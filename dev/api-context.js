/*
 * APOTEK ANA FARMA — DEV API CONTEXT
 * V20.0
 *
 * Single responsibility: inject the current user id into read requests.
 * Authorization / role / shift / GPS mutation policy is centralized in
 * role-security.js (DEV CONSOLIDATED POLICY). This file deliberately does
 * NOT wrap apiPost(), avoiding competing POST policy layers.
 */
(function () {
  'use strict';

  function install() {
    if (typeof apiGet !== 'function' || typeof AppState === 'undefined') {
      setTimeout(install, 25);
      return;
    }
    if (window.__ANA_FARMA_DEV_API_CONTEXT__) return;
    window.__ANA_FARMA_DEV_API_CONTEXT__ = true;

    const protectedGet = new Set([
      'getProduk','getSupplier','getPelanggan','getTransaksi','getDetailTransaksi',
      'getLogStok','getPembelian','getRetur','getStokOpnameLog','getLaporanPenjualan',
      'getLaporanLabaRugi','getLaporanKadaluarsa','getAnalisisPenjualan',
      'getOmzetPerKasir','getShiftStatus','getShiftLog','getUsers',
      'getDashboardSummary','getPengajuanPembelian','getPengaturan','getLokasi'
    ]);

    const originalGet = window.apiGet;
    window.apiGet = function (action, params, options) {
      const p = Object.assign({}, params || {});
      if (protectedGet.has(action) && !p.idUser && AppState.user) {
        p.idUser = AppState.user.idUser;
      }
      return originalGet.call(this, action, p, options);
    };
    window.apiGet.__devContextWrapped = true;
  }

  install();
})();
