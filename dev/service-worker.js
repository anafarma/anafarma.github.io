/**
 * APOTEK ANA FARMA — Service Worker
 * OFFLINE APP SHELL — v16.2
 *
 * Prinsip:
 * - HTML navigasi: NETWORK-FIRST
 * - app.js / logo_data.js: NETWORK-FIRST
 * - static asset: CACHE-FIRST
 * - Apps Script API: TIDAK dicache
 * - cache write menggunakan Response.clone() yang aman
 * - cache write diikat ke lifecycle fetch dengan event.waitUntil()
 * - cache lama dibuang saat versi berubah
 */

const CACHE_VERSION = 'ana-farma-v16-2';

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
// HELPER
// ================================================================

function scopeUrl(path) {
  return new URL(
    path,
    self.registration.scope
  ).href;
}

function cachePut(cacheName, request, response) {
  if (!response || !response.ok) {
    return Promise.resolve();
  }

  /*
   * Clone dilakukan SEBELUM response digunakan
   * oleh Cache.put().
   *
   * Satu clone = satu operasi Cache.put().
   */
  const copy = response.clone();

  return caches.open(cacheName)
    .then(cache => {
      return cache.put(
        request,
        copy
      );
    })
    .catch(error => {
      console.error(
        '[SW CACHE PUT]',
        error
      );
    });
}


// ================================================================
// INSTALL
// ================================================================

self.addEventListener(
  'install',
  event => {

    event.waitUntil(

      caches.open(
        CACHE_VERSION
      )
        .then(cache => {

          return cache.addAll(
            APP_SHELL
          );

        })
        .catch(error => {

          console.error(
            '[SW INSTALL]',
            error
          );

        })

    );

    /*
     * Langsung minta menjadi worker aktif.
     */
    self.skipWaiting();
  }
);


// ================================================================
// ACTIVATE
// ================================================================

self.addEventListener(
  'activate',
  event => {

    event.waitUntil(

      caches.keys()
        .then(keys => {

          return Promise.all(

            keys
              .filter(
                key =>
                  key !==
                  CACHE_VERSION
              )
              .map(
                key =>
                  caches.delete(
                    key
                  )
              )

          );

        })
        .then(() => {

          return self.clients.claim();

        })

    );
  }
);


// ================================================================
// FETCH
// ================================================================

