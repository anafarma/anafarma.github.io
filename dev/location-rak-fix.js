/**
 * APOTEK ANA FARMA — DEV LOCATION RAK FIX
 *
 * Menutup celah UI pada dropdown Lokasi Rak tanpa membuat router/API baru.
 *
 * Masalah yang ditangani:
 * 1. features-runtime menyimpan [] sebagai cache lokasi selama 24 jam.
 * 2. AppState.lokasiCache = [] dianggap "sudah dimuat", sehingga modal
 *    tidak mencoba memuat ulang.
 * 3. Perubahan data Lokasi_Rak di backend tidak langsung terlihat di modal.
 * 4. Backend terbaru tetap memvalidasi sesi untuk getLokasi, sehingga
 *    refresh langsung juga wajib mengirim idUser.
 *
 * Strategi:
 * - Ambil lokasi secara fresh saat aplikasi sudah siap.
 * - Kirim idUser dari sesi aktif pada request getLokasi.
 * - Saat modal Edit/Tambah Obat muncul, refresh fresh bila daftar kosong.
 * - Tidak menghapus nilai lokasi yang sedang dipilih.
 * - Tidak mengubah API bisnis, schema database, atau hak akses.
 */
(function () {
  'use strict';

  const LOCATION_FIX_VERSION = '20260829-LOCATION-RACK-FIX-2';
  const MAX_WAIT = 12000;
  const WAIT_STEP = 50;

  function esc(value) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(value)
      : String(value == null ? '' : value).replace(/[&<>\"']/g, function (c) {
          return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#039;' })[c];
        });
  }

  function setLocationState(list) {
    const normalized = Array.isArray(list) ? list.filter(function (x) {
      return x && String(x.ID_Lokasi || '').trim() !== '';
    }).map(function (x) {
      return {
        ID_Lokasi: String(x.ID_Lokasi).trim(),
        Nama_Display: String(x.Nama_Display || x.ID_Lokasi).trim(),
        Zona: String(x.Zona || '').trim()
      };
    }) : [];

    if (window.AppState) window.AppState.lokasiCache = normalized;
    return normalized;
  }

  async function fetchLocationsFresh() {
    if (!window.AppState || !window.AppState.user || !window.API_URL) return [];

    const idUser = String(window.AppState.user.idUser || '').trim();
    if (!idUser) return [];

    const url = new URL(window.API_URL);
    url.searchParams.set('action', 'getLokasi');
    url.searchParams.set('idUser', idUser);
    url.searchParams.set('_location_refresh', String(Date.now()));

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit'
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);

      const json = await response.json();
      if (!json || json.ok !== true) throw new Error((json && json.error) || 'Respons getLokasi tidak valid.');

      const list = setLocationState(json.data);

      // Simpan hasil non-kosong ke cache standar agar offline/read cepat tetap ada.
      if (list.length && typeof window.simpanCache === 'function') {
        window.simpanCache('getLokasi', { idUser: idUser }, list).catch(function () {});
      }
      return list;
    } catch (error) {
      console.warn('[LOCATION FIX] gagal mengambil lokasi fresh:', error);
      return Array.isArray(window.AppState.lokasiCache) ? window.AppState.lokasiCache : [];
    }
  }

  function buildOptions(select, list, selectedValue) {
    if (!select) return;

    const current = selectedValue != null
      ? String(selectedValue)
      : String(select.value || '');

    const fragment = document.createDocumentFragment();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Belum teridentifikasi / tanpa rak';
    fragment.appendChild(empty);

    (Array.isArray(list) ? list : []).forEach(function (item) {
      const option = document.createElement('option');
      option.value = String(item.ID_Lokasi || '').trim();
      option.textContent = String(item.Nama_Display || item.ID_Lokasi || '').trim() +
        (item.Zona ? ' • ' + String(item.Zona).trim() : '');
      fragment.appendChild(option);
    });

    select.replaceChildren(fragment);

    const exists = Array.from(select.options).some(function (option) {
      return option.value === current;
    });
    select.value = exists ? current : '';
  }

  async function refreshRakSelectIfNeeded(force) {
    const select = document.querySelector('#modal-root #p-rak');
    if (!select) return false;

    const currentValue = select.value || '';
    const cached = Array.isArray(window.AppState && window.AppState.lokasiCache)
      ? window.AppState.lokasiCache
      : [];

    // Jika sudah ada data, tampilkan segera. Jika kosong, ambil fresh.
    if (cached.length && !force) {
      buildOptions(select, cached, currentValue);
      return true;
    }

    const previousText = select.options.length <= 1 ? 'Memuat lokasi rak…' : '';
    if (previousText) {
      select.innerHTML = '<option value="">' + esc(previousText) + '</option>';
      select.disabled = true;
    }

    const fresh = await fetchLocationsFresh();
    buildOptions(select, fresh, currentValue);
    select.disabled = false;
    return true;
  }

  function installObserver() {
    const root = document.getElementById('modal-root');
    if (!root || root.__LOCATION_RAK_FIX_INSTALLED__) return;
    root.__LOCATION_RAK_FIX_INSTALLED__ = true;

    const observer = new MutationObserver(function () {
      const select = root.querySelector('#p-rak');
      if (!select || select.__LOCATION_RAK_PATCHED__) return;
      select.__LOCATION_RAK_PATCHED__ = true;

      // Jalankan setelah renderer modal selesai menulis DOM.
      requestAnimationFrame(function () {
        refreshRakSelectIfNeeded(false).catch(function (error) {
          console.warn('[LOCATION FIX] modal refresh:', error);
        });
      });
    });

    observer.observe(root, { childList: true, subtree: true });
    window.__ANA_FARMA_LOCATION_RAK_OBSERVER__ = observer;
  }

  function waitForApp() {
    const started = Date.now();
    const timer = setInterval(function () {
      if (window.AppState && window.API_URL && typeof window.fetch === 'function') {
        clearInterval(timer);
        installObserver();
        fetchLocationsFresh().catch(function () {});
        return;
      }
      if (Date.now() - started > MAX_WAIT) clearInterval(timer);
    }, WAIT_STEP);
  }

  window.AnaFarmaLocationRakFix = {
    version: LOCATION_FIX_VERSION,
    refresh: function () { return fetchLocationsFresh(); },
    refreshModal: function () { return refreshRakSelectIfNeeded(true); }
  };

  waitForApp();
})();
