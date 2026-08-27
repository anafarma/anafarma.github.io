/* APOTEK ANA FARMA /dev — runtime data & performance hardening V18.6 */
(function () {
  'use strict';

  const VERSION = '2026-08-27-DEV-HOTFIX-18-6';
  const CACHE_AGE = 15 * 60 * 1000;
  const PRODUCT_CACHE_AGE = 60 * 60 * 1000;

  function state() { return window.AppState; }
  function user() { return state() && state().user; }
  function withUser() {
    const u = user();
    return { idUser: u && u.idUser ? u.idUser : null };
  }
  function esc(v) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(v)
      : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function first(obj, keys, fallback = '') {
    for (const key of keys) {
      const value = obj && obj[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return fallback;
  }

  function normalizeProduct(raw) {
    const p = raw || {};
    const id = first(p, ['idProduk','IDProduk','ID_Produk','kode','Kode','Kode_Obat','kodeObat','Code','code']);
    const code = first(p, ['kode','Kode','Kode_Obat','kodeObat','idProduk','IDProduk'], id);
    const name = first(p, ['nama','Nama','namaObat','NamaObat','Nama_Obat','nama_obat','name','Name','obat'], 'Obat tanpa nama');
    const price = num(first(p, ['hargaJual','HargaJual','Harga_Jual','harga','Harga','Harga_Beli_Jual'], 0));
    const stock = num(first(p, ['stok','Stok','STOK','stokTersedia','Stok_Tersedia','Qty_Stok'], 0));
    const unit = first(p, ['satuan','Satuan','Satuan_Beli','Unit','unit'], '');
    return {
      ...p,
      idProduk: String(id),
      kode: String(code),
      nama: String(name),
      hargaJual: price,
      stok: stock,
      satuan: String(unit),
      kategori: String(first(p, ['kategori','Kategori'], '')),
      Kode_Obat: first(p, ['Kode_Obat','kode','Kode'], code),
      Nama_Obat: first(p, ['Nama_Obat','nama','Nama','namaObat'], name),
      Harga_Jual: price,
      Stok: stock,
      Satuan: first(p, ['Satuan','satuan'], unit)
    };
  }

  function renderDashboardFast(root) {
    if (!root || !user()) return;
    const u = user();
    root.innerHTML = `<div class="container">
      <div class="section-title">Ringkasan</div>
      <div class="grid-2">
        <div class="stat-card"><div class="stat-label">Total Produk</div><div class="stat-value" data-dashboard="totalProduk">—</div></div>
        <div class="stat-card"><div class="stat-label">Stok Menipis</div><div class="stat-value" data-dashboard="stokMenipis">—</div></div>
        <div class="stat-card"><div class="stat-label">Penjualan Hari Ini</div><div class="stat-value" data-dashboard="penjualanHariIni">—</div></div>
        <div class="stat-card good"><div class="stat-label">Transaksi Hari Ini</div><div class="stat-value" data-dashboard="transaksiHariIni">—</div></div>
      </div>
      <div class="section-title">Akses Cepat</div>
      <div class="menu-grid">
        <button class="menu-item menu-item-unggulan" data-action="navigate" data-screen="kasir"><span class="menu-icon">🛒</span><span class="menu-label">Kasir</span></button>
        <button class="menu-item" data-action="navigate" data-screen="stok"><span class="menu-icon">💊</span><span class="menu-label">Stok</span></button>
        <button class="menu-item" data-action="navigate" data-screen="riwayat"><span class="menu-icon">🧾</span><span class="menu-label">Riwayat</span></button>
        <button class="menu-item" data-action="navigate" data-screen="pembelian"><span class="menu-icon">📦</span><span class="menu-label">Pembelian</span></button>
        <button class="menu-item" data-action="navigate" data-screen="retur"><span class="menu-icon">↩️</span><span class="menu-label">Retur</span></button>
        <button class="menu-item" data-action="navigate" data-screen="pelanggan"><span class="menu-icon">👥</span><span class="menu-label">Pelanggan</span></button>
        <button class="menu-item" data-action="navigate" data-screen="laporan"><span class="menu-icon">📊</span><span class="menu-label">Laporan</span></button>
        <button class="menu-item" data-action="navigate" data-screen="opname"><span class="menu-icon">📋</span><span class="menu-label">Opname</span></button>
        ${u.role === 'Owner' ? '<button class="menu-item" data-action="navigate" data-screen="pengaturan"><span class="menu-icon">⚙️</span><span class="menu-label">Pengaturan</span></button>' : ''}
      </div>
      <div class="section-title">Status</div>
      <div class="card"><div class="list-item" style="box-shadow:none;margin:0;padding:0;"><div class="li-main"><div class="li-title">Koneksi</div><div class="li-sub" data-status-online>${navigator.onLine ? 'Online' : 'Offline'}</div></div><span class="pill pill-gray" data-status-sync>Memeriksa…</span></div></div>
    </div>`;

    const setSummary = summary => {
      if (!summary) return;
      const totalProduk = summary.totalProduk ?? summary.TotalProduk ?? summary.total_produk ?? 0;
      const stokMenipis = summary.stokMenipis ?? summary.StokMenipis ?? summary.stok_menipis ?? 0;
      const penjualan = summary.penjualanHariIni ?? summary.PenjualanHariIni ?? summary.penjualan_hari_ini ?? 0;
      const transaksi = summary.transaksiHariIni ?? summary.TransaksiHariIni ?? summary.transaksi_hari_ini ?? 0;
      const q = sel => root.querySelector(sel);
      if (q('[data-dashboard="totalProduk"]')) q('[data-dashboard="totalProduk"]').textContent = totalProduk;
      if (q('[data-dashboard="stokMenipis"]')) q('[data-dashboard="stokMenipis"]').textContent = stokMenipis;
      if (q('[data-dashboard="penjualanHariIni"]')) q('[data-dashboard="penjualanHariIni"]').textContent = typeof window.formatRupiah === 'function' ? window.formatRupiah(penjualan) : `Rp ${num(penjualan).toLocaleString('id-ID')}`;
      if (q('[data-dashboard="transaksiHariIni"]')) q('[data-dashboard="transaksiHariIni"]').textContent = transaksi;
    };

    Promise.resolve(window.bacaCache && window.bacaCache('getDashboardSummary', withUser(), CACHE_AGE))
      .then(cached => { if (cached) setSummary(cached); })
      .catch(() => {});

    Promise.resolve(window.jumlahOutbox ? window.jumlahOutbox() : 0).then(count => {
      const el = root.querySelector('[data-status-sync]');
      if (!el) return;
      el.textContent = count > 0 ? `${count} pending` : 'Tersinkron';
      el.className = count > 0 ? 'pill pill-warn' : 'pill pill-success';
    }).catch(() => {});

    const refresh = () => {
      if (!window.apiGet) return;
      return window.apiGet('getDashboardSummary', withUser(), { maxAge: CACHE_AGE })
        .then(setSummary)
        .catch(error => console.warn('[DEV DASHBOARD REFRESH]', error));
    };
    if (navigator.onLine) {
      if ('requestIdleCallback' in window) requestIdleCallback(refresh, { timeout: 1200 });
      else setTimeout(refresh, 0);
    }
  }

  function renderKasirFast(root) {
    if (!root || !user()) return;
    root.innerHTML = `<div class="container"><div class="section-title">Kasir</div><div class="search-bar"><span>🔎</span><input type="search" placeholder="Cari nama obat atau kode…" data-kasir-search autocomplete="off"></div><div data-kasir-results><div class="empty-state">Memuat data obat…</div></div><div class="section-title">Keranjang</div><div data-cart-root></div><div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;"><strong>Total</strong><strong data-cart-total>Rp0</strong></div><div style="height:10px"></div><button class="btn btn-primary" data-action="checkout">Proses & Simpan · <span data-cart-count>0</span></button></div></div>`;

    if (window.renderCart) window.renderCart();
    const searchInput = root.querySelector('[data-kasir-search]');
    const results = root.querySelector('[data-kasir-results]');
    let products = Array.isArray(state().produkCache) ? state().produkCache.map(normalizeProduct) : [];
    state().produkCache = products;

    const paint = keyword => {
      const q = String(keyword || '').trim().toLowerCase();
      const filtered = products.filter(p => !q || p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q)).slice(0, 30);
      if (!filtered.length) { results.innerHTML = '<div class="empty-state">Obat tidak ditemukan.</div>'; return; }
      results.innerHTML = filtered.map(p => `<button class="list-item" style="width:100%;border:none;text-align:left;" data-action="add-cart" data-id-produk="${esc(p.idProduk)}"><div class="li-main"><div class="li-title">${esc(p.nama)}</div><div class="li-sub">${esc(p.kode)} · ${typeof window.formatRupiah === 'function' ? window.formatRupiah(p.hargaJual) : 'Rp 0'}</div></div><div class="li-right"><div class="li-value">Stok ${p.stok}</div></div></button>`).join('');
    };

    const applyProducts = data => {
      if (!Array.isArray(data)) return;
      products = data.map(normalizeProduct);
      state().produkCache = products;
      state().produkCacheAt = Date.now();
      paint(searchInput ? searchInput.value : '');
    };

    const params = withUser();
    Promise.resolve(window.bacaCache && window.bacaCache('getProduk', params, PRODUCT_CACHE_AGE))
      .then(cached => { if (Array.isArray(cached) && cached.length) applyProducts(cached); })
      .catch(() => {});

    if (products.length) paint(searchInput.value);

    const refresh = () => window.apiGet ? window.apiGet('getProduk', params, { maxAge: PRODUCT_CACHE_AGE }).then(applyProducts).catch(error => console.warn('[DEV KASIR REFRESH]', error)) : null;
    if (navigator.onLine) {
      if (products.length) {
        if ('requestIdleCallback' in window) requestIdleCallback(refresh, { timeout: 1500 }); else setTimeout(refresh, 0);
      } else refresh();
    }

    searchInput?.addEventListener('input', event => {
      const q = event.target.value;
      clearTimeout(searchInput.__anaTimer);
      searchInput.__anaTimer = setTimeout(() => paint(q), 80);
    });
  }

  function install() {
    if (!window.AppState || !window.SCREEN_RENDERERS || !window.apiGet) return false;
    window.SCREEN_RENDERERS.dashboard = renderDashboardFast;
    window.SCREEN_RENDERERS.kasir = renderKasirFast;
    window.__ANA_DEV_HOTFIX_VERSION__ = VERSION;
    console.info('[DEV HOTFIX] installed', VERSION);
    return true;
  }

  function wait() {
    if (install()) return;
    setTimeout(wait, 50);
  }
  wait();
})();
