/**
 * APOTEK ANA FARMA — Service Worker
 * OFFLINE APP SHELL
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

// ================================================================
// INSTALL
// ================================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ================================================================
// ACTIVATE
// ================================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_VERSION)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ================================================================
// FETCH
// ================================================================
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // --------------------------------------------------------------
  // Apps Script API
  // --------------------------------------------------------------
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
              'Content-Type': 'application/json'
            }
          }
        )
      )
    );

    return;
  }

  // --------------------------------------------------------------
  // NAVIGATION
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
        .catch(() =>
          caches.match('./index.html')
        )
    );

    return;
  }

  // --------------------------------------------------------------
  // APP FILES
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
    .catch(() =>
      caches.match('./index.html')
    )
  );
});
