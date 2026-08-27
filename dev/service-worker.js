/**
 * APOTEK ANA FARMA — DEV SERVICE WORKER
 * V18.1
 *
 * Navigation: network-first + bounded timeout.
 * Application scripts: network-first + exact/base fallback.
 * Static assets: cache-first.
 * Apps Script: network-only, never cached.
 */
const CACHE_VERSION = 'ana-farma-dev-v18-1';
const NAV_TIMEOUT_MS = 2500;
const SCRIPT_TIMEOUT_MS = 2200;
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './logo_data.js',
  './features-runtime.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

function absolute(path) {
  return new URL(path, self.registration.scope).href;
}

function isAppsScript(url) {
  return url.hostname === 'script.google.com' ||
    url.hostname === 'script.googleusercontent.com' ||
    url.hostname.endsWith('.googleusercontent.com');
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function putCache(request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
  } catch (error) {
    console.warn('[DEV SW CACHE]', error);
  }
}

async function cacheShell() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.all(APP_SHELL.map(async path => {
    try {
      const response = await fetch(absolute(path), { cache: 'no-store' });
      if (response.ok) await cache.put(absolute(path), response.clone());
    } catch (error) {
      console.warn('[DEV SW INSTALL]', path, error);
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('ana-farma-dev-') && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function navigationResponse(event) {
  try {
    const response = await fetchWithTimeout(event.request, NAV_TIMEOUT_MS);
    if (response && response.ok) {
      event.waitUntil(putCache(absolute('./index.html'), response));
      return response;
    }
  } catch (_) {}

  const cached = await caches.match(absolute('./index.html'));
  return cached || new Response(
    'Offline - index.html belum tersedia.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}

async function scriptResponse(event) {
  const request = event.request;
  try {
    const response = await fetchWithTimeout(request, SCRIPT_TIMEOUT_MS);
    if (response && response.ok) {
      event.waitUntil(putCache(request, response));
      const base = new URL(request.url);
      base.search = '';
      event.waitUntil(putCache(new Request(base.href), response));
      return response;
    }
  } catch (_) {}

  const exact = await caches.match(request);
  if (exact) return exact;

  const base = new URL(request.url);
  base.search = '';
  const fallback = await caches.match(base.href);
  return fallback || new Response(
    '',
    { status: 504, statusText: 'Offline resource unavailable' }
  );
}

async function staticResponse(event) {
  const cached = await caches.match(event.request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response && response.ok) event.waitUntil(putCache(event.request, response));
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Apps Script is the authoritative data source and must never enter Cache Storage.
  if (isAppsScript(url)) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ ok: false, error: 'Tidak ada koneksi internet.' }),
        { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      ))
    );
    return;
  }

  if (!isSameOrigin(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(event));
    return;
  }

  const path = url.pathname.replace(/\\+/g, '/');
  const isRuntimeScript =
    path.endsWith('/app.js') ||
    path.endsWith('/logo_data.js') ||
    path.endsWith('/features-runtime.js');

  if (isRuntimeScript) {
    event.respondWith(scriptResponse(event));
    return;
  }

  event.respondWith(
    staticResponse(event).catch(async () => {
      const fallback = await caches.match(absolute('./index.html'));
      return fallback || new Response(
        'Offline - resource tidak tersedia.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    })
  );
});
