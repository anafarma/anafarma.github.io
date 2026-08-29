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

/* =====================================================================
 * DEV UI HARDENING — modal actions, supplier quick management, stale errors
 * ===================================================================== */
(function () {
  'use strict';

  const VERSION = '20260829-UI-HARDENING-1';
  const ROOT_ID = 'modal-root';
  const SUPPLIER_PANEL_ID = 'af-product-supplier-panel';
  let installed = false;
  let lastErrorKey = '';
  let lastErrorAt = 0;

  const state = () => window.AppState || null;
  const user = () => state()?.user || null;
  const isOwner = () => String(user()?.role || '').trim().toLowerCase() === 'owner';
  const esc = v => typeof window.escapeHtml === 'function'
    ? window.escapeHtml(v)
    : String(v ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));

  function currentScreen() {
    return String(state()?.currentScreen || document.querySelector('.screen.active')?.dataset?.screen || '');
  }

  function annotateApiErrors() {
    if (typeof window.apiGet === 'function' && !window.apiGet.__afScreenAnnotated) {
      const originalGet = window.apiGet;
      const wrappedGet = async function (action, params, options) {
        const screenAtStart = currentScreen();
        try {
          return await originalGet.call(this, action, params, options);
        } catch (error) {
          if (error && typeof error === 'object') error.__anaScreen = screenAtStart;
          throw error;
        }
      };
      wrappedGet.__afScreenAnnotated = true;
      wrappedGet.__afOriginal = originalGet;
      window.apiGet = wrappedGet;
    }

    if (typeof window.apiPost === 'function' && !window.apiPost.__afScreenAnnotated) {
      const originalPost = window.apiPost;
      const wrappedPost = async function (action, data, options) {
        const screenAtStart = currentScreen();
        try {
          return await originalPost.call(this, action, data, options);
        } catch (error) {
          if (error && typeof error === 'object') error.__anaScreen = screenAtStart;
          throw error;
        }
      };
      wrappedPost.__afScreenAnnotated = true;
      wrappedPost.__afOriginal = originalPost;
      window.apiPost = wrappedPost;
    }

    if (typeof window.tampilkanError === 'function' && !window.tampilkanError.__afDedupe) {
      const originalError = window.tampilkanError;
      const wrappedError = function (error) {
        const message = error?.message || String(error || 'Terjadi kesalahan.');
        const originScreen = error?.__anaScreen;
        const activeScreen = currentScreen();

        if (originScreen && activeScreen && originScreen !== activeScreen) {
          console.warn('[DEV UI HARDENING] stale request ignored:', originScreen, '->', activeScreen, message);
          return;
        }

        const key = `${activeScreen}|${message}`;
        const now = Date.now();
        if (key === lastErrorKey && now - lastErrorAt < 1800) return;
        lastErrorKey = key;
        lastErrorAt = now;
        return originalError.call(this, error);
      };
      wrappedError.__afDedupe = true;
      wrappedError.__afOriginal = originalError;
      window.tampilkanError = wrappedError;
    }
  }

  function closeExistingModal() {
    if (typeof window.AnaFarmaDevFeatures?.closeModal === 'function') {
      window.AnaFarmaDevFeatures.closeModal();
      return true;
    }
    return false;
  }

  function installUniversalCancel() {
    if (window.__ANA_FARMA_DEV_MODAL_CANCEL_HARDENING__) return;
    window.__ANA_FARMA_DEV_MODAL_CANCEL_HARDENING__ = true;

    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-dev-close]');
      if (!button) return;
      const modal = button.closest('[data-dev-modal]');
      if (!modal) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeExistingModal();
    }, true);
  }

  async function loadSuppliersFresh() {
    if (typeof window.apiGet !== 'function') return [];
    const data = await window.apiGet('getSupplier', {}, { cache: false });
    return Array.isArray(data) ? data : [];
  }

  function supplierPanelHtml(mode, supplier) {
    const s = supplier || {};
    return `
      <div id="${SUPPLIER_PANEL_ID}" class="card" style="margin:8px 0 12px;border:1px solid rgba(15,143,131,.22);background:#fbfffe;box-shadow:none;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
          <div style="font-weight:850;color:var(--primary-dark)">${mode === 'edit' ? 'Edit Supplier' : 'Supplier Baru'}</div>
          <button type="button" class="btn btn-secondary btn-sm" data-af-supplier-cancel>Batal</button>
        </div>
        <div class="form-group"><label for="af-sp-name">Nama Supplier</label><input id="af-sp-name" value="${esc(s.Nama_Supplier || '')}" autocomplete="organization"></div>
        <div class="form-group"><label for="af-sp-contact">Kontak</label><input id="af-sp-contact" value="${esc(s.Kontak || '')}" inputmode="tel"></div>
        <div class="form-group"><label for="af-sp-address">Alamat</label><textarea id="af-sp-address" rows="2">${esc(s.Alamat || '')}</textarea></div>
        <div class="form-group" style="margin-bottom:8px;"><label><input id="af-sp-active" type="checkbox" ${s.Aktif !== false ? 'checked' : ''}> Aktif</label></div>
        <button type="button" class="btn btn-primary" id="af-sp-save">${mode === 'edit' ? 'Simpan Perubahan Supplier' : 'Tambah Supplier'}</button>
      </div>`;
  }

  async function refreshSupplierSelect(select, selectedId) {
    const suppliers = await loadSuppliersFresh();
    select.innerHTML = '<option value="">-- Tanpa Supplier --</option>' + suppliers.map(s => `<option value="${esc(s.ID_Supplier)}">${esc(s.Nama_Supplier)}</option>`).join('');
    if (selectedId != null) select.value = String(selectedId);
    select.dataset.afSupplierLoaded = '1';
    select.dataset.afSupplierList = JSON.stringify(suppliers);
    return suppliers;
  }

  function injectSupplierActions() {
    if (!isOwner()) return;
    const root = document.getElementById(ROOT_ID);
    const select = root?.querySelector('#p-supplier');
    if (!select || root.querySelector('#af-supplier-actions')) return;
    const group = select.closest('.form-group');
    if (!group) return;

    const actions = document.createElement('div');
    actions.id = 'af-supplier-actions';
    actions.style.cssText = 'display:flex;gap:7px;margin-top:-6px;margin-bottom:12px;';
    actions.innerHTML = '<button type="button" class="btn btn-outline btn-sm" id="af-supplier-add">+ Supplier Baru</button><button type="button" class="btn btn-outline btn-sm" id="af-supplier-edit" disabled>✎ Edit Supplier</button>';
    group.insertAdjacentElement('afterend', actions);

    const updateEditState = () => {
      const edit = root.querySelector('#af-supplier-edit');
      if (edit) edit.disabled = !select.value;
    };
    select.addEventListener('change', updateEditState);

    const openPanel = async mode => {
      root.querySelector('#' + SUPPLIER_PANEL_ID)?.remove();
      let supplier = null;
      if (mode === 'edit') {
        try {
          let list = JSON.parse(select.dataset.afSupplierList || '[]');
          if (!list.length) list = await loadSuppliersFresh();
          supplier = list.find(x => String(x.ID_Supplier) === String(select.value)) || null;
        } catch (_) {}
        if (!supplier) { window.toast?.('Supplier yang dipilih tidak ditemukan.', 'warn'); return; }
      }
      actions.insertAdjacentHTML('afterend', supplierPanelHtml(mode, supplier));
      const panel = root.querySelector('#' + SUPPLIER_PANEL_ID);
      if (!panel) return;
      panel.querySelector('[data-af-supplier-cancel]').onclick = () => panel.remove();
      panel.querySelector('#af-sp-save').onclick = async () => {
        const save = panel.querySelector('#af-sp-save');
        const namaSupplier = panel.querySelector('#af-sp-name').value.trim();
        const kontak = panel.querySelector('#af-sp-contact').value.trim();
        const alamat = panel.querySelector('#af-sp-address').value.trim();
        const aktif = panel.querySelector('#af-sp-active').checked;
        if (!namaSupplier) { window.toast?.('Nama supplier wajib diisi.', 'warn'); return; }
        if (!state()?.isOnline) { window.toast?.('Pengelolaan supplier membutuhkan koneksi internet.', 'warn'); return; }
        save.disabled = true;
        try {
          let selectedId = select.value;
          if (mode === 'edit') {
            await window.apiPost('updateSupplier', { idUser: user().idUser, idSupplier: supplier.ID_Supplier, namaSupplier, kontak, alamat, aktif }, { allowOffline: false });
            selectedId = supplier.ID_Supplier;
            window.toast?.('Supplier berhasil diperbarui.', 'success');
          } else {
            const result = await window.apiPost('addSupplier', { idUser: user().idUser, namaSupplier, kontak, alamat }, { allowOffline: false });
            selectedId = result?.idSupplier || '';
            window.toast?.('Supplier baru berhasil ditambahkan.', 'success');
          }
          await refreshSupplierSelect(select, selectedId);
          updateEditState();
          panel.remove();
        } catch (error) {
          window.tampilkanError?.(error);
          save.disabled = false;
        }
      };
    };
    root.querySelector('#af-supplier-add').onclick = () => openPanel('add');
    root.querySelector('#af-supplier-edit').onclick = () => openPanel('edit');

    if (!select.dataset.afSupplierList) {
      loadSuppliersFresh().then(list => {
        if (!select.isConnected) return;
        select.dataset.afSupplierList = JSON.stringify(list);
        updateEditState();
      }).catch(error => console.warn('[SUPPLIER QUICK MANAGER]', error));
    }
    updateEditState();
  }

  function observeProductModal() {
    if (window.__ANA_FARMA_DEV_SUPPLIER_MODAL_OBSERVER__) return;
    window.__ANA_FARMA_DEV_SUPPLIER_MODAL_OBSERVER__ = true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (root.querySelector('[data-dev-modal] #p-supplier')) injectSupplierActions();
    });
    observer.observe(root, { childList: true, subtree: true });
    if (root.querySelector('[data-dev-modal] #p-supplier')) injectSupplierActions();
  }

  function install() {
    if (installed) return;
    installed = true;
    annotateApiErrors();
    installUniversalCancel();
    observeProductModal();
    window.__ANA_FARMA_DEV_UI_HARDENING__ = VERSION;
    console.info('[DEV UI HARDENING]', VERSION);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
