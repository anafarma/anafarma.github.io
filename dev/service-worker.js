/**
 * APOTEK ANA FARMA — Service Worker
 * OFFLINE APP SHELL — v16
 *
 * Tujuan:
 * - aplikasi /dev/ tetap bisa dibuka saat offline
 * - index.html/app.js/logo/manifest tersedia dari cache
 * - API Apps Script TIDAK dicache oleh Service Worker
 * - cache lama dibuang saat versi berubah
 * - navigasi offline selalu fallback ke index.html pada scope yang sama
 */

const CACHE_VERSION = 'ana-farma-v16';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './logo_data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => {
        console.error('[SW INSTALL]', error);
      })
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Hanya GET yang boleh diproses cache.
  if (request.method !== 'GET') {
    return;
  }

  // Apps Script API: network-only.
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com')
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'Tidak ada koneksi internet.'
          }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json; charset=utf-8'
            }
          }
        )
      )
    );
    return;
  }

  // Navigasi: online-first; bila offline gunakan index.html dari cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() =>
          caches.match('./index.html', { ignoreSearch: true })
            .then(cached =>
              cached ||
              caches.match('./', { ignoreSearch: true })
            )
        )
    );
    return;
  }

  // App shell/static files: cache-first, lalu simpan versi online terbaru.
  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then(cached => {
        if (cached) {
          return cached;
        }

        return fetch(request).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(request, clone);
            });
          }

          return response;
        });
      })
      .catch(() => {
        if (
          request.destination === 'script' ||
          request.destination === 'style' ||
          request.destination === 'image'
        ) {
          return new Response('', {
            status: 504,
            statusText: 'Offline resource unavailable'
          });
        }

        return caches.match('./index.html', {
          ignoreSearch: true
        });
      })
  );
});
