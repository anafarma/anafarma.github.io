/*
 * APOTEK ANA FARMA — DEV KASIR PERFORMANCE / UX
 * V18.9
 *
 * Fokus:
 * - Data obat cache-first agar Kasir cepat tampil.
 * - Informasi obat: NAMA -> LOKASI RAK -> STOK + HARGA.
 * - Kode obat tidak ditampilkan pada baris utama kasir.
 * - Keranjang + Proses & Simpan selalu mudah dijangkau melalui
 *   floating action dock di atas bottom navigation.
 * - Detail keranjang tetap menggunakan cart milik app.js.
 * - Ikon utama menggunakan SVG inline agar tidak bergantung emoji/font eksternal.
 * - Tidak membuat API, IndexedDB, router, atau outbox baru.
 */
(function () {
  'use strict';

  const VERSION = '2026-08-27-DEV-KASIR-UX-18-9';
  const CACHE_AGE = 60 * 60 * 1000;
  const INSTALLED = '__ANA_FARMA_KASIR_PERF__';
  const STYLE_ID = 'ana-farma-kasir-ux-style';
  const DOCK_ID = 'ana-farma-kasir-dock';
  const SHEET_ID = 'ana-farma-kasir-sheet';

  const ICON = {
    cart: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.2"></circle><circle cx="18" cy="20" r="1.2"></circle><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.2 4.2"></path></svg>'
  };

  function esc(v) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(v)
      : String(v ?? '').replace(/[&<>"']/g, c => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
  }

  function money(v) {
    return typeof window.formatRupiah === 'function'
      ? window.formatRupiah(v)
      : `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
  }

  function normalize(p) {
    p = p || {};
    const location = p.Lokasi_Rak ?? p.lokasiRak ?? p.lokasi ?? p.Lokasi ??
      p.Nama_Display ?? p.namaLokasi ?? p.ID_Lokasi ?? '';

    return {
      ...p,
      idProduk: String(p.idProduk ?? p.IDProduk ?? p.ID_Produk ?? p.kode ?? p.Kode ?? p.Kode_Obat ?? ''),
      kode: String(p.kode ?? p.Kode ?? p.Kode_Obat ?? p.idProduk ?? p.IDProduk ?? ''),
      nama: String(p.nama ?? p.Nama ?? p.Nama_Obat ?? p.namaObat ?? p.NamaObat ?? 'Obat tanpa nama'),
      hargaJual: Number(p.hargaJual ?? p.HargaJual ?? p.Harga_Jual ?? p.harga ?? 0) || 0,
      stok: Number(p.stok ?? p.Stok ?? p.STOK ?? 0) || 0,
      lokasiRak: String(location || '').trim(),
      satuan: String(p.satuan ?? p.Satuan ?? '').trim()
    };
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .af-kasir-results{display:grid;gap:8px}
      .af-kasir-product{position:relative;width:100%;border:1px solid rgba(16,38,42,.07)!important;border-radius:16px!important;background:rgba(255,255,255,.96)!important;padding:14px 16px!important;display:flex!important;align-items:center!important;gap:14px;box-shadow:0 3px 14px rgba(16,38,42,.045)!important;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
      .af-kasir-product:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(16,38,42,.09)!important}.af-kasir-product:active{transform:scale(.995)}
      .af-kasir-product-main{min-width:0;flex:1}.af-kasir-product-name{font-size:14px;font-weight:850;color:#142b2e;line-height:1.3}.af-kasir-product-meta{margin-top:5px;font-size:12px;color:#66777a;line-height:1.45}.af-kasir-product-meta strong{color:#142b2e;font-weight:800}.af-kasir-rack{color:#0b8178;font-weight:750}
      .af-kasir-stock{white-space:nowrap;font-size:13px;font-weight:850;color:#142b2e}.af-kasir-stock.low{color:#c77700}.af-kasir-stock.empty{color:#c62828}
      .af-kasir-add{width:36px;height:36px;flex:0 0 36px;border:0;border-radius:12px;background:#0f9b8f;color:#fff;display:grid;place-items:center}
      .af-kasir-dock{position:fixed;left:50%;bottom:calc(72px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:90;width:min(620px,calc(100vw - 24px));display:flex;align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.78);border-radius:20px;background:rgba(255,255,255,.92);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);box-shadow:0 14px 42px rgba(15,42,45,.18),0 2px 8px rgba(15,42,45,.08)}
      .af-kasir-dock.hidden{display:none!important}.af-kasir-dock-cart{min-width:0;flex:1;display:flex;align-items:center;gap:10px;border:0;background:transparent;text-align:left;padding:7px 9px;border-radius:14px;color:#142b2e}.af-kasir-dock-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#e9f6f4;color:#087d74;flex:0 0 38px}.af-kasir-dock-label{font-size:12px;color:#637477;line-height:1.15}.af-kasir-dock-total{font-size:14px;font-weight:900;color:#142b2e;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .af-kasir-dock-checkout{border:0;border-radius:14px;padding:12px 16px;background:#0f9b8f;color:#fff;font-size:13px;font-weight:850;white-space:nowrap;min-height:48px;box-shadow:0 6px 16px rgba(15,155,143,.22)}.af-kasir-dock-checkout:disabled{opacity:.45;box-shadow:none}
      .af-kasir-sheet-wrap{position:fixed;inset:0;z-index:140;background:rgba(11,28,31,.34);display:none;align-items:flex-end}.af-kasir-sheet-wrap.show{display:flex}.af-kasir-sheet{width:min(620px,100%);max-height:min(78vh,680px);margin:0 auto;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -18px 55px rgba(11,28,31,.22);overflow:hidden;display:flex;flex-direction:column}
      .af-kasir-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e9eeee}.af-kasir-sheet-title{font-size:16px;font-weight:900;color:#142b2e}.af-kasir-sheet-sub{font-size:11px;color:#6b7a7c;margin-top:2px}.af-kasir-sheet-close{width:36px;height:36px;border:0;border-radius:50%;background:#f0f4f4;font-size:18px}.af-kasir-sheet-body{padding:10px 14px;overflow:auto}.af-kasir-sheet-foot{padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #e9eeee;background:#fff}.af-kasir-sheet-row{display:flex;align-items:center;gap:10px;padding:12px 4px;border-bottom:1px solid #eef2f2}.af-kasir-sheet-row-main{min-width:0;flex:1}.af-kasir-sheet-row-name{font-weight:800;font-size:13px}.af-kasir-sheet-row-sub{font-size:11px;color:#6b7a7c;margin-top:3px}.af-kasir-qty{display:flex;align-items:center;gap:7px}.af-kasir-qty button{width:32px;height:32px;border:0;border-radius:9px;background:#edf3f2;font-weight:900}
      .af-kasir-search-icon{display:grid;place-items:center;color:#607174;flex:0 0 18px}
      @media(max-width:520px){.af-kasir-dock{bottom:calc(66px + env(safe-area-inset-bottom));width:calc(100vw - 16px);border-radius:17px}.af-kasir-dock-checkout{padding:11px 12px;font-size:12px}.af-kasir-product{padding:13px 12px!important}.af-kasir-stock{font-size:12px}}
      @media(prefers-reduced-motion:reduce){.af-kasir-product{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function createDock() {
    let dock = document.getElementById(DOCK_ID);
    if (!dock) {
      dock = document.createElement('div');
      dock.id = DOCK_ID;
      dock.className = 'af-kasir-dock hidden';
      dock.innerHTML = `<button type="button" class="af-kasir-dock-cart" data-kasir-open-cart aria-label="Buka keranjang"><span class="af-kasir-dock-icon">${ICON.cart}</span><span style="min-width:0;flex:1"><span class="af-kasir-dock-label">Keranjang <b data-kasir-dock-count>0</b></span><span class="af-kasir-dock-total" data-kasir-dock-total>Rp0</span></span></button><button type="button" class="af-kasir-dock-checkout" data-action="checkout" disabled>Proses &amp; Simpan</button>`;
      document.body.appendChild(dock);
      dock.querySelector('[data-kasir-open-cart]').addEventListener('click', openCartSheet);
    }
    updateDock();
    return dock;
  }

  function createSheet() {
    let wrap = document.getElementById(SHEET_ID);
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.id = SHEET_ID;
    wrap.className = 'af-kasir-sheet-wrap';
    wrap.innerHTML = `<div class="af-kasir-sheet" role="dialog" aria-modal="true" aria-label="Keranjang"><div class="af-kasir-sheet-head"><div><div class="af-kasir-sheet-title">Keranjang</div><div class="af-kasir-sheet-sub" data-kasir-sheet-sub>0 item</div></div><button type="button" class="af-kasir-sheet-close" data-kasir-close aria-label="Tutup">×</button></div><div class="af-kasir-sheet-body" data-kasir-sheet-body></div><div class="af-kasir-sheet-foot"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px"><span style="font-size:12px;color:#68777a">Total</span><strong data-kasir-sheet-total>Rp0</strong></div><button type="button" class="btn btn-primary" style="width:100%" data-action="checkout" data-kasir-sheet-checkout disabled>Proses &amp; Simpan</button></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-kasir-close]').addEventListener('click', closeCartSheet);
    wrap.addEventListener('click', e => { if (e.target === wrap) closeCartSheet(); });
    return wrap;
  }

  function updateDock() {
    const dock = document.getElementById(DOCK_ID);
    const state = window.AppState;
    if (!dock || !state) return;
    const active = state.currentScreen === 'kasir' && !!state.user;
    dock.classList.toggle('hidden', !active);
    const cart = Array.isArray(state.cart) ? state.cart : [];
    const count = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const total = cart.reduce((sum, item) => sum + (Number(item.hargaSatuan) || 0) * (Number(item.qty) || 0), 0);
    dock.querySelector('[data-kasir-dock-count]').textContent = String(count);
    dock.querySelector('[data-kasir-dock-total]').textContent = money(total);
    dock.querySelector('[data-action="checkout"]').disabled = count <= 0;
    const sheet = document.getElementById(SHEET_ID);
    if (sheet) {
      sheet.querySelector('[data-kasir-sheet-sub]').textContent = `${count} item${count === 1 ? '' : 's'}`;
      sheet.querySelector('[data-kasir-sheet-total]').textContent = money(total);
      sheet.querySelector('[data-kasir-sheet-checkout]').disabled = count <= 0;
      renderSheetItems(sheet);
    }
  }

  function renderSheetItems(sheet) {
    const body = sheet.querySelector('[data-kasir-sheet-body]');
    const cart = window.AppState?.cart || [];
    if (!cart.length) { body.innerHTML = '<div class="empty-state" style="padding:34px 12px">Keranjang masih kosong.<br><small>Pilih obat dari daftar transaksi.</small></div>'; return; }
    body.innerHTML = cart.map(item => `<div class="af-kasir-sheet-row"><div class="af-kasir-sheet-row-main"><div class="af-kasir-sheet-row-name">${esc(item.nama)}</div><div class="af-kasir-sheet-row-sub">${money(item.hargaSatuan)} × ${Number(item.qty) || 0}</div></div><div class="af-kasir-qty"><button type="button" data-action="cart-minus" data-id-produk="${esc(item.idProduk)}" aria-label="Kurangi">−</button><strong>${Number(item.qty) || 0}</strong><button type="button" data-action="cart-plus" data-id-produk="${esc(item.idProduk)}" aria-label="Tambah">+</button></div></div>`).join('');
  }

  function openCartSheet() { const wrap = createSheet(); renderSheetItems(wrap); wrap.classList.add('show'); }
  function closeCartSheet() { document.getElementById(SHEET_ID)?.classList.remove('show'); }

  function render(root) {
    const u = window.AppState?.user;
    if (!root || !u) return;
    injectStyle();
    root.innerHTML = `<div class="container" style="padding-bottom:150px"><div class="section-title">Transaksi</div><div class="search-bar"><span class="af-kasir-search-icon">${ICON.search}</span><input type="search" placeholder="Cari nama obat atau kode…" data-kasir-search autocomplete="off"></div><div data-kasir-results class="af-kasir-results"><div class="empty-state">Menyiapkan data obat…</div></div><div class="section-title" style="margin-top:18px">Detail Keranjang</div><div data-cart-root></div></div>`;
    if (typeof window.renderCart === 'function') window.renderCart();
    createDock();
    createSheet();

    const search = root.querySelector('[data-kasir-search]');
    const results = root.querySelector('[data-kasir-results]');
    let products = Array.isArray(window.AppState.produkCache) ? window.AppState.produkCache.map(normalize) : [];
    window.AppState.produkCache = products;

    const paint = () => {
      if (!root.isConnected || window.AppState.currentScreen !== 'kasir') return;
      const q = String(search?.value || '').trim().toLowerCase();
      const filtered = products.filter(p => !q || p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q)).slice(0, 40);
      results.innerHTML = filtered.length ? filtered.map(p => {
        const stockClass = p.stok <= 0 ? 'empty' : p.stok <= 5 ? 'low' : '';
        const rack = p.lokasiRak || 'Belum teridentifikasi';
        return `<button class="af-kasir-product" type="button" data-action="add-cart" data-id-produk="${esc(p.idProduk)}"><span class="af-kasir-product-main"><span class="af-kasir-product-name">${esc(p.nama)}</span><span class="af-kasir-product-meta"><span class="af-kasir-rack">Rak: ${esc(rack)}</span> · <strong>Stok ${Number(p.stok) || 0}</strong> · <strong>${money(p.hargaJual)}</strong></span></span><span class="af-kasir-stock ${stockClass}">${Number(p.stok) || 0}</span><span class="af-kasir-add" aria-hidden="true">${ICON.plus}</span></button>`;
      }).join('') : '<div class="empty-state">Obat tidak ditemukan.</div>';
    };

    const apply = data => {
      if (!Array.isArray(data) || !root.isConnected || window.AppState.currentScreen !== 'kasir') return;
      products = data.map(normalize); window.AppState.produkCache = products; window.AppState.produkCacheAt = Date.now(); paint();
    };

    const params = { idUser: u.idUser };
    Promise.resolve(typeof window.bacaCache === 'function' ? window.bacaCache('getProduk', params, CACHE_AGE) : null).then(cached => { if (Array.isArray(cached) && cached.length) apply(cached); else paint(); }).catch(() => paint());
    if (products.length) paint();

    if (window.AppState.isOnline && typeof window.apiGet === 'function') setTimeout(() => window.apiGet('getProduk', params, { cache: true, maxAge: CACHE_AGE }).then(apply).catch(() => {}), products.length ? 250 : 0);
    search?.addEventListener('input', () => { clearTimeout(search.__afTimer); search.__afTimer = setTimeout(paint, 70); });

    const observer = new MutationObserver(() => updateDock());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.__afKasirObserver = observer;
  }

  function install() {
    if (window[INSTALLED]) return;
    if (!window.SCREEN_RENDERERS || typeof window.apiGet !== 'function' || !window.AppState) { setTimeout(install, 50); return; }
    window[INSTALLED] = true;
    injectStyle();
    window.SCREEN_RENDERERS.kasir = render;
    window.__ANA_FARMA_KASIR_PERF_VERSION__ = VERSION;
    window.addEventListener('online', updateDock);
    window.addEventListener('offline', updateDock);
    document.addEventListener('click', event => { if (event.target.closest('[data-kasir-open-cart]')) return; if (!window.AppState || window.AppState.currentScreen !== 'kasir') closeCartSheet(); setTimeout(updateDock, 0); }, true);
    console.info('[DEV KASIR UX] installed', VERSION);
  }

  install();
})();
