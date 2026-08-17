/*
 * ANA FARMA — ONLINE/OFFLINE PATCH
 * Tidak mengubah struktur app.js.
 * File ini dimuat SETELAH app.js.
 */

(function () {
  'use strict';

  const CFG = {
    prefix: 'anafarma_offline_v1_',
    cartKey: 'anafarma_cart_v1',

    cacheTtlMs: {
      getProduk: 24 * 60 * 60 * 1000,
      getSupplier: 12 * 60 * 60 * 1000,
      getPelanggan: 12 * 60 * 60 * 1000,
      getLokasi: 24 * 60 * 60 * 1000,
      getPengaturan: 24 * 60 * 60 * 1000,
      getDashboardSummary: 15 * 60 * 1000,
      getShiftStatus: 15 * 60 * 1000
    },

    cacheable: [
      'getProduk',
      'getSupplier',
      'getPelanggan',
      'getLokasi',
      'getPengaturan',
      'getDashboardSummary',
      'getShiftStatus'
    ],

    writeActions: [
      'mulaiShift',
      'selesaiShift',
      'gantiPassword',
      'addProduk',
      'updateProduk',
      'nonaktifkanProduk',
      'adjustStok',
      'createTransaksi',
      'batalkanTransaksi',
      'addPembelian',
      'addRetur',
      'addPengajuanPembelian',
      'setujuiPengajuanPembelian',
      'tolakPengajuanPembelian',
      'addSupplier',
      'updateSupplier',
      'addPelanggan',
      'updatePelanggan',
      'addUser',
      'updateUser',
      'toggleGPSUser',
      'resetPasswordUser',
      'updatePengaturan',
      'simpanStokOpname'
    ]
  };

  function isOnline() {
    return navigator.onLine;
  }

  function parse(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function cacheKey(action, params) {
    const stable = {};

    Object.keys(params || {})
      .sort()
      .forEach(function (key) {
        stable[key] = params[key];
      });

    return CFG.prefix + action + '_' + JSON.stringify(stable);
  }

  function saveCache(action, params, data) {
    if (!CFG.cacheable.includes(action)) return;

    try {
      localStorage.setItem(
        cacheKey(action, params),
        JSON.stringify({
          savedAt: Date.now(),
          data: data
        })
      );
    } catch (e) {
      console.warn('Cache offline penuh.');
    }
  }

  function getCache(action, params, allowExpired) {
    if (!CFG.cacheable.includes(action)) return null;

    const obj = parse(
      localStorage.getItem(cacheKey(action, params))
    );

    if (!obj || !Object.prototype.hasOwnProperty.call(obj, 'data')) {
      return null;
    }

    if (allowExpired) {
      return obj.data;
    }

    const ttl =
      CFG.cacheTtlMs[action] ||
      6 * 60 * 60 * 1000;

    if (Date.now() - obj.savedAt > ttl) {
      return null;
    }

    return obj.data;
  }

  function tampilOffline() {
    const banner =
      document.getElementById('offline-banner');

    if (!banner) return;

    banner.textContent =
      '⚠️ OFFLINE — menggunakan data tersimpan.';

    banner.classList.add('show');
  }

  function tampilOnline() {
    const banner =
      document.getElementById('offline-banner');

    if (!banner) return;

    banner.textContent =
      '✓ ONLINE — terhubung ke server.';

    banner.classList.remove('show');
  }

  /*
   * ============================================================
   * API GET WRAPPER
   * ============================================================
   */

  if (typeof window.apiGet === 'function') {

    const apiGetOriginal = window.apiGet;

    window.apiGet = async function (action, params) {

      params = params || {};

      /*
       * ONLINE
       * Tetap server sebagai sumber data utama.
       */
      if (isOnline()) {
        try {
          const result =
            await apiGetOriginal(action, params);

          saveCache(action, params, result);

          return result;

        } catch (error) {

          /*
           * Jika internet sebenarnya gagal,
           * gunakan cache terakhir.
           */
          const fallback =
            getCache(action, params, true);

          if (fallback !== null) {
            tampilOffline();
            return fallback;
          }

          throw error;
        }
      }

      /*
       * OFFLINE
       */
      const cached =
        getCache(action, params, false);

      if (cached !== null) {
        return cached;
      }

      /*
       * Jika TTL habis tetapi data masih ada,
       * tetap izinkan sebagai fallback.
       */
      const stale =
        getCache(action, params, true);

      if (stale !== null) {
        tampilOffline();
        return stale;
      }

      throw new Error(
        'OFFLINE_NO_CACHE: Data belum tersedia di perangkat. ' +
        'Hubungkan internet sekali untuk mengambil data.'
      );
    };
  }

  /*
   * ============================================================
   * API POST WRAPPER
   * ============================================================
   *
   * Untuk sekarang WRITE OFFLINE DIBLOK.
   * Ini sengaja untuk melindungi stok dan transaksi.
   */

  if (typeof window.apiPost === 'function') {

    const apiPostOriginal = window.apiPost;

    window.apiPost = async function (action, data) {

      if (
        !isOnline() &&
        CFG.writeActions.includes(action)
      ) {

        const error = new Error(
          'OFFLINE_WRITE_BLOCKED: Tidak ada koneksi internet. ' +
          'Perubahan belum disimpan. Sambungkan internet lalu ulangi.'
        );

        error.code = 'OFFLINE_WRITE_BLOCKED';

        throw error;
      }

      return apiPostOriginal(action, data);
    };
  }

  /*
   * ============================================================
   * KERANJANG
   * ============================================================
   */

  function simpanKeranjang() {
    try {
      if (!window.AppState) return;

      localStorage.setItem(
        CFG.cartKey,
        JSON.stringify({
          savedAt: Date.now(),
          userId:
            AppState.user
              ? AppState.user.idUser
              : null,
          cart:
            Array.isArray(AppState.cart)
              ? AppState.cart
              : [],
          customer:
            AppState.cartCustomer || null
        })
      );
    } catch (e) {}
  }

  function muatKeranjang() {
    try {
      if (!window.AppState) return;

      const data =
        parse(localStorage.getItem(CFG.cartKey));

      if (!data || !Array.isArray(data.cart)) {
        return;
      }

      const currentUser =
        AppState.user
          ? AppState.user.idUser
          : null;

      if (
        data.userId &&
        currentUser &&
        data.userId !== currentUser
      ) {
        return;
      }

      AppState.cart = data.cart;
      AppState.cartCustomer =
        data.customer || null;

      if (
        typeof window.updateKeranjangUIStatus ===
        'function'
      ) {
        window.updateKeranjangUIStatus();
      }

      if (
        typeof window.renderCartFab ===
        'function'
      ) {
        window.renderCartFab();
      }

    } catch (e) {
      console.warn(
        'Gagal memuat keranjang offline.'
      );
    }
  }

  /*
   * Simpan keranjang berkala.
   * Tidak mengubah fungsi keranjang lama.
   */
  setInterval(simpanKeranjang, 1500);

  window.addEventListener(
    'beforeunload',
    simpanKeranjang
  );

  window.addEventListener(
    'pagehide',
    simpanKeranjang
  );

  /*
   * ============================================================
   * STATUS ONLINE / OFFLINE
   * ============================================================
   */

  window.addEventListener(
    'online',
    function () {
      tampilOnline();

      if (typeof window.toast === 'function') {
        window.toast(
          'Koneksi kembali. Sistem ONLINE.',
          'success'
        );
      }
    }
  );

  window.addEventListener(
    'offline',
    function () {
      tampilOffline();

      if (typeof window.toast === 'function') {
        window.toast(
          'Mode OFFLINE aktif.',
          'warn'
        );
      }
    }
  );

  document.addEventListener(
    'DOMContentLoaded',
    function () {

      setTimeout(function () {
        muatKeranjang();

        if (isOnline()) {
          tampilOnline();
        } else {
          tampilOffline();
        }
      }, 500);

    }
  );

  /*
   * ============================================================
   * DIAGNOSTIK
   * ============================================================
   */

  window.AnaFarmaOffline = {

    version: '1.0.0',

    isOnline: function () {
      return navigator.onLine;
    },

    clearCache: function () {
      Object.keys(localStorage)
        .forEach(function (key) {

          if (
            key.indexOf(CFG.prefix) === 0
          ) {
            localStorage.removeItem(key);
          }

        });
    },

    clearCart: function () {
      localStorage.removeItem(
        CFG.cartKey
      );
    }

  };

})();