/**
 * ANA FARMA DEV — SALES & SHIFT V2
 * Multi-satuan POS, payment flow, human-readable shift time.
 * Loaded after feature-compat.js.
 */
(function () {
  'use strict';

  const VERSION = '2026-08-31-SALES-SHIFT-V2';
  const CART_KEY = 'anafarma_dev_sales_v2_cart';
  let checkoutBusy = false;

  const esc = v => typeof window.escapeHtml === 'function'
    ? window.escapeHtml(v)
    : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => typeof window.formatRupiah === 'function'
    ? window.formatRupiah(v)
    : `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

  function productCode(p) { return String(p?.Kode_Obat ?? p?.kodeObat ?? p?.kode ?? p?.idProduk ?? '').trim(); }
  function productName(p) { return String(p?.Nama_Obat ?? p?.namaObat ?? p?.nama ?? '').trim(); }
  function baseUnit(p) { return String(p?.Satuan || 'Pcs').trim() || 'Pcs'; }
  function basePrice(p) { return Math.max(0, Number(p?.Harga_Jual || 0)); }
  function baseStock(p) { return Math.max(0, Number(p?.Stok || 0)); }
  function altEnabled(p) {
    const name = String(p?.Satuan_Jual_2 || '').trim();
    const factor = Number(p?.Isi_Per_Satuan_2 || 0);
    const price = Number(p?.Harga_Jual_2 || 0);
    const active = p?.Aktif_Satuan_2 === true || String(p?.Aktif_Satuan_2).toUpperCase() === 'TRUE' || String(p?.Aktif_Satuan_2).toLowerCase() === 'ya';
    return Boolean(name && active && Number.isInteger(factor) && factor > 0 && price > 0);
  }
  function unitsFor(p) {
    const out = [{ key: 'PRIMARY', name: baseUnit(p), factor: 1, price: basePrice(p) }];
    if (altEnabled(p)) out.push({
      key: 'SECONDARY',
      name: String(p.Satuan_Jual_2).trim(),
      factor: Number(p.Isi_Per_Satuan_2),
      price: Number(p.Harga_Jual_2)
    });
    return out;
  }
  function findProduct(code) {
    return (Array.isArray(AppState.produkCache) ? AppState.produkCache : [])
      .find(p => productCode(p) === String(code));
  }
  function normalizeLine(item) {
    const p = findProduct(item.kodeObat) || item.product || {};
    const unit = unitsFor(p).find(u => u.key === item.unitKey) || unitsFor(p)[0];
    return {
      ...item,
      kodeObat: productCode(p) || item.kodeObat,
      namaObat: productName(p) || item.namaObat,
      unitKey: unit.key,
      satuanJual: unit.name,
      faktor: unit.factor,
      hargaSatuan: unit.price,
      stok: baseStock(p)
    };
  }
  function cart() {
    AppState.cart = (Array.isArray(AppState.cart) ? AppState.cart : []).map(normalizeLine);
    return AppState.cart;
  }
  function persistCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart())); } catch (_) {}
  }
  function restoreCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) AppState.cart = JSON.parse(raw) || [];
    } catch (_) { AppState.cart = []; }
    cart();
  }
  function cartTotal() {
    return cart().reduce((sum, x) => sum + Number(x.qty || 0) * Number(x.hargaSatuan || 0), 0);
  }
  function cartBaseQtyFor(code) {
    return cart().filter(x => x.kodeObat === code).reduce((sum, x) => sum + Number(x.qty || 0) * Number(x.faktor || 1), 0);
  }
  function addLine(product, unitKey) {
    const units = unitsFor(product);
    const unit = units.find(u => u.key === unitKey) || units[0];
    const code = productCode(product);
    if (!code) return toast('Produk tidak memiliki kode.', 'error');
    const same = cart().find(x => x.kodeObat === code && x.unitKey === unit.key);
    const otherBase = cartBaseQtyFor(code) - (same ? Number(same.qty || 0) * unit.factor : 0);
    const nextQty = (same ? Number(same.qty || 0) : 0) + 1;
    if (otherBase + nextQty * unit.factor > baseStock(product)) {
      return toast(`Stok ${productName(product)} hanya ${baseStock(product)} ${baseUnit(product)}.`, 'warn');
    }
    if (same) same.qty = nextQty;
    else cart().push({ kodeObat: code, namaObat: productName(product), unitKey: unit.key, satuanJual: unit.name, faktor: unit.factor, hargaSatuan: unit.price, qty: 1, stok: baseStock(product) });
    persistCart();
    renderSalesCart();
  }
  function changeQty(index, delta) {
    const item = cart()[index];
    if (!item) return;
    const next = Number(item.qty || 0) + Number(delta || 0);
    if (next <= 0) AppState.cart.splice(index, 1);
    else if (cartBaseQtyFor(item.kodeObat) - Number(item.qty || 0) * item.faktor + next * item.faktor > item.stok) return toast(`Stok ${item.namaObat} tidak mencukupi.`, 'warn');
    else item.qty = next;
    persistCart();
    renderSalesCart();
  }
  function removeLine(index) {
    AppState.cart.splice(index, 1);
    persistCart();
    renderSalesCart();
  }
  function changeUnit(index, key) {
    const old = cart()[index];
    if (!old) return;
    const p = findProduct(old.kodeObat);
    const unit = unitsFor(p).find(u => u.key === key);
    if (!unit || unit.key === old.unitKey) return;
    const otherBase = cartBaseQtyFor(old.kodeObat) - Number(old.qty || 0) * Number(old.faktor || 1);
    if (otherBase + unit.factor > baseStock(p)) return toast(`Stok tidak cukup untuk 1 ${unit.name}.`, 'warn');
    old.unitKey = unit.key;
    old.satuanJual = unit.name;
    old.faktor = unit.factor;
    old.hargaSatuan = unit.price;
    old.qty = 1;
    persistCart();
    renderSalesCart();
  }

  function productResultHtml(p) {
    const units = unitsFor(p);
    const unitButtons = units.map(u => `<button type="button" class="btn ${u.key === 'PRIMARY' ? 'btn-primary' : 'btn-outline'} btn-sm" data-sales-add="${esc(productCode(p))}" data-sales-unit="${esc(u.key)}">+ ${esc(u.name)} · ${money(u.price)}</button>`).join('');
    return `<div class="list-item" style="display:block"><div style="display:flex;gap:10px;align-items:flex-start"><div class="li-main"><div class="li-title">${esc(productName(p))}</div><div class="li-sub">${esc(productCode(p))} · Rak: ${esc(p.Lokasi_Rak || 'Belum teridentifikasi')}</div><div class="li-sub">Stok dasar: <strong>${baseStock(p)} ${esc(baseUnit(p))}</strong></div></div></div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">${unitButtons}</div></div>`;
  }

  function renderSalesCart() {
    const root = document.querySelector('[data-sales-cart]');
    const totalEl = document.querySelector('[data-sales-total]');
    const countEl = document.querySelector('[data-sales-count]');
    if (totalEl) totalEl.textContent = money(cartTotal());
    if (countEl) countEl.textContent = String(cart().reduce((s, x) => s + Number(x.qty || 0), 0));
    if (!root) return;
    if (!cart().length) {
      root.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><div>Keranjang masih kosong.</div><div style="font-size:11px;margin-top:6px">Pilih PCS atau BOX langsung dari daftar obat.</div></div>';
      return;
    }
    root.innerHTML = cart().map((x, i) => {
      const p = findProduct(x.kodeObat) || {};
      const options = unitsFor(p).map(u => `<option value="${u.key}" ${u.key === x.unitKey ? 'selected' : ''}>${esc(u.name)} · ${money(u.price)}</option>`).join('');
      return `<div class="list-item" style="align-items:flex-start"><div class="li-main"><div class="li-title">${esc(x.namaObat)}</div><div class="li-sub">${esc(x.kodeObat)} · Stok ${x.stok} ${esc(baseUnit(p))}</div><select data-sales-unit-change="${i}" style="margin-top:7px;width:100%;border:1px solid var(--border);border-radius:9px;padding:8px">${options}</select></div><div style="display:flex;align-items:center;gap:7px;margin-left:8px"><button class="btn btn-secondary btn-sm" data-sales-minus="${i}">−</button><strong>${x.qty}</strong><button class="btn btn-secondary btn-sm" data-sales-plus="${i}">+</button></div><div class="li-right"><div class="li-value">${money(Number(x.qty) * Number(x.hargaSatuan))}</div><button class="btn btn-danger btn-sm" style="margin-top:6px" data-sales-remove="${i}">Hapus</button></div></div>`;
    }).join('');
  }

  function renderKasirV2(root) {
    root.innerHTML = `<div class="container"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><div><div class="section-title" style="margin-top:0">Kasir</div><div style="font-size:12px;color:var(--text-dim)">Penjualan PCS / BOX · stok dihitung dalam unit dasar</div></div><span class="pill ${AppState.isOnline ? 'pill-success' : 'pill-warn'}">${AppState.isOnline ? 'ONLINE' : 'OFFLINE'}</span></div><div class="search-bar"><span>🔎</span><input id="sales-search-v2" type="search" placeholder="Cari nama obat atau kode..." autocomplete="off"></div><div id="sales-results-v2"></div><div class="section-title">Keranjang <span style="font-weight:600;text-transform:none;letter-spacing:0">(<span data-sales-count>0</span>)</span></div><div data-sales-cart></div><div class="card" style="position:sticky;bottom:76px;z-index:5"><div style="display:flex;justify-content:space-between;align-items:center"><span>Total sementara</span><strong data-sales-total>${money(0)}</strong></div><button type="button" class="btn btn-primary" style="margin-top:10px" data-sales-checkout>💳 Pembayaran & Simpan</button></div></div>`;
    renderSalesCart();
    const search = root.querySelector('#sales-search-v2');
    const results = root.querySelector('#sales-results-v2');
    const products = Array.isArray(AppState.produkCache) ? AppState.produkCache : [];
    const draw = () => {
      const q = String(search.value || '').trim().toLowerCase();
      const rows = products.filter(p => !q || `${productCode(p)} ${productName(p)}`.toLowerCase().includes(q)).slice(0, 40);
      results.innerHTML = rows.length ? rows.map(productResultHtml).join('') : '<div class="empty-state">Produk tidak ditemukan.</div>';
    };
    draw();
    search.addEventListener('input', draw);
  }

  async function openPayment() {
    if (checkoutBusy || !cart().length) return toast('Keranjang masih kosong.', 'warn');
    checkoutBusy = true;
    try {
      let customers = [];
      if (AppState.isOnline) { try { customers = await apiGet('getPelanggan', withIdUser(), { cache: true, maxAge: 120000 }); } catch (_) {} }
      const subtotal = cartTotal();
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay center-align';
      overlay.id = 'sales-v2-payment';
      overlay.innerHTML = `<div class="modal-sheet modal-center" style="max-width:470px"><div class="modal-header"><div><h3>Pembayaran</h3><div style="font-size:11px;color:var(--text-dim)">Total item: ${cart().length}</div></div><button class="modal-close" data-sales-close>×</button></div><div class="modal-body"><div class="form-group"><label>Pelanggan (opsional)</label><select id="sales-customer"><option value="">Tanpa pelanggan</option>${(Array.isArray(customers) ? customers : []).map(c => `<option value="${esc(c.ID_Pelanggan)}">${esc(c.Nama)}</option>`).join('')}</select></div><div class="form-group"><label>Diskon (Rp)</label><input id="sales-discount" type="number" min="0" value="0" inputmode="numeric"></div><div class="form-group"><label>Metode pembayaran</label><select id="sales-method"><option>Tunai</option><option>QRIS</option><option>E-Wallet</option><option>Transfer</option></select></div><div class="form-group"><label>Dibayar (Rp)</label><input id="sales-paid" type="number" min="0" value="${subtotal}" inputmode="numeric"></div><div class="card" style="background:var(--bg);box-shadow:none"><div style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div style="display:flex;justify-content:space-between;margin-top:7px"><span>Total</span><strong id="sales-pay-total">${money(subtotal)}</strong></div><div style="display:flex;justify-content:space-between;margin-top:7px"><span>Kembalian</span><strong id="sales-pay-change">${money(0)}</strong></div></div><div id="sales-pay-message" style="font-size:12px;color:var(--text-dim);min-height:18px;margin:8px 0"></div><button class="btn btn-primary" id="sales-pay-submit">Proses transaksi</button></div></div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));
      const discount = overlay.querySelector('#sales-discount');
      const paid = overlay.querySelector('#sales-paid');
      const totalEl = overlay.querySelector('#sales-pay-total');
      const changeEl = overlay.querySelector('#sales-pay-change');
      const submit = overlay.querySelector('#sales-pay-submit');
      const message = overlay.querySelector('#sales-pay-message');
      const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 180); };
      overlay.querySelector('[data-sales-close]').onclick = close;
      overlay.onclick = e => { if (e.target === overlay) close(); };
      const recalc = () => {
        const total = Math.max(0, subtotal - Math.max(0, Number(discount.value || 0)));
        const bayar = Math.max(0, Number(paid.value || 0));
        totalEl.textContent = money(total);
        changeEl.textContent = money(Math.max(0, bayar - total));
        submit.disabled = bayar < total || !cart().length;
      };
      discount.oninput = recalc;
      paid.oninput = recalc;
      submit.onclick = async () => {
        const diskon = Math.max(0, Number(discount.value || 0));
        const total = Math.max(0, subtotal - diskon);
        const bayar = Math.max(0, Number(paid.value || 0));
        if (bayar < total) return toast('Pembayaran kurang.', 'warn');
        submit.disabled = true;
        message.textContent = 'Memvalidasi dan menyimpan...';
        const requestId = typeof uuidKecil === 'function' ? uuidKecil() : `${Date.now()}-${Math.random()}`;
        const payload = withIdUser({ items: cart().map(x => ({ kodeObat: x.kodeObat, qty: Number(x.qty), satuanJual: x.satuanJual })), idPelanggan: overlay.querySelector('#sales-customer').value || '', diskon, pajak: 0, metodeBayar: overlay.querySelector('#sales-method').value, bayar });
        try {
          const result = await apiPost('createTransaksi', payload, { requestId, allowOffline: true });
          AppState.cart = [];
          persistCart();
          close();
          renderSalesCart();
          toast(result?.queued ? 'Transaksi disimpan offline. Akan dikirim otomatis saat online.' : `Transaksi ${result?.idTransaksi || 'berhasil'} tersimpan.`, result?.queued ? 'warn' : 'success');
        } catch (error) {
          submit.disabled = false;
          message.textContent = error?.message || String(error);
          toast(message.textContent, 'error');
        }
      };
      recalc();
    } finally {
      checkoutBusy = false;
    }
  }

  function bindEvents() {
    if (window.__ANA_FARMA_SALES_V2__) return;
    window.__ANA_FARMA_SALES_V2__ = true;
    document.addEventListener('click', event => {
      const add = event.target.closest?.('[data-sales-add]');
      if (add) { const p = findProduct(add.dataset.salesAdd); if (p) addLine(p, add.dataset.salesUnit); return; }
      const plus = event.target.closest?.('[data-sales-plus]');
      if (plus) { changeQty(Number(plus.dataset.salesPlus), 1); return; }
      const minus = event.target.closest?.('[data-sales-minus]');
      if (minus) { changeQty(Number(minus.dataset.salesMinus), -1); return; }
      const remove = event.target.closest?.('[data-sales-remove]');
      if (remove) { removeLine(Number(remove.dataset.salesRemove)); return; }
      const checkout = event.target.closest?.('[data-sales-checkout]');
      if (checkout) { openPayment(); return; }
    });
    document.addEventListener('change', event => {
      const select = event.target.closest?.('[data-sales-unit-change]');
      if (select) changeUnit(Number(select.dataset.salesUnitChange), select.value);
    });
  }

  function humanDate(value) {
    if (!value) return '-';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Makassar' }).format(d).replace(/\./g, ':');
  }

  async function patchDashboardShift() {
    const root = document.querySelector('[data-screen="dashboard"]');
    if (!root) return;
    const shiftButton = root.querySelector('#dash-shift');
    if (!shiftButton) return;
    const card = shiftButton.closest('.card');
    if (!card) return;
    card.querySelectorAll('*').forEach(node => {
      if (node.children.length === 0 && /Aktif sejak/i.test(node.textContent || '')) {
        const value = (node.textContent || '').replace(/^Aktif sejak\s*/i, '').trim();
        node.textContent = `Aktif sejak ${humanDate(value)}`;
      }
    });
  }

  function install() {
    if (window.__ANA_FARMA_SALES_V2_INSTALLED__) return;
    if (typeof AppState === 'undefined' || typeof SCREEN_RENDERERS === 'undefined') { setTimeout(install, 50); return; }
    window.__ANA_FARMA_SALES_V2_INSTALLED__ = true;
    restoreCart();
    bindEvents();

    SCREEN_RENDERERS.kasir = async function (root) {
      try {
        const data = await apiGet('getProduk', withIdUser(), { cache: true, maxAge: 3600000 });
        AppState.produkCache = Array.isArray(data) ? data : [];
        AppState.produkCacheAt = Date.now();
      } catch (_) {}
      renderKasirV2(root);
    };

    const originalDashboard = SCREEN_RENDERERS.dashboard;
    SCREEN_RENDERERS.dashboard = async function (root) {
      if (originalDashboard) await originalDashboard(root);
      await patchDashboardShift();
    };

    const observer = new MutationObserver(() => {
      if (AppState.currentScreen === 'dashboard') patchDashboardShift();
    });
    observer.observe(document.getElementById('screen-root') || document.body, { childList: true, subtree: true });
    window.salesV2 = { version: VERSION, renderKasirV2, renderSalesCart, cart, openPayment, humanDate };
  }

  (function waitForFeatures() {
    if (window.__ANA_FARMA_FEATURE_COMPAT__ || window.__ANA_FARMA_DEV_FEATURES_READY__) install();
    else setTimeout(waitForFeatures, 50);
  })();
})();
