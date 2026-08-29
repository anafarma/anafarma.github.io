/*
 * APOTEK ANA FARMA — DEV CONSOLIDATED SECURITY/POLICY RUNTIME
 * V20.0
 * Single policy layer for role, shift, session, GPS and purchase flow.
 * UI is allowed to hide actions, but this layer also guards apiPost().
 */
(function () {
  'use strict';

  const VERSION = '2026-08-29-DEV-CONSOLIDATED-POLICY-20-0';
  const OWNER_ONLY = new Set([
    'addProduk','updateProduk','adjustStok','addSupplier','updateSupplier',
    'updatePengaturan','gantiPassword','updateUser','toggleGPSUser',
    'resetPasswordUser','setujuiPengajuanPembelian','tolakPengajuanPembelian'
  ]);
  const SHIFT_REQUIRED = new Set([
    'createTransaksi','addPengajuanPembelian','addRetur','simpanStokOpname',
    'updatePelanggan','addPelanggan'
  ]);
  const state = { gpsBusy: new Set(), purchaseBusy: false };

  const user = () => window.AppState?.user || null;
  const isOwner = () => String(user()?.role || '').trim().toLowerCase() === 'owner';
  const online = () => !!window.AppState?.isOnline;
  const shiftActive = () => {
    const s = user()?.shiftAktif;
    return !!(s && (s.status === 'Aktif' || s.status === 'active' || s.aktif === true));
  };
  const esc = v => typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => typeof window.formatRupiah === 'function' ? window.formatRupiah(v) : `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
  const toast = (m, t='info') => window.toast?.(m, t);

  function normalizeRole() {
    const u = user();
    if (!u) return;
    const r = String(u.role || '').trim().toLowerCase();
    if (r === 'owner') u.role = 'Owner';
    else if (['pegawai','employee','karyawan'].includes(r)) u.role = 'Pegawai';
  }

  function persistSession() {
    const u = user();
    if (!u) return;
    try { localStorage.setItem('anafarma_sesi_v2', JSON.stringify({ user: u, savedAt: Date.now() })); } catch (_) {}
  }

  function disableAutoLogout() {
    const app = window.AppState;
    if (app?.autoLogoutTimer) clearTimeout(app.autoLogoutTimer);
    if (app) app.autoLogoutTimer = null;
    window.scheduleAutoLogout = function () {
      if (window.AppState?.autoLogoutTimer) clearTimeout(window.AppState.autoLogoutTimer);
      if (window.AppState) window.AppState.autoLogoutTimer = null;
    };
    window.resetAutoLogoutTimer = window.scheduleAutoLogout;
  }

  function guardApi() {
    if (window.__ANA_FARMA_CONSOLIDATED_POLICY__) return;
    if (!window.AppState || typeof window.apiPost !== 'function') {
      setTimeout(guardApi, 40);
      return;
    }
    window.__ANA_FARMA_CONSOLIDATED_POLICY__ = true;
    normalizeRole();
    const original = window.apiPost;

    window.apiPost = async function (action, data = {}, options = {}) {
      normalizeRole();
      const a = String(action || '');
      if (!isOwner() && OWNER_ONLY.has(a)) {
        const e = new Error('Aksi ini hanya dapat dilakukan oleh Owner.');
        e.kind = 'authorization';
        toast(e.message, 'warn');
        throw e;
      }
      if (!isOwner() && SHIFT_REQUIRED.has(a) && !shiftActive()) {
        const e = new Error('Mulai shift terlebih dahulu sebelum melakukan kegiatan operasional.');
        e.kind = 'shift-required';
        toast(e.message, 'warn');
        throw e;
      }
      if (a === 'toggleGPSUser') {
        const target = String(data?.targetUserId || data?.idUser || '');
        if (state.gpsBusy.has(target)) {
          const e = new Error('Perubahan GPS sedang diproses. Tunggu hingga selesai.');
          e.kind = 'busy';
          toast(e.message, 'warn');
          throw e;
        }
        state.gpsBusy.add(target);
        try { return await original.call(this, action, data, options); }
        finally { state.gpsBusy.delete(target); }
      }
      return original.call(this, action, data, options);
    };
    window.apiPost.__devConsolidatedPolicy = true;
  }

  function field(id, label, value='', type='text', extra='') {
    return `<div class="form-group"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" type="${esc(type)}" value="${esc(value)}" ${extra}></div>`;
  }
  function select(id, label, options, value='') {
    return `<div class="form-group"><label for="${esc(id)}">${esc(label)}</label><select id="${esc(id)}">${(options || []).map(o => `<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  }
  function modal(title, body, mount) {
    const root = document.getElementById('modal-root');
    if (!root) return;
    root.innerHTML = `<div class="modal-overlay center-align" data-consolidated-modal><div class="modal-sheet modal-center" style="width:min(100%,560px)"><div class="modal-header"><h3>${esc(title)}</h3><button type="button" class="modal-close" data-consolidated-close>×</button></div><div class="modal-body">${body}</div></div></div>`;
    const overlay = root.querySelector('[data-consolidated-modal]');
    const close = () => { overlay.classList.remove('show'); setTimeout(() => { if (root.querySelector('[data-consolidated-modal]') === overlay) root.innerHTML = ''; }, 180); };
    root.querySelector('[data-consolidated-close]').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    root.querySelectorAll('[data-consolidated-cancel]').forEach(b => b.onclick = close);
    requestAnimationFrame(() => overlay.classList.add('show'));
    mount?.(root, close);
  }

  async function products() {
    const d = await window.apiGet('getProduk', { idUser: user()?.idUser }, { cache: true, maxAge: 60 * 60 * 1000 });
    return (Array.isArray(d) ? d : []).map(p => ({
      raw: p,
      kode: String(p.Kode_Obat ?? p.kodeObat ?? p.kode ?? ''),
      nama: String(p.Nama_Obat ?? p.namaObat ?? p.nama ?? ''),
      satuan: String(p.Satuan ?? p.satuan ?? 'Pcs').trim() || 'Pcs',
      satuanBeli: String(p.Satuan_Beli ?? p.satuanBeli ?? '').trim(),
      isiBeli: Math.max(1, Number(p.Isi_Per_Satuan_Beli ?? p.isiPerSatuanBeli ?? 1) || 1),
      hargaBeli: Number(p.Harga_Beli ?? p.hargaBeli ?? 0) || 0
    }));
  }

  function units(p) {
    const result = [{ value: 'pcs', label: p?.satuan || 'Pcs', isi: 1 }];
    if (p?.satuanBeli && Number(p.isiBeli) > 1) result.push({ value: 'box', label: p.satuanBeli, isi: Number(p.isiBeli) });
    return result;
  }

  async function loadSuppliers() {
    try { const d = await window.apiGet('getSupplier', {}, { cache: true, maxAge: 30 * 60 * 1000 }); return Array.isArray(d) ? d : []; }
    catch (_) { return []; }
  }

  function supplierFields(prefix='rq') {
    return `${select(`${prefix}-supplier`, 'Supplier', [{value:'',label:'-- Pilih Supplier --'},{value:'__NEW__',label:'+ Tambah Supplier Baru'}])}<div id="${prefix}-new-supplier" style="display:none;border:1px solid var(--border);border-radius:12px;padding:12px;margin:0 0 13px;background:var(--bg)"><div class="form-hint" style="margin-bottom:9px">Supplier baru akan diajukan bersama pembelian dan <b>belum menjadi supplier aktif</b> sampai disetujui Owner.</div>${field(`${prefix}-sup-nama`,'Nama Supplier','')}${field(`${prefix}-sup-kontak`,'Kontak / Telepon','')}${field(`${prefix}-sup-alamat`,'Alamat','')}</div>`;
  }

  function bindSupplierSelector(root, prefix='rq', options=[]) {
    const selectEl = root.querySelector(`#${prefix}-supplier`);
    if (selectEl) selectEl.innerHTML = options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    const panel = root.querySelector(`#${prefix}-new-supplier`);
    const toggle = () => { if (panel) panel.style.display = selectEl?.value === '__NEW__' ? 'block' : 'none'; };
    selectEl?.addEventListener('change', toggle);
    toggle();
    return { selectEl, panel };
  }

  async function openPurchase() {
    if (!user()) return;
    if (!online()) { toast('Pembelian/pengajuan membutuhkan koneksi internet.', 'warn'); return; }
    const [ps, ss] = await Promise.all([products(), loadSuppliers()]);
    const isO = isOwner();
    const prefix = isO ? 'dp' : 'rq';
    const supplierOptions = [{value:'',label:'-- Pilih Supplier --'},{value:'__NEW__',label:'+ Tambah Supplier Baru'}].concat(ss.map(s => ({value:s.ID_Supplier,label:s.Nama_Supplier})));
    const body = `${select(`${prefix}-kode`, 'Obat (kosong = produk baru)', isO ? ps.map(p=>({value:p.kode,label:`${p.nama} (${p.kode})`})) : [{value:'',label:'-- Produk baru --'}].concat(ps.map(p=>({value:p.kode,label:`${p.nama} (${p.kode})`})) ))}${field(`${prefix}-nama`,'Nama Obat','')}${select(`${prefix}-unit`,'Satuan Pembelian',[{value:'pcs',label:'Pcs'}])}${field(`${prefix}-isi`,'Isi per Satuan',1,'number','min="1"')}${field(`${prefix}-qty`,'Jumlah Pembelian',1,'number','min="1"')}${field(`${prefix}-kategori`,'Jenis/Kategori','Umum')}${field(`${prefix}-hb`,'Harga Beli per Satuan Pembelian',0,'number','min="0"')}${isO ? field(`${prefix}-hj`,'Harga Jual',0,'number','min="0"') : ''}${supplierFields(prefix)}${field(`${prefix}-faktur`,'No. Faktur','')}${field(`${prefix}-tgl`,'Tanggal Faktur',new Date().toISOString().slice(0,10),'date')}${field(`${prefix}-batch`,'No. Batch','')}${field(`${prefix}-exp`,'Expired','','date')}<div class="btn-row"><button class="btn btn-secondary" data-consolidated-cancel>Batal</button><button class="btn btn-primary" id="${prefix}-save">${isO?'Simpan Pembelian':'Ajukan Pembelian'}</button></div>`;

    modal(isO ? 'Pembelian Langsung' : 'Ajukan Pembelian Baru', body, async (root, close) => {
      const kode = root.querySelector(`#${prefix}-kode`);
      const unit = root.querySelector(`#${prefix}-unit`);
      const isi = root.querySelector(`#${prefix}-isi`);
      const nama = root.querySelector(`#${prefix}-nama`);
      const hb = root.querySelector(`#${prefix}-hb`);
      const sup = bindSupplierSelector(root, prefix, supplierOptions);
      const price2 = root.querySelector(`#${prefix}-hj`);
      const findP = () => ps.find(p => p.kode === kode?.value);
      const draw = () => {
        const p = findP();
        const opts = units(p || {});
        unit.innerHTML = opts.map(x => `<option value="${esc(x.value)}" data-isi="${x.isi}">${esc(x.label)}</option>`).join('') || '<option value="pcs">Pcs</option>';
        if (p) {
          nama.value = p.nama;
          isi.value = String(opts.find(x => x.value === unit.value)?.isi || 1);
          hb.value = p.hargaBeli ? String(p.hargaBeli * (unit.value === 'box' ? p.isiBeli : 1)) : '';
          if (price2) price2.value = Number(p.raw?.Harga_Jual ?? p.raw?.hargaJual ?? 0) || '';
        } else { isi.value = '1'; if (!isO) hb.value = ''; }
      };
      kode?.addEventListener('change', draw);
      unit?.addEventListener('change', draw);
      draw();

      root.querySelector(`#${prefix}-save`).onclick = async () => {
        if (state.purchaseBusy) return;
        const p = findP();
        const v = units(p || {}).find(x => x.value === unit.value) || { isi: Math.max(1, Number(isi.value) || 1), label: unit.value === 'box' ? 'Box' : 'Pcs' };
        const qty = Math.floor(Number(root.querySelector(`#${prefix}-qty`).value));
        const hargaBeli = Number(hb.value);
        const namaObat = nama.value.trim();
        if (!namaObat || qty <= 0 || !Number.isFinite(hargaBeli) || hargaBeli < 0) { toast('Data pembelian belum lengkap atau tidak valid.', 'warn'); return; }
        const supplierValue = sup.selectEl?.value || '';
        const newSupplier = supplierValue === '__NEW__';
        const supplierName = newSupplier ? root.querySelector(`#${prefix}-sup-nama`)?.value.trim() : (sup.selectEl?.selectedOptions?.[0]?.textContent || '');
        const supplierContact = newSupplier ? root.querySelector(`#${prefix}-sup-kontak`)?.value.trim() : '';
        const supplierAddress = newSupplier ? root.querySelector(`#${prefix}-sup-alamat`)?.value.trim() : '';
        if (!supplierName) { toast('Nama supplier wajib diisi.', 'warn'); return; }
        if (newSupplier && !supplierContact && !supplierAddress) { toast('Isi minimal kontak atau alamat supplier baru.', 'warn'); return; }

        const payload = {
          idUser: user().idUser, kodeObat: p?.kode || kode.value || '', namaObat,
          jumlah: qty, jenis: root.querySelector(`#${prefix}-kategori`).value.trim(),
          satuanBeli: v.label, isiPerSatuanBeli: Math.max(1, Number(v.isi) || 1),
          qtySatuanBeli: qty, hargaBeliPerSatuanBeli: hargaBeli,
          hargaJual: isO ? Number(price2?.value || 0) : 0,
          idSupplier: newSupplier ? '' : supplierValue, namaSupplier: supplierName,
          supplierKontak: supplierContact, supplierAlamat: supplierAddress,
          supplierBaru: newSupplier, supplierStatus: newSupplier ? 'Menunggu Persetujuan' : 'Aktif',
          noFaktur: root.querySelector(`#${prefix}-faktur`).value.trim(),
          tanggalFaktur: root.querySelector(`#${prefix}-tgl`).value,
          noBatch: root.querySelector(`#${prefix}-batch`).value.trim(),
          expired: root.querySelector(`#${prefix}-exp`).value,
          mode: isO ? 'langsung' : 'pengajuan'
        };
        const button = root.querySelector(`#${prefix}-save`);
        button.disabled = true; state.purchaseBusy = true;
        try {
          await window.apiPost(isO ? 'addPembelian' : 'addPengajuanPembelian', payload, { allowOffline: false });
          close();
          toast(isO ? `Pembelian ${qty} ${v.label} berhasil disimpan.` : 'Pengajuan pembelian dan supplier berhasil dikirim ke Owner.', 'success');
          window.navigasiKe?.('pembelian');
        } catch (e) { window.tampilkanError?.(e); button.disabled = false; }
        finally { state.purchaseBusy = false; }
      };
    });
  }

  async function renderPurchase(root) {
    if (!root || !user()) return;
    root.innerHTML = `<div class="container"><div class="section-title">Pembelian & Pengajuan</div><div class="btn-row"><button class="btn btn-primary" id="con-purchase-add">${isOwner()?'+ Pembelian Langsung':'+ Ajukan Pembelian'}</button><button class="btn btn-outline" id="con-purchase-refresh">↻ Muat Ulang</button></div><div id="con-purchase-list" class="card" style="margin-top:10px">Memuat…</div></div>`;
    const list = root.querySelector('#con-purchase-list');
    try {
      const [r, p] = await Promise.all([
        window.apiGet('getPembelian', {}, { cache:true, maxAge:5*60*1000 }),
        window.apiGet('getPengajuanPembelian', { idUser:user().idUser }, { cache:true, maxAge:60*1000 })
      ]);
      const rows = Array.isArray(r) ? r : [];
      const pending = Array.isArray(p) ? p : [];
      list.innerHTML = `<div class="section-title">Pengajuan</div>${pending.map(x => {
        const supplierPending = String(x.Supplier_Status ?? x.supplierStatus ?? x.Status_Supplier ?? '').toLowerCase().includes('menunggu');
        return `<div class="list-item"><div class="li-main"><div class="li-title">${esc(x.Nama_Obat || '-')} • ${esc(x.Jumlah || x.Qty || '-')}</div><div class="li-sub">${esc(x.Diajukan_Oleh || '-')} • ${esc(x.Status || '-')}</div><div class="li-sub">Supplier: ${esc(x.Nama_Supplier || '-')} ${supplierPending ? '• Menunggu persetujuan Owner' : ''}</div><div class="li-sub">${esc(x.Satuan_Beli || x.satuanBeli || 'Pcs')} • Isi ${Number(x.Isi_Per_Satuan_Beli || x.isiPerSatuanBeli || 1)}</div></div><div class="li-right">${isOwner() && x.Status === 'Menunggu' ? `<button class="btn btn-primary btn-sm" data-con-approve="${esc(x.ID_Pengajuan)}">Setujui</button><button class="btn btn-danger btn-sm" style="margin-top:4px" data-con-reject="${esc(x.ID_Pengajuan)}">Tolak</button>` : `<span class="pill pill-warn">${esc(x.Status || '-')}</span>`}</div></div>`;
      }).join('') || '<div class="empty-state">Tidak ada pengajuan.</div>'}<div class="section-title">Riwayat Pembelian</div>${rows.map(x => `<div class="list-item"><div class="li-main"><div class="li-title">${esc(x.Nama_Obat || '-')}</div><div class="li-sub">${esc(x.Nama_Supplier || '-')} • ${esc(x.No_Faktur || '-')}</div><div class="li-sub">${esc(x.Tanggal || '-')} • ${esc(x.Satuan_Beli || x.satuanBeli || 'Pcs')} • Qty ${esc(x.Qty || x.Qty_Satuan_Beli || '-')}</div></div><div class="li-right"><div class="li-value">${money(x.Total || 0)}</div></div></div>`).join('') || '<div class="empty-state">Belum ada pembelian.</div>'}`;
    } catch (e) {
      list.innerHTML = `<div class="empty-state">Gagal memuat pembelian.<br><small>${esc(e.message || String(e))}</small></div>`;
    }
    root.querySelector('#con-purchase-add').onclick = openPurchase;
    root.querySelector('#con-purchase-refresh').onclick = () => window.navigasiKe?.('pembelian');
    root.querySelectorAll('[data-con-approve]').forEach(b => b.onclick = () => approvePurchase(b.dataset.conApprove));
    root.querySelectorAll('[data-con-reject]').forEach(b => b.onclick = () => rejectPurchase(b.dataset.conReject));
  }

  async function approvePurchase(id) {
    if (!isOwner() || !online()) return;
    modal('Persetujuan Pembelian', `${field('con-hb','Harga Beli Satuan',0,'number','min="0"')}${field('con-hj','Harga Jual',0,'number','min="0"')}<div class="form-group"><label><input type="checkbox" id="con-update-price"> Perbarui harga jual master</label></div><div class="form-hint">Supplier baru hanya boleh menjadi supplier aktif setelah backend memproses persetujuan Owner.</div><div class="btn-row"><button class="btn btn-secondary" data-consolidated-cancel>Batal</button><button class="btn btn-primary" id="con-approve-save">Setujui</button></div>`, async (root, close) => {
      root.querySelector('#con-approve-save').onclick = async () => {
        const b = root.querySelector('#con-approve-save'); b.disabled = true;
        try {
          await window.apiPost('setujuiPengajuanPembelian', {
            idUser: user().idUser, idPengajuan: id,
            hargaBeliSatuan: Number(root.querySelector('#con-hb').value || 0),
            hargaJual: Number(root.querySelector('#con-hj').value || 0),
            perbaruiHargaJual: root.querySelector('#con-update-price').checked,
            setujuiSupplierBaru: true
          });
          close(); toast('Pengajuan disetujui.', 'success'); window.navigasiKe?.('pembelian');
        } catch (e) { window.tampilkanError?.(e); b.disabled = false; }
      };
    });
  }

  async function rejectPurchase(id) {
    if (!isOwner() || !online()) return;
    modal('Tolak Pengajuan', `${field('con-reason','Alasan Penolakan','')}<div class="btn-row"><button class="btn btn-secondary" data-consolidated-cancel>Batal</button><button class="btn btn-danger" id="con-reject-save">Tolak</button></div>`, async (root, close) => {
      root.querySelector('#con-reject-save').onclick = async () => {
        const b = root.querySelector('#con-reject-save'); b.disabled = true;
        try {
          await window.apiPost('tolakPengajuanPembelian', { idUser:user().idUser, idPengajuan:id, alasan:root.querySelector('#con-reason').value.trim() });
          close(); toast('Pengajuan ditolak.', 'success'); window.navigasiKe?.('pembelian');
        } catch (e) { window.tampilkanError?.(e); b.disabled = false; }
      };
    });
  }

  function installGpsUx() {
    if (window.__ANA_FARMA_GPS_CONSOLIDATED__) return;
    window.__ANA_FARMA_GPS_CONSOLIDATED__ = true;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-usr-gps]');
      if (!button) return;
      const id = String(button.dataset.usrGps || '');
      if (!id) return;
      if (state.gpsBusy.has(id)) { event.preventDefault(); event.stopImmediatePropagation(); toast('Perubahan GPS sedang diproses.', 'warn'); return; }
      state.gpsBusy.add(id);
      button.disabled = true;
      setTimeout(() => { state.gpsBusy.delete(id); button.disabled = false; }, 15000);
    }, true);
  }

  function installShiftPersistence() {
    ['visibilitychange','pageshow','focus'].forEach(evt => window.addEventListener(evt, persistSession));
  }

  function boot() {
    normalizeRole();
    disableAutoLogout();
    guardApi();
    installGpsUx();
    installShiftPersistence();
    if (window.SCREEN_RENDERERS) window.SCREEN_RENDERERS.pembelian = renderPurchase;
    window.AnaFarmaSessionPolicy = { version: VERSION, isShiftActive: shiftActive, canOperate: () => isOwner() || shiftActive(), persist: persistSession };
    window.AnaFarmaConsolidatedPolicy = { version: VERSION, gpsBusy: state.gpsBusy, openPurchase, renderPurchase, approvePurchase, rejectPurchase };
    console.info('[DEV CONSOLIDATED POLICY]', VERSION);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