self.addEventListener(
  'fetch',
  event => {

    const request =
      event.request;

    /*
     * Hanya GET yang ditangani.
     */
    if (
      request.method !== 'GET'
    ) {
      return;
    }

    const url =
      new URL(
        request.url
      );


    // ============================================================
    // APPS SCRIPT API
    // ============================================================

    /*
     * Jangan pernah memasukkan response API
     * ke App Shell cache.
     *
     * Cache data aplikasi ditangani IndexedDB
     * oleh app.js.
     */

    if (
      url.hostname.includes(
        'script.google.com'
      ) ||
      url.hostname.includes(
        'script.googleusercontent.com'
      )
    ) {

      event.respondWith(

        fetch(request)
          .catch(() => {

            return new Response(

              JSON.stringify({
                ok: false,
                error:
                  'Tidak ada koneksi internet.'
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


    // ============================================================
    // NAVIGATION / HTML
    // ============================================================

    /*
     * Online:
     *
     *     network
     *        ↓
     *     tampilkan response
     *        +
     *     simpan copy ke cache
     *
     * Offline:
     *
     *     cache index.html
     */

    if (
      request.mode === 'navigate'
    ) {

      event.respondWith(

        fetch(request)
          .then(response => {

            if (
              response &&
              response.ok
            ) {

              /*
               * clone() dibuat SEGERA,
               * sebelum response dipakai.
               */
              const cachedResponse =
                response.clone();

              const cacheWrite =
                caches.open(
                  CACHE_VERSION
                )
                  .then(cache => {

                    return cache.put(
                      scopeUrl(
                        './index.html'
                      ),
                      cachedResponse
                    );

                  })
                  .catch(error => {

                    console.error(
                      '[SW HTML CACHE]',
                      error
                    );

                  });

              /*
               * Pastikan browser tidak
               * menghentikan operasi cache
               * sebelum selesai.
               */
              event.waitUntil(
                cacheWrite
              );
            }

            return response;

          })
          .catch(async () => {

            const cached =
              await caches.match(
                scopeUrl(
                  './index.html'
                )
              );

            if (cached) {
              return cached;
            }

            return new Response(
              'Offline - index.html belum tersedia.',
              {
                status: 503,
                headers: {
                  'Content-Type':
                    'text/plain; charset=utf-8'
                }
              }
            );

          })

      );

      return;
    }


    // ============================================================
    // APP.JS
    // LOGO_DATA.JS
    // ============================================================

    const pathname =
      url.pathname.replace(
        /\/+/g,
        '/'
      );

    const isAppJs =
      pathname.endsWith(
        '/app.js'
      );

    const isLogoData =
      pathname.endsWith(
        '/logo_data.js'
      );


    if (
      isAppJs ||
      isLogoData
    ) {

      event.respondWith(

        fetch(request)
          .then(response => {

            if (
              response &&
              response.ok
            ) {

              /*
               * ==================================================
               * PENTING
               * ==================================================
               *
               * Jangan:
               *
               * const clone = response.clone();
               * cache.put(... clone);
               * cache.put(... response.clone());
               *
               * secara tersebar di promise chain.
               *
               * Buat semua clone terlebih dahulu.
               */

              const exactCopy =
                response.clone();

              const baseUrl =
                new URL(
                  request.url
                );

              baseUrl.search = '';

              const baseCopy =
                response.clone();


              const cacheWrite =
                caches.open(
                  CACHE_VERSION
                )
                  .then(cache => {

                    /*
                     * Cache URL persis.
                     *
                     * Contoh:
                     * app.js?v=20260825-OFFLINE-V16
                     */
                    return cache.put(
                      request,
                      exactCopy
                    );

                  })
                  .then(() => {

                    /*
                     * Cache URL dasar juga.
                     *
                     * Ini menjadi fallback
                     * apabila offline dan
                     * query version berbeda.
                     */
                    return caches.open(
                      CACHE_VERSION
                    )
                      .then(cache => {

                        return cache.put(
                          baseUrl.toString(),
                          baseCopy
                        );

                      });

                  })
                  .catch(error => {

                    console.error(
                      '[SW APP CACHE]',
                      error
                    );

                  });

              event.waitUntil(
                cacheWrite
              );
            }

            return response;

          })
          .catch(async () => {

            /*
             * ==================================================
             * OFFLINE FALLBACK
             * ==================================================
             */

            // 1. URL persis
            const exact =
              await caches.match(
                request
              );

            if (exact) {
              return exact;
            }


            // 2. URL dasar tanpa query
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


    // ============================================================
    // STATIC ASSETS LAIN
    // ============================================================

    /*
     * CACHE-FIRST
     *
     * Cocok untuk:
     * - icon
     * - manifest
     * - gambar
     * - font
     * - asset statis lainnya
     */

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

                /*
                 * Clone dibuat sekali
                 * untuk Cache.put().
                 */
                const cachedResponse =
                  response.clone();

                const cacheWrite =
                  caches.open(
                    CACHE_VERSION
                  )
                    .then(cache => {

                      return cache.put(
                        request,
                        cachedResponse
                      );

                    })
                    .catch(error => {

                      console.error(
                        '[SW STATIC CACHE]',
                        error
                      );

                    });

                event.waitUntil(
                  cacheWrite
                );
              }

              return response;

            });

        })
        .catch(async () => {

          /*
           * Jika request asset gagal,
           * coba index.html sebagai
           * fallback terakhir.
           */

          const fallback =
            await caches.match(
              scopeUrl(
                './index.html'
              )
            );

          if (fallback) {
            return fallback;
          }

          return new Response(
            'Offline',
            {
              status: 503,
              headers: {
                'Content-Type':
                  'text/plain; charset=utf-8'
              }
            }
          );

        })

    );

  }
);
