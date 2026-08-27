/**
 * APOTEK ANA FARMA — DEV SERVICE WORKER V18
 *
 * Strategy:
 * - navigation: network-first with bounded timeout, cached index fallback
 * - app.js/logo_data.js: stale-while-revalidate for fast startup + background update
 * - static assets: cache-first
 * - Apps Script: network-only, never cached
 * - only same-origin requests are handled by the application cache rules
 */

const CACHE_VERSION = 'ana-farma-dev-v18';
const NAV_TIMEOUT_MS = 2500;
const SCRIPT_TIMEOUT_MS = 2000;

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './logo_data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

function isAppsScript(url) {
  return url.hostname === 'script.google.com' ||
         url.hostname === 'script.googleusercontent.com' ||
         url.hostname.endsWith('.googleusercontent.com');
}

function withTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
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

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) await putCache(request, response);
  return response;
}

async function staleWhileRevalidate(request, timeoutMs) {
  const cached = await caches.match(request);
  const cachedBase = cached || await caches.match(request, { ignoreSearch: true });

  const networkPromise = withTimeout(request, timeoutMs)
    .then(async response => {
      if (response && response.ok) {
        await putCache(request, response);
        const url = new URL(request.url);
        url.search = '';
        await putCache(new Request(url.toString()), response);
      }
      return response;
    })
    .catch(error => {
      console.warn('[DEV SW REVALIDATE]', error);
      return null;
    });

  if (cachedBase) {
    eventWait(networkPromise);
    return cachedBase;
  }

  const response = await networkPromise;
  if (response) return response;

  return new Response('', {
    status: 504,
    statusText: 'Offline resource unavailable'
  });
}

function eventWait(promise) {
  // Assigned by fetch handler for lifecycle-safe background caching.
  if (self.__activeFetchEvent) self.__activeFetchEvent.waitUntil(promise);
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => {
        console.error('[DEV SW INSTALL]', error);
        throw error;
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('ana-farma-') && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isAppsScript(url)) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ ok: false, error: 'Tidak ada koneksi internet.' }),
        { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      ))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  self.__activeFetchEvent = event;

  if (request.mode === 'navigate') {
    event.respondWith(
      withTimeout(request, NAV_TIMEOUT_MS)
        .then(async response => {
          if (response && response.ok) {
            event.waitUntil(putCache(new Request(scopeUrl('./index.html')), response));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(scopeUrl('./index.html'));
          if (cached) return cached;
          return new Response('Offline - index.html belum tersedia.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
        .finally(() => {
          if (self.__activeFetchEvent === event) self.__activeFetchEvent = null;
        })
    );
    return;
  }

  const path = url.pathname.replace(/\/+/g, '/');
  const isAppJs = path.endsWith('/app.js');
  const isLogoData = path.endsWith('/logo_data.js');

  if (isAppJs || isLogoData) {
    event.respondWith(staleWhileRevalidate(request, SCRIPT_TIMEOUT_MS));
    return;
  }

  event.respondWith(
    cacheFirst(request).catch(async () => {
      const cachedIndex = await caches.match(scopeUrl('./index.html'));
      return cachedIndex || new Response('Offline - resource tidak tersedia.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});
