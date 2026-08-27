/**
 * APOTEK ANA FARMA — DEV BOOTSTRAP / V18
 *
 * Tujuan:
 * - memulai Service Worker sedini mungkin;
 * - memanaskan IndexedDB agar init app.js tidak menunggu pembukaan DB pertama;
 * - tidak membuat database/engine offline kedua;
 * - tidak mengubah API aplikasi.
 */
(function () {
  'use strict';

  const DB_NAME = 'anafarma_offline_v2';
  const DB_VERSION = 1;
  const SW_URL = 'service-worker.js';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(SW_URL, {
      updateViaCache: 'none'
    }).then(function (registration) {
      window.__ANA_FARMA_DEV_SW_READY__ = registration;
    }).catch(function (error) {
      console.warn('[DEV BOOT][SW]', error);
    });
  }

  if ('indexedDB' in window) {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', {
            keyPath: 'requestId'
          });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = function () {
        const db = request.result;
        window.__ANA_FARMA_DEV_DB_READY__ = true;
        db.close();
      };

      request.onerror = function () {
        console.warn('[DEV BOOT][IndexedDB]', request.error);
      };
    } catch (error) {
      console.warn('[DEV BOOT][IndexedDB]', error);
    }
  }
})();
