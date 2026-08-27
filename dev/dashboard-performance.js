/*
 * APOTEK ANA FARMA — DEV DASHBOARD PERFORMANCE V18.8
 *
 * Dashboard-only optimization. Other feature renderers remain owned by
 * features-runtime.js. The dashboard paints immediately from IndexedDB
 * cache when available, then refreshes server data asynchronously.
 */
(function () {
  'use strict';

  const VERSION = '2026-08-27-DEV-DASHBOARD-PERF-18-8';
  const CACHE_AGE = 5 * 60 * 1000;
  const INSTALLED = '__ANA_FARMA_DASHBOARD_PERF__';

  function user() { return window.AppState?.user || null; }
  function owner() { return String(user()?.role || '').trim().toLowerCase() === 'owner'; }
  function money(v) { return typeof window.formatRupiah === 'function' ? window.formatRupiah(v) : `Rp ${Number(v || 0).toLocaleString('id-ID')}`; }
  function esc(v) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? ''); }
  function nav(name) { if (typeof window.navigasiKe === 'function') window.navigasiKe(name); else if (typeof window.setScreen === 'function') window.setScreen(name); }

  async function loadShift() {
    const u = user();
    if (!u || owner() || typeof window.apiGet !== 'function') return null;
    try {
      const data = await window.apiGet('getShiftStatus', { idUser: u.idUser }, { cache: false });
      u.shiftAktif = data || null;
      return data || null;
    } catch (_) { return u.shiftAktif || null; }
  }

  async function changeShift(active) {
    const u = user();
    if (!u || owner() || !window.AppState?.isOnline || typeof window.apiPost !== 'function') {
      if (typeof window.toast === 'function') window.toast('Shift membutuhkan koneksi internet.', 'warn');
      return;
    }
    const submit = async (position) => {
      if (active) {
        await window.apiPost('selesaiShift', { idUser: u.idUser }, { allowOffline: false });
      } else {
        await window.apiPost('mulaiShift', { idUser: u.idUser, lat: position?.coords?.latitude ?? null, lng: position?.coords?.longitude ?? null, modalAwal: 0 }, { allowOffline: false });
      }
      await loadShift();
      if (typeof window.toast === 'function') window.toast(active ? 'Shift selesai.' : 'Shift dimulai.', 'success');
      render(document.querySelector('[data-screen="dashboard"]'));
    };
    try {
      if (!active && u.wajibGPS && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => submit(pos).catch(window.tampilkanError), () => window.toast?.('GPS wajib untuk memulai shift. Izinkan lokasi lalu coba lagi.', 'warn'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
      } else await submit(null);
    } catch (error) { if (typeof window.tampilkanError === 'function') window.tampilkanError(error); }
  }

  function render(root) {
    const u = user();
    if (!root || !u) return;
    const primary = owner() ? 'stok' : 'kasir';
    const primaryLabel = owner() ? 'Kelola Stok' : 'Transaksi Baru';
    const primaryIcon = owner() ? '📦' : '🧾';
    root.innerHTML = `
      <div class="container">
        <div class="card" style="background:linear-gradient(135deg,#ffffff,#eef9f6);">
          <div style="font-size:19px;font-weight:900;">Selamat datang, ${esc(u.nama || u.username)}</div>
          <div style="color:var(--text-dim);margin-top:4px;">${esc(u.role)} • <span data-dash-online>${window.AppState?.isOnline ? 'ONLINE' : 'OFFLINE'}</span></div>
        </div>
        ${!owner() ? '<div class="card"><div style="font-weight:800;">Shift</div><div id="dash-shift-status" style="margin-top:5px;color:var(--text-dim);">Memuat status shift…</div><button class="btn btn-primary btn-sm" id="dash-shift" style="margin-top:10px;">Memuat…</button></div>' : ''}
        <div class="section-title">Ringkasan Hari Ini</div>
        <div class="grid-2">
          <div class="stat-card good"><div class="stat-label">Omzet Hari Ini</div><div class="stat-value" data-dash="omzet">—</div></div>
          <div class="stat-card"><div class="stat-label">Transaksi</div><div class="stat-value" data-dash="transaksi">—</div></div>
          <div class="stat-card warn"><div class="stat-label">Stok Menipis</div><div class="stat-value" data-dash="menipis">—</div></div>
          <div class="stat-card danger"><div class="stat-label">Stok Habis</div><div class="stat-value" data-dash="habis">—</div></div>
        </div>
        <div class="section-title">Akses Utama</div>
        <div class="grid-2">
          <button class="btn btn-primary" data-fast-nav="${primary}">${primaryIcon} ${primaryLabel}</button>
          ${owner() ? '<button class="btn btn-outline" data-fast-nav="kasir">🧾 Transaksi</button>' : ''}
          <button class="btn btn-outline" data-fast-nav="pembelian">🚚 Pembelian</button>
          <button class="btn btn-outline" data-fast-nav="pelanggan">👥 Pelanggan</button>
          <button class="btn btn-outline" data-fast-nav="retur">↩️ Retur</button>
          <button class="btn btn-outline" data-fast-nav="opname">📋 Stok Opname</button>
          ${owner() ? '<button class="btn btn-outline" data-fast-nav="laporan">📊 Laporan</button><button class="btn btn-outline" data-fast-nav="users">👤 Pengguna</button>' : ''}
        </div>
        <div id="dash-alerts"></div>
        <div class="card" style="margin-top:12px;"><div style="font-weight:800;">Sinkronisasi</div><div id="dash-sync" style="font-size:12px;color:var(--text-dim);margin-top:5px;">Memeriksa…</div><button class="btn btn-outline btn-sm" id="dash-sync-btn" style="margin-top:10px;">🔄 Sinkronkan Sekarang</button></div>
        <div id="dash-analysis"></div>
      </div>`;

    root.querySelectorAll('[data-fast-nav]').forEach(btn => btn.onclick = () => nav(btn.dataset.fastNav));
    root.querySelector('#dash-sync-btn')?.addEventListener('click', async () => { if (typeof window.sinkronkanOutbox === 'function') await window.sinkronkanOutbox(); render(root); });

    const applySummary = s => {
      if (!root.isConnected || window.AppState?.currentScreen !== 'dashboard') return;
      s = s || {};
      root.querySelector('[data-dash="omzet"]').textContent = money(s.omzetHariIni ?? s.penjualanHariIni ?? 0);
      root.querySelector('[data-dash="transaksi"]').textContent = Number(s.transaksiHariIni ?? 0);
      root.querySelector('[data-dash="menipis"]').textContent = Number(s.stokMenipis ?? 0);
      root.querySelector('[data-dash="habis"]').textContent = Number(s.stokHabis ?? 0);
      if (!owner() && root.querySelector('#dash-shift')) {
        const shift = s.shift || user()?.shiftAktif || {};
        const active = shift.status === 'Aktif';
        root.querySelector('#dash-shift-status').textContent = active ? `Aktif sejak ${shift.mulai || '-'}` : 'Belum aktif';
        root.querySelector('#dash-shift').textContent = active ? 'Selesai Shift' : 'Mulai Shift';
        root.querySelector('#dash-shift').className = `btn ${active ? 'btn-danger' : 'btn-primary'} btn-sm`;
        root.querySelector('#dash-shift').onclick = () => changeShift(active);
      }
      const alerts = [];
      if (Number(s.kadaluarsaDekat || 0)) alerts.push(`<div class="card" style="border-left:4px solid var(--warning);"><b>⏰ ${Number(s.kadaluarsaDekat)} produk mendekati kadaluarsa</b><div class="li-sub">Periksa Kelola Stok.</div></div>`);
      if (owner() && Number(s.pengajuanPending || 0)) alerts.push(`<div class="card" style="border-left:4px solid var(--info);"><b>📥 ${Number(s.pengajuanPending)} pengajuan menunggu persetujuan</b></div>`);
      root.querySelector('#dash-alerts').innerHTML = alerts.join('');
    };

    const cached = typeof window.bacaCache === 'function' ? window.bacaCache('getDashboardSummary', { idUser: u.idUser }, CACHE_AGE) : Promise.resolve(null);
    Promise.resolve(cached).then(data => { if (data) applySummary(data); }).catch(() => {});
    Promise.resolve(window.jumlahOutbox ? window.jumlahOutbox() : 0).then(count => { const el = root.querySelector('#dash-sync'); if (el) el.textContent = count ? `${count} data menunggu sinkronisasi.` : 'Tidak ada data tertunda.'; }).catch(() => {});

    if (!owner()) loadShift().then(shift => applySummary({ shift })).catch(() => {});
    if (window.AppState?.isOnline && typeof window.apiGet === 'function') {
      setTimeout(() => window.apiGet('getDashboardSummary', { idUser: u.idUser }, { cache: true, maxAge: 60 * 1000 }).then(applySummary).catch(() => {}), 0);
      if (owner()) {
        setTimeout(() => window.apiGet('getAnalisisPenjualan', {}, { cache: true, maxAge: 5 * 60 * 1000 }).then(a => {
          if (!root.isConnected || !a) return;
          root.querySelector('#dash-analysis').innerHTML = `<div class="section-title">Analisis Penjualan</div><div class="grid-2"><div class="stat-card"><div class="stat-label">Minggu ini</div><div class="stat-value">${money(a.omzetMingguIni)}</div><div class="li-sub">${Number(a.persenMingguan || 0).toFixed(1)}% vs minggu lalu</div></div><div class="stat-card"><div class="stat-label">Bulan ini</div><div class="stat-value">${money(a.omzetBulanIni)}</div><div class="li-sub">${Number(a.persenBulanan || 0).toFixed(1)}% vs bulan lalu</div></div></div>`;
        }).catch(() => {}), 0);
      }
    }
  }

  function install() {
    if (window[INSTALLED]) return;
    if (!window.SCREEN_RENDERERS || typeof window.apiGet !== 'function') { setTimeout(install, 50); return; }
    window[INSTALLED] = true;
    window.SCREEN_RENDERERS.dashboard = render;
    window.__ANA_FARMA_DASHBOARD_PERF_VERSION__ = VERSION;
    console.info('[DEV DASHBOARD PERF] installed', VERSION);
  }
  install();
})();
