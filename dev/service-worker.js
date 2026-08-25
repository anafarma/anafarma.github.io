/**
 * APOTEK ANA FARMA — Service Worker
 * OFFLINE APP SHELL — v16.1
 *
 * Prinsip:
 * - index.html/app.js selalu mencoba versi terbaru saat online
 * - offline menggunakan cache terakhir
 * - Apps Script API tidak dicache oleh Service Worker
 * - cache lama dibuang saat versi berubah
 */

const CACHE_VERSION = 'ana-farma-v16-1';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './logo_data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const NETWORK_FIRST_FILES = [
  './',
  './index.html',
  './app.js',
  './logo_data.js'
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
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_VERSION)
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// ================================================================
// FETCH
// ================================================================

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // ==============================================================
  // APPS SCRIPT API
  // ==============================================================

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
            status: 503,
            headers: {
              'Content-Type':
                'application/json; charset=utf-8'
            }
          }
        );
      })
    );

    return;
  }

  // ==============================================================
  // NAVIGASI / HTML
  // ==============================================================
  //
  // Online:
  //   network → simpan HTML terbaru → tampilkan
  //
  // Offline:
  //   gunakan index.html terakhir
  //
  // ==============================================================

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {

          if (response && response.ok) {
            const clone = response.clone();

            caches.open(CACHE_VERSION)
              .then(cache => {
                cache.put(
                  './index.html',
                  clone
                );
              });
          }

          return response;
        })
        .catch(() => {
          return caches.match(
            './index.html'
          );
        })
    );

    return;
  }

  // ==============================================================
  // APP JS / LOGO DATA
  // NETWORK-FIRST
  // ==============================================================
  //
  // Penting:
  // Jangan gunakan ignoreSearch untuk app.js.
  // Query version pada app.js harus dihormati.
  //
  // ==============================================================

  const pathname =
    url.pathname.replace(
      /\/+/g,
      '/'
    );

  const isAppJs =
    pathname.endsWith('/app.js');

  const isLogoData =
    pathname.endsWith('/logo_data.js');

  if (isAppJs || isLogoData) {

    event.respondWith(
      fetch(request)
        .then(response => {

          if (response && response.ok) {
            const clone = response.clone();

            caches.open(CACHE_VERSION)
              .then(cache => {

                // Simpan berdasarkan URL request
                // termasuk query string versi.
                cache.put(
                  request,
                  clone
                );

                // Juga simpan URL dasar agar
                // fallback offline tetap tersedia.
                const baseUrl =
                  new URL(
                    request.url
                  );

                baseUrl.search = '';

                cache.put(
                  baseUrl.toString(),
                  response.clone()
                );
              });
          }

          return response;
        })
        .catch(async () => {

          // Pertama coba URL persis
          const exact =
            await caches.match(
              request
            );

          if (exact) {
            return exact;
          }

          // Kemudian coba URL dasar
          const baseUrl =
            new URL(
              request.url
            );

          baseUrl.search = '';

          const fallback =
            await caches.match(
              baseUrl.toString()
            );

          if (fallback) {
            return fallback;
          }

          return new Response(
            '',
            {
              status: 504,
              statusText:
                'Offline resource unavailable'
            }
          );
        })
    );

    return;
  }

  // ==============================================================
  // STATIC FILE LAIN
  // CACHE-FIRST
  // ==============================================================

  event.respondWith(
    caches.match(
      request,
      {
        ignoreSearch: true
      }
    )
      .then(cached => {

        if (cached) {
          return cached;
        }

        return fetch(request)
          .then(response => {

            if (
              response &&
              response.ok
            ) {
              const clone =
                response.clone();

              caches.open(
                CACHE_VERSION
              )
                .then(cache => {
                  cache.put(
                    request,
                    clone
                  );
                });
            }

            return response;
          });
      })
      .catch(() => {

        return caches.match(
          './index.html'
        );
      })
  );
});
