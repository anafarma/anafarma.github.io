/**
 * APOTEK ANA FARMA — Service Worker
 * OFFLINE APP SHELL
 */

const CACHE_VERSION = 'ana-farma-v15';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './logo_data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ================================================================
// INSTALL
// ================================================================
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

// ================================================================
// ACTIVATE
// ================================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

// ================================================================
// FETCH
// ================================================================
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // --------------------------------------------------------------
  // Apps Script API
  // Jangan cache data API di Service Worker.
  // IndexedDB yang menangani cache data aplikasi.
  // --------------------------------------------------------------
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com')
  ) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Tidak ada koneksi internet.'
          }),
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
      })
    );

    return;
  }

  // --------------------------------------------------------------
  // NAVIGATION
  // Kalau user membuka /dev/ atau halaman lain saat offline,
  // berikan index.html dari cache.
  // --------------------------------------------------------------
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();

          caches.open(CACHE_VERSION)
            .then(cache => {
              cache.put('./index.html', clone);
            });

          return response;
        })
        .catch(() => {
          return caches.match('./index.html');
        })
    );

    return;
  }

  // --------------------------------------------------------------
  // FILE APP
  // Abaikan query string seperti:
  // app.js?v=20260814-POS-FIX-02
  // --------------------------------------------------------------
  event.respondWith(
    caches.match(request, {
      ignoreSearch: true
    })
    .then(cached => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();

            caches.open(CACHE_VERSION)
              .then(cache => {
                cache.put(request, clone);
              });
          }

          return response;
        });
    })
    .catch(() => {
      return caches.match('./index.html');
    })
  );
});
