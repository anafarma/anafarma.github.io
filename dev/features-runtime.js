/**
 * APOTEK ANA FARMA — DEV FEATURES RUNTIME
 * V18.1
 *
 * Lapisan fitur lengkap untuk /dev.
 * Tidak membuat router/API/IndexedDB kedua.
 * Menggunakan AppState, apiGet, apiPost, SCREEN_RENDERERS dari app.js.
 *
 * Offline policy:
 * - READ: memakai cache IndexedDB yang sudah disediakan app.js.
 * - createTransaksi: boleh masuk Outbox saat offline.
 * - master-data mutation (stok, pembelian, retur, pelanggan, supplier,
 *   user, pengaturan, opname): online-only untuk menjaga konsistensi stok.
 */
(function () {
  'use strict';

  const VERSION = '20260827-DEV-FEATURES-18.1';
  const FEATURE_READY = '__ANA_FARMA_DEV_FEATURES_READY__';

  function readyInstall() {
    if (window[FEATURE_READY]) return;
    if (typeof AppState === 'undefined' || typeof SCREEN_RENDERERS === 'undefined' || typeof apiGet !== 'function' || typeof apiPost !== 'function') {
      setTimeout(readyInstall, 25);
      return;
    }
    window[FEATURE_READY] = true;
    install();
  }

  function esc(v) {
    return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function money(v) {
    return typeof formatRupiah === 'function' ? formatRupiah(v) : 'Rp' + Number(v || 0).toLocaleString('id-ID');
  }

  function onlineRequired() {
    if (AppState.isOnline) return true;
    toast('Fitur ini membutuhkan koneksi internet agar data server tetap konsisten.', 'warn');
    return false;
  }

  function modal(title, body, onMount, center) {
    const root = document.getElementById('modal-root');
    if (!root) return;
    root.innerHTML = `
      <div class="modal-overlay ${center ? 'center-align' : ''}" data-dev-modal>
        <div class="modal-sheet ${center ? 'modal-center' : ''}">
          <div class="modal-header">
            <h3>${esc(title)}</h3>
            <button type="button" class="modal-close" data-dev-close>✕</button>
          </div>
          <div class="modal-body">${body}</div>
        </div>
      </div>`;
    const overlay = root.querySelector('[data-dev-modal]');
    root.querySelector('[data-dev-close]').onclick = closeModal;
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };
    requestAnimationFrame(() => overlay.classList.add('show'));
    if (onMount) onMount(root);
  }

  function closeModal() {
    const root = document.getElementById('modal-root');
    const overlay = root && root.querySelector('[data-dev-modal]');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => { if (root) root.innerHTML = ''; }, 180);
  }

  function confirmDev(message, title = 'Konfirmasi') {
    return new Promise(resolve => {
      modal(title, `<p style="line-height:1.5;color:var(--text-dim);">${esc(message)}</p><div class="btn-row" style="margin-top:16px;"><button class="btn btn-secondary" id="dev-no">Batal</button><button class="btn btn-primary" id="dev-yes">Ya, lanjutkan</button></div>`, root => {
        root.querySelector('#dev-no').onclick = () => { closeModal(); resolve(false); };
        root.querySelector('#dev-yes').onclick = () => { closeModal(); resolve(true); };
      }, true);
    });
  }

  function formField(id, label, value = '', type = 'text', extra = '') {
    return `<div class="form-group"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" type="${esc(type)}" value="${esc(value)}" ${extra}></div>`;
  }

  function selectField(id, label, options, value = '') {
    return `<div class="form-group"><label for="${esc(id)}">${esc(label)}</label><select id="${esc(id)}">${options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  }

  async function safeGet(action, params = {}, options = {}) {
    try { return await apiGet(action, params, options); }
    catch (e) { tampilkanError(e); throw e; }
  }

  async function safePost(action, data = {}, options = {}) {
    if (!AppState.isOnline && action !== 'createTransaksi') {
      throw new Error('Fitur ini membutuhkan koneksi internet.');
    }
    try { return await apiPost(action, data, options); }
    catch (e) { tampilkanError(e); throw e; }
  }

  function roleOwner() { return AppState.user && AppState.user.role === 'Owner'; }

  function produkNama(p) { return p ? (p.Nama_Obat ?? p.namaObat ?? '-') : '-'; }
  function produkKode(p) { return p ? (p.Kode_Obat ?? p.kodeObat ?? '') : ''; }
  function produkStok(p) { return Number(p && (p.Stok ?? p.stok) || 0); }

  async function getProdukFresh() {
    const data = await safeGet('getProduk', { idUser: AppState.user && AppState.user.idUser }, { cache: true, maxAge: 60 * 60 * 1000 });
    AppState.produkCache = Array.isArray(data) ? data : [];
    AppState.produkCacheAt = Date.now();
    return AppState.produkCache;
  }

  async function loadLokasi() {
    try {
      const data = await safeGet('getLokasi', {}, { cache: true, maxAge: 24 * 60 * 60 * 1000 });
      AppState.lokasiCache = Array.isArray(data) ? data : [];
      return AppState.lokasiCache;
    } catch (_) { AppState.lokasiCache = []; return []; }
  }

  function lokasiOptions(value = '') {
    const list = Array.isArray(AppState.lokasiCache) ? AppState.lokasiCache : [];
    const options = [{ value: '', label: 'Belum teridentifikasi / tanpa rak' }];
    list.forEach(x => options.push({ value: x.ID_Lokasi, label: `${x.Nama_Display || x.ID_Lokasi}${x.Zona ? ' • ' + x.Zona : ''}` }));
    return options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value || '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  }

  // ------------------------------------------------------------------
  // DASHBOARD LENGKAP
  // ------------------------------------------------------------------
  async function renderDashboardFull(root) {
    const u = AppState.user;
    root.innerHTML = `<div class="container"><div class="empty-state">Memuat dashboard...</div></div>`;
    const [summary, analysis] = await Promise.all([
      safeGet('getDashboardSummary', { idUser: u.idUser }, { cache: true, maxAge: 60 * 1000 }),
      roleOwner() ? safeGet('getAnalisisPenjualan', {}, { cache: true, maxAge: 5 * 60 * 1000 }).catch(() => null) : Promise.resolve(null)
    ]);
    const s = summary || {};
    const shift = s.shift || {};
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <div style="font-size:18px;font-weight:800;">Selamat datang, ${esc(u.nama || u.username)}</div>
          <div style="color:var(--text-dim);margin-top:3px;">${esc(u.role)} • ${AppState.isOnline ? 'ONLINE' : 'OFFLINE'}</div>
        </div>
        ${!roleOwner() ? `<div class="card" style="border-left:4px solid var(--primary);"><div style="font-weight:700;">Shift</div><div style="margin-top:5px;">${shift.status === 'Aktif' ? `Aktif sejak ${esc(shift.mulai || '-')}` : 'Belum aktif'}</div><button class="btn btn-${shift.status === 'Aktif' ? 'danger' : 'primary'} btn-sm" id="dash-shift" style="margin-top:10px;">${shift.status === 'Aktif' ? 'Selesai Shift' : 'Mulai Shift'}</button></div>` : ''}
        <div class="section-title">Ringkasan Hari Ini</div>
        <div class="grid-2">
          <div class="stat-card good"><div class="stat-label">Omzet Hari Ini</div><div class="stat-value">${money(s.omzetHariIni)}</div></div>
          <div class="stat-card"><div class="stat-label">Transaksi</div><div class="stat-value">${Number(s.transaksiHariIni || 0)}</div></div>
          <div class="stat-card warn"><div class="stat-label">Stok Menipis</div><div class="stat-value">${Number(s.stokMenipis || 0)}</div></div>
          <div class="stat-card danger"><div class="stat-label">Stok Habis</div><div class="stat-value">${Number(s.stokHabis || 0)}</div></div>
        </div>
        <div class="grid-2" style="margin-top:10px;">
          <button class="btn btn-primary" data-nav="kasir">🧾 Transaksi Baru</button>
          <button class="btn btn-outline" data-nav="stok">📦 Kelola Stok</button>
          <button class="btn btn-outline" data-nav="pembelian">🚚 Pembelian</button>
          <button class="btn btn-outline" data-nav="pelanggan">👥 Pelanggan</button>
          <button class="btn btn-outline" data-nav="retur">↩️ Retur</button>
          <button class="btn btn-outline" data-nav="opname">📋 Stok Opname</button>
          ${roleOwner() ? '<button class="btn btn-outline" data-nav="laporan">📊 Laporan</button><button class="btn btn-outline" data-nav="users">👤 Pengguna</button>' : ''}
        </div>
        ${Number(s.kadaluarsaDekat || 0) ? `<div class="card" style="border-left:4px solid var(--warning);margin-top:12px;cursor:pointer;" data-nav="stok"><b>⏰ ${Number(s.kadaluarsaDekat)} produk mendekati kadaluarsa</b><div style="font-size:12px;color:var(--text-dim);margin-top:3px;">Periksa daftar stok dan tanggal kadaluarsa.</div></div>` : ''}
        ${roleOwner() && Number(s.pengajuanPending || 0) ? `<div class="card" style="border-left:4px solid var(--info);margin-top:12px;cursor:pointer;" data-nav="pembelian"><b>📥 ${Number(s.pengajuanPending)} pengajuan menunggu persetujuan</b></div>` : ''}
        ${analysis ? `<div class="section-title">Analisis Penjualan</div><div class="grid-2"><div class="stat-card"><div class="stat-label">Minggu ini</div><div class="stat-value">${money(analysis.omzetMingguIni)}</div><div style="font-size:11px;color:var(--text-dim);">${Number(analysis.persenMingguan || 0).toFixed(1)}% vs minggu lalu</div></div><div class="stat-card"><div class="stat-label">Bulan ini</div><div class="stat-value">${money(analysis.omzetBulanIni)}</div><div style="font-size:11px;color:var(--text-dim);">${Number(analysis.persenBulanan || 0).toFixed(1)}% vs bulan lalu</div></div></div>` : ''}
        <div class="card" style="margin-top:12px;"><b>Sinkronisasi</b><div id="dash-sync" style="font-size:12px;color:var(--text-dim);margin-top:5px;">Memeriksa...</div><button class="btn btn-outline btn-sm" id="dash-sync-btn" style="margin-top:10px;">🔄 Sinkronkan Sekarang</button></div>
      </div>`;
    root.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navigasiKe(b.dataset.nav));
    const shiftBtn = root.querySelector('#dash-shift');
    if (shiftBtn) shiftBtn.onclick = shift.status === 'Aktif' ? selesaiShiftDev : mulaiShiftDev;
    root.querySelector('#dash-sync-btn').onclick = async () => { await syncOutbox(); renderDashboardFull(root); };
    const c = await jumlahOutbox(); root.querySelector('#dash-sync').textContent = c ? `${c} data menunggu sinkronisasi.` : 'Tidak ada data tertunda.';
  }

  // ------------------------------------------------------------------
  // STOK / PRODUK
  // ------------------------------------------------------------------
  async function renderStokFull(root) {
    root.innerHTML = `<div class="container"><div class="empty-state">Memuat stok...</div></div>`;
    const products = await getProdukFresh();
    await loadLokasi();
    root.innerHTML = `
      <div class="container">
        <div class="section-title">Stok Obat</div>
        <div class="search-bar"><span>🔍</span><input id="stok-q" placeholder="Cari nama/kode obat..." autocomplete="off"></div>
        <div class="btn-row" style="margin-bottom:10px;"><button class="btn btn-outline btn-sm" data-filter="all">Semua</button><button class="btn btn-outline btn-sm" data-filter="menipis">Menipis</button><button class="btn btn-outline btn-sm" data-filter="habis">Habis</button>${roleOwner() ? '<button class="btn btn-primary btn-sm" id="stok-add">+ Obat</button>' : ''}</div>
        <div id="stok-list"></div>
      </div>`;
    let filter = 'all';
    const draw = () => {
      const q = root.querySelector('#stok-q').value.trim().toLowerCase();
      let rows = products.filter(p => !q || `${produkKode(p)} ${produkNama(p)}`.toLowerCase().includes(q));
      if (filter === 'menipis') rows = rows.filter(p => produkStok(p) > 0 && produkStok(p) <= Number(p.Stok_Minimum || 0));
      if (filter === 'habis') rows = rows.filter(p => produkStok(p) <= 0);
      root.querySelector('#stok-list').innerHTML = rows.slice(0, 200).map(p => {
        const expired = p.Expired ? new Date(p.Expired) : null;
        const expSoon = expired && !isNaN(expired) && expired.getTime() <= Date.now() + 30 * 86400000;
        const status = produkStok(p) <= 0 ? '<span class="pill pill-danger">Habis</span>' : produkStok(p) <= Number(p.Stok_Minimum || 0) ? '<span class="pill pill-warn">Menipis</span>' : '<span class="pill pill-success">Aman</span>';
        return `<div class="list-item"><div class="li-main"><div class="li-title">${esc(produkNama(p))}</div><div class="li-sub">${esc(produkKode(p))} • ${esc(p.Kategori || '-')} • ${money(p.Harga_Jual)}</div><div class="li-sub">Rak: ${esc(p.Lokasi_Rak || 'Belum teridentifikasi')} ${p.Expired ? '• Exp: '+esc(p.Expired) : ''}</div></div><div class="li-right"><div class="li-value">${produkStok(p)}</div>${status}${expSoon ? '<div class="pill pill-warn" style="margin-top:3px;">Exp dekat</div>' : ''}<div style="display:flex;gap:4px;margin-top:6px;"><button class="btn btn-outline btn-sm" data-adjust="${esc(produkKode(p))}">±</button>${roleOwner() ? `<button class="btn btn-outline btn-sm" data-edit="${esc(produkKode(p))}">Edit</button>` : ''}</div></div></div>`;
      }).join('') || '<div class="empty-state">Tidak ada produk.</div>';
      root.querySelectorAll('[data-adjust]').forEach(b => b.onclick = () => adjustStockModal(products.find(p => produkKode(p) === b.dataset.adjust)));
      root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editProdukModal(products.find(p => produkKode(p) === b.dataset.edit), draw));
    };
    root.querySelector('#stok-q').oninput = debounce(draw, 150);
    root.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; draw(); });
    const add = root.querySelector('#stok-add'); if (add) add.onclick = () => editProdukModal(null, draw);
    draw();
  }

  async function editProdukModal(p, refresh) {
    if (!roleOwner() || !onlineRequired()) return;
    if (!AppState.lokasiCache) await loadLokasi();
    const title = p ? 'Edit Obat' : 'Tambah Obat';
    const supplier = await safeGet('getSupplier', {}, { cache: true, maxAge: 30 * 60 * 1000 }).catch(() => []);
    const supplierOpts = [{ value:'', label:'-- Tanpa Supplier --' }].concat((Array.isArray(supplier) ? supplier : []).map(s => ({ value:s.ID_Supplier, label:s.Nama_Supplier })));
    modal(title, `${p ? `<div class="form-hint">Kode: ${esc(produkKode(p))}</div>` : ''}${formField('p-nama','Nama Obat',p ? p.Nama_Obat : '')}${formField('p-kategori','Kategori',p ? p.Kategori : 'Umum')}${formField('p-satuan','Satuan Ecer',p ? p.Satuan : 'Pcs')}${formField('p-stokmin','Stok Minimum',p ? p.Stok_Minimum : 5,'number','min="0"')}${formField('p-hb','Harga Beli',p ? p.Harga_Beli : 0,'number','min="0"')}${formField('p-hj','Harga Jual',p ? p.Harga_Jual : 0,'number','min="0"')}${selectField('p-supplier','Supplier',supplierOpts,p ? p.Supplier : '')}${selectField('p-rak','Lokasi Rak',[{value:'',label:'Belum teridentifikasi / tanpa rak'}].concat((AppState.lokasiCache || []).map(x => ({value:x.ID_Lokasi,label:`${x.Nama_Display || x.ID_Lokasi}${x.Zona ? ' • '+x.Zona : ''}`}))),p ? p.Lokasi_Rak : '')}${formField('p-exp','Kadaluarsa',p ? p.Expired : '','date')}${formField('p-sb','Satuan Beli',p ? p.Satuan_Beli : (p ? p.Satuan : 'Pcs'))}${formField('p-isi-beli','Isi per Satuan Beli',p ? p.Isi_Per_Satuan_Beli : 1,'number','min="1"')}${formField('p-sj2','Satuan Jual 2',p ? p.Satuan_Jual_2 : '')}${formField('p-isi2','Isi Satuan Jual 2',p ? p.Isi_Per_Satuan_2 : 1,'number','min="1"')}${formField('p-hj2','Harga Jual 2',p ? p.Harga_Jual_2 : 0,'number','min="0"')}<div class="form-group"><label><input type="checkbox" id="p-a2" ${p && (p.Aktif_Satuan_2 === true || String(p.Aktif_Satuan_2).toUpperCase() === 'TRUE') ? 'checked' : ''}> Aktifkan satuan jual 2</label></div><div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="p-save">Simpan</button></div>`, root => {
      root.querySelector('#p-save').onclick = async () => {
        const data = { idUser: AppState.user.idUser, namaObat: root.querySelector('#p-nama').value.trim(), kategori: root.querySelector('#p-kategori').value.trim(), satuan: root.querySelector('#p-satuan').value.trim(), stokMinimum: Number(root.querySelector('#p-stokmin').value || 0), hargaBeli: Number(root.querySelector('#p-hb').value || 0), hargaJual: Number(root.querySelector('#p-hj').value || 0), supplier: root.querySelector('#p-supplier').value, lokasiRak: root.querySelector('#p-rak').value, expired: root.querySelector('#p-exp').value, satuanBeli: root.querySelector('#p-sb').value.trim(), isiPerSatuanBeli: Number(root.querySelector('#p-isi-beli').value || 1), satuanJual2: root.querySelector('#p-sj2').value.trim(), isiPerSatuan2: Number(root.querySelector('#p-isi2').value || 1), hargaJual2: Number(root.querySelector('#p-hj2').value || 0), aktifSatuan2: root.querySelector('#p-a2').checked };
        if (!data.namaObat || data.hargaJual <= 0) { toast('Nama obat dan harga jual wajib diisi.', 'warn'); return; }
        if (p) { data.kodeObat = produkKode(p); await safePost('updateProduk', data); } else { data.stok = 0; await safePost('addProduk', data); }
        closeModal(); await getProdukFresh(); refresh();
      };
    });
  }

  async function adjustStockModal(p) {
    if (!p || !onlineRequired()) return;
    modal('Penyesuaian Stok', `<div class="card"><b>${esc(produkNama(p))}</b><div style="font-size:12px;color:var(--text-dim);margin-top:3px;">Stok saat ini: ${produkStok(p)}</div></div>${formField('adj-jumlah','Perubahan (+/-)',0,'number')}${formField('adj-ket','Keterangan','') }<div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="adj-save">Simpan</button></div>`, root => {
      root.querySelector('#adj-save').onclick = async () => { const perubahan = Number(root.querySelector('#adj-jumlah').value || 0); if (!perubahan) { toast('Perubahan tidak boleh nol.','warn'); return; } await safePost('adjustStok',{idUser:AppState.user.idUser,kodeObat:produkKode(p),perubahan,keterangan:root.querySelector('#adj-ket').value.trim()}); closeModal(); invalidasiCacheProduk(); navigasiKe('stok'); };
    });
  }

  // ------------------------------------------------------------------
  // RIWAYAT TRANSAKSI
  // ------------------------------------------------------------------
  async function renderRiwayatFull(root) {
    const today = new Date().toISOString().slice(0,10);
    root.innerHTML = `<div class="container"><div class="section-title">Riwayat Transaksi</div><div class="grid-2">${formField('riw-start','Mulai',today,'date')}${formField('riw-end','Selesai',today,'date')}</div><div class="btn-row" style="margin-bottom:10px;"><button class="btn btn-primary" id="riw-load">Tampilkan</button><button class="btn btn-outline" id="riw-refresh">↻</button></div><div id="riw-list"></div></div>`;
    const draw = async () => {
      const list = root.querySelector('#riw-list'); list.innerHTML = '<div class="empty-state">Memuat...</div>';
      const data = await safeGet('getTransaksi',{mulai:root.querySelector('#riw-start').value,selesai:root.querySelector('#riw-end').value,idKasir:roleOwner()?'':AppState.user.idUser,limit:300},{cache:true,maxAge:2*60*1000});
      list.innerHTML = (Array.isArray(data)?data:[]).map(t => `<div class="list-item"><div class="li-main"><div class="li-title">${esc(t.ID_Transaksi)}</div><div class="li-sub">${esc(t.Tanggal)} • ${esc(t.Nama_Kasir || '-')}</div><div class="li-sub">${esc(t.Daftar_Obat || '-')}</div></div><div class="li-right"><div class="li-value">${money(t.Total)}</div><span class="pill ${t.Status === 'Dibatalkan' ? 'pill-danger' : 'pill-success'}">${esc(t.Status)}</span><div style="display:flex;gap:4px;margin-top:5px;"><button class="btn btn-outline btn-sm" data-detail="${esc(t.ID_Transaksi)}">Detail</button>${t.Status !== 'Dibatalkan' ? `<button class="btn btn-danger btn-sm" data-cancel="${esc(t.ID_Transaksi)}">Batal</button>` : ''}</div></div></div>`).join('') || '<div class="empty-state">Tidak ada transaksi.</div>';
      list.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detailTransaksi(b.dataset.detail));
      list.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{if(await confirmDev('Batalkan transaksi ini? Stok akan dikembalikan.')){await safePost('batalkanTransaksi',{idUser:AppState.user.idUser,idTransaksi:b.dataset.cancel}); await draw();}});
    };
    root.querySelector('#riw-load').onclick=draw; root.querySelector('#riw-refresh').onclick=draw; draw();
  }

  async function detailTransaksi(id) {
    const d = await safeGet('getDetailTransaksi',{idTransaksi:id},{cache:true,maxAge:10*60*1000});
    modal('Detail '+id, `<div>${(Array.isArray(d)?d:[]).map(x=>`<div class="list-item"><div class="li-main"><b>${esc(x.Nama_Obat)}</b><div class="li-sub">${x.Qty} × ${money(x.Harga_Satuan)}</div></div><div class="li-right"><b>${money(x.Subtotal)}</b></div></div>`).join('') || '<div class="empty-state">Tidak ada detail.</div>'}</div>`);
  }

  // ------------------------------------------------------------------
  // PEMBELIAN + PENGAJUAN
  // ------------------------------------------------------------------
  async function renderPembelianFull(root) {
    root.innerHTML = `<div class="container"><div class="section-title">Pembelian & Pengajuan</div><div class="btn-row"><button class="btn btn-primary" id="pb-add">${roleOwner() ? '+ Pembelian Langsung' : '+ Ajukan Barang Masuk'}</button><button class="btn btn-outline" id="pb-refresh">↻ Muat</button></div><div id="pb-list" style="margin-top:10px;"></div></div>`;
    const [rows, pengajuan] = await Promise.all([safeGet('getPembelian',{}, {cache:true,maxAge:5*60*1000}),safeGet('getPengajuanPembelian',{idUser:AppState.user.idUser},{cache:true,maxAge:60*1000})]);
    const list = root.querySelector('#pb-list');
    const pending = (Array.isArray(pengajuan)?pengajuan:[]);
    list.innerHTML = `<div class="section-title">Pengajuan</div>` + (pending.map(x=>`<div class="list-item"><div class="li-main"><div class="li-title">${esc(x.Nama_Obat)} • ${x.Jumlah}</div><div class="li-sub">${esc(x.Diajukan_Oleh)} • ${esc(x.Status)}${x.Nama_Supplier ? ' • '+esc(x.Nama_Supplier):''}</div><div class="li-sub">Faktur: ${esc(x.No_Faktur || '-')} • Exp: ${esc(x.Expired || '-')}</div></div><div class="li-right">${roleOwner() && x.Status==='Menunggu'?`<button class="btn btn-primary btn-sm" data-approve="${esc(x.ID_Pengajuan)}">Setujui</button><button class="btn btn-danger btn-sm" data-reject="${esc(x.ID_Pengajuan)}" style="margin-top:4px;">Tolak</button>`:`<span class="pill ${x.Status==='Disetujui'?'pill-success':x.Status==='Ditolak'?'pill-danger':'pill-warn'}">${esc(x.Status)}</span>`}</div></div>`).join('') || '<div class="empty-state">Tidak ada pengajuan.</div>') + `<div class="section-title">Riwayat Pembelian</div>` + ((Array.isArray(rows)?rows:[]).map(x=>`<div class="list-item"><div class="li-main"><div class="li-title">${esc(x.Nama_Obat)}</div><div class="li-sub">${esc(x.Nama_Supplier || '-')} • ${esc(x.No_Faktur || '-')}</div><div class="li-sub">${esc(x.Tanggal)}</div></div><div class="li-right"><div class="li-value">${money(x.Total)}</div><div class="li-sub">Qty ${x.Qty}</div></div></div>`).join('') || '<div class="empty-state">Belum ada pembelian.</div>');
    root.querySelector('#pb-add').onclick = () => roleOwner() ? purchaseModal() : requestPurchaseModal();
    root.querySelector('#pb-refresh').onclick = () => navigasiKe('pembelian');
    root.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>approvePurchase(b.dataset.approve));
    root.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>rejectPurchase(b.dataset.reject));
  }

  async function purchaseProductOptions() { const p=await getProdukFresh(); return p.map(x=>({value:produkKode(x),label:`${produkNama(x)} (${produkKode(x)})` })); }
  async function purchaseModal() {
    if (!onlineRequired()) return;
    const [p,s] = await Promise.all([purchaseProductOptions(),safeGet('getSupplier',{}, {cache:true,maxAge:30*60*1000})]);
    modal('Pembelian Langsung', `${selectField('pb-kode','Obat',p)}${selectField('pb-supplier','Supplier',[{value:'',label:'-- Supplier --'}].concat((s||[]).map(x=>({value:x.ID_Supplier,label:x.Nama_Supplier}))))}${formField('pb-qty','Jumlah Satuan Beli',1,'number','min="1"')}${formField('pb-harga','Harga per Satuan Beli',0,'number','min="0"')}${formField('pb-faktur','No. Faktur','')}${formField('pb-tgl','Tanggal Faktur','','date')}${formField('pb-batch','No. Batch','')}${formField('pb-exp','Expired','','date')}<div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="pb-save">Simpan</button></div>`,root=>{root.querySelector('#pb-save').onclick=async()=>{const data={idUser:AppState.user.idUser,kodeObat:root.querySelector('#pb-kode').value,idSupplier:root.querySelector('#pb-supplier').value,namaSupplier:root.querySelector('#pb-supplier').selectedOptions[0]?.textContent||'',qtySatuanBeli:Number(root.querySelector('#pb-qty').value||0),hargaBeliPerSatuanBeli:Number(root.querySelector('#pb-harga').value||0),noFaktur:root.querySelector('#pb-faktur').value.trim(),tanggalFaktur:root.querySelector('#pb-tgl').value,noBatch:root.querySelector('#pb-batch').value.trim(),expired:root.querySelector('#pb-exp').value};await safePost('addPembelian',data);closeModal();navigasiKe('pembelian');};});
  }

  async function requestPurchaseModal() {
    if (!onlineRequired()) return;
    const [p,s] = await Promise.all([purchaseProductOptions(),safeGet('getSupplier',{}, {cache:true,maxAge:30*60*1000})]);
    modal('Ajukan Barang Masuk', `${selectField('pj-kode','Obat (kosong = produk baru)',[{value:'',label:'-- Produk baru --'}].concat(p))}${formField('pj-nama','Nama Obat','')}${formField('pj-jumlah','Jumlah',1,'number','min="1"')}${formField('pj-jenis','Jenis/Kategori','Umum')}${formField('pj-exp','Expired','','date')}${selectField('pj-supplier','Supplier',[{value:'',label:'-- Supplier --'}].concat((s||[]).map(x=>({value:x.ID_Supplier,label:x.Nama_Supplier}))))}${formField('pj-faktur','No. Faktur','')}${formField('pj-tgl','Tanggal Faktur','','date')}${formField('pj-batch','No. Batch','')}<div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="pj-save">Ajukan</button></div>`,root=>{root.querySelector('#pj-kode').onchange=()=>{const hit=(p||[]).find(x=>x.value===root.querySelector('#pj-kode').value);if(hit)root.querySelector('#pj-nama').value=hit.label.split(' (')[0];};root.querySelector('#pj-save').onclick=async()=>{const sup=root.querySelector('#pj-supplier');await safePost('addPengajuanPembelian',{idUser:AppState.user.idUser,kodeObat:root.querySelector('#pj-kode').value,namaObat:root.querySelector('#pj-nama').value.trim(),jumlah:Number(root.querySelector('#pj-jumlah').value||0),jenis:root.querySelector('#pj-jenis').value.trim(),expired:root.querySelector('#pj-exp').value,noFaktur:root.querySelector('#pj-faktur').value.trim(),tanggalFaktur:root.querySelector('#pj-tgl').value,noBatch:root.querySelector('#pj-batch').value.trim(),idSupplier:sup.value,namaSupplier:sup.selectedOptions[0]?.textContent||''});closeModal();navigasiKe('pembelian');};});
  }

  async function approvePurchase(id) {
    if (!roleOwner() || !onlineRequired()) return;
    modal('Persetujuan Pengajuan',`${formField('ap-hb','Harga Beli Satuan',0,'number','min="0"')}${formField('ap-hj','Harga Jual',0,'number','min="0"')}<div class="form-group"><label><input type="checkbox" id="ap-update"> Perbarui harga jual master</label></div><div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="ap-save">Setujui</button></div>`,root=>{root.querySelector('#ap-save').onclick=async()=>{await safePost('setujuiPengajuanPembelian',{idUser:AppState.user.idUser,idPengajuan:id,hargaBeliSatuan:Number(root.querySelector('#ap-hb').value||0),hargaJual:Number(root.querySelector('#ap-hj').value||0),perbaruiHargaJual:root.querySelector('#ap-update').checked});closeModal();navigasiKe('pembelian');};});
  }
  async function rejectPurchase(id) { if(!roleOwner()||!onlineRequired())return; modal('Tolak Pengajuan',`${formField('rej','Alasan','')}<div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-danger" id="rej-save">Tolak</button></div>`,root=>{root.querySelector('#rej-save').onclick=async()=>{await safePost('tolakPengajuanPembelian',{idUser:AppState.user.idUser,idPengajuan:id,alasan:root.querySelector('#rej').value.trim()});closeModal();navigasiKe('pembelian');};}); }

  // ------------------------------------------------------------------
  // RETUR
  // ------------------------------------------------------------------
  async function renderReturFull(root) {
    root.innerHTML = `<div class="container"><div class="section-title">Retur</div><button class="btn btn-primary" id="ret-add">+ Catat Retur</button><div id="ret-list" style="margin-top:10px;"></div></div>`;
    const rows = await safeGet('getRetur',{}, {cache:true,maxAge:5*60*1000});
    root.querySelector('#ret-list').innerHTML = (Array.isArray(rows)?rows:[]).map(x=>`<div class="list-item"><div class="li-main"><div class="li-title">${esc(x.Nama_Obat)}</div><div class="li-sub">${esc(x.Tanggal)} • ${esc(x.Oleh)}</div><div class="li-sub">${esc(x.Alasan || '-')}</div></div><div class="li-right"><b>${x.Qty}</b><div>${money(x.Jumlah_Refund)}</div><span class="pill pill-gray">${esc(x.Status)}</span></div></div>`).join('')||'<div class="empty-state">Belum ada retur.</div>';
    root.querySelector('#ret-add').onclick=returnModal;
  }
  async function returnModal(){
    if(!onlineRequired())return;
    const p=await getProdukFresh();
    modal('Catat Retur',`${selectField('rt-kode','Obat',p.map(x=>({value:produkKode(x),label:produkNama(x)})))}${formField('rt-qty','Qty',1,'number','min="1"')}${formField('rt-alasan','Alasan','')}${formField('rt-refund','Jumlah Refund',0,'number','min="0"')}<div class="form-group"><label><input type="checkbox" id="rt-stock" checked> Kembalikan ke stok (jika layak jual)</label></div><div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="rt-save">Simpan</button></div>`,root=>{root.querySelector('#rt-save').onclick=async()=>{const code=root.querySelector('#rt-kode').value;const prod=p.find(x=>produkKode(x)===code);await safePost('addRetur',{idUser:AppState.user.idUser,kodeObat:code,namaObat:produkNama(prod),qty:Number(root.querySelector('#rt-qty').value||0),alasan:root.querySelector('#rt-alasan').value.trim(),jumlahRefund:Number(root.querySelector('#rt-refund').value||0),kembalikanKeStok:root.querySelector('#rt-stock').checked});closeModal();navigasiKe('retur');};});
  }

  // ------------------------------------------------------------------
  // PELANGGAN
  // ------------------------------------------------------------------
  async function renderPelangganFull(root){
    root.innerHTML=`<div class="container"><div class="section-title">Pelanggan</div><div class="btn-row"><div class="search-bar" style="flex:1;margin:0;"><span>🔍</span><input id="pel-q" placeholder="Nama / nomor HP..."></div><button class="btn btn-primary btn-sm" id="pel-add">+ Baru</button></div><div id="pel-list" style="margin-top:10px;"></div></div>`;
    const rows=await safeGet('getPelanggan',{}, {cache:true,maxAge:5*60*1000}); const list=root.querySelector('#pel-list');
    const draw=()=>{const q=root.querySelector('#pel-q').value.trim().toLowerCase();const filtered=(Array.isArray(rows)?rows:[]).filter(x=>!q||`${x.Nama} ${x.No_HP}`.toLowerCase().includes(q));list.innerHTML=filtered.slice(0,300).map(x=>`<div class="list-item"><div class="li-main"><div class="li-title">${esc(x.Nama)}</div><div class="li-sub">${esc(x.No_HP||'-')} • ${esc(x.Alamat||'-')}</div><div class="li-sub">Poin: ${Number(x.Poin||0)} • Belanja: ${money(x.Total_Belanja)}</div></div><div class="li-right"><button class="btn btn-outline btn-sm" data-pel-edit="${esc(x.ID_Pelanggan)}">Edit</button></div></div>`).join('')||'<div class="empty-state">Belum ada pelanggan.</div>';list.querySelectorAll('[data-pel-edit]').forEach(b=>b.onclick=()=>editPelanggan(rows.find(x=>x.ID_Pelanggan===b.dataset.pelEdit),draw));};root.querySelector('#pel-q').oninput=debounce(draw,150);root.querySelector('#pel-add').onclick=()=>editPelanggan(null,draw);draw();
  }
  async function editPelanggan(p,refresh){if(!onlineRequired())return;modal(p?'Edit Pelanggan':'Pelanggan Baru',`${formField('pl-nama','Nama',p?p.Nama:'')}${formField('pl-hp','No. HP',p?p.No_HP:'','tel')}${formField('pl-alamat','Alamat',p?p.Alamat:'')} ${p?formField('pl-poin','Tukar Poin (opsional)',0,'number','min="0"'):''}<div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="pl-save">Simpan</button></div>`,root=>{root.querySelector('#pl-save').onclick=async()=>{const data={idUser:AppState.user.idUser,nama:root.querySelector('#pl-nama').value.trim(),noHp:root.querySelector('#pl-hp').value.trim(),alamat:root.querySelector('#pl-alamat').value.trim()};if(!data.nama){toast('Nama wajib diisi.','warn');return;}if(p){const poin=Number(root.querySelector('#pl-poin')?.value||0);if(poin)data.tukarPoin=poin;data.idPelanggan=p.ID_Pelanggan;await safePost('updatePelanggan',data);}else await safePost('addPelanggan',data);closeModal();refresh();};});}

  // ------------------------------------------------------------------
  // SUPPLIER
  // ------------------------------------------------------------------
  async function renderSupplierFull(root){
    if(!roleOwner()){renderPlaceholder(root,'Supplier','Modul ini hanya dapat diakses Owner.');return;}
    root.innerHTML=`<div class="container"><div class="section-title">Supplier</div><button class="btn btn-primary" id="sup-add">+ Supplier</button><div id="sup-list" style="margin-top:10px;"></div></div>`;const rows=await safeGet('getSupplier',{}, {cache:true,maxAge:30*60*1000});const list=root.querySelector('#sup-list');list.innerHTML=(Array.isArray(rows)?rows:[]).map(x=>`<div class="list-item"><div class="li-main"><div class="li-title">${esc(x.Nama_Supplier)}</div><div class="li-sub">${esc(x.Kontak||'-')} • ${esc(x.Alamat||'-')}</div></div><div class="li-right"><span class="pill ${x.Aktif?'pill-success':'pill-gray'}">${x.Aktif?'Aktif':'Nonaktif'}</span><button class="btn btn-outline btn-sm" data-sup="${esc(x.ID_Supplier)}" style="margin-top:5px;">Edit</button></div></div>`).join('')||'<div class="empty-state">Belum ada supplier.</div>';root.querySelector('#sup-add').onclick=()=>editSupplier(null);list.querySelectorAll('[data-sup]').forEach(b=>b.onclick=()=>editSupplier(rows.find(x=>x.ID_Supplier===b.dataset.sup)));}
  async function editSupplier(p){if(!roleOwner()||!onlineRequired())return;modal(p?'Edit Supplier':'Supplier Baru',`${formField('sp-nama','Nama Supplier',p?p.Nama_Supplier:'')}${formField('sp-kontak','Kontak',p?p.Kontak:'')}${formField('sp-alamat','Alamat',p?p.Alamat:'')}<div class="form-group"><label><input type="checkbox" id="sp-aktif" ${!p||p.Aktif?'checked':''}> Aktif</label></div><div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="sp-save">Simpan</button></div>`,root=>{root.querySelector('#sp-save').onclick=async()=>{const data={idUser:AppState.user.idUser,namaSupplier:root.querySelector('#sp-nama').value.trim(),kontak:root.querySelector('#sp-kontak').value.trim(),alamat:root.querySelector('#sp-alamat').value.trim(),aktif:root.querySelector('#sp-aktif').checked};if(!data.namaSupplier){toast('Nama supplier wajib diisi.','warn');return;}if(p)data.idSupplier=p.ID_Supplier;await safePost(p?'updateSupplier':'addSupplier',data);closeModal();navigasiKe('supplier');};});}

  // ------------------------------------------------------------------
  // LAPORAN
  // ------------------------------------------------------------------
  async function renderLaporanFull(root){
    if(!roleOwner()){renderPlaceholder(root,'Laporan','Modul ini hanya dapat diakses Owner.');return;}
    const today=new Date().toISOString().slice(0,10);root.innerHTML=`<div class="container"><div class="section-title">Laporan</div><div class="grid-2">${formField('lap-start','Mulai',today,'date')}${formField('lap-end','Selesai',today,'date')}</div><button class="btn btn-primary" id="lap-load">Tampilkan</button><div id="lap-body" style="margin-top:12px;"></div></div>`;
    const draw=async()=>{const body=root.querySelector('#lap-body');body.innerHTML='<div class="empty-state">Memuat laporan...</div>';const [pen,laba,exp,kasir]=await Promise.all([safeGet('getLaporanPenjualan',{mulai:root.querySelector('#lap-start').value,selesai:root.querySelector('#lap-end').value},{cache:true,maxAge:2*60*1000}),safeGet('getLaporanLabaRugi',{mulai:root.querySelector('#lap-start').value,selesai:root.querySelector('#lap-end').value},{cache:true,maxAge:2*60*1000}),safeGet('getLaporanKadaluarsa',{hari:90},{cache:true,maxAge:10*60*1000}),safeGet('getOmzetPerKasir',{tanggal:root.querySelector('#lap-end').value},{cache:true,maxAge:2*60*1000})]);body.innerHTML=`<div class="grid-2"><div class="stat-card good"><div class="stat-label">Omzet</div><div class="stat-value">${money(pen.totalOmzet)}</div></div><div class="stat-card"><div class="stat-label">Transaksi</div><div class="stat-value">${pen.totalTransaksi}</div></div><div class="stat-card"><div class="stat-label">Laba Kotor</div><div class="stat-value">${money(laba.labaKotor)}</div></div><div class="stat-card"><div class="stat-label">Margin</div><div class="stat-value">${Number(laba.margin||0).toFixed(1)}%</div></div></div><div class="card"><b>Metode Pembayaran</b>${Object.entries(pen.perMetode||{}).map(([k,v])=>`<div style="display:flex;justify-content:space-between;margin-top:7px;"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join('')}</div><div class="card"><b>Top Produk</b>${(laba.topProduk||[]).map(x=>`<div style="display:flex;justify-content:space-between;margin-top:7px;"><span>${esc(x.nama)}</span><b>${x.qty}</b></div>`).join('')||'<div class="form-hint">Belum ada data.</div>'}</div><div class="card"><b>Omzet per Kasir (${esc(lapEnd(root))})</b>${(kasir.perKasir||[]).map(x=>`<div style="display:flex;justify-content:space-between;margin-top:7px;"><span>${esc(x.namaKasir)}</span><b>${money(x.omzet)}</b></div>`).join('')||'<div class="form-hint">Belum ada transaksi.</div>'}</div><div class="card"><b>Kadaluarsa ≤ 90 hari</b>${(exp||[]).slice(0,100).map(x=>`<div class="list-item"><div class="li-main"><b>${esc(x.Nama_Obat)}</b><div class="li-sub">${esc(x.Expired)}</div></div><div class="li-right">${x.Stok}</div></div>`).join('')||'<div class="form-hint">Tidak ada.</div>'}</div>`;};root.querySelector('#lap-load').onclick=draw;draw();}
  function lapEnd(root){return root.querySelector('#lap-end').value;}

  // ------------------------------------------------------------------
  // STOK OPNAME
  // ------------------------------------------------------------------
  async function renderOpnameFull(root){
    root.innerHTML=`<div class="container"><div class="section-title">Stok Opname</div><div class="card"><div class="form-hint">Isi stok fisik. Hanya selisih yang akan mengubah stok server.</div></div><div class="search-bar"><span>🔍</span><input id="op-q" placeholder="Cari obat..."></div><div id="op-list"></div><button class="btn btn-primary" id="op-save" style="position:sticky;bottom:72px;z-index:20;">Simpan Opname</button></div>`;
    const products=await getProdukFresh();const list=root.querySelector('#op-list');
    const draw=()=>{const q=root.querySelector('#op-q').value.trim().toLowerCase();const rows=products.filter(p=>!q||`${produkKode(p)} ${produkNama(p)}`.toLowerCase().includes(q)).slice(0,200);list.innerHTML=rows.map(p=>`<div class="card"><div style="font-weight:700;">${esc(produkNama(p))}</div><div class="form-hint">Sistem: ${produkStok(p)}</div><input type="number" min="0" step="1" data-op-code="${esc(produkKode(p))}" value="${produkStok(p)}"><input type="text" placeholder="Keterangan (opsional)" data-op-ket="${esc(produkKode(p))}" style="margin-top:6px;width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;"></div>`).join('');};root.querySelector('#op-q').oninput=debounce(draw,150);draw();root.querySelector('#op-save').onclick=async()=>{if(!onlineRequired())return;const items=[];list.querySelectorAll('[data-op-code]').forEach(inp=>{const code=inp.dataset.opCode;const p=products.find(x=>produkKode(x)===code);const fisik=Number(inp.value);if(Number.isFinite(fisik))items.push({kodeObat:code,namaObat:produkNama(p),stokFisik:fisik,keterangan:list.querySelector(`[data-op-ket="${CSS.escape(code)}"]`)?.value||''});});if(!items.length)return;await safePost('simpanStokOpname',{idUser:AppState.user.idUser,items});toast('Stok opname berhasil disimpan.','success');invalidasiCacheProduk();navigasiKe('opname');};
  }

  // ------------------------------------------------------------------
  // PENGATURAN
  // ------------------------------------------------------------------
  async function renderPengaturanFull(root){
    if(!roleOwner()){renderPlaceholder(root,'Pengaturan','Modul ini hanya dapat diakses Owner.');return;}const s=await safeGet('getPengaturan',{}, {cache:true,maxAge:10*60*1000});const keys=['nama_apotek','alamat_apotek','telepon_apotek','gps_lat','gps_lng','gps_radius','auto_logout_menit','poin_per_rupiah'];root.innerHTML=`<div class="container"><div class="section-title">Pengaturan</div><div class="card">${keys.map(k=>formField('set-'+k,k.replaceAll('_',' '),s[k]??'')).join('')}</div><button class="btn btn-primary" id="set-save">Simpan Pengaturan</button></div>`;root.querySelector('#set-save').onclick=async()=>{const kv={};keys.forEach(k=>kv[k]=root.querySelector('#set-'+k).value.trim());await safePost('updatePengaturan',{idUser:AppState.user.idUser,kv});AppState.pengaturan=Object.assign({},AppState.pengaturan,kv);toast('Pengaturan tersimpan.','success');};}

  // ------------------------------------------------------------------
  // USER MANAGEMENT
  // ------------------------------------------------------------------
  async function renderUsersFull(root){
    if(!roleOwner()){renderPlaceholder(root,'Pengguna','Modul ini hanya dapat diakses Owner.');return;}const rows=await safeGet('getUsers',{}, {cache:true,maxAge:5*60*1000});root.innerHTML=`<div class="container"><div class="section-title">Pengguna</div><button class="btn btn-primary" id="usr-add">+ Pengguna</button><div id="usr-list" style="margin-top:10px;"></div></div>`;const list=root.querySelector('#usr-list');list.innerHTML=(rows||[]).map(u=>`<div class="list-item"><div class="li-main"><div class="li-title">${esc(u.nama)} • ${esc(u.username)}</div><div class="li-sub">${esc(u.role)} • ${u.wajibGPS?'GPS wajib':'GPS tidak wajib'}</div></div><div class="li-right"><span class="pill ${u.aktif?'pill-success':'pill-danger'}">${u.aktif?'Aktif':'Nonaktif'}</span><div style="display:flex;gap:4px;margin-top:5px;"><button class="btn btn-outline btn-sm" data-usr-edit="${esc(u.idUser)}">Edit</button><button class="btn btn-outline btn-sm" data-usr-gps="${esc(u.idUser)}">GPS</button></div></div></div>`).join('')||'<div class="empty-state">Belum ada pengguna.</div>';root.querySelector('#usr-add').onclick=()=>userModal(null);list.querySelectorAll('[data-usr-edit]').forEach(b=>b.onclick=()=>userModal(rows.find(x=>x.idUser===b.dataset.usrEdit)));list.querySelectorAll('[data-usr-gps]').forEach(b=>toggleGps(rows.find(x=>x.idUser===b.dataset.usrGps)));}
  async function userModal(u){if(!roleOwner()||!onlineRequired())return;modal(u?'Edit Pengguna':'Pengguna Baru',`${formField('u-user','Username',u?u.username:'')}${formField('u-nama','Nama',u?u.nama:'')}${selectField('u-role','Role',[{value:'Pegawai',label:'Pegawai'},{value:'Owner',label:'Owner'}],u?u.role:'Pegawai')}${u?'':formField('u-pass','Password Awal','12345678','password')}<div class="form-group"><label><input id="u-aktif" type="checkbox" ${!u||u.aktif?'checked':''}> Aktif</label></div><div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="u-save">Simpan</button></div>${u?'<button class="btn btn-outline" id="u-reset" style="margin-top:8px;">Reset Password</button>':''}`,root=>{root.querySelector('#u-save').onclick=async()=>{const data={idUser:AppState.user.idUser,nama:root.querySelector('#u-nama').value.trim(),role:root.querySelector('#u-role').value,aktif:root.querySelector('#u-aktif').checked};if(!u){data.username=root.querySelector('#u-user').value.trim();data.password=root.querySelector('#u-pass').value;}else data.idUser=u.idUser;await safePost(u?'updateUser':'addUser',data);closeModal();navigasiKe('users');};if(root.querySelector('#u-reset'))root.querySelector('#u-reset').onclick=async()=>{const pass=prompt('Password baru:','12345678');if(pass){await safePost('resetPasswordUser',{idUser:AppState.user.idUser, targetUserId:u.idUser, passwordBaru:pass}).catch(()=>{});toast('Jika backend menolak parameter, gunakan reset dari spreadsheet.','warn');}};});}
  async function toggleGps(u){if(!u||!roleOwner()||!onlineRequired())return;await safePost('toggleGPSUser',{idUser:AppState.user.idUser,targetUserId:u.idUser,wajibGPS:!u.wajibGPS});navigasiKe('users');}

  // ------------------------------------------------------------------
  // PROFIL / SHIFT / PASSWORD
  // ------------------------------------------------------------------
  async function mulaiShiftDev(){
    if(!AppState.user||AppState.user.role==='Owner'){toast('Owner tidak wajib memulai shift.','info');return;}
    if(!onlineRequired())return;
    const submit=async(pos)=>{await safePost('mulaiShift',{idUser:AppState.user.idUser,lat:pos?.coords?.latitude??null,lng:pos?.coords?.longitude??null,modalAwal:0});await segarkanSesiShift();toast('Shift dimulai.','success');navigasiKe('dashboard');};
    if(AppState.user.wajibGPS&&navigator.geolocation){navigator.geolocation.getCurrentPosition(submit,()=>toast('GPS wajib untuk memulai shift. Izinkan lokasi lalu coba lagi.','warn'),{enableHighAccuracy:true,timeout:10000,maximumAge:30000});}else submit(null);
  }
  async function selesaiShiftDev(){if(!onlineRequired())return;await safePost('selesaiShift',{idUser:AppState.user.idUser});await segarkanSesiShift();toast('Shift selesai.','success');navigasiKe('dashboard');}
  async function renderProfilFull(root){const u=AppState.user;root.innerHTML=`<div class="container"><div class="section-title">Profil</div><div class="card"><div style="font-size:18px;font-weight:800;">${esc(u.nama)}</div><div style="color:var(--text-dim);margin-top:3px;">${esc(u.username)} • ${esc(u.role)}</div><div style="margin-top:10px;">${u.wajibGPS?'GPS wajib untuk shift':'GPS tidak wajib'}</div></div>${u.role!=='Owner'?`<div class="card"><b>Shift</b><div style="margin-top:5px;">${u.shiftAktif&&u.shiftAktif.status==='Aktif'?'Aktif':'Tidak aktif'}</div><button class="btn btn-primary" id="pf-shift" style="margin-top:10px;">${u.shiftAktif&&u.shiftAktif.status==='Aktif'?'Selesai Shift':'Mulai Shift'}</button></div>`:''}<div class="card"><b>Keamanan</b><button class="btn btn-outline" id="pf-pass" style="margin-top:10px;">Ganti Password</button><button class="btn btn-danger" id="pf-logout" style="margin-top:8px;">Keluar</button></div></div>`;if(u.role!=='Owner')root.querySelector('#pf-shift').onclick=u.shiftAktif&&u.shiftAktif.status==='Aktif'?selesaiShiftDev:mulaiShiftDev;root.querySelector('#pf-pass').onclick=changePassword;root.querySelector('#pf-logout').onclick=()=>logout();}
  async function changePassword(){if(!onlineRequired())return;modal('Ganti Password',`${formField('oldp','Password Lama','','password')}${formField('newp','Password Baru','','password')}<div class="btn-row"><button class="btn btn-secondary" data-dev-close>Batal</button><button class="btn btn-primary" id="pass-save">Simpan</button></div>`,root=>{root.querySelector('#pass-save').onclick=async()=>{const a=root.querySelector('#oldp').value,b=root.querySelector('#newp').value;if(b.length<6){toast('Password baru minimal 6 karakter.','warn');return;}await safePost('gantiPassword',{idUser:AppState.user.idUser,passwordLama:a,passwordBaru:b});closeModal();toast('Password berhasil diganti.','success');};});}

  // ------------------------------------------------------------------
  // OFFLINE CART PERSISTENCE
  // ------------------------------------------------------------------
  const CART_KEY = 'anafarma_dev_cart_v18_1';
  function cartSave(){try{localStorage.setItem(CART_KEY,JSON.stringify({savedAt:Date.now(),user:AppState.user?.idUser||'',cart:AppState.cart||[],customer:AppState.cartCustomer||null}));}catch(e){console.warn('[DEV CART SAVE]',e);}}
  function cartRestore(){try{const x=JSON.parse(localStorage.getItem(CART_KEY)||'null');if(!x||x.user!==AppState.user?.idUser||Date.now()-Number(x.savedAt||0)>24*60*60*1000)return false;AppState.cart=Array.isArray(x.cart)?x.cart:[];AppState.cartCustomer=x.customer||null;renderKasirCartStatus();return AppState.cart.length>0;}catch(e){return false;}}
  function cartClear(){try{localStorage.removeItem(CART_KEY);}catch(e){}}

  function wrapGlobal(name, after) {
    const original = window[name];
    if (typeof original !== 'function' || original.__devWrapped) return;
    const wrapped = function(){const r=original.apply(this,arguments);try{after.apply(this,[r].concat([].slice.call(arguments)));}catch(e){console.warn('[DEV WRAP]',name,e);}return r;};
    wrapped.__devWrapped=true;wrapped.__devOriginal=original;window[name]=wrapped;
  }

  function installCartPersistence(){
    wrapGlobal('tambahKeKeranjang',()=>cartSave());
    wrapGlobal('ubahQtyKeranjang',()=>cartSave());
    wrapGlobal('kosongkanKeranjang',()=>cartClear());
    const original=window.prosesCheckout;
    if(typeof original==='function'&&!original.__devWrapped){const wrapped=async function(){const r=await original.apply(this,arguments);if(r&&r.offlinePending)cartSave();else cartClear();return r;};wrapped.__devWrapped=true;wrapped.__devOriginal=original;window.prosesCheckout=wrapped;}
    wrapGlobal('masukKeAplikasi',async()=>{setTimeout(cartRestore,0);});
  }

  // ------------------------------------------------------------------
  // INSTALL RENDERERS
  // ------------------------------------------------------------------
  function install(){
    SCREEN_RENDERERS.dashboard = renderDashboardFull;
    SCREEN_RENDERERS.stok = renderStokFull;
    SCREEN_RENDERERS.riwayat = renderRiwayatFull;
    SCREEN_RENDERERS.pembelian = renderPembelianFull;
    SCREEN_RENDERERS.retur = renderReturFull;
    SCREEN_RENDERERS.pelanggan = renderPelangganFull;
    SCREEN_RENDERERS.supplier = renderSupplierFull;
    SCREEN_RENDERERS.laporan = renderLaporanFull;
    SCREEN_RENDERERS.opname = renderOpnameFull;
    SCREEN_RENDERERS.pengaturan = renderPengaturanFull;
    SCREEN_RENDERERS.users = renderUsersFull;
    SCREEN_RENDERERS.profil = renderProfilFull;
    installCartPersistence();
    window.AnaFarmaDevFeatures = {
      version: VERSION,
      refreshProducts: getProdukFresh,
      loadLocations: loadLokasi,
      closeModal,
      clearCartPersistence: cartClear,
      restoreCart: cartRestore
    };
    console.info('[DEV FEATURES] installed', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', readyInstall, { once: true });
  } else {
    readyInstall();
  }
})();
