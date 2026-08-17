/**
 * ================================================================
 * ANA FARMA - OFFLINE SYNC ENGINE
 * ================================================================
 *
 * Tidak mengganti struktur app.js.
 *
 * Fungsi:
 * 1. Menyimpan transaksi pending di IndexedDB.
 * 2. Mempertahankan requestId yang sama.
 * 3. Mengirim ulang otomatis ketika online.
 * 4. Tidak pernah menganggap transaksi offline sebagai SYNCED
 *    sebelum server mengonfirmasi.
 *
 * Backend target:
 *   createTransaksi
 *
 * Database lokal:
 *   AnaFarmaOfflineDB
 * ================================================================
 */

(function () {
  'use strict';

  const DB_NAME = 'AnaFarmaOfflineDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'transaction_queue';

  const STATUS_PENDING = 'PENDING';
  const STATUS_SYNCED = 'SYNCED';
  const STATUS_FAILED = 'FAILED';
  const STATUS_CONFLICT = 'CONFLICT';

  let syncing = false;


  // ================================================================
  // IndexedDB
  // ================================================================

  function openDB() {

    return new Promise(function (resolve, reject) {

      if (!window.indexedDB) {
        reject(
          new Error(
            'Browser tidak mendukung penyimpanan offline.'
          )
        );
        return;
      }

      const request =
        indexedDB.open(
          DB_NAME,
          DB_VERSION
        );

      request.onupgradeneeded =
        function (event) {

          const db =
            event.target.result;

          if (
            !db.objectStoreNames.contains(
              STORE_NAME
            )
          ) {

            const store =
              db.createObjectStore(
                STORE_NAME,
                {
                  keyPath: 'requestId'
                }
              );

            store.createIndex(
              'status',
              'status',
              {
                unique: false
              }
            );

            store.createIndex(
              'createdAt',
              'createdAt',
              {
                unique: false
              }
            );

          }

        };

      request.onsuccess =
        function () {
          resolve(
            request.result
          );
        };

      request.onerror =
        function () {
          reject(
            request.error ||
            new Error(
              'Gagal membuka database offline.'
            )
          );
        };

    });

  }


  function put(item) {

    return openDB()
      .then(function (db) {

        return new Promise(
          function (resolve, reject) {

            const tx =
              db.transaction(
                STORE_NAME,
                'readwrite'
              );

            tx.objectStore(
              STORE_NAME
            ).put(item);

            tx.oncomplete =
              function () {
                resolve();
              };

            tx.onerror =
              function () {
                reject(
                  tx.error ||
                  new Error(
                    'Gagal menyimpan transaksi offline.'
                  )
                );
              };

          }
        );

      });

  }


  function get(requestId) {

    return openDB()
      .then(function (db) {

        return new Promise(
          function (resolve, reject) {

            const tx =
              db.transaction(
                STORE_NAME,
                'readonly'
              );

            const request =
              tx.objectStore(
                STORE_NAME
              ).get(requestId);

            request.onsuccess =
              function () {
                resolve(
                  request.result || null
                );
              };

            request.onerror =
              function () {
                reject(
                  request.error
                );
              };

          }
        );

      });

  }


  function getPending() {

    return openDB()
      .then(function (db) {

        return new Promise(
          function (resolve, reject) {

            const tx =
              db.transaction(
                STORE_NAME,
                'readonly'
              );

            const index =
              tx.objectStore(
                STORE_NAME
              ).index('status');

            const request =
              index.getAll(
                STATUS_PENDING
              );

            request.onsuccess =
              function () {
                const data =
                  request.result || [];

                data.sort(
                  function (a, b) {
                    return (
                      new Date(a.createdAt) -
                      new Date(b.createdAt)
                    );
                  }
                );

                resolve(data);
              };

            request.onerror =
              function () {
                reject(
                  request.error
                );
              };

          }
        );

      });

  }


  // ================================================================
  // Request ID
  // ================================================================

  function createRequestId() {

    if (
      typeof window.uuidKecil ===
      'function'
    ) {
      return window.uuidKecil();
    }

    if (
      window.crypto &&
      crypto.randomUUID
    ) {
      return crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      '-' +
      Math.random()
        .toString(36)
        .substring(2, 12)
    );

  }


  // ================================================================
  // Simpan transaksi offline
  // ================================================================

  async function queueTransaction(
    data
  ) {

    if (
      !AppState ||
      !AppState.user
    ) {

      throw new Error(
        'Sesi pengguna tidak tersedia.'
      );

    }


    const requestId =
      createRequestId();


    const item = {

      requestId:
        requestId,

      action:
        'createTransaksi',

      status:
        STATUS_PENDING,

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString(),

      attempts:
        0,

      lastAttemptAt:
        null,

      lastError:
        null,

      idUser:
        AppState.user.idUser,

      username:
        AppState.user.username || '',

      payload:
        data

    };


    await put(item);


    return item;

  }


  // ================================================================
  // Tampilkan status
  // ================================================================

  function showMessage(
    message,
    type
  ) {

    if (
      typeof window.toast ===
      'function'
    ) {

      window.toast(
        message,
        type || 'warn'
      );

      return;

    }

    console.log(
      '[ANA FARMA OFFLINE]',
      message
    );

  }


  // ================================================================
  // Kirim SATU transaksi
  // ================================================================

  async function syncOne(
    item
  ) {

    if (
      !navigator.onLine
    ) {
      return false;
    }


    /*
     * Jangan kirim ulang transaksi yang sudah berhasil.
     */
    if (
      item.status ===
      STATUS_SYNCED
    ) {
      return true;
    }


    item.attempts =
      Number(item.attempts || 0) + 1;

    item.lastAttemptAt =
      new Date().toISOString();

    item.updatedAt =
      new Date().toISOString();

    await put(item);


    try {

      /*
       * __anaFarmaPostRaw dibuat oleh adapter
       * yang akan kita pasang di bawah.
       *
       * requestId WAJIB sama.
       */
      const result =
        await window.__anaFarmaPostRaw(
          'createTransaksi',
          item.payload,
          item.requestId
        );


      /*
       * Backend mengembalikan duplicate=true
       * jika transaksi sudah pernah diproses.
       *
       * Itu tetap dianggap SYNCED.
       */
      item.status =
        STATUS_SYNCED;

      item.updatedAt =
        new Date().toISOString();

      item.syncedAt =
        new Date().toISOString();

      item.result =
        result;

      item.lastError =
        null;

      await put(item);

      return true;


    } catch (error) {

      const message =
        String(
          error &&
          error.message ||
          error
        );


      /*
       * Stok berubah / transaksi ditolak server
       * jangan terus-menerus retry tanpa batas.
       */
      if (
        /stok|stock|tidak cukup|berubah|konflik/i
          .test(message)
      ) {

        item.status =
          STATUS_CONFLICT;

      } else {

        item.status =
          STATUS_PENDING;

      }


      item.lastError =
        message;

      item.updatedAt =
        new Date().toISOString();

      await put(item);


      return false;

    }

  }


  // ================================================================
  // Sinkronisasi semua transaksi
  // ================================================================

  async function syncAll(
    silent
  ) {

    if (syncing) {
      return;
    }

    if (!navigator.onLine) {
      return;
    }

    syncing = true;


    try {

      const list =
        await getPending();


      if (!list.length) {
        return;
      }


      let successCount = 0;


      /*
       * Satu per satu.
       *
       * Jangan paralel karena transaksi menyentuh stok.
       */
      for (
        let i = 0;
        i < list.length;
        i++
      ) {

        if (
          !navigator.onLine
        ) {
          break;
        }


        const ok =
          await syncOne(
            list[i]
          );


        if (ok) {
          successCount++;
        }


        /*
         * Beri jeda kecil agar tidak membanjiri Apps Script.
         */
        await new Promise(
          function (resolve) {
            setTimeout(
              resolve,
              300
            );
          }
        );

      }


      if (
        !silent &&
        successCount > 0
      ) {

        showMessage(
          successCount +
          ' transaksi offline berhasil disinkronkan.',
          'success'
        );

      }


    } catch (error) {

      console.error(
        '[Offline Sync]',
        error
      );


    } finally {

      syncing = false;

    }

  }


  // ================================================================
  // Adapter apiPost
  // ================================================================
  //
  // Kita tidak mengubah fungsi apiPost asli.
  //
  // Fungsi asli disimpan sebagai __anaFarmaApiPostOriginal.
  //
  // Wrapper baru:
  //
  // ONLINE:
  //   menggunakan server normal.
  //
  // OFFLINE + createTransaksi:
  //   masuk IndexedDB.
  //
  // OFFLINE + operasi lain:
  //   tetap ditolak.
  // ================================================================

  function pasangApiAdapter() {

    if (
      typeof window.apiPost !==
      'function'
    ) {

      console.warn(
        '[Offline Sync] apiPost belum tersedia.'
      );

      return false;
    }


    if (
      window.__anaFarmaOfflineAdapterInstalled
    ) {

      return true;

    }


    const originalApiPost =
      window.apiPost;


    window.__anaFarmaApiPostOriginal =
      originalApiPost;


    /*
     * Raw POST dengan requestId yang diberikan.
     *
     * Ini tidak memakai apiPost asli karena apiPost asli
     * selalu membuat requestId baru.
     */
    window.__anaFarmaPostRaw =
      async function (
        action,
        data,
        requestId
      ) {

        if (
          !API_URL ||
          API_URL.indexOf(
            'PASTE_URL_WEB_APP'
          ) !== -1
        ) {

          throw new Error(
            'KONFIGURASI_BELUM_SELESAI'
          );

        }


        const payload = {

          action:
            action,

          data:
            data || {},

          requestId:
            requestId

        };


        let response;


        try {

          response =
            await fetch(
              API_URL,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'text/plain;charset=utf-8'
                },

                body:
                  JSON.stringify(
                    payload
                  )
              }
            );

        } catch (networkError) {

          throw new Error(
            'Tidak bisa terhubung ke server.'
          );

        }


        let json;


        try {

          json =
            await response.json();

        } catch (parseError) {

          throw new Error(
            'Respons server tidak valid.'
          );

        }


        if (!json.ok) {

          throw new Error(
            json.error ||
            'Server menolak transaksi.'
          );

        }


        return json.data;

      };


    /*
     * Wrapper utama.
     */
    window.apiPost =
      async function (
        action,
        data
      ) {


        /*
         * ONLINE:
         *
         * Gunakan apiPost asli.
         * Tidak mengubah perilaku aplikasi existing.
         */
        if (
          navigator.onLine
        ) {

          try {

            return await originalApiPost(
              action,
              data
            );

          } catch (error) {

            /*
             * Jika koneksi sebenarnya putus
             * tepat ketika request dilakukan,
             * hanya createTransaksi yang boleh
             * dimasukkan ke queue.
             */
            if (
              action ===
              'createTransaksi'
            ) {

              const message =
                String(
                  error &&
                  error.message ||
                  error
                );


              if (
                /tidak bisa terhubung|koneksi|network|fetch/i
                  .test(message)
              ) {

                const queued =
                  await queueTransaction(
                    data
                  );


                showMessage(
                  'Koneksi terputus. Transaksi disimpan di perangkat dan menunggu sinkronisasi.',
                  'warn'
                );


                return {

                  offlinePending:
                    true,

                  requestId:
                    queued.requestId,

                  status:
                    STATUS_PENDING,

                  message:
                    'Transaksi menunggu sinkronisasi.'

                };

              }

            }


            throw error;

          }

        }


        /*
         * OFFLINE:
         *
         * Hanya transaksi yang boleh diantrikan.
         */
        if (
          action ===
          'createTransaksi'
        ) {

          const queued =
            await queueTransaction(
              data
            );


          showMessage(
            'OFFLINE. Transaksi disimpan aman di perangkat dan akan disinkronkan saat internet kembali.',
            'warn'
          );


          return {

            offlinePending:
              true,

            requestId:
              queued.requestId,

            status:
              STATUS_PENDING,

            message:
              'Transaksi menunggu koneksi internet.'

          };

        }


        /*
         * Operasi lain tidak boleh dilakukan
         * secara offline pada tahap ini.
         */
        const error =
          new Error(
            'OFFLINE_WRITE_BLOCKED: ' +
            'Operasi ini membutuhkan koneksi internet.'
          );

        error.code =
          'OFFLINE_WRITE_BLOCKED';

        throw error;

      };


    window.__anaFarmaOfflineAdapterInstalled =
      true;


    return true;

  }


  // ================================================================
  // Status transaksi pending
  // ================================================================

  async function getStatus() {

    const pending =
      await getPending();

    return {

      pending:
        pending.length,

      syncing:
        syncing,

      online:
        navigator.onLine

    };

  }


  // ================================================================
  // Event internet
  // ================================================================

  window.addEventListener(
    'online',
    function () {

      setTimeout(
        function () {

          syncAll(false);

        },
        1200
      );

    }
  );


  window.addEventListener(
    'offline',
    function () {

      showMessage(
        'Mode OFFLINE aktif.',
        'warn'
      );

    }
  );


  // ================================================================
  // API publik
  // ================================================================

  window.AnaFarmaOfflineSync = {

    queue:
      queueTransaction,

    sync:
      function () {
        return syncAll(false);
      },

    status:
      getStatus,

    pending:
      getPending,

    version:
      '1.0.0'

  };


  // ================================================================
  // Inisialisasi
  // ================================================================

  function init() {

    /*
     * app.js dimuat lebih dahulu oleh index.html.
     */
    pasangApiAdapter();


    /*
     * Jika saat halaman dibuka internet sudah tersedia,
     * coba sinkronkan pending.
     */
    if (
      navigator.onLine
    ) {

      setTimeout(
        function () {
          syncAll(true);
        },
        2500
      );

    }

  }


  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  } else {

    init();

  }

})();
