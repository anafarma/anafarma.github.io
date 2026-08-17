/**
 * ANA FARMA — Service Worker
 * ONLINE / OFFLINE
 */

const CACHE_VERSION = 'ana-farma-v15';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './offline-sync.js',
  './logo_data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];


self.addEventListener(
  'install',
  function (event) {

    event.waitUntil(

      caches
        .open(CACHE_VERSION)
        .then(function (cache) {

          return cache.addAll(
            APP_SHELL
          );

        })
        .catch(function () {})

    );

    self.skipWaiting();

  }
);


self.addEventListener(
  'activate',
  function (event) {

    event.waitUntil(

      caches
        .keys()
        .then(function (keys) {

          return Promise.all(

            keys
              .filter(function (key) {

                return (
                  key !==
                  CACHE_VERSION
                );

              })
              .map(function (key) {

                return caches.delete(
                  key
                );

              })

          );

        })

    );

    self.clients.claim();

  }
);


self.addEventListener(
  'fetch',
  function (event) {

    const request =
      event.request;

    const url =
      new URL(
        request.url
      );


    /*
     * Apps Script tidak dicache.
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
          .catch(function () {

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
                    'application/json'
                }

              }

            );

          })

      );

      return;

    }


    /*
     * Hanya GET yang dicache.
     */
    if (
      request.method !==
      'GET'
    ) {

      return;

    }


    event.respondWith(

      caches.match(
        request
      )
      .then(function (cached) {

        const network =
          fetch(request)
            .then(function (response) {

              if (
                response &&
                response.ok
              ) {

                const copy =
                  response.clone();

                caches
                  .open(
                    CACHE_VERSION
                  )
                  .then(function (cache) {

                    cache.put(
                      request,
                      copy
                    );

                  });

              }

              return response;

            })
            .catch(function () {

              return cached;

            });


        return (
          cached ||
          network
        );

      })

    );

  }
);
