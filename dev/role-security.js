/*
 * APOTEK ANA FARMA — DEV ROLE SECURITY V18.8
 *
 * Defense-in-depth di frontend. Backend tetap menjadi otoritas terakhir.
 * Pegawai tidak boleh menjalankan mutation Owner-only walaupun mencoba
 * memanggil API dari console/UI secara langsung.
 */
(function () {
  'use strict';

  const VERSION = '2026-08-27-DEV-ROLE-SECURITY-18-8';
  const OWNER_ONLY_ACTIONS = new Set([
    'addProduk', 'updateProduk', 'adjustStok',
    'addSupplier', 'updateSupplier',
    'updatePengaturan',
    'gantiPassword',
    'updateUser', 'toggleGPSUser', 'resetPasswordUser',
    'setujuiPengajuanPembelian', 'tolakPengajuanPembelian'
  ]);

  function isOwner() {
    return String(window.AppState?.user?.role || '').trim().toLowerCase() === 'owner';
  }

  function install() {
    if (window.__ANA_FARMA_ROLE_SECURITY__) return;
    if (typeof window.apiPost !== 'function' || !window.AppState) {
      setTimeout(install, 50);
      return;
    }
    window.__ANA_FARMA_ROLE_SECURITY__ = true;

    const originalPost = window.apiPost;
    const guardedPost = function (action, data, options) {
      if (!isOwner() && OWNER_ONLY_ACTIONS.has(String(action))) {
        const error = new Error('Aksi ini hanya dapat dilakukan oleh Owner.');
        error.kind = 'authorization';
        if (typeof window.toast === 'function') window.toast(error.message, 'warn');
        return Promise.reject(error);
      }
      return originalPost.call(this, action, data, options);
    };
    guardedPost.__devRoleGuard = true;
    guardedPost.__devOriginal = originalPost;
    window.apiPost = guardedPost;

    const observer = new MutationObserver(() => {
      if (isOwner()) return;
      const profile = document.querySelector('[data-screen="profil"]');
      profile?.querySelectorAll('#pf-pass, [data-action="change-password"]').forEach(el => {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('disabled', 'disabled');
      });
      profile?.querySelectorAll('button').forEach(btn => {
        if (/ganti\s+password/i.test(btn.textContent || '')) {
          btn.classList.add('hidden');
          btn.setAttribute('disabled', 'disabled');
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', event => {
      if (isOwner()) return;
      const button = event.target.closest('button');
      if (!button) return;
      if (/ganti\s+password/i.test(button.textContent || '')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (typeof window.toast === 'function') window.toast('Penggantian password hanya dapat dilakukan oleh Owner.', 'warn');
      }
    }, true);

    window.__ANA_FARMA_ROLE_SECURITY_VERSION__ = VERSION;
    console.info('[DEV ROLE SECURITY] installed', VERSION);
  }

  install();
})();
