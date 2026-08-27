/*
 * APOTEK ANA FARMA — DEV KASIR PERFORMANCE V18.8
 *
 * Cache-first transaction screen. app.js tetap menjadi pemilik cart,
 * checkout, API, IndexedDB dan outbox; file ini hanya mempercepat render.
 */
(function () {
  'use strict';

  const VERSION = '2026-08-27-DEV-KASIR-PERF-18-8';
  const CACHE_AGE = 60 * 60 * 1000;
  const INSTALLED = '__ANA_FARMA_KASIR_PERF__';

  function esc(v) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? ''); }
  function money(v) { return typeof window.formatRupiah === 'function' ? window.formatRupiah(v) : `Rp ${Number(v || 0).toLocaleString('id-ID')}`; }
  function normalize(p) {
    p = p || {};
    return {
      ...p,
      idProduk: String(p.idProduk ?? p.IDProduk ?? p.ID_Produk ?? p.kode ?? p.Kode ?? p.Kode_Obat ?? ''),
      kode: String(p.kode ?? p.Kode ?? p.Kode_Obat ?? p.idProduk ?? p.IDProduk ?? ''),
      nama: String(p.nama ?? p.Nama ?? p.Nama_Obat ?? p.namaObat ?? p.NamaObat ?? 'Obat tanpa nama'),
      hargaJual: Number(p.hargaJual ?? p.HargaJual ?? p.Harga_Jual ?? p.harga ?? 0) || 0,
      stok: Number(p.stok ?? p.Stok ?? p.STOK ?? 0) || 0
    };
  }

  function render(root) {
    const u = window.AppState?.user;
    if (!root || !u) return;
    root.innerHTML = `<div class="container"><div class="section-title">Transaksi</div><div class="search-bar"><span>🔎</span><input type="search" placeholder="Cari nama obat atau kode…" data-kasir-search autocomplete="off"></div><div data-kasir-results><div class="empty-state">Menyiapkan data obat…</div></div><div class="section-title">Keranjang</div><div data-cart-root></div><div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;"><strong>Total</strong><strong data-cart-total>Rp0</strong></div><div style="height:10px"></div><button class="btn btn-primary" data-action="checkout">Proses & Simpan · <span data-cart-count>0</span></button></div></div>`;
    if (typeof window.renderCart === 'function') window.renderCart();

    const search = root.querySelector('[data-kasir-search]');
    const results = root.querySelector('[data-kasir-results]');
    let products = Array.isArray(window.AppState.produkCache) ? window.AppState.produkCache.map(normalize) : [];
    window.AppState.produkCache = products;

    const paint = () => {
      if (!root.isConnected || window.AppState.currentScreen !== 'kasir') return;
      const q = String(search?.value || '').trim().toLowerCase();
      const rows = products.filter(p => !q || p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q)).slice(0, 40);
      results.innerHTML = rows.length ? rows.map(p => `<button class="list-item" style="width:100%;border:none;text-align:left;" data-action="add-cart" data-id-produk="${esc(p.idProduk)}"><div class="li-main"><div class="li-title">${esc(p.nama)}</div><div class="li-sub">${esc(p.kode)} · ${money(p.hargaJual)}</div></div><div class="li-right"><div class="li-value">Stok ${p.stok}</div></div></button>`).join('') : '<div class="empty-state">Obat tidak ditemukan.</div>';
    };
    const apply = data => {
      if (!Array.isArray(data) || !root.isConnected || window.AppState.currentScreen !== 'kasir') return;
      products = data.map(normalize); window.AppState.produkCache = products; window.AppState.produkCacheAt = Date.now(); paint();
    };

    const params = { idUser: u.idUser };
    Promise.resolve(typeof window.bacaCache === 'function' ? window.bacaCache('getProduk', params, CACHE_AGE) : null).then(cached => { if (Array.isArray(cached) && cached.length) apply(cached); else paint(); }).catch(() => paint());
    if (products.length) paint();

    if (window.AppState.isOnline && typeof window.apiGet === 'function') {
      setTimeout(() => window.apiGet('getProduk', params, { cache: true, maxAge: CACHE_AGE }).then(apply).catch(() => {}), products.length ? 300 : 0);
    }
    search?.addEventListener('input', () => { clearTimeout(search.__afTimer); search.__afTimer = setTimeout(paint, 80); });
  }

  function install() {
    if (window[INSTALLED]) return;
    if (!window.SCREEN_RENDERERS || typeof window.apiGet !== 'function') { setTimeout(install, 50); return; }
    window[INSTALLED] = true;
    window.SCREEN_RENDERERS.kasir = render;
    window.__ANA_FARMA_KASIR_PERF_VERSION__ = VERSION;
    console.info('[DEV KASIR PERF] installed', VERSION);
  }
  install();
})();
