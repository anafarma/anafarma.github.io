/*
 * =====================================================================
 * INTEGRATION PATCH — app_kasir_integrated_v2.js
 * =====================================================================
 * Fitur dari file pertama diintegrasikan ke app.js tanpa menghapus
 * modul lain pada file kedua:
 * - cache produk 60 menit
 * - pagination kasir 30 item
 * - tombol keranjang sticky + status sinkronisasi
 * - optimistic +/- update
 * - verifikasi stok asynchronous
 * - multi-satuan pada keranjang
 * - checkout dengan verifikasi stok
 * =====================================================================
 */

/**
 * =====================================================================
 * APOTEK ANA FARMA — app.js (Frontend PWA)
 * =====================================================================
 * File ini murni JavaScript vanilla (tanpa framework) supaya ringan
 * di HP kasir & mudah dirawat tanpa proses build apapun.
 *
 * WAJIB DIISI SEBELUM DIPAKAI:
 *   1) API_URL di bawah -> URL Web App hasil Deploy Apps Script Anda.
 * =====================================================================
 */

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
const API_URL = 'https://script.google.com/macros/s/AKfycby6e72NoImYbWFs-O9Okcj1-cAoh0BiOpnWuPOqVau-KTmmQ60tdKF32xtZrn_qhv7O/exec';
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

const STORAGE_KEY = 'anafarma_sesi_v1';
const AUTO_LOGOUT_MS = 20 * 60 * 1000; // 20 menit, bisa ditimpa oleh Pengaturan.auto_logout_menit
const PRODUK_CACHE_MS = 60 * 60 * 1000; // 1 hour (was 30s) — integrated optimization
const APOTEK_POS_VERSION = '2026-08-14-POS-FIX-01';

// ---------------------------------------------------------------------
// STATE GLOBAL
// ---------------------------------------------------------------------
const AppState = {
  user: null,              // {idUser, username, nama, role, wajibGPS, shiftAktif}
  pengaturan: {},
  produkCache: [],
  produkCacheAt: 0,
  cart: [],                 // [{kodeObat, namaObat, hargaSatuan, qty, stokTersedia}]
  cartCustomer: null,       // {idPelanggan, nama}
  currentScreen: 'dashboard',
  navHistory: [],
  autoLogoutTimer: null,
  isOnline: navigator.onLine,
  deferredInstallPrompt: null,

  // Added from app_kasir_integrated_v2.js
  kasirCurrentPage: 1,
  kasirCurrentQuery: '',
  stokVerificationPending: false,
  stokVerificationResult: null
};

// ---------------------------------------------------------------------
// LAPISAN API (fetch ke Apps Script)
// ---------------------------------------------------------------------
/**
 * PENTING: request POST dikirim dengan Content-Type: text/plain supaya
 * browser TIDAK melakukan CORS preflight (OPTIONS) yang tidak bisa
 * dijawab oleh Apps Script Web App. Body tetap teks JSON biasa dan
 * diparse manual oleh doPost() di backend.
 */
function uuidKecil() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function apiGet(action, params) {
  if (isApiBelumDikonfigurasi()) throw new Error('KONFIGURASI_BELUM_SELESAI');
  const qs = new URLSearchParams(Object.assign({ action: action }, params || {}));
  let res;
  try {
    res = await fetch(API_URL + '?' + qs.toString(), { method: 'GET' });
  } catch (netErr) {
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet Anda.');
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Terjadi kesalahan di server.');
  return json.data;
}

async function apiPost(action, data) {
  if (isApiBelumDikonfigurasi()) throw new Error('KONFIGURASI_BELUM_SELESAI');
  const payload = { action: action, data: data || {}, requestId: uuidKecil() };
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet Anda.');
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Terjadi kesalahan di server.');
  return json.data;
}

function isApiBelumDikonfigurasi() {
  return !API_URL || API_URL.indexOf('PASTE_URL_WEB_APP') !== -1;
}

// Tambahkan idUser otomatis ke setiap data POST yang butuh sesi
function withIdUser(data) {
  return Object.assign({}, data || {}, { idUser: AppState.user ? AppState.user.idUser : null });
}

// ---------------------------------------------------------------------
// UTILITAS UMUM
// ---------------------------------------------------------------------
function formatRupiah(n) {
  n = Number(n) || 0;
  return 'Rp' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}
function formatTanggal(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTanggalJam(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function tanggalInputHariIni() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function debounce(fn, delay) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.remove(); }, 2800);
}

function tampilkanError(err) {
  const msg = (err && err.message) || String(err);
  if (msg === 'KONFIGURASI_BELUM_SELESAI') {
    toast('Aplikasi belum terhubung ke server. Hubungi Owner untuk konfigurasi.', 'error');
    return;
  }
  toast(msg, 'error');
}

// ---------------------------------------------------------------------
// SISTEM MODAL (pengganti confirm()/prompt() bawaan browser, lebih stabil di HP)
// ---------------------------------------------------------------------
function tutupModal() {
  const root = document.getElementById('modal-root');
  const overlay = root.querySelector('.modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => { root.innerHTML = ''; }, 200);
}

function bukaModal(opts) {
  // opts: { title, bodyHtml, center, onMount }
  const root = document.getElementById('modal-root');
  const centerCls = opts.center ? ' modal-center' : '';
  const overlayCls = opts.center ? ' center-align' : '';
  root.innerHTML = `
    <div class="modal-overlay${overlayCls}">
      <div class="modal-sheet${centerCls}">
        <div class="modal-header">
          <h3>${escapeHtml(opts.title || '')}</h3>
          <button class="modal-close" data-close-modal>✕</button>
        </div>
        <div class="modal-body">${opts.bodyHtml || ''}</div>
      </div>
    </div>`;
  root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', tutupModal));
  root.querySelector('.modal-overlay').addEventListener('click', function (e) {
    if (e.target === this) tutupModal();
  });
  requestAnimationFrame(() => root.querySelector('.modal-overlay').classList.add('show'));
  if (opts.onMount) opts.onMount(root);
}

function konfirmasi(pesan, judul) {
  return new Promise((resolve) => {
    bukaModal({
      title: judul || 'Konfirmasi',
      center: true,
      bodyHtml: `
        <p style="font-size:14px;color:var(--text-dim);margin-bottom:16px;">${escapeHtml(pesan)}</p>
        <div class="btn-row">
          <button class="btn btn-secondary" id="konfirm-batal">Batal</button>
          <button class="btn btn-primary" id="konfirm-ya">Ya, Lanjutkan</button>
        </div>`,
      onMount: (root) => {
        root.querySelector('#konfirm-batal').addEventListener('click', () => { tutupModal(); resolve(false); });
        root.querySelector('#konfirm-ya').addEventListener('click', () => { tutupModal(); resolve(true); });
      }
    });
  });
}

function mintaInputTeks(label, judul) {
  return new Promise((resolve) => {
    bukaModal({
      title: judul || 'Isi Keterangan',
      center: true,
      bodyHtml: `
        <div class="form-group"><label>${escapeHtml(label)}</label><input type="text" id="input-teks-modal"></div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="teks-batal">Batal</button>
          <button class="btn btn-primary" id="teks-lanjut">Simpan</button>
        </div>`,
      onMount: (root) => {
        const inp = root.querySelector('#input-teks-modal');
        inp.focus();
        root.querySelector('#teks-batal').addEventListener('click', () => { tutupModal(); resolve(null); });
        root.querySelector('#teks-lanjut').addEventListener('click', () => { const v = inp.value.trim(); tutupModal(); resolve(v); });
      }
    });
  });
}

// ---------------------------------------------------------------------
// AUTO-LOGOUT KARENA TIDAK AKTIF
// ---------------------------------------------------------------------
function resetAutoLogoutTimer() {
  if (AppState.autoLogoutTimer) clearTimeout(AppState.autoLogoutTimer);
  if (!AppState.user) return;
  const menit = Number(AppState.pengaturan && AppState.pengaturan.auto_logout_menit) || 20;
  AppState.autoLogoutTimer = setTimeout(() => {
    toast('Sesi berakhir karena tidak aktif. Silakan login kembali.', 'warn');
    logout();
  }, menit * 60 * 1000);
}
['click', 'touchstart', 'keydown', 'scroll'].forEach(evt => {
  document.addEventListener(evt, () => resetAutoLogoutTimer(), { passive: true });
});

// ---------------------------------------------------------------------
// AUTENTIKASI
// ---------------------------------------------------------------------
function simpanSesi(user) {
  AppState.user = user;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}
function muatSesi() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) AppState.user = JSON.parse(raw);
  } catch (e) { AppState.user = null; }
}
function hapusSesi() {
  AppState.user = null;
  localStorage.removeItem(STORAGE_KEY);
}

async function login(username, password) {
  const data = await apiPost('login', { username: username, password: password });
  simpanSesi(data);
  return data;
}

async function logout() {
  hapusSesi();
  AppState.cart = [];
  AppState.cartCustomer = null;
  clearTimeout(AppState.autoLogoutTimer);
  document.getElementById('main-shell').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

async function segarkanSesiShift() {
  if (!AppState.user) return;
  try {
    const shift = await apiGet('getShiftStatus', { idUser: AppState.user.idUser });
    AppState.user.shiftAktif = shift && shift.status === 'Aktif' ? shift : null;
    simpanSesi(AppState.user);
  } catch (e) { /* diamkan, tidak kritis */ }
}

// ---------------------------------------------------------------------
// ROUTER SEDERHANA (dengan dukungan tombol back HP)
// ---------------------------------------------------------------------
const SCREENS_OWNER = ['dashboard','kasir','stok','riwayat','pembelian','retur','pelanggan','supplier','laporan','opname','pengaturan','users','profil'];
const SCREENS_PEGAWAI = ['dashboard','kasir','riwayat','pembelian','retur','pelanggan','opname','profil'];

function screensUntukRole() {
  return AppState.user && AppState.user.role === 'Owner' ? SCREENS_OWNER : SCREENS_PEGAWAI;
}

function navigasiKe(screen, pushState) {
  if (!screensUntukRole().includes(screen)) screen = 'dashboard';
  AppState.currentScreen = screen;
  if (pushState !== false) {
    history.pushState({ screen: screen }, '', '#' + screen);
  }
  renderBottomNav();
  renderScreen(screen);
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', (e) => {
  let screen = (e.state && e.state.screen) || 'dashboard';
  if (!AppState.user) return;
  if (!screensUntukRole().includes(screen)) screen = 'dashboard';
  AppState.currentScreen = screen;
  renderBottomNav();
  renderScreen(screen);
});

// ---------------------------------------------------------------------
// BOTTOM NAV
// ---------------------------------------------------------------------
const NAV_ITEMS = {
  dashboard: { icon: '🏠', label: 'Beranda' },
  kasir:     { icon: '🧾', label: 'Transaksi' },
  stok:      { icon: '📦', label: 'Stok' },
  riwayat:   { icon: '🕘', label: 'Riwayat' },
  laporan:   { icon: '📊', label: 'Laporan' },
  pembelian: { icon: '🚚', label: 'Pembelian' },
  retur:     { icon: '↩️', label: 'Retur' },
  opname:    { icon: '📋', label: 'Opname' },
  pelanggan: { icon: '👥', label: 'Pelanggan' },
  profil:    { icon: '⋯',  label: 'Lainnya' }
};
// Menu utama yang tampil di bottom nav.
function navUtamaUntukRole() {
  if (AppState.user && AppState.user.role === 'Owner') {
    return ['dashboard', 'kasir', 'stok', 'laporan', 'profil'];
  }
  // Kasir: 6 menu kerja langsung tampil di bottom nav (bukan disembunyikan di "Lainnya").
  // Akun/Logout tetap bisa diakses lewat ikon profil di topbar.
  return ['kasir', 'riwayat', 'pembelian', 'retur', 'opname', 'pelanggan'];
}

function renderBottomNav() {
  const nav = document.getElementById('bottomnav');
  const items = navUtamaUntukRole();
  nav.innerHTML = items.map(key => {
    const it = NAV_ITEMS[key];
    const activeGroup = key === 'profil'
      ? ['profil','pembelian','retur','pelanggan','supplier','opname','pengaturan','users','riwayat' /*owner riwayat lewat profil?*/].includes(AppState.currentScreen) && !['dashboard','kasir','stok','laporan'].includes(AppState.currentScreen)
      : AppState.currentScreen === key;
    return `<button class="nav-item ${activeGroup ? 'active' : ''}" data-nav="${key}">
      <span class="nav-icon">${it.icon}</span><span>${it.label}</span>
    </button>`;
  }).join('');
  nav.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigasiKe(btn.dataset.nav));
  });
}

// ---------------------------------------------------------------------
// DISPATCH RENDER LAYAR
// ---------------------------------------------------------------------
function renderScreen(screen) {
  const root = document.getElementById('screen-root');
  root.innerHTML = '<div class="container"><div class="empty-state">Memuat...</div></div>';
  const renderer = SCREEN_RENDERERS[screen];
  if (!renderer) { root.innerHTML = '<div class="container"><div class="empty-state">Halaman tidak ditemukan.</div></div>'; return; }
  Promise.resolve(renderer(root)).catch(err => {
    tampilkanError(err);
    root.innerHTML = `<div class="container"><div class="empty-state">
      <div class="empty-icon">⚠️</div>Gagal memuat halaman.<br><span style="font-size:12px;">${escapeHtml(err.message || String(err))}</span>
      <div style="margin-top:14px;"><button class="btn btn-outline btn-sm" onclick="renderScreen('${screen}')">Coba Lagi</button></div>
    </div></div>`;
  });
}
const SCREEN_RENDERERS = {}; // diisi belakangan oleh masing-masing modul layar

// ---------------------------------------------------------------------
// PRODUK: cache ringan supaya kasir tetap responsif walau data terus bertambah
// ---------------------------------------------------------------------
async function ambilProduk(paksaRefresh) {
  const now = Date.now();
  if (!paksaRefresh && AppState.produkCache.length && (now - AppState.produkCacheAt) < PRODUK_CACHE_MS) {
    return AppState.produkCache;
  }
  const data = await apiGet('getProduk', { idUser: AppState.user ? AppState.user.idUser : null });
  AppState.produkCache = data;
  AppState.produkCacheAt = now;
  return data;
}
function invalidasiCacheProduk() { AppState.produkCacheAt = 0; }

// =====================================================================
// LAYAR: DASHBOARD
// =====================================================================
function ambilLokasiGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Perangkat tidak mendukung GPS.')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(new Error('Gagal mengambil lokasi GPS. Pastikan izin lokasi diaktifkan.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function mulaiShiftUI() {
  const btn = document.getElementById('btn-mulai-shift');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengambil lokasi GPS...'; }
  try {
    let lokasi = { lat: null, lng: null };
    if (AppState.user.role !== 'Owner' && AppState.user.wajibGPS) {
      lokasi = await ambilLokasiGPS();
    }
    const modalAwalInput = await mintaModalAwal();
    if (modalAwalInput === null) { renderScreen('dashboard'); return; }
    await apiPost('mulaiShift', withIdUser({ lat: lokasi.lat, lng: lokasi.lng, modalAwal: modalAwalInput }));
    toast('Shift dimulai. Selamat bekerja!', 'success');
    await segarkanSesiShift();
    navigasiKe('dashboard', false);
  } catch (err) {
    tampilkanError(err);
    renderScreen('dashboard');
  }
}

function mintaModalAwal() {
  const u = AppState.user;
  return new Promise((resolve) => {
    bukaModal({
      title: 'Mulai Shift', center: true,
      bodyHtml: `
        <div class="login-error show" style="margin-bottom:12px;background:var(--info-light);color:var(--info);">
          Konfirmasi: Anda login sebagai <b>${escapeHtml(u.nama)}</b> (${escapeHtml(u.username)}). Pastikan ini benar sebelum melanjutkan.
        </div>
        <div class="form-group">
          <label>Modal Awal Kas (opsional)</label>
          <input type="number" id="input-modal-awal" placeholder="0" inputmode="numeric">
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="modal-batal">Batal</button>
          <button class="btn btn-primary" id="modal-lanjut">Ya, Mulai Shift</button>
        </div>`,
      onMount: (root) => {
        root.querySelector('#modal-batal').addEventListener('click', () => { tutupModal(); resolve(null); });
        root.querySelector('#modal-lanjut').addEventListener('click', () => {
          const v = Number(root.querySelector('#input-modal-awal').value || 0);
          tutupModal(); resolve(v);
        });
      }
    });
  });
}

async function selesaiShiftUI() {
  const ok = await konfirmasi('Akhiri shift sekarang? Anda tidak bisa memproses transaksi baru setelah shift berakhir.', 'Selesai Shift');
  if (!ok) return;
  try {
    await apiPost('selesaiShift', withIdUser({}));
    toast('Shift selesai. Terima kasih!', 'success');
    await segarkanSesiShift();
    navigasiKe('dashboard', false);
  } catch (err) { tampilkanError(err); }
}

SCREEN_RENDERERS.dashboard = async function (root) {
  const [ringkasan] = await Promise.all([
    apiGet('getDashboardSummary', { idUser: AppState.user.idUser })
  ]);
  const u = AppState.user;
  const perluShift = u.role !== 'Owner';
  const shiftAktif = u.shiftAktif && u.shiftAktif.status === 'Aktif';

  let gpsCardHtml = '';
  if (perluShift) {
    gpsCardHtml = `
      <div class="gps-status">
        <div class="gps-dot ${shiftAktif ? 'on' : 'off'}"></div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:13.5px;">${shiftAktif ? 'Shift sedang berjalan' : 'Belum memulai shift'}</div>
          <div style="font-size:11.5px;color:var(--text-dim);">${shiftAktif ? 'Mulai: ' + formatTanggalJam(u.shiftAktif.mulai) : (u.wajibGPS ? 'Harus berada di lokasi apotek untuk memulai' : 'Wajib dimulai sebelum bertransaksi')}</div>
        </div>
        ${shiftAktif
          ? '<button class="btn btn-danger btn-sm" id="btn-selesai-shift">Selesai</button>'
          : '<button class="btn btn-primary btn-sm" id="btn-mulai-shift">Mulai</button>'}
      </div>`;
  }

  root.innerHTML = `
    <div class="container">
      ${gpsCardHtml}
      <div class="section-title">Ringkasan Hari Ini</div>
      <div class="grid-2">
        <div class="stat-card good"><div class="stat-label">Omzet Hari Ini</div><div class="stat-value">${formatRupiah(ringkasan.omzetHariIni)}</div></div>
        <div class="stat-card"><div class="stat-label">Transaksi</div><div class="stat-value">${ringkasan.transaksiHariIni}</div></div>
        <div class="stat-card warn"><div class="stat-label">Stok Menipis</div><div class="stat-value">${ringkasan.stokMenipis}</div></div>
        <div class="stat-card danger"><div class="stat-label">Stok Habis</div><div class="stat-value">${ringkasan.stokHabis}</div></div>
      </div>
      ${ringkasan.kadaluarsaDekat > 0 ? `
      <div class="card" style="border-left:4px solid var(--warning);margin-top:12px;">
        <div style="font-weight:700;font-size:13.5px;">⏰ ${ringkasan.kadaluarsaDekat} produk mendekati kadaluarsa</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">Dalam 30 hari ke depan. Cek menu Stok untuk detail.</div>
      </div>` : ''}
      ${u.role === 'Owner' && ringkasan.pengajuanPending > 0 ? `
      <div class="card" id="dash-pengajuan-badge" style="border-left:4px solid var(--info);margin-top:12px;cursor:pointer;">
        <div style="font-weight:700;font-size:13.5px;">📥 ${ringkasan.pengajuanPending} pengajuan barang masuk menunggu persetujuan</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">Dari Kasir. Ketuk untuk tinjau &amp; setujui sekarang.</div>
      </div>` : ''}

      <div class="section-title">Akses Cepat</div>
      <div class="grid-2" id="dash-quick-actions">
        ${u.role === 'Owner' ? `
        <button class="btn btn-primary" data-nav="stok" style="grid-column:span 2;">📦 Kelola Stok</button>
        <button class="btn btn-outline" data-nav="kasir">🧾 Transaksi Baru</button>
        <button class="btn btn-outline" data-nav="pembelian">🚚 Pembelian</button>
        <button class="btn btn-outline" data-nav="supplier">🏭 Supplier</button>
        <button class="btn btn-outline" data-nav="laporan">📊 Laporan</button>
        <button class="btn btn-outline" data-nav="retur">↩️ Retur</button>
        <button class="btn btn-outline" data-nav="pelanggan">👥 Pelanggan</button>` : `
        <button class="btn btn-primary" data-nav="kasir" style="grid-column:span 2;">🧾 Transaksi Baru</button>
        <button class="btn btn-outline" data-nav="opname">📋 Stok Opname</button>
        <button class="btn btn-outline" data-nav="pembelian">🚚 Pembelian</button>
        <button class="btn btn-outline" data-nav="retur">↩️ Retur</button>
        <button class="btn btn-outline" data-nav="pelanggan">👥 Pelanggan</button>`}
      </div>
    </div>`;

  root.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => navigasiKe(b.dataset.nav)));
  const badgePengajuan = document.getElementById('dash-pengajuan-badge');
  if (badgePengajuan) badgePengajuan.addEventListener('click', () => navigasiKe('pembelian'));
  const btnMulai = document.getElementById('btn-mulai-shift');
  if (btnMulai) btnMulai.addEventListener('click', mulaiShiftUI);
  const btnSelesai = document.getElementById('btn-selesai-shift');
  if (btnSelesai) btnSelesai.addEventListener('click', selesaiShiftUI);
};

// =====================================================================
// LAYAR: KASIR (POS)
// =====================================================================
function cekBolehTransaksi() {
  const u = AppState.user;
  if (!u) return 'Sesi pengguna tidak ditemukan. Silakan login kembali.';
  if (u.role !== 'Owner') {
    if (!u.shiftAktif || u.shiftAktif.status !== 'Aktif') {
      return 'Anda belum memulai shift. Mulai shift dari menu Beranda terlebih dahulu.';
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// MULTI-SATUAN PENJUALAN
// ---------------------------------------------------------------------
// Backend saat ini mengirim field master secara langsung:
// Satuan, Harga_Jual, Satuan_Jual_2, Isi_Per_Satuan_2,
// Harga_Jual_2, Aktif_Satuan_2.
// Helper ini juga menerima format satuanJual[] bila suatu saat backend
// mengirim format tersebut. Dengan begitu frontend tetap kompatibel.
function pilihanPenjualanProduk(produk) {
  if (!produk) return [];

  if (Array.isArray(produk.satuanJual) && produk.satuanJual.length) {
    return produk.satuanJual
      .map((s, i) => ({
        key: i === 0 ? 'normal' : 'alternatif_' + i,
        satuan: String(s.satuan || '').trim(),
        harga: Number(s.hargaJual) || 0,
        isi: Math.max(1, Number(s.isi || s.isiPerSatuan || 1) || 1)
      }))
      .filter(s => s.satuan && s.harga > 0);
  }

  const hasil = [];
  const satuanNormal = String(produk.Satuan || 'Pcs').trim() || 'Pcs';
  const hargaNormal = Number(produk.Harga_Jual) || 0;
  if (hargaNormal > 0) {
    hasil.push({
      key: 'normal',
      satuan: satuanNormal,
      harga: hargaNormal,
      isi: 1
    });
  }

  const aktif2 = produk.Aktif_Satuan_2 === true ||
    produk.Aktif_Satuan_2 === 1 ||
    String(produk.Aktif_Satuan_2).toUpperCase() === 'TRUE';
  const satuan2 = String(produk.Satuan_Jual_2 || '').trim();
  const harga2 = Number(produk.Harga_Jual_2) || 0;
  const isi2 = Math.max(1, Number(produk.Isi_Per_Satuan_2) || 1);

  if (aktif2 && satuan2 && harga2 > 0) {
    hasil.push({
      key: 'alternatif',
      satuan: satuan2,
      harga: harga2,
      isi: isi2
    });
  }

  return hasil;
}

function pilihanAktifUntukCart(produk, item) {
  const pilihan = pilihanPenjualanProduk(produk);
  if (!pilihan.length) return null;
  const key = item && item.satuanJual ? item.satuanJual : 'normal';
  return pilihan.find(x => x.key === key) || pilihan[0];
}

function buatItemKeranjang(produk, pilihan, qty) {
  const stok = Number(produk.Stok) || 0;
  const maxQty = Math.floor(stok / pilihan.isi);
  if (maxQty <= 0) return null;

  return {
    kodeObat: produk.Kode_Obat,
    namaObat: produk.Nama_Obat,
    hargaSatuan: Number(pilihan.harga) || 0,
    qty: Math.min(Math.max(1, Number(qty) || 1), maxQty),
    stokTersedia: stok,
    satuanJual: pilihan.key,
    namaSatuan: pilihan.satuan,
    isiPerSatuan: pilihan.isi,
    synced: false
  };
}

// Tambahkan produk dengan satuan penjualan tertentu.
// Satu produk hanya mempunyai satu baris aktif di keranjang; mengganti
// Pcs -> Box akan mengganti satuan dan harga pada item yang sama.
function tambahKeKeranjang(produk, pilihanKey) {
  const blokir = cekBolehTransaksi();
  if (blokir) { toast(blokir, 'warn'); return false; }

  const pilihan = pilihanPenjualanProduk(produk);
  if (!pilihan.length) {
    toast('Produk belum memiliki harga jual yang valid.', 'warn');
    return false;
  }

  const target = pilihan.find(x => x.key === pilihanKey) || pilihan[0];
  const stok = Number(produk.Stok) || 0;
  const maxQty = Math.floor(stok / target.isi);
  if (maxQty <= 0) {
    toast('Stok tidak cukup untuk penjualan per ' + target.satuan + '.', 'warn');
    return false;
  }

  let item = AppState.cart.find(x => x.kodeObat === produk.Kode_Obat);

  if (!item) {
    item = buatItemKeranjang(produk, target, 1);
    if (!item) {
      toast('Stok tidak cukup.', 'warn');
      return false;
    }
    AppState.cart.push(item);
  } else {
    // Jika tombol satuan yang dipilih berbeda, ganti satuan terlebih dahulu.
    if (item.satuanJual !== target.key) {
      const qtyBaru = Math.min(Math.max(1, Number(item.qty) || 1), maxQty);
      item.satuanJual = target.key;
      item.namaSatuan = target.satuan;
      item.isiPerSatuan = target.isi;
      item.hargaSatuan = target.harga;
      item.qty = qtyBaru;
      item.stokTersedia = stok;
      item.synced = false;
    } else {
      if ((item.qty + 1) > maxQty) {
        toast('Stok maksimal ' + maxQty + ' ' + target.satuan + '.', 'warn');
        return false;
      }
      item.qty += 1;
      item.stokTersedia = stok;
      item.synced = false;
    }
  }

  updateKeranjangUIStatus();
  renderCartFab();

  const searchEl = document.getElementById('kasir-search');
  renderKasirList(
    AppState.produkCache,
    searchEl ? searchEl.value : '',
    AppState.kasirCurrentPage || 1
  );

  // Verifikasi tetap asynchronous sehingga tombol + tidak menunggu server.
  setTimeout(() => verifyCartItemAsync(produk.Kode_Obat), 0);
  return true;
}

function ubahQtyKeranjang(kodeObat, delta) {
  const item = AppState.cart.find(x => x.kodeObat === kodeObat);
  if (!item) return;

  const isi = Math.max(1, Number(item.isiPerSatuan) || 1);
  const stok = Number(item.stokTersedia) || 0;
  const maxQty = Math.floor(stok / isi);
  const qtyBaru = Number(item.qty || 0) + Number(delta || 0);

  if (qtyBaru <= 0) {
    AppState.cart = AppState.cart.filter(x => x !== item);
  } else if (qtyBaru > maxQty) {
    item.qty = maxQty;
    toast('Stok maksimal ' + maxQty + ' ' + (item.namaSatuan || 'unit'), 'warn');
  } else {
    item.qty = qtyBaru;
  }

  if (item) item.synced = false;
  updateKeranjangUIStatus();
  renderCartFab();

  const modal = document.getElementById('modal-root');
  if (modal && modal.querySelector('.modal-overlay.show')) renderKeranjangModalBody();

  const searchEl = document.getElementById('kasir-search');
  if (document.getElementById('kasir-list')) {
    renderKasirList(
      AppState.produkCache,
      searchEl ? searchEl.value : '',
      AppState.kasirCurrentPage || 1
    );
  }

  if (qtyBaru > 0) setTimeout(() => verifyCartItemAsync(kodeObat), 0);
}

function totalKeranjang() {
  return AppState.cart.reduce((s, x) => s + Number(x.qty || 0) * Number(x.hargaSatuan || 0), 0);
}

function jumlahItemKeranjang() {
  return AppState.cart.reduce((s, x) => s + Number(x.qty || 0), 0);
}

function renderCartFab() {
  let fab = document.getElementById('cart-fab');
  if (AppState.currentScreen !== 'kasir') {
    if (fab) fab.remove();
    return;
  }
  if (!AppState.cart.length) {
    if (fab) fab.remove();
    return;
  }
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'cart-fab';
    fab.className = 'cart-fab';
    document.getElementById('app').appendChild(fab);
    fab.addEventListener('click', bukaKeranjangModal);
  }
  fab.innerHTML = `<span><span class="cart-count">${jumlahItemKeranjang()}</span>Lihat Keranjang</span><span>${formatRupiah(totalKeranjang())}</span>`;
  updateKeranjangUIStatus();
}

function namaLokasiRakProduk(p) {
  if (!p) return '-';
  const raw = String(p.Lokasi_Rak ?? p.LokasiRak ?? p.Lokasi ?? p.Nama_Lokasi ?? '').trim();
  if (!raw) return '-';
  const list = Array.isArray(AppState.lokasiCache) ? AppState.lokasiCache : [];
  const hit = list.find(x => String(x.ID_Lokasi ?? '') === raw);
  return hit ? String(hit.Nama_Display || hit.ID_Lokasi || raw) : raw;
}

function renderKasirList(produkList, query, page = 1) {
  const listEl = document.getElementById('kasir-list');
  if (!listEl) return;

  const source = Array.isArray(produkList) ? produkList : [];
  const q = String(query || '').toLowerCase().trim();
  const filtered = q
    ? source.filter(p => String(p.Nama_Obat || '').toLowerCase().includes(q))
    : source;

  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(Math.max(1, Number(page) || 1), totalPages);
  AppState.kasirCurrentPage = page;
  AppState.kasirCurrentQuery = query || '';

  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  if (!paged.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div>Produk tidak ditemukan.</div>`;
    updateKeranjangUIStatus();
    return;
  }

  listEl.innerHTML = paged.map(p => {
    const pilihan = pilihanPenjualanProduk(p);
    const item = AppState.cart.find(x => x.kodeObat === p.Kode_Obat);
    const stok = Number(p.Stok) || 0;

    if (!pilihan.length) {
      return `
        <div class="list-item">
          <div class="li-main">
            <div class="li-title">${escapeHtml(p.Nama_Obat)}</div>
            <div class="li-sub">📍 ${escapeHtml(namaLokasiRakProduk(p))} • Stok: ${stok} ${escapeHtml(p.Satuan || '')}</div>
            <div class="form-hint" style="margin-top:5px;color:var(--danger);">Harga jual belum tersedia.</div>
          </div>
        </div>`;
    }

    const activeKey = item ? item.satuanJual : '';
    const pilihanHtml = pilihan.map(s => {
      const maxQty = Math.floor(stok / s.isi);
      const disabled = maxQty <= 0;
      const active = activeKey === s.key;
      return `
        <button type="button"
          class="btn-satuan ${active ? 'active' : ''}"
          data-pilihan-kode="${escapeHtml(p.Kode_Obat)}"
          data-pilihan-satuan="${escapeHtml(s.key)}"
          ${disabled ? 'disabled' : ''}
          title="Stok maksimal ${maxQty} ${escapeHtml(s.satuan)}">
          ${s.key === 'alternatif' ? '📦 ' : ''}${escapeHtml(s.satuan)} ${formatRupiah(s.harga)}
        </button>`;
    }).join('');

    const qtyHtml = item ? `
      <div style="display:flex;align-items:center;gap:8px;margin-top:7px;justify-content:flex-end;">
        <span style="font-size:11.5px;color:var(--text-dim);">${escapeHtml(item.namaSatuan || '')}</span>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus" data-kode-obat="${escapeHtml(p.Kode_Obat)}">−</button>
          <span class="qty-display">${item.qty}</span>
          <button type="button" class="qty-btn qty-plus" data-kode-obat="${escapeHtml(p.Kode_Obat)}">+</button>
        </div>
      </div>` : '';

    return `
      <div class="list-item" data-kode-obat="${escapeHtml(p.Kode_Obat)}">
        <div class="li-main">
          <div class="li-title">${escapeHtml(p.Nama_Obat)}</div>
          <div class="li-sub">📍 ${escapeHtml(namaLokasiRakProduk(p))} • ${formatRupiah((item && item.hargaSatuan) || (pilihan[0] && pilihan[0].harga) || p.Harga_Jual)}</div>
          <div style="font-size:11.5px;color:var(--text-faint);margin-top:2px;">Stok tersedia: ${stok} ${escapeHtml(p.Satuan || '')}</div>
          <div style="margin-top:8px;">
            <div style="font-size:11.5px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">Pilihan penjualan</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${pilihanHtml}</div>
          </div>
        </div>
        <div class="li-right" style="min-width:145px;">
          ${qtyHtml}
        </div>
      </div>`;
  }).join('');

  // EVENT TRANSAKSI — event delegation.
  // Handler dipasang pada container, bukan pada setiap tombol.
  // Ini membuat tombol tetap aktif walaupun daftar dirender ulang setelah
  // klik, pencarian, pergantian halaman, atau perubahan quantity.
  listEl.onclick = function(e) {
    const satuanBtn = e.target.closest('[data-pilihan-kode]');
    if (satuanBtn && listEl.contains(satuanBtn)) {
      e.preventDefault();
      e.stopPropagation();
      if (satuanBtn.disabled) return;

      const kode = satuanBtn.getAttribute('data-pilihan-kode');
      const satuan = satuanBtn.getAttribute('data-pilihan-satuan');
      const produk = source.find(x => String(x.Kode_Obat) === String(kode));
      if (!produk) {
        toast('Data obat tidak ditemukan. Silakan segarkan daftar obat.', 'warn');
        return;
      }
      tambahKeKeranjang(produk, satuan);
      return;
    }

    const qtyBtn = e.target.closest('.qty-btn');
    if (qtyBtn && listEl.contains(qtyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const kode = qtyBtn.getAttribute('data-kode-obat');
      ubahQtyKeranjang(kode, qtyBtn.classList.contains('qty-plus') ? 1 : -1);
    }
  };

  if (totalPages > 1) renderPaginationControls(page, totalPages, query, source);
  updateKeranjangUIStatus();
}

SCREEN_RENDERERS.kasir = async function (root) {
  root.innerHTML = `
    <div class="container">
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" id="kasir-search" placeholder="Cari nama obat...">
      </div>
      <div id="kasir-list"></div>

      <div id="kasir-actions" style="display:none;position:sticky;bottom:calc(64px + var(--safe-bottom));padding:10px 0 8px;background:linear-gradient(to top, var(--bg) 75%, rgba(244,246,247,0));z-index:30;">
        <button class="btn btn-primary btn-block" id="btn-lanjut-keranjang">
          🛒 Lihat Keranjang (<span id="cart-items-count">0</span>) • <span id="cart-total">Rp0</span>
        </button>
        <div style="font-size:11px;color:var(--text-faint);text-align:center;margin-top:5px;">
          <span id="cart-synced-status" style="display:none;">⏳ Verifikasi stok...</span>
          <span id="cart-ready-status" style="display:none;">✅ Siap checkout</span>
        </div>
      </div>
    </div>`;

  const produk = await ambilProduk();
  const searchInput = document.getElementById('kasir-search');
  AppState.kasirCurrentPage = 1;
  AppState.kasirCurrentQuery = '';
  renderKasirList(produk, '', 1);

  searchInput.addEventListener('input', debounce(() => {
    AppState.kasirCurrentQuery = searchInput.value;
    AppState.kasirCurrentPage = 1;
    renderKasirList(AppState.produkCache, searchInput.value, 1);
  }, 150));

  const btnLanjut = document.getElementById('btn-lanjut-keranjang');
  if (btnLanjut) btnLanjut.addEventListener('click', bukaKeranjangModal);

  updateKeranjangUIStatus();
  if (AppState.kasirStatusTimer) clearInterval(AppState.kasirStatusTimer);
  AppState.kasirStatusTimer = setInterval(() => {
    if (AppState.currentScreen === 'kasir') updateKeranjangUIStatus();
  }, 5000);
};

// ---------------- Modal Keranjang & Checkout ----------------
function renderKeranjangModalBody() {
  const body = document.querySelector('#modal-root .modal-body');
  if (!body) return;

  if (!AppState.cart.length) {
    body.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div>Keranjang kosong.</div>`;
    return;
  }

  const cartItemsHtml = AppState.cart.map(it => {
    const produk = AppState.produkCache.find(p => p.Kode_Obat === it.kodeObat);
    const pilihan = produk ? pilihanPenjualanProduk(produk) : [];
    const syncIcon = it.synced ? '✅' : '⏳';

    return `
      <div class="list-item" data-kode-item="${escapeHtml(it.kodeObat)}">
        <div class="li-main">
          <div class="li-title">${escapeHtml(it.namaObat)} <span style="font-size:11px;color:var(--text-faint);">${syncIcon}</span></div>
          <div class="li-sub">
            ${escapeHtml(it.namaSatuan || it.satuanJual || '')} • ${formatRupiah(it.hargaSatuan)} × ${it.qty} = ${formatRupiah(it.qty * it.hargaSatuan)}
          </div>
          ${pilihan.length > 1 ? `
            <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;">
              ${pilihan.map(s => `
                <button type="button" class="btn-satuan ${it.satuanJual === s.key ? 'active' : ''}"
                  data-cart-kode="${escapeHtml(it.kodeObat)}" data-cart-satuan="${escapeHtml(s.key)}">
                  ${s.key === 'alternatif' ? '📦 ' : ''}${escapeHtml(s.satuan)} ${formatRupiah(s.harga)}
                </button>`).join('')}
            </div>` : ''}
        </div>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus-cart" data-kode-item="${escapeHtml(it.kodeObat)}">−</button>
          <span class="qty-display">${it.qty}</span>
          <button type="button" class="qty-btn qty-plus-cart" data-kode-item="${escapeHtml(it.kodeObat)}">+</button>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div id="cart-items">${cartItemsHtml}</div>
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin:14px 0;">
      <span>Total</span><span id="cart-total-display">${formatRupiah(totalKeranjang())}</span>
    </div>
    <button class="btn btn-primary btn-block" id="btn-lanjut-bayar">Lanjut ke Pembayaran</button>`;

  body.querySelectorAll('.qty-plus-cart').forEach(b =>
    b.addEventListener('click', () => ubahQtyKeranjang(b.dataset.kodeItem, 1))
  );
  body.querySelectorAll('.qty-minus-cart').forEach(b =>
    b.addEventListener('click', () => ubahQtyKeranjang(b.dataset.kodeItem, -1))
  );
  body.querySelectorAll('[data-cart-kode]').forEach(b =>
    b.addEventListener('click', () => ubahSatuanKeranjang(b.dataset.cartKode, b.dataset.cartSatuan))
  );
  body.querySelector('#btn-lanjut-bayar').addEventListener('click', bukaCheckoutModal);
}

function bukaKeranjangModal() {
  if (!AppState.cart.length) {
    toast('Keranjang masih kosong.', 'warn');
    return;
  }
  bukaModal({ title: 'Keranjang', bodyHtml: '' });
  renderKeranjangModalBody();
}

async function bukaCheckoutModal() {
  let pelangganOptions = '<option value="">-- Tanpa Pelanggan --</option>';
  try {
    const pelanggan = await apiGet('getPelanggan', { idUser: AppState.user ? AppState.user.idUser : null });
    pelangganOptions += pelanggan.map(p => `<option value="${p.ID_Pelanggan}">${escapeHtml(p.Nama)} (${p.Poin || 0} poin)</option>`).join('');
  } catch (e) { /* opsional */ }

  const total = totalKeranjang();
  bukaModal({
    title: 'Pembayaran',
    bodyHtml: `
      <div class="form-group">
        <label>Pelanggan (opsional)</label>
        <select id="chk-pelanggan">${pelangganOptions}</select>
      </div>
      <div class="form-group">
        <label>Diskon (Rp)</label>
        <input type="number" id="chk-diskon" value="0" inputmode="numeric">
      </div>
      <div class="form-group">
        <label>Metode Pembayaran</label>
        <select id="chk-metode">
          <option>Tunai</option><option>QRIS</option><option>E-Wallet</option>
        </select>
      </div>
      <div class="form-group">
        <label>Jumlah Dibayar</label>
        <input type="number" id="chk-bayar" value="${total}" inputmode="numeric">
      </div>
      <div id="chk-summary" style="background:var(--bg);border-radius:10px;padding:12px;margin:10px 0;font-size:14px;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${formatRupiah(total)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:6px;"><span>Total</span><span id="chk-total-tampil">${formatRupiah(total)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Kembalian</span><span id="chk-kembali-tampil">${formatRupiah(0)}</span></div>
      </div>
      
      <!-- ✅ OPTIMIZATION: Verification status -->
      <div id="chk-verification" style="font-size: 12px; color: var(--text-faint); text-align: center; margin: 10px 0;">
        <span id="chk-verify-status">🔄 Verifying stok...</span>
      </div>
      
      <button class="btn btn-primary" id="btn-proses-bayar">Proses & Simpan Transaksi</button>`,
    onMount: (root) => {
      const diskonEl = root.querySelector('#chk-diskon');
      const bayarEl = root.querySelector('#chk-bayar');
      const btn = root.querySelector('#btn-proses-bayar');
      const verifyStatusEl = root.querySelector('#chk-verify-status');
      
      const update = () => {
        const diskon = Number(diskonEl.value || 0);
        const totalBaru = Math.max(0, total - diskon);
        const bayar = Number(bayarEl.value || 0);
        root.querySelector('#chk-total-tampil').textContent = formatRupiah(totalBaru);
        root.querySelector('#chk-kembali-tampil').textContent = formatRupiah(bayar - totalBaru);
      };
      diskonEl.addEventListener('input', update);
      bayarEl.addEventListener('input', update);
      
      // ✅ OPTIMIZATION: Async stok verification (non-blocking)
      verifikasiStokBeforeCheckout(AppState.cart)
        .then(result => {
          if (result.valid) {
            verifyStatusEl.textContent = '✅ Stok terverifikasi';
            verifyStatusEl.style.color = 'var(--success)';
          } else {
            verifyStatusEl.textContent = '❌ ' + result.error;
            verifyStatusEl.style.color = 'var(--danger)';
            btn.disabled = true;
          }
        })
        .catch(e => {
          verifyStatusEl.textContent = '⚠️ Verify gagal (akan check saat proses)';
          verifyStatusEl.style.color = 'var(--warning)';
        });
      
      root.querySelector('#btn-proses-bayar').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-proses-bayar');
        btn.disabled = true; 
        btn.textContent = 'Memproses...';
        try {
          // ✅ OPTIMIZATION: Batch semua item dalam 1 request
const payloadTransaksi = withIdUser({
  items: AppState.cart.map(it => {
    const isi = Math.max(1, Number(it.isiPerSatuan) || 1);
    const qtyStok = Number(it.qty || 0) * isi;

    // Backend lama menyimpan stok dalam satuan eceran.
    // Karena itu Box/Strip dikonversi ke satuan stok di sini,
    // sedangkan harga dibagi isi agar total penjualan tetap sama.
    return {
      kodeObat: it.kodeObat,
      qty: qtyStok,
      hargaSatuan: Number(it.hargaSatuan || 0) / isi,
      satuanJual: it.satuanJual,
      namaSatuan: it.namaSatuan || ''
    };
  }),
  idPelanggan:
    root.querySelector('#chk-pelanggan').value || '',
  diskon:
    Number(diskonEl.value || 0),
  pajak: 0,
  metodeBayar:
    root.querySelector('#chk-metode').value,
  bayar:
    Number(bayarEl.value || 0)
});

const hasil =
  await apiPost(
    'createTransaksi',
    payloadTransaksi
  );

/*
 * ============================================================
 * OFFLINE
 * ============================================================
 *
 * Transaksi sudah masuk IndexedDB, tetapi BELUM dibuat
 * sebagai transaksi server.
 *
 * Jangan kosongkan keranjang.
 * Jangan tampilkan struk transaksi server.
 */
if (
  hasil &&
  hasil.offlinePending === true
) {

  tutupModal();

  tampilkanError(
    'Internet sedang offline. Transaksi disimpan di perangkat dan akan disinkronkan otomatis ketika internet kembali.'
  );

  btn.disabled = false;
  btn.textContent =
    'Proses & Simpan Transaksi';

  return;
}


/*
 * ============================================================
 * ONLINE / SERVER BERHASIL
 * ============================================================
 *
 * Hanya pada kondisi ini keranjang boleh dikosongkan.
 */
tutupModal();

AppState.cart = [];

invalidasiCacheProduk();
renderCartFab();
updateKeranjangUIStatus();

tampilkanStrukRingkas(hasil);

navigasiKe(
  'kasir',
  false
);

function renderPaginationControls(currentPage, totalPages, query, produkList) {
  const listEl = document.getElementById('kasir-list');
  
  const paginationHtml = `
    <div style="display: flex; justify-content: center; gap: 6px; margin-top: 16px; padding-bottom: 80px; flex-wrap: wrap;">
      ${currentPage > 1 ? `
        <button class="btn btn-outline btn-sm" id="btn-prev-page">← Sebelumnya</button>
      ` : ''}
      <span style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-weight: 600;">
        Halaman ${currentPage} dari ${totalPages}
      </span>
      ${currentPage < totalPages ? `
        <button class="btn btn-outline btn-sm" id="btn-next-page">Selanjutnya →</button>
      ` : ''}
    </div>`;
  
  listEl.innerHTML += paginationHtml;
  
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      renderKasirList(produkList, query, currentPage - 1);
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      renderKasirList(produkList, query, currentPage + 1);
    });
  }
}


function updateKeranjangUIStatus() {
  const kasirActionsEl = document.getElementById('kasir-actions');
  if (!kasirActionsEl) return;
  
  if (AppState.cart.length > 0) {
    kasirActionsEl.style.display = 'block';
    
    // ✅ OPTIMIZATION: Update dari local state (tidak perlu API call)
    document.getElementById('cart-items-count').textContent = jumlahItemKeranjang();
    document.getElementById('cart-total').textContent = formatRupiah(totalKeranjang());
    
    // ✅ Show status indicator
    const unsynced = AppState.cart.filter(it => !it.synced);
    const syncedEl = document.getElementById('cart-synced-status');
    const readyEl = document.getElementById('cart-ready-status');
    
    if (unsynced.length > 0) {
      if (syncedEl) syncedEl.style.display = 'inline';
      if (readyEl) readyEl.style.display = 'none';
    } else {
      if (syncedEl) syncedEl.style.display = 'none';
      if (readyEl) readyEl.style.display = 'inline';
    }
  } else {
    kasirActionsEl.style.display = 'none';
  }
}


async function verifyCartItemAsync(kodeObat) {
  try {
    const result = await apiPost('verifikasiStokFast', withIdUser({ kodeObat: kodeObat }));
    const item = AppState.cart.find(x => x.kodeObat === kodeObat);
    if (!item) return;

    item.synced = true;

    if (result && result.stok !== undefined) {
      item.stokTersedia = Number(result.stok) || 0;
      const isi = Math.max(1, Number(item.isiPerSatuan) || 1);
      const maxQty = Math.floor(item.stokTersedia / isi);
      if (item.qty > maxQty) {
        item.qty = maxQty;
        if (item.qty <= 0) {
          AppState.cart = AppState.cart.filter(x => x !== item);
          toast('Stok ' + item.namaObat + ' sudah tidak mencukupi untuk satuan yang dipilih.', 'warn');
        } else {
          toast('Stok ' + item.namaObat + ' berubah. Maksimal ' + item.qty + ' ' + (item.namaSatuan || 'unit') + '.', 'warn');
        }
      }
    }

    updateKeranjangUIStatus();
    renderCartFab();
    const searchEl = document.getElementById('kasir-search');
    if (document.getElementById('kasir-list')) {
      renderKasirList(AppState.produkCache, searchEl ? searchEl.value : '', AppState.kasirCurrentPage || 1);
    }
  } catch (e) {
    // Verifikasi async gagal tidak menghapus item. Checkout tetap melakukan
    // pemeriksaan final di server.
    console.warn('Async verify failed:', e);
  }
}

function ubahSatuanKeranjang(kodeObat, satuanJual) {
  const item = AppState.cart.find(x => x.kodeObat === kodeObat);
  const produk = AppState.produkCache.find(p => p.Kode_Obat === kodeObat);
  if (!item || !produk) return;

  const pilihan = pilihanPenjualanProduk(produk).find(x => x.key === satuanJual);
  if (!pilihan) {
    toast('Satuan penjualan tidak tersedia.', 'warn');
    return;
  }

  const stok = Number(produk.Stok) || 0;
  const maxQty = Math.floor(stok / pilihan.isi);
  if (maxQty <= 0) {
    toast('Stok tidak cukup untuk ' + pilihan.satuan + '.', 'warn');
    return;
  }

  item.satuanJual = pilihan.key;
  item.namaSatuan = pilihan.satuan;
  item.isiPerSatuan = pilihan.isi;
  item.hargaSatuan = pilihan.harga;
  item.stokTersedia = stok;
  item.qty = Math.min(Math.max(1, Number(item.qty) || 1), maxQty);
  item.synced = false;

  renderKeranjangModalBody();
  renderCartFab();
  updateKeranjangUIStatus();
  setTimeout(() => verifyCartItemAsync(kodeObat), 0);

  const searchEl = document.getElementById('kasir-search');
  if (document.getElementById('kasir-list')) {
    renderKasirList(AppState.produkCache, searchEl ? searchEl.value : '', AppState.kasirCurrentPage || 1);
  }
}

async function verifikasiStokBeforeCheckout(cart) {
  try {
    const result = await apiPost('verifikasiStokFast', withIdUser({
      items: cart.map(it => ({
        kodeObat: it.kodeObat,
        qty: Number(it.qty || 0) * Math.max(1, Number(it.isiPerSatuan) || 1)
      }))
    }));

    return result && result.valid
      ? result
      : { valid: false, error: (result && result.error) || 'Verifikasi gagal' };
  } catch (e) {
    console.warn('Stok verification error:', e);
    return { valid: null, error: 'Koneksi error, akan diverifikasi saat checkout' };
  }
}

function tampilkanStrukRingkas(hasil) {
  bukaModal({
    title: '✅ Transaksi Berhasil', center: true,
    bodyHtml: `
      <div style="text-align:center;padding:6px 0 14px;">
        <div style="font-size:13px;color:var(--text-dim);">ID Transaksi</div>
        <div style="font-weight:700;margin-bottom:14px;">${hasil.idTransaksi}</div>
        <div style="font-size:26px;font-weight:800;color:var(--primary-dark);">${formatRupiah(hasil.total)}</div>
        <div style="font-size:13px;color:var(--text-dim);margin-top:4px;">Kembalian: ${formatRupiah(hasil.kembali)}</div>
        ${hasil.poinDidapat ? `<div style="font-size:13px;color:var(--success);margin-top:4px;">+${hasil.poinDidapat} poin pelanggan</div>` : ''}
      </div>
      <button class="btn btn-primary" data-close-modal>Selesai</button>`
  });
}

// =====================================================================
// LAYAR: STOK (PRODUK)
// =====================================================================
function renderStokList(produkList, query, filter) {
  const listEl = document.getElementById('stok-list');
  if (!listEl) return;
  const q = (query || '').toLowerCase().trim();
  let filtered = produkList;
  if (q) filtered = filtered.filter(p => p.Nama_Obat.toLowerCase().includes(q));
  if (filter === 'menipis') filtered = filtered.filter(p => Number(p.Stok) <= Number(p.Stok_Minimum));
  if (filter === 'habis') filtered = filtered.filter(p => Number(p.Stok) <= 0);

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div>Tidak ada produk.</div>`;
    return;
  }
  listEl.innerHTML = filtered.slice(0, 150).map(p => {
    const habis = Number(p.Stok) <= 0;
    const menipis = !habis && Number(p.Stok) <= Number(p.Stok_Minimum);
    return `
    <div class="list-item" data-detail="${p.Kode_Obat}">
      <div class="li-main">
        <div class="li-title">${escapeHtml(p.Nama_Obat)}</div>
        <div class="li-sub">${escapeHtml(p.Kategori || '-')} • ${formatRupiah(p.Harga_Jual)}</div>
      </div>
      <div class="li-right">
        <div class="li-value">${p.Stok} ${escapeHtml(p.Satuan || '')}</div>
        ${habis ? '<span class="pill pill-danger">Habis</span>' : (menipis ? '<span class="pill pill-warn">Menipis</span>' : '')}
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => {
    const p = produkList.find(x => x.Kode_Obat === el.dataset.detail);
    if (p) bukaDetailProdukModal(p);
  }));
}

SCREEN_RENDERERS.stok = async function (root) {
  root.innerHTML = `
    <div class="container">
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" id="stok-search" placeholder="Cari nama obat...">
      </div>
      <div class="tab-switch" id="stok-filter">
        <button class="active" data-filter="semua">Semua</button>
        <button data-filter="menipis">Menipis</button>
        <button data-filter="habis">Habis</button>
      </div>
      <button class="btn btn-primary" id="btn-tambah-produk" style="margin-bottom:12px;">+ Tambah Produk Baru</button>
      <div id="stok-list"></div>
    </div>`;
  const produk = await ambilProduk(true);
  let filterAktif = 'semua';
  renderStokList(produk, '', filterAktif);
  const searchInput = document.getElementById('stok-search');
  searchInput.addEventListener('input', debounce(() => renderStokList(AppState.produkCache, searchInput.value, filterAktif), 150));
  document.querySelectorAll('#stok-filter button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#stok-filter button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    filterAktif = b.dataset.filter;
    renderStokList(AppState.produkCache, searchInput.value, filterAktif);
  }));
  document.getElementById('btn-tambah-produk').addEventListener('click', () => bukaFormProdukModal(null));
};

function bukaDetailProdukModal(p) {
  const isOwner = AppState.user.role === 'Owner';
  bukaModal({
    title: p.Nama_Obat,
    bodyHtml: `
      <div class="grid-2" style="margin-bottom:14px;">
        <div class="stat-card"><div class="stat-label">Stok Saat Ini</div><div class="stat-value">${p.Stok} ${escapeHtml(p.Satuan || '')}</div></div>
        <div class="stat-card"><div class="stat-label">Harga Jual</div><div class="stat-value">${formatRupiah(p.Harga_Jual)}</div></div>
      </div>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.8;margin-bottom:14px;">
        <div>Kode: <b>${escapeHtml(p.Kode_Obat)}</b></div>
        <div>Kategori: ${escapeHtml(p.Kategori || '-')}</div>
        <div>Stok Minimum: ${p.Stok_Minimum}</div>
        <div>Harga Beli: ${formatRupiah(p.Harga_Beli)} / ${escapeHtml(p.Satuan || '')}</div>
        ${Number(p.Isi_Per_Satuan_Beli) > 1 ? `<div>Satuan Beli: 1 ${escapeHtml(p.Satuan_Beli || '')} = ${p.Isi_Per_Satuan_Beli} ${escapeHtml(p.Satuan || '')}</div>` : ''}
        <div>Supplier: ${escapeHtml(p.Supplier || '-')}</div>
        <div>Lokasi Rak: ${escapeHtml(p.Lokasi_Rak || '-')}</div>
        <div>Expired: ${p.Expired ? formatTanggal(p.Expired) : '-'}</div>
      </div>
      <div class="btn-row" style="margin-bottom:8px;">
        <button class="btn btn-outline" id="btn-adjust-stok">± Sesuaikan Stok</button>
        <button class="btn btn-outline" id="btn-riwayat-stok">🕘 Riwayat</button>
        <button class="btn btn-secondary" id="btn-edit-produk">✏️ Edit</button>
      </div>`,
    onMount: (root) => {
      root.querySelector('#btn-adjust-stok').addEventListener('click', () => bukaAdjustStokModal(p));
      root.querySelector('#btn-riwayat-stok').addEventListener('click', () => bukaRiwayatStokModal(p));
      root.querySelector('#btn-edit-produk').addEventListener('click', () => bukaFormProdukModal(p));
    }
  });
}

function bukaRiwayatStokModal(p) {
  bukaModal({
    title: 'Riwayat Stok: ' + p.Nama_Obat,
    bodyHtml: `<div class="form-hint" style="margin-bottom:10px;">Stok saat ini: <b>${p.Stok} ${escapeHtml(p.Satuan || '')}</b></div>
      <div id="rs-list"><div class="empty-state">Memuat...</div></div>`,
    onMount: async (root) => {
      try {
        const log = await apiGet('getLogStok', { kodeObat: p.Kode_Obat, limit: 200, idUser: AppState.user ? AppState.user.idUser : null });
        const listEl = root.querySelector('#rs-list');
        if (!log.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🕘</div>Belum ada riwayat untuk obat ini.</div>`; return; }
        listEl.innerHTML = log.map(l => {
          const naik = Number(l.Perubahan) >= 0;
          return `<div class="list-item">
            <div class="li-main">
              <div class="li-title">${escapeHtml(l.Jenis)}</div>
              <div class="li-sub">${formatTanggalJam(l.Tanggal)} • oleh ${escapeHtml(l.Oleh || '-')}</div>
              ${l.Keterangan ? `<div class="li-sub">${escapeHtml(l.Keterangan)}</div>` : ''}
            </div>
            <div class="li-right">
              <div class="li-value" style="color:${naik ? 'var(--success)' : 'var(--danger)'};">${naik ? '+' : ''}${l.Perubahan}</div>
              <div class="li-sub">${l.Qty_Sebelum} → ${l.Qty_Sesudah}</div>
            </div>
          </div>`;
        }).join('');
      } catch (err) {
        root.querySelector('#rs-list').innerHTML = `<div class="empty-state">Gagal memuat riwayat: ${escapeHtml(err.message || String(err))}</div>`;
      }
    }
  });
}

function bukaAdjustStokModal(p) {
  const blokir = cekBolehTransaksi();
  bukaModal({
    title: 'Sesuaikan Stok: ' + p.Nama_Obat, center: true,
    bodyHtml: `
      ${blokir ? `<div class="login-error show" style="margin-bottom:10px;">${escapeHtml(blokir)}</div>` : ''}
      <div class="form-hint" style="margin-bottom:10px;">Stok saat ini: <b>${p.Stok} ${escapeHtml(p.Satuan || '')}</b></div>
      <div class="form-group">
        <label>Jumlah Perubahan (isi minus untuk mengurangi, contoh: -2)</label>
        <input type="number" id="adj-perubahan" placeholder="cth: 10 atau -2" inputmode="numeric">
      </div>
      <div class="form-group">
        <label>Keterangan</label>
        <input type="text" id="adj-ket" placeholder="cth: rusak, hilang, koreksi hitung">
      </div>
      <button class="btn btn-primary" id="btn-simpan-adjust" ${blokir ? 'disabled' : ''}>Simpan Perubahan</button>`,
    onMount: (root) => {
      root.querySelector('#btn-simpan-adjust').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-simpan-adjust');
        const perubahan = Number(root.querySelector('#adj-perubahan').value || 0);
        if (!perubahan) { toast('Isi jumlah perubahan.', 'warn'); return; }
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
          await apiPost('adjustStok', withIdUser({ kodeObat: p.Kode_Obat, perubahan: perubahan, keterangan: root.querySelector('#adj-ket').value }));
          toast('Stok diperbarui.', 'success');
          tutupModal();
          invalidasiCacheProduk();
          renderScreen('stok');
        } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan Perubahan'; }
      });
    }
  });
}

/**
 * =====================================================================
 * APOTEK ANA FARMA — app.js PATCH
 * =====================================================================
 * 
 * FITUR BARU:
 * 1. Multi-Satuan Harga Obat (Satuan_Jual_2, Isi_Per_Satuan_2, Harga_Jual_2, Aktif_Satuan_2)
 * 2. Lokasi Rak Dropdown (dari sheet Lokasi_Rak)
 * 
 * INSTRUKSI PEMASANGAN:
 * 1. Di app.js, cari fungsi: bukaFormProdukModal(p)
 * 2. Ganti SELURUH isi fungsi bukaFormProdukModal (line 960-1027) dengan kode di bawah
 * 3. ATAU, jika tidak yakin, lihat instruksi detailed di PATCH_INSTRUCTION.txt
 * 
 * =====================================================================
 */
 
// =====================================================================
// TAMBAHAN UNTUK SUPPORT LOKASI_RAK DROPDOWN
// =====================================================================
// Cache lokasi_rak untuk performa
const LokasiRakCache = {
  data: [],
  lastFetch: 0,
  cacheDuration: 60000 // 1 menit
};
 
async function ambilLokasiRak() {
  const now = Date.now();
  if (LokasiRakCache.data.length && (now - LokasiRakCache.lastFetch) < LokasiRakCache.cacheDuration) {
    return LokasiRakCache.data;
  }
  try {
    const data = await apiGet('getLokasi', { idUser: AppState.user ? AppState.user.idUser : null });
    LokasiRakCache.data = data || [];
    LokasiRakCache.lastFetch = now;
    return LokasiRakCache.data;
  } catch (e) {
    console.warn('⚠️ Gagal ambil lokasi rak:', e.message);
    return [];
  }
}
 
// =====================================================================
// FUNGSI FORM PRODUK YANG DIPERBARUI (GANTI FUNCTION YANG LAMA)
// =====================================================================
async function bukaFormProdukModal(p) {
  const isEdit = !!p;
  const isOwner = AppState.user.role === 'Owner';
  
  // Ambil daftar lokasi untuk dropdown
  const lokasiList = await ambilLokasiRak();
  const lokasiOptions = lokasiList.map(loc => 
    `<option value="${escapeHtml(loc.ID_Lokasi)}" ${isEdit && p.Lokasi_Rak === loc.ID_Lokasi ? 'selected' : ''}>${escapeHtml(loc.Nama_Display || loc.ID_Lokasi)} (${escapeHtml(loc.Zona || '')})</option>`
  ).join('');
  
  bukaModal({
    title: isEdit ? 'Edit Produk' : 'Tambah Produk',
    bodyHtml: `
      <div class="form-group"><label>Nama Obat</label><input type="text" id="f-nama" value="${isEdit ? escapeHtml(p.Nama_Obat) : ''}" required></div>
      <div class="grid-2">
        <div class="form-group"><label>Kategori</label><input type="text" id="f-kategori" value="${isEdit ? escapeHtml(p.Kategori || '') : 'Umum'}"></div>
        <div class="form-group"><label>Satuan Jual (eceran)</label><input type="text" id="f-satuan" value="${isEdit ? escapeHtml(p.Satuan || '') : 'Pcs'}" placeholder="cth: Kaplet, Botol, Tube"></div>
      </div>
      
      <div class="grid-2">
        <div class="form-group"><label>Satuan Beli (dari supplier)</label><input type="text" id="f-satuanbeli" value="${isEdit ? escapeHtml(p.Satuan_Beli || p.Satuan || '') : 'Pcs'}" placeholder="cth: Box, Dus, Strip"></div>
        <div class="form-group"><label>Isi per Satuan Beli</label><input type="number" id="f-isipersatuanbeli" value="${isEdit ? (p.Isi_Per_Satuan_Beli || 1) : 1}" inputmode="numeric" min="1"></div>
      </div>
      <div class="form-hint" style="margin:-8px 0 12px;">Contoh: kalau 1 Box isi 100 Kaplet dan dijual per Kaplet, isi "Box" di Satuan Beli, "Kaplet" di Satuan Jual, dan "100" di Isi per Satuan Beli. Kalau tidak dipecah (beli & jual sama), isi "1".</div>
      
      ${!isEdit ? `<div class="form-group"><label>Stok Awal (dalam satuan jual/eceran)</label><input type="number" id="f-stok" value="0" inputmode="numeric"></div>` : ''}
      
      <div class="grid-2">
        <div class="form-group"><label>Stok Minimum</label><input type="number" id="f-stokmin" value="${isEdit ? p.Stok_Minimum : 5}" inputmode="numeric"></div>
        <div class="form-group"><label>Harga Beli</label><input type="number" id="f-hargabeli" value="${isEdit ? p.Harga_Beli : 0}" inputmode="numeric"></div>
      </div>
      
      <div class="form-group">
        <label>Harga Jual ${!isOwner ? '(hanya Owner yang bisa mengubah)' : ''}</label>
        <input type="number" id="f-hargajual" value="${isEdit ? p.Harga_Jual : 0}" inputmode="numeric" ${!isOwner ? 'disabled' : ''}>
      </div>
      
      <!-- ===== FITUR BARU: MULTI-SATUAN HARGA ===== -->
      <div style="background:var(--primary-light);padding:12px;border-radius:var(--radius-sm);margin-bottom:14px;">
        <div style="font-weight:700;font-size:13px;color:var(--primary-dark);margin-bottom:12px;">📦 Satuan Jual Alternatif (Opsional)</div>
        <div class="grid-2">
          <div class="form-group">
            <label>Satuan Alternatif (cth: Box)</label>
            <input type="text" id="f-satuan2" value="${isEdit ? escapeHtml(p.Satuan_Jual_2 || '') : ''}" placeholder="Opsional">
          </div>
          <div class="form-group">
            <label>Isi per Satuan (cth: 10)</label>
            <input type="number" id="f-isi2" value="${isEdit ? (p.Isi_Per_Satuan_2 || 1) : 1}" inputmode="numeric" min="1">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>Harga untuk Satuan Alternatif ${!isOwner ? '(hanya Owner)' : ''}</label>
            <input type="number" id="f-harga2" value="${isEdit ? p.Harga_Jual_2 : 0}" inputmode="numeric" ${!isOwner ? 'disabled' : ''}>
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end;">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:0;">
              <input type="checkbox" id="f-aktif2" ${isEdit && p.Aktif_Satuan_2 ? 'checked' : ''} style="width:auto;">
              <span>Aktifkan</span>
            </label>
          </div>
        </div>
        <div class="form-hint">Misal: jual per Pcs Rp10.000, atau per Box (10 pcs) Rp95.000. Kosongkan jika tidak perlu.</div>
      </div>
      
      <div class="grid-2">
        <div class="form-group">
          <label>Supplier</label>
          <input type="text" id="f-supplier" value="${isEdit ? escapeHtml(p.Supplier || '') : ''}">
        </div>
        <div class="form-group">
          <label>Lokasi Rak</label>
          <select id="f-rak">
            <option value="">-- Pilih Lokasi --</option>
            ${lokasiOptions}
          </select>
        </div>
      </div>
      
      <div class="form-group"><label>Tanggal Expired (opsional)</label><input type="date" id="f-expired" value="${isEdit && p.Expired ? new Date(p.Expired).toISOString().slice(0,10) : ''}"></div>
      
      ${isEdit && isOwner ? `<div class="form-group"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="f-aktif" ${p.Aktif ? 'checked' : ''} style="width:auto;"> Produk Aktif (tampil di kasir)</label></div>` : ''}
      
      <button class="btn btn-primary" id="btn-simpan-produk">Simpan</button>`,
    onMount: (root) => {
      root.querySelector('#btn-simpan-produk').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-simpan-produk');
        const nama = root.querySelector('#f-nama').value.trim();
        if (!nama) { toast('Nama obat wajib diisi.', 'warn'); return; }
        
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
          const payload = {
            namaObat: nama, 
            kategori: root.querySelector('#f-kategori').value,
            satuan: root.querySelector('#f-satuan').value, 
            stokMinimum: root.querySelector('#f-stokmin').value,
            hargaBeli: root.querySelector('#f-hargabeli').value, 
            supplier: root.querySelector('#f-supplier').value,
            lokasiRak: root.querySelector('#f-rak').value,
            expired: root.querySelector('#f-expired').value,
            satuanBeli: root.querySelector('#f-satuanbeli').value,
            isiPerSatuanBeli: root.querySelector('#f-isipersatuanbeli').value,
            
            // ===== FIELDS BARU: MULTI-SATUAN =====
            satuanJual2: root.querySelector('#f-satuan2').value || '',
            isiPerSatuan2: root.querySelector('#f-isi2').value || 1,
            hargaJual2: root.querySelector('#f-harga2').value || 0,
            aktifSatuan2: root.querySelector('#f-aktif2').checked ? true : false
          };
          
          if (isOwner) payload.hargaJual = root.querySelector('#f-hargajual').value;
          
          if (isEdit) {
            payload.kodeObat = p.Kode_Obat;
            await apiPost('updateProduk', withIdUser(payload));
            if (isOwner) {
              const aktifEl = root.querySelector('#f-aktif');
              if (aktifEl) await apiPost('nonaktifkanProduk', withIdUser({ kodeObat: p.Kode_Obat, aktif: aktifEl.checked }));
            }
          } else {
            payload.stok = root.querySelector('#f-stok').value;
            await apiPost('addProduk', withIdUser(payload));
          }
          
          toast('Produk disimpan.', 'success');
          tutupModal();
          invalidasiCacheProduk();
          renderScreen('stok');
        } catch (err) { 
          tampilkanError(err); 
          btn.disabled = false; 
          btn.textContent = 'Simpan'; 
        }
      });
    }
  });
}
 
// =====================================================================
// STYLE TAMBAHAN untuk select dropdown (paste di <style> tag HTML)
// =====================================================================
/*
Tambahkan ini di bagian <style> di index.html (setelah line 140):
 
.form-group select {
  width: 100%;
  padding: 11px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  font-size: 15px;
  color: var(--text);
  cursor: pointer;
}
 
.form-group select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
}
 
.form-group select option {
  padding: 8px;
  color: var(--text);
  background: #fff;
}
*/
 

// =====================================================================
// LAYAR: RIWAYAT TRANSAKSI
// =====================================================================
SCREEN_RENDERERS.riwayat = async function (root) {
  const isOwner = AppState.user.role === 'Owner';
  root.innerHTML = `
    <div class="container">
      ${!isOwner ? `<div class="form-hint" style="margin-bottom:10px;">Menampilkan transaksi milik Anda sendiri — berguna untuk mencocokkan uang di laci.</div>` : ''}
      <div class="grid-2" style="margin-bottom:12px;">
        <div class="form-group" style="margin-bottom:0;"><label>Dari</label><input type="date" id="rw-mulai"></div>
        <div class="form-group" style="margin-bottom:0;"><label>Sampai</label><input type="date" id="rw-selesai" value="${tanggalInputHariIni()}"></div>
      </div>
      <div id="rw-list"></div>
    </div>`;
  const mulai = new Date(); mulai.setDate(mulai.getDate() - 7);
  document.getElementById('rw-mulai').value = mulai.toISOString().slice(0, 10);

  async function muat() {
    const listEl = document.getElementById('rw-list');
    listEl.innerHTML = '<div class="empty-state">Memuat...</div>';
    const data = await apiGet('getTransaksi', {
      mulai: document.getElementById('rw-mulai').value,
      selesai: document.getElementById('rw-selesai').value,
      limit: 300,
      idKasir: isOwner ? '' : AppState.user.idUser,
      idUser: AppState.user ? AppState.user.idUser : null
    });
    if (!data.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div>Tidak ada transaksi pada rentang ini.</div>`; return; }
    listEl.innerHTML = data.map(t => `
      <div class="list-item" data-id="${t.ID_Transaksi}">
        <div class="li-main">
          <div class="li-title">${escapeHtml(t.Daftar_Obat || t.ID_Transaksi)}</div>
          <div class="li-sub">${formatTanggalJam(t.Tanggal)}${isOwner ? ' • ' + escapeHtml(t.Nama_Kasir) : ''}</div>
        </div>
        <div class="li-right">
          <div class="li-value">${formatRupiah(t.Total)}</div>
          <span class="pill ${t.Status === 'Dibatalkan' ? 'pill-danger' : 'pill-success'}">${t.Status}</span>
        </div>
      </div>`).join('');
    listEl.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
      const t = data.find(x => x.ID_Transaksi === el.dataset.id);
      bukaDetailTransaksiModal(t);
    }));
  }
  document.getElementById('rw-mulai').addEventListener('change', muat);
  document.getElementById('rw-selesai').addEventListener('change', muat);
  await muat();
};

async function bukaDetailTransaksiModal(t) {
  bukaModal({ title: 'Detail ' + t.ID_Transaksi, bodyHtml: '<div class="empty-state">Memuat...</div>' });
  try {
    const detail = await apiGet('getDetailTransaksi', { idTransaksi: t.ID_Transaksi, idUser: AppState.user ? AppState.user.idUser : null });
    const body = document.querySelector('#modal-root .modal-body');
    const bisaBatal = t.Status !== 'Dibatalkan';
    body.innerHTML = `
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">
        ${formatTanggalJam(t.Tanggal)} • Kasir: ${escapeHtml(t.Nama_Kasir)}<br>
        Pelanggan: ${escapeHtml(t.Nama_Pelanggan || '-')} • ${escapeHtml(t.Metode_Bayar)}
      </div>
      <table class="simple-table">
        <thead><tr><th>Produk</th><th>Qty</th><th>Subtotal</th></tr></thead>
        <tbody>${detail.map(d => `<tr><td>${escapeHtml(d.Nama_Obat)}</td><td>${d.Qty}</td><td>${formatRupiah(d.Subtotal)}</td></tr>`).join('')}</tbody>
      </table>
      <div style="margin-top:10px;font-size:14px;line-height:1.9;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${formatRupiah(t.Subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Diskon</span><span>-${formatRupiah(t.Diskon)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;"><span>Total</span><span>${formatRupiah(t.Total)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Bayar</span><span>${formatRupiah(t.Bayar)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Kembali</span><span>${formatRupiah(t.Kembali)}</span></div>
      </div>
      ${bisaBatal ? `<button class="btn btn-danger" id="btn-batal-transaksi" style="margin-top:14px;">Batalkan Transaksi</button>` : ''}
      <button class="btn btn-secondary" id="btn-mulai-retur" style="margin-top:8px;">↩️ Buat Retur dari Transaksi Ini</button>`;
    const btnBatal = document.getElementById('btn-batal-transaksi');
    if (btnBatal) btnBatal.addEventListener('click', async () => {
      const ok = await konfirmasi('Batalkan transaksi ini? Stok yang terjual akan dikembalikan.', 'Batalkan Transaksi');
      if (!ok) return;
      try {
        await apiPost('batalkanTransaksi', withIdUser({ idTransaksi: t.ID_Transaksi }));
        toast('Transaksi dibatalkan.', 'success');
        tutupModal();
        invalidasiCacheProduk();
        renderScreen('riwayat');
      } catch (err) { tampilkanError(err); }
    });
    document.getElementById('btn-mulai-retur').addEventListener('click', () => {
      tutupModal();
      navigasiKe('retur');
      setTimeout(() => bukaFormReturModal(t, detail), 100);
    });
  } catch (err) { tampilkanError(err); tutupModal(); }
}

// =====================================================================
// LAYAR: PEMBELIAN (DARI SUPPLIER)
// =====================================================================
SCREEN_RENDERERS.pembelian = async function (root) {
  const isOwner = AppState.user.role === 'Owner';

  if (!isOwner) {
    const blokir = cekBolehTransaksi();
    root.innerHTML = `
      <div class="container">
        ${blokir ? `<div class="login-error show" style="margin-bottom:10px;">${escapeHtml(blokir)}</div>` : ''}
        <button class="btn btn-primary" id="btn-ajukan-pembelian" style="margin-bottom:12px;" ${blokir ? 'disabled' : ''}>+ Ajukan Barang Masuk</button>
        <div class="section-title">Riwayat Pengajuan Saya</div>
        <div id="pj-list"><div class="empty-state">Memuat...</div></div>
      </div>`;
    document.getElementById('btn-ajukan-pembelian').addEventListener('click', bukaFormPengajuanModal);
    const data = await apiGet('getPengajuanPembelian', { idUser: AppState.user.idUser });
    const listEl = document.getElementById('pj-list');
    if (!data.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🚚</div>Belum ada pengajuan barang masuk.</div>`; return; }
    const badgeWarna = { 'Menunggu': 'var(--warning)', 'Disetujui': 'var(--success)', 'Ditolak': 'var(--danger)' };
    listEl.innerHTML = data.map(pj => `
      <div class="list-item">
        <div class="li-main">
          <div class="li-title">${escapeHtml(pj.Nama_Obat)}</div>
          <div class="li-sub">${formatTanggal(pj.Tanggal)} • Qty: ${pj.Jumlah} • Faktur: ${escapeHtml(pj.No_Faktur || '-')}</div>
          ${pj.Status === 'Ditolak' && pj.Catatan ? `<div class="li-sub" style="color:var(--danger);">Alasan ditolak: ${escapeHtml(pj.Catatan)}</div>` : ''}
        </div>
        <div class="li-right"><span class="badge" style="background:${badgeWarna[pj.Status] || 'var(--text-dim)'};color:#fff;">${escapeHtml(pj.Status)}</span></div>
      </div>`).join('');
    return;
  }

  // ---- Tampilan Owner ----
  root.innerHTML = `
    <div class="container">
      <div id="pb-pending-section"></div>
      <button class="btn btn-primary" id="btn-tambah-pembelian" style="margin-bottom:12px;">+ Catat Pembelian Langsung</button>
      <div class="section-title">Riwayat Pembelian</div>
      <div id="pb-list"><div class="empty-state">Memuat...</div></div>
    </div>`;
  document.getElementById('btn-tambah-pembelian').addEventListener('click', bukaFormPembelianModal);

  const pending = (await apiGet('getPengajuanPembelian', { idUser: AppState.user.idUser })).filter(p => p.Status === 'Menunggu');
  const pendingEl = document.getElementById('pb-pending-section');
  if (pending.length) {
    pendingEl.innerHTML = `
      <div class="card" style="border:1.5px solid var(--warning);margin-bottom:14px;">
        <b>⏳ Menunggu Persetujuan (${pending.length})</b>
        <div style="margin-top:8px;">${pending.map(pj => `
          <div class="list-item" data-id="${pj.ID_Pengajuan}" style="cursor:pointer;">
            <div class="li-main">
              <div class="li-title">${escapeHtml(pj.Nama_Obat)}</div>
              <div class="li-sub">Diajukan ${escapeHtml(pj.Diajukan_Oleh)} • Qty: ${pj.Jumlah} • Faktur: ${escapeHtml(pj.No_Faktur || '-')}</div>
            </div>
            <div class="li-right">➜</div>
          </div>`).join('')}</div>
      </div>`;
    pendingEl.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        const pj = pending.find(x => x.ID_Pengajuan === el.dataset.id);
        bukaApprovalPengajuanModal(pj);
      });
    });
  } else {
    pendingEl.innerHTML = '';
  }

  const data = await apiGet('getPembelian', { idUser: AppState.user ? AppState.user.idUser : null });
  const listEl = document.getElementById('pb-list');
  if (!data.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🚚</div>Belum ada catatan pembelian.</div>`; return; }
  listEl.innerHTML = data.map(pb => `
    <div class="list-item">
      <div class="li-main">
        <div class="li-title">${escapeHtml(pb.Nama_Obat)}</div>
        <div class="li-sub">${formatTanggal(pb.Tanggal)} • ${escapeHtml(pb.Nama_Supplier || '-')} • Faktur: ${escapeHtml(pb.No_Faktur || '-')}</div>
      </div>
      <div class="li-right"><div class="li-value">+${pb.Qty}${pb.Qty_Satuan_Beli && Number(pb.Qty_Satuan_Beli) !== Number(pb.Qty) ? ' <span style="font-weight:400;font-size:11px;color:var(--text-dim);">(' + pb.Qty_Satuan_Beli + ' beli)</span>' : ''}</div><div class="li-sub">${formatRupiah(pb.Total)}</div></div>
    </div>`).join('');
};

function bukaFormPengajuanModal() {
  bukaModal({
    title: 'Ajukan Barang Masuk',
    bodyHtml: `
      <div class="form-hint" style="margin-bottom:10px;">Isi sesuai faktur dari supplier. Owner akan meninjau &amp; menyetujui sebelum stok bertambah.</div>
      <div class="form-group"><label>Nama Obat</label><input type="text" id="pj-nama" placeholder="Nama obat sesuai faktur"></div>
      <div class="grid-2">
        <div class="form-group"><label>Jumlah (satuan eceran)</label><input type="number" id="pj-jumlah" inputmode="numeric" placeholder="0"></div>
        <div class="form-group"><label>Kategori (kalau produk baru)</label><input type="text" id="pj-jenis" placeholder="cth: Umum, Obat Keras"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>No. Faktur</label><input type="text" id="pj-faktur"></div>
        <div class="form-group"><label>Tanggal Faktur</label><input type="date" id="pj-tglfaktur"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>No. Batch</label><input type="text" id="pj-batch"></div>
        <div class="form-group"><label>Tanggal Expired</label><input type="date" id="pj-expired"></div>
      </div>
      <div class="form-group"><label>Nama Supplier</label><input type="text" id="pj-supplier" placeholder="Nama supplier sesuai faktur"></div>
      <div class="form-group"><label>Kode Barang di Faktur (opsional)</label><input type="text" id="pj-kodesupplier" placeholder="cth: ANDAL02"></div>
      <div class="form-group"><label>Catatan (opsional)</label><input type="text" id="pj-catatan"></div>
      <button class="btn btn-primary" id="btn-simpan-pengajuan">Ajukan ke Owner</button>`,
    onMount: (root) => {
      root.querySelector('#btn-simpan-pengajuan').addEventListener('click', () => kirimPengajuanPembelian(root, false));
    }
  });
}

async function kirimPengajuanPembelian(root, abaikanDuplikat) {
  const nama = root.querySelector('#pj-nama').value.trim();
  const jumlah = Number(root.querySelector('#pj-jumlah').value || 0);
  if (!nama) { toast('Nama obat wajib diisi.', 'warn'); return; }
  if (jumlah <= 0) { toast('Jumlah tidak valid.', 'warn'); return; }
  const btn = root.querySelector('#btn-simpan-pengajuan');
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try {
    await apiPost('addPengajuanPembelian', withIdUser({
      namaObat: nama, jumlah: jumlah, jenis: root.querySelector('#pj-jenis').value,
      noFaktur: root.querySelector('#pj-faktur').value, tanggalFaktur: root.querySelector('#pj-tglfaktur').value,
      noBatch: root.querySelector('#pj-batch').value, expired: root.querySelector('#pj-expired').value,
      namaSupplier: root.querySelector('#pj-supplier').value, kodeSupplier: root.querySelector('#pj-kodesupplier').value,
      catatan: root.querySelector('#pj-catatan').value, abaikanDuplikat: abaikanDuplikat
    }));
    toast('Pengajuan terkirim, menunggu persetujuan Owner.', 'success');
    tutupModal();
    renderScreen('pembelian');
  } catch (err) {
    if (String(err.message || '').indexOf('DUPLIKAT_FAKTUR') === 0 || String(err.message || '').indexOf('DUPLIKAT_FAKTUR') !== -1) {
      const pesanBersih = String(err.message).replace('DUPLIKAT_FAKTUR: ', '');
      const ok = await konfirmasi(pesanBersih, 'Faktur Sudah Pernah Diinput');
      if (ok) { await kirimPengajuanPembelian(root, true); return; }
      btn.disabled = false; btn.textContent = 'Ajukan ke Owner';
    } else {
      tampilkanError(err); btn.disabled = false; btn.textContent = 'Ajukan ke Owner';
    }
  }
}

function bukaApprovalPengajuanModal(pj) {
  bukaModal({
    title: 'Tinjau Pengajuan: ' + pj.Nama_Obat,
    bodyHtml: `
      <div style="font-size:13px;color:var(--text-dim);line-height:1.9;margin-bottom:14px;">
        <div>Diajukan oleh: <b>${escapeHtml(pj.Diajukan_Oleh)}</b> • ${formatTanggalJam(pj.Tanggal)}</div>
        <div>Jumlah: <b>${pj.Jumlah}</b> ${pj.Kode_Obat ? '(produk sudah ada)' : '(produk baru)'}</div>
        <div>No. Faktur: ${escapeHtml(pj.No_Faktur || '-')} ${pj.Tanggal_Faktur ? '(' + formatTanggal(pj.Tanggal_Faktur) + ')' : ''}</div>
        <div>No. Batch: ${escapeHtml(pj.No_Batch || '-')} • Expired: ${pj.Expired ? formatTanggal(pj.Expired) : '-'}</div>
        <div>Supplier: ${escapeHtml(pj.Nama_Supplier || '-')} ${pj.Kode_Supplier ? '(kode: ' + escapeHtml(pj.Kode_Supplier) + ')' : ''}</div>
        ${pj.Catatan ? `<div>Catatan Kasir: ${escapeHtml(pj.Catatan)}</div>` : ''}
      </div>
      <div class="form-hint" style="margin-bottom:8px;">Cocokkan detail di atas dengan foto faktur yang dikirim via WhatsApp sebelum menyetujui.</div>
      <div class="grid-2">
        <div class="form-group"><label>Harga Beli/Satuan</label><input type="number" id="ap-hargabeli" inputmode="numeric" placeholder="0"></div>
        <div class="form-group"><label>Harga Jual</label><input type="number" id="ap-hargajual" inputmode="numeric" placeholder="0"></div>
      </div>
      ${pj.Kode_Obat ? `<div class="form-group"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="ap-updateharga" style="width:auto;"> Perbarui harga jual produk ini juga</label></div>` : ''}
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-danger" id="btn-tolak-pengajuan">Tolak</button>
        <button class="btn btn-primary" id="btn-setujui-pengajuan">Setujui</button>
      </div>`,
    onMount: (root) => {
      root.querySelector('#btn-setujui-pengajuan').addEventListener('click', async () => {
        const hargaJual = Number(root.querySelector('#ap-hargajual').value || 0);
        if (hargaJual <= 0) { toast('Harga jual wajib diisi.', 'warn'); return; }
        const btn = root.querySelector('#btn-setujui-pengajuan');
        btn.disabled = true; btn.textContent = 'Memproses...';
        try {
          await apiPost('setujuiPengajuanPembelian', withIdUser({
            idPengajuan: pj.ID_Pengajuan, kodeObat: pj.Kode_Obat,
            hargaBeliSatuan: root.querySelector('#ap-hargabeli').value, hargaJual: hargaJual,
            perbaruiHargaJual: root.querySelector('#ap-updateharga') ? root.querySelector('#ap-updateharga').checked : true
          }));
          toast('Pengajuan disetujui, stok bertambah.', 'success');
          tutupModal(); invalidasiCacheProduk(); renderScreen('pembelian');
        } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Setujui'; }
      });
      root.querySelector('#btn-tolak-pengajuan').addEventListener('click', async () => {
        const alasan = await mintaInputTeks('Alasan penolakan (akan terlihat oleh Kasir)', 'Tolak Pengajuan');
        if (alasan === null) return;
        try {
          await apiPost('tolakPengajuanPembelian', withIdUser({ idPengajuan: pj.ID_Pengajuan, alasan: alasan }));
          toast('Pengajuan ditolak.', 'success');
          tutupModal(); renderScreen('pembelian');
        } catch (err) { tampilkanError(err); }
      });
    }
  });
}

async function bukaFormPembelianModal() {
  const [produk, supplier] = await Promise.all([ambilProduk(), apiGet('getSupplier', { idUser: AppState.user ? AppState.user.idUser : null })]);
  const optProduk = produk.map(p => `<option value="${p.Kode_Obat}"
      data-satuan-beli="${escapeHtml(p.Satuan_Beli || p.Satuan || 'Pcs')}"
      data-satuan-jual="${escapeHtml(p.Satuan || 'Pcs')}"
      data-isi="${Number(p.Isi_Per_Satuan_Beli) || 1}">${escapeHtml(p.Nama_Obat)} (stok: ${p.Stok} ${escapeHtml(p.Satuan || '')})</option>`).join('');
  const optSupplier = '<option value="">-- Pilih Supplier --</option>'
    + supplier.map(s => `<option value="${s.ID_Supplier}" data-nama="${escapeHtml(s.Nama_Supplier)}">${escapeHtml(s.Nama_Supplier)}</option>`).join('')
    + '<option value="__baru__">+ Tambah Supplier Baru</option>';
  bukaModal({
    title: 'Catat Pembelian',
    bodyHtml: `
      <div class="form-group"><label>Produk</label><select id="pb-produk">${optProduk}</select></div>
      <div class="form-group">
        <label>Supplier</label>
        <select id="pb-supplier">${optSupplier}</select>
        <input type="text" id="pb-supplier-baru" placeholder="Nama supplier baru" style="margin-top:6px;display:none;">
      </div>
      <div class="grid-2">
        <div class="form-group"><label id="pb-qty-label">Qty Masuk</label><input type="number" id="pb-qty" inputmode="numeric" placeholder="0"></div>
        <div class="form-group"><label id="pb-harga-label">Harga Beli/Satuan</label><input type="number" id="pb-harga" inputmode="numeric" placeholder="0"></div>
      </div>
      <div class="form-hint" id="pb-konversi-info" style="margin-top:-8px;margin-bottom:12px;"></div>
      <div class="grid-2">
        <div class="form-group"><label>No. Faktur</label><input type="text" id="pb-faktur"></div>
        <div class="form-group"><label>Tanggal Faktur</label><input type="date" id="pb-tglfaktur"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>No. Batch</label><input type="text" id="pb-batch"></div>
        <div class="form-group"><label>Tanggal Expired</label><input type="date" id="pb-expired"></div>
      </div>
      <div class="form-group"><label>Kode Barang di Faktur (opsional)</label><input type="text" id="pb-kodesupplier" placeholder="cth: ANDAL02"></div>
      <button class="btn btn-primary" id="btn-simpan-pembelian">Simpan Pembelian</button>`,
    onMount: (root) => {
      const produkSel = root.querySelector('#pb-produk');
      const qtyEl = root.querySelector('#pb-qty');
      const hargaLabel = root.querySelector('#pb-harga-label');
      const qtyLabel = root.querySelector('#pb-qty-label');
      const infoEl = root.querySelector('#pb-konversi-info');
      const supSel = root.querySelector('#pb-supplier');
      const supBaruEl = root.querySelector('#pb-supplier-baru');

      function perbaruiLabelSatuan() {
        const opt = produkSel.options[produkSel.selectedIndex];
        if (!opt) return;
        const satuanBeli = opt.dataset.satuanBeli || 'Pcs';
        const satuanJual = opt.dataset.satuanJual || 'Pcs';
        const isi = Number(opt.dataset.isi) || 1;
        qtyLabel.textContent = `Qty Masuk (dalam ${satuanBeli})`;
        hargaLabel.textContent = `Harga Beli per ${satuanBeli}`;
        perbaruiPreview();
      }
      function perbaruiPreview() {
        const opt = produkSel.options[produkSel.selectedIndex];
        if (!opt) return;
        const satuanBeli = opt.dataset.satuanBeli || 'Pcs';
        const satuanJual = opt.dataset.satuanJual || 'Pcs';
        const isi = Number(opt.dataset.isi) || 1;
        const qty = Number(qtyEl.value || 0);
        if (isi > 1) {
          infoEl.textContent = qty > 0
            ? `1 ${satuanBeli} = ${isi} ${satuanJual}. Stok akan bertambah ${qty * isi} ${satuanJual}.`
            : `1 ${satuanBeli} = ${isi} ${satuanJual}.`;
        } else {
          infoEl.textContent = '';
        }
      }
      produkSel.addEventListener('change', perbaruiLabelSatuan);
      qtyEl.addEventListener('input', perbaruiPreview);
      perbaruiLabelSatuan();

      supSel.addEventListener('change', () => {
        supBaruEl.style.display = supSel.value === '__baru__' ? 'block' : 'none';
      });

      root.querySelector('#btn-simpan-pembelian').addEventListener('click', () => simpanPembelianLangsung(root, false));
    }
  });
}

async function simpanPembelianLangsung(root, abaikanDuplikat) {
  const produkSel = root.querySelector('#pb-produk');
  const supSel = root.querySelector('#pb-supplier');
  const supBaruEl = root.querySelector('#pb-supplier-baru');
  const qty = Number(root.querySelector('#pb-qty').value || 0);
  const btn = root.querySelector('#btn-simpan-pembelian');
  if (qty <= 0) { toast('Qty tidak valid.', 'warn'); return; }
  if (supSel.value === '__baru__' && !supBaruEl.value.trim()) { toast('Nama supplier baru wajib diisi.', 'warn'); return; }
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    let idSupplier = supSel.value;
    let namaSupplier = '';
    if (supSel.value === '__baru__') {
      const hasilSupplier = await apiPost('addSupplier', withIdUser({ namaSupplier: supBaruEl.value.trim() }));
      idSupplier = hasilSupplier.idSupplier;
      namaSupplier = supBaruEl.value.trim();
    } else if (supSel.value) {
      namaSupplier = supSel.options[supSel.selectedIndex].dataset.nama;
    }
    await apiPost('addPembelian', withIdUser({
      kodeObat: produkSel.value,
      idSupplier: idSupplier, namaSupplier: namaSupplier,
      qtySatuanBeli: qty, hargaBeliPerSatuanBeli: Number(root.querySelector('#pb-harga').value || 0),
      noFaktur: root.querySelector('#pb-faktur').value, tanggalFaktur: root.querySelector('#pb-tglfaktur').value,
      noBatch: root.querySelector('#pb-batch').value, expired: root.querySelector('#pb-expired').value,
      kodeSupplier: root.querySelector('#pb-kodesupplier').value, abaikanDuplikat: abaikanDuplikat
    }));
    toast('Pembelian dicatat, stok bertambah.', 'success');
    tutupModal();
    invalidasiCacheProduk();
    renderScreen('pembelian');
  } catch (err) {
    if (String(err.message || '').indexOf('DUPLIKAT_FAKTUR') !== -1) {
      const pesanBersih = String(err.message).replace('DUPLIKAT_FAKTUR: ', '');
      const ok = await konfirmasi(pesanBersih, 'Faktur Sudah Pernah Diinput');
      if (ok) { await simpanPembelianLangsung(root, true); return; }
      btn.disabled = false; btn.textContent = 'Simpan Pembelian';
    } else {
      tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan Pembelian';
    }
  }
}

// =====================================================================
// LAYAR: RETUR
// =====================================================================
SCREEN_RENDERERS.retur = async function (root) {
  const blokir = cekBolehTransaksi();
  root.innerHTML = `
    <div class="container">
      ${blokir ? `<div class="login-error show" style="margin-bottom:10px;">${escapeHtml(blokir)}</div>` : ''}
      <button class="btn btn-primary" id="btn-tambah-retur" style="margin-bottom:12px;" ${blokir ? 'disabled' : ''}>+ Buat Retur Baru</button>
      <div id="rt-list"></div>
    </div>`;
  document.getElementById('btn-tambah-retur').addEventListener('click', () => bukaFormReturModal(null, null));
  const data = await apiGet('getRetur', { idUser: AppState.user ? AppState.user.idUser : null });
  const listEl = document.getElementById('rt-list');
  if (!data.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">↩️</div>Belum ada retur.</div>`; return; }
  listEl.innerHTML = data.map(r => `
    <div class="list-item">
      <div class="li-main">
        <div class="li-title">${escapeHtml(r.Nama_Obat)}</div>
        <div class="li-sub">${formatTanggal(r.Tanggal)} • ${escapeHtml(r.Alasan || '-')}</div>
      </div>
      <div class="li-right"><div class="li-value">${r.Qty}</div><span class="pill ${r.Status === 'Kembali ke Stok' ? 'pill-success' : 'pill-gray'}">${r.Status}</span></div>
    </div>`).join('');
};

async function bukaFormReturModal(transaksi, detailTransaksi) {
  const produk = await ambilProduk();
  const optProduk = produk.map(p => `<option value="${p.Kode_Obat}" data-nama="${escapeHtml(p.Nama_Obat)}">${escapeHtml(p.Nama_Obat)}</option>`).join('');
  bukaModal({
    title: 'Buat Retur',
    bodyHtml: `
      ${transaksi ? `<div class="form-hint" style="margin-bottom:10px;">Dari transaksi: <b>${transaksi.ID_Transaksi}</b></div>` : ''}
      <div class="form-group"><label>Produk</label><select id="rt-produk">${optProduk}</select></div>
      <div class="form-group"><label>Qty Retur</label><input type="number" id="rt-qty" inputmode="numeric" placeholder="0"></div>
      <div class="form-group"><label>Alasan</label><input type="text" id="rt-alasan" placeholder="cth: salah beli, rusak, kadaluarsa"></div>
      <div class="form-group"><label>Jumlah Refund (Rp, opsional)</label><input type="number" id="rt-refund" inputmode="numeric" value="0"></div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="rt-kembalikan" style="width:auto;" checked> Kembalikan ke stok (barang masih layak jual)</label>
      </div>
      <button class="btn btn-primary" id="btn-simpan-retur">Simpan Retur</button>`,
    onMount: (root) => {
      const produkSel = root.querySelector('#rt-produk');
      if (transaksi) produkSel.value = ''; // biarkan user pilih manual dari transaksi
      root.querySelector('#btn-simpan-retur').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-simpan-retur');
        const qty = Number(root.querySelector('#rt-qty').value || 0);
        if (qty <= 0) { toast('Qty tidak valid.', 'warn'); return; }
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
          const opt = produkSel.options[produkSel.selectedIndex];
          await apiPost('addRetur', withIdUser({
            idTransaksi: transaksi ? transaksi.ID_Transaksi : '', kodeObat: produkSel.value,
            namaObat: opt.dataset.nama, qty: qty, alasan: root.querySelector('#rt-alasan').value,
            jumlahRefund: Number(root.querySelector('#rt-refund').value || 0),
            kembalikanKeStok: root.querySelector('#rt-kembalikan').checked
          }));
          toast('Retur disimpan.', 'success');
          tutupModal();
          invalidasiCacheProduk();
          renderScreen('retur');
        } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan Retur'; }
      });
    }
  });
}

// =====================================================================
// LAYAR: PELANGGAN
// =====================================================================
SCREEN_RENDERERS.pelanggan = async function (root) {
  root.innerHTML = `
    <div class="container">
      <div class="search-bar"><span>🔍</span><input type="text" id="pl-search" placeholder="Cari nama pelanggan..."></div>
      <button class="btn btn-primary" id="btn-tambah-pelanggan" style="margin-bottom:12px;">+ Tambah Pelanggan</button>
      <div id="pl-list"></div>
    </div>`;
  document.getElementById('btn-tambah-pelanggan').addEventListener('click', () => bukaFormPelangganModal(null));
  const data = await apiGet('getPelanggan', { idUser: AppState.user ? AppState.user.idUser : null });
  function render(q) {
    const qq = (q || '').toLowerCase();
    const filtered = qq ? data.filter(p => p.Nama.toLowerCase().includes(qq)) : data;
    const listEl = document.getElementById('pl-list');
    if (!filtered.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div>Belum ada pelanggan.</div>`; return; }
    listEl.innerHTML = filtered.map(p => `
      <div class="list-item" data-id="${p.ID_Pelanggan}">
        <div class="li-main">
          <div class="li-title">${escapeHtml(p.Nama)}</div>
          <div class="li-sub">${escapeHtml(p.No_HP || '-')} • Total belanja: ${formatRupiah(p.Total_Belanja)}</div>
        </div>
        <div class="li-right"><span class="pill pill-primary">${p.Poin || 0} poin</span></div>
      </div>`).join('');
    listEl.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
      const p = data.find(x => x.ID_Pelanggan === el.dataset.id);
      bukaFormPelangganModal(p);
    }));
  }
  render('');
  document.getElementById('pl-search').addEventListener('input', debounce((e) => render(e.target.value), 150));
};

function bukaFormPelangganModal(p) {
  const isEdit = !!p;
  bukaModal({
    title: isEdit ? 'Edit Pelanggan' : 'Tambah Pelanggan',
    bodyHtml: `
      <div class="form-group"><label>Nama</label><input type="text" id="pf-nama" value="${isEdit ? escapeHtml(p.Nama) : ''}"></div>
      <div class="form-group"><label>No. HP</label><input type="text" id="pf-hp" value="${isEdit ? escapeHtml(p.No_HP || '') : ''}"></div>
      <div class="form-group"><label>Alamat</label><input type="text" id="pf-alamat" value="${isEdit ? escapeHtml(p.Alamat || '') : ''}"></div>
      ${isEdit ? `<div class="form-group"><label>Tukar Poin (kurangi poin, opsional)</label><input type="number" id="pf-tukarpoin" value="0" inputmode="numeric"><div class="form-hint">Poin saat ini: ${p.Poin || 0}</div></div>` : ''}
      <button class="btn btn-primary" id="btn-simpan-pelanggan">Simpan</button>`,
    onMount: (root) => {
      root.querySelector('#btn-simpan-pelanggan').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-simpan-pelanggan');
        const nama = root.querySelector('#pf-nama').value.trim();
        if (!nama) { toast('Nama wajib diisi.', 'warn'); return; }
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
          if (isEdit) {
            await apiPost('updatePelanggan', withIdUser({
              idPelanggan: p.ID_Pelanggan, nama: nama, noHp: root.querySelector('#pf-hp').value,
              alamat: root.querySelector('#pf-alamat').value, tukarPoin: Number(root.querySelector('#pf-tukarpoin').value || 0)
            }));
          } else {
            await apiPost('addPelanggan', withIdUser({ nama: nama, noHp: root.querySelector('#pf-hp').value, alamat: root.querySelector('#pf-alamat').value }));
          }
          toast('Pelanggan disimpan.', 'success');
          tutupModal();
          renderScreen('pelanggan');
        } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan'; }
      });
    }
  });
}

// =====================================================================
// LAYAR: SUPPLIER (OWNER)
// =====================================================================
SCREEN_RENDERERS.supplier = async function (root) {
  root.innerHTML = `
    <div class="container">
      <button class="btn btn-primary" id="btn-tambah-supplier" style="margin-bottom:12px;">+ Tambah Supplier</button>
      <div id="sp-list"></div>
    </div>`;
  document.getElementById('btn-tambah-supplier').addEventListener('click', () => bukaFormSupplierModal(null));
  const data = await apiGet('getSupplier', { idUser: AppState.user ? AppState.user.idUser : null });
  const listEl = document.getElementById('sp-list');
  if (!data.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🚚</div>Belum ada supplier.</div>`; return; }
  listEl.innerHTML = data.map(s => `
    <div class="list-item" data-id="${s.ID_Supplier}">
      <div class="li-main"><div class="li-title">${escapeHtml(s.Nama_Supplier)}</div><div class="li-sub">${escapeHtml(s.Kontak || '-')}</div></div>
      <span class="pill ${s.Aktif ? 'pill-success' : 'pill-gray'}">${s.Aktif ? 'Aktif' : 'Nonaktif'}</span>
    </div>`).join('');
  listEl.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
    const s = data.find(x => x.ID_Supplier === el.dataset.id);
    bukaFormSupplierModal(s);
  }));
};

function bukaFormSupplierModal(s) {
  const isEdit = !!s;
  bukaModal({
    title: isEdit ? 'Edit Supplier' : 'Tambah Supplier',
    bodyHtml: `
      <div class="form-group"><label>Nama Supplier</label><input type="text" id="sf-nama" value="${isEdit ? escapeHtml(s.Nama_Supplier) : ''}"></div>
      <div class="form-group"><label>Kontak</label><input type="text" id="sf-kontak" value="${isEdit ? escapeHtml(s.Kontak || '') : ''}"></div>
      <div class="form-group"><label>Alamat</label><input type="text" id="sf-alamat" value="${isEdit ? escapeHtml(s.Alamat || '') : ''}"></div>
      ${isEdit ? `<div class="form-group"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="sf-aktif" style="width:auto;" ${s.Aktif ? 'checked' : ''}> Aktif</label></div>` : ''}
      <button class="btn btn-primary" id="btn-simpan-supplier">Simpan</button>`,
    onMount: (root) => {
      root.querySelector('#btn-simpan-supplier').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-simpan-supplier');
        const nama = root.querySelector('#sf-nama').value.trim();
        if (!nama) { toast('Nama wajib diisi.', 'warn'); return; }
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
          if (isEdit) {
            await apiPost('updateSupplier', withIdUser({
              idSupplier: s.ID_Supplier, namaSupplier: nama, kontak: root.querySelector('#sf-kontak').value,
              alamat: root.querySelector('#sf-alamat').value, aktif: root.querySelector('#sf-aktif').checked
            }));
          } else {
            await apiPost('addSupplier', withIdUser({ namaSupplier: nama, kontak: root.querySelector('#sf-kontak').value, alamat: root.querySelector('#sf-alamat').value }));
          }
          toast('Supplier disimpan.', 'success');
          tutupModal();
          renderScreen('supplier');
        } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan'; }
      });
    }
  });
}

// =====================================================================
// LAYAR: LAPORAN (OWNER)
// =====================================================================
SCREEN_RENDERERS.laporan = async function (root) {
  root.innerHTML = `
    <div class="container">
      <div class="grid-2" style="margin-bottom:12px;">
        <div class="form-group" style="margin-bottom:0;"><label>Dari</label><input type="date" id="lp-mulai"></div>
        <div class="form-group" style="margin-bottom:0;"><label>Sampai</label><input type="date" id="lp-selesai" value="${tanggalInputHariIni()}"></div>
      </div>
      <div class="tab-switch" id="lp-tab">
        <button class="active" data-tab="penjualan">Penjualan</button>
        <button data-tab="labarugi">Laba/Rugi</button>
        <button data-tab="kadaluarsa">Kadaluarsa</button>
      </div>
      <div id="lp-content"></div>
    </div>`;
  const awalBulan = new Date(); awalBulan.setDate(1);
  document.getElementById('lp-mulai').value = awalBulan.toISOString().slice(0, 10);

  let tabAktif = 'penjualan';
  async function muat() {
    const el = document.getElementById('lp-content');
    el.innerHTML = '<div class="empty-state">Memuat...</div>';
    const mulai = document.getElementById('lp-mulai').value;
    const selesai = document.getElementById('lp-selesai').value;
    try {
      if (tabAktif === 'penjualan') {
        const d = await apiGet('getLaporanPenjualan', { mulai, selesai, idUser: AppState.user ? AppState.user.idUser : null });
        el.innerHTML = `
          <div class="grid-2">
            <div class="stat-card good"><div class="stat-label">Total Omzet</div><div class="stat-value">${formatRupiah(d.totalOmzet)}</div></div>
            <div class="stat-card"><div class="stat-label">Jumlah Transaksi</div><div class="stat-value">${d.totalTransaksi}</div></div>
          </div>
          <div class="card" style="margin-top:12px;">
            <div class="section-title" style="margin-top:0;">Per Metode Pembayaran</div>
            ${Object.keys(d.perMetode).length ? Object.keys(d.perMetode).map(k => `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
                <span>${escapeHtml(k)}</span><span style="font-weight:700;">${formatRupiah(d.perMetode[k])}</span>
              </div>`).join('') : '<div class="empty-state">Belum ada data.</div>'}
          </div>`;
      } else if (tabAktif === 'labarugi') {
        const d = await apiGet('getLaporanLabaRugi', { mulai, selesai, idUser: AppState.user ? AppState.user.idUser : null });
        el.innerHTML = `
          <div class="grid-2">
            <div class="stat-card good"><div class="stat-label">Laba Kotor</div><div class="stat-value">${formatRupiah(d.labaKotor)}</div></div>
            <div class="stat-card"><div class="stat-label">Margin</div><div class="stat-value">${d.margin.toFixed(1)}%</div></div>
          </div>
          <div class="grid-2" style="margin-top:10px;">
            <div class="stat-card"><div class="stat-label">Total Penjualan</div><div class="stat-value" style="font-size:15px;">${formatRupiah(d.totalPenjualan)}</div></div>
            <div class="stat-card"><div class="stat-label">Total Modal</div><div class="stat-value" style="font-size:15px;">${formatRupiah(d.totalModal)}</div></div>
          </div>
          <div class="card" style="margin-top:12px;">
            <div class="section-title" style="margin-top:0;">Produk Terlaris</div>
            ${d.topProduk.length ? d.topProduk.map((p, i) => `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
                <span>${i + 1}. ${escapeHtml(p.nama)}</span><span style="font-weight:700;">${p.qty}</span>
              </div>`).join('') : '<div class="empty-state">Belum ada data.</div>'}
          </div>
          <div class="form-hint" style="margin-top:8px;">Catatan: keakuratan laba bergantung pada kolom Harga Beli tiap produk. Isi/perbarui via menu Stok bila masih 0.</div>`;
      } else {
        const d = await apiGet('getLaporanKadaluarsa', { hari: 90, idUser: AppState.user ? AppState.user.idUser : null });
        el.innerHTML = d.length ? d.map(p => `
          <div class="list-item">
            <div class="li-main"><div class="li-title">${escapeHtml(p.Nama_Obat)}</div><div class="li-sub">Stok: ${p.Stok}</div></div>
            <span class="pill pill-warn">${formatTanggal(p.Expired)}</span>
          </div>`).join('') : `<div class="empty-state"><div class="empty-icon">✅</div>Tidak ada produk mendekati kadaluarsa dalam 90 hari.<br><span style="font-size:11.5px;">Isi tanggal Expired di menu Stok agar laporan ini akurat.</span></div>`;
      }
    } catch (err) { tampilkanError(err); el.innerHTML = '<div class="empty-state">Gagal memuat laporan.</div>'; }
  }

  document.querySelectorAll('#lp-tab button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#lp-tab button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); tabAktif = b.dataset.tab; muat();
  }));
  document.getElementById('lp-mulai').addEventListener('change', muat);
  document.getElementById('lp-selesai').addEventListener('change', muat);
  await muat();
};

// =====================================================================
// LAYAR: STOK OPNAME (HITUNG FISIK BULANAN)
// =====================================================================
SCREEN_RENDERERS.opname = async function (root) {
  const blokir = cekBolehTransaksi();
  root.innerHTML = `
    <div class="container">
      ${blokir ? `<div class="login-error show" style="margin-bottom:10px;">${escapeHtml(blokir)}</div>` : ''}
      <div class="card" style="margin-bottom:12px;">
        <b>Stok Opname (Hitung Fisik)</b>
        <p style="font-size:12.5px;color:var(--text-dim);margin-top:6px;">Masukkan jumlah fisik hasil hitung manual. Hanya baris yang diisi & berbeda dari sistem yang akan disimpan &amp; menyesuaikan stok.</p>
      </div>
      <div class="search-bar"><span>🔍</span><input type="text" id="op-search" placeholder="Cari nama obat..."></div>
      <div id="op-list"></div>
      <button class="btn btn-primary" id="btn-simpan-opname" style="margin-top:14px;" ${blokir ? 'disabled' : ''}>Simpan Hasil Opname</button>
    </div>`;
  const produk = await ambilProduk(true);
  const inputMap = {};

  function render(q) {
    const qq = (q || '').toLowerCase();
    const filtered = qq ? produk.filter(p => p.Nama_Obat.toLowerCase().includes(qq)) : produk;
    const listEl = document.getElementById('op-list');
    listEl.innerHTML = filtered.slice(0, 150).map(p => `
      <div class="list-item">
        <div class="li-main">
          <div class="li-title">${escapeHtml(p.Nama_Obat)}</div>
          <div class="li-sub">Stok sistem: ${p.Stok} ${escapeHtml(p.Satuan || '')}</div>
        </div>
        <input type="number" data-kode="${p.Kode_Obat}" placeholder="fisik" value="${inputMap[p.Kode_Obat] !== undefined ? inputMap[p.Kode_Obat] : ''}"
          style="width:80px;padding:8px;border:1.5px solid var(--border);border-radius:8px;text-align:center;" inputmode="numeric">
      </div>`).join('');
    listEl.querySelectorAll('input[data-kode]').forEach(inp => inp.addEventListener('input', () => {
      inputMap[inp.dataset.kode] = inp.value;
    }));
  }
  render('');
  document.getElementById('op-search').addEventListener('input', debounce((e) => render(e.target.value), 150));

  document.getElementById('btn-simpan-opname').addEventListener('click', async () => {
    const items = Object.keys(inputMap)
      .filter(kode => inputMap[kode] !== '' && inputMap[kode] !== undefined)
      .map(kode => {
        const p = produk.find(x => x.Kode_Obat === kode);
        return { kodeObat: kode, namaObat: p ? p.Nama_Obat : '', stokFisik: Number(inputMap[kode]), keterangan: 'Opname ' + tanggalInputHariIni() };
      });
    if (!items.length) { toast('Belum ada data yang diisi.', 'warn'); return; }
    const ok = await konfirmasi('Simpan hasil opname untuk ' + items.length + ' produk? Stok sistem akan disesuaikan sesuai hasil hitung fisik.', 'Simpan Stok Opname');
    if (!ok) return;
    const btn = document.getElementById('btn-simpan-opname');
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    try {
      const hasil = await apiPost('simpanStokOpname', withIdUser({ items: items }));
      toast('Opname tersimpan (' + hasil.jumlahDiproses + ' penyesuaian).', 'success');
      invalidasiCacheProduk();
      navigasiKe('dashboard');
    } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan Hasil Opname'; }
  });
};

// =====================================================================
// LAYAR: PENGATURAN (OWNER)
// =====================================================================
SCREEN_RENDERERS.pengaturan = async function (root) {
  const p = await apiGet('getPengaturan', {});
  root.innerHTML = `
    <div class="container">
      <div class="section-title" style="margin-top:0;">Profil Apotek</div>
      <div class="form-group"><label>Nama Apotek</label><input type="text" id="pg-nama" value="${escapeHtml(p.nama_apotek || '')}"></div>
      <div class="form-group"><label>Alamat</label><input type="text" id="pg-alamat" value="${escapeHtml(p.alamat_apotek || '')}"></div>
      <div class="form-group"><label>Telepon/WhatsApp</label><input type="text" id="pg-telp" value="${escapeHtml(p.telepon_apotek || '')}"></div>

      <div class="section-title">Lokasi GPS Apotek (untuk validasi shift)</div>
      <div class="grid-2">
        <div class="form-group"><label>Latitude</label><input type="text" id="pg-lat" value="${escapeHtml(p.gps_lat || '')}"></div>
        <div class="form-group"><label>Longitude</label><input type="text" id="pg-lng" value="${escapeHtml(p.gps_lng || '')}"></div>
      </div>
      <div class="form-group"><label>Radius Maksimal (meter)</label><input type="number" id="pg-radius" value="${escapeHtml(p.gps_radius || '150')}"></div>
      <button class="btn btn-outline btn-sm" id="btn-pakai-lokasi-sekarang" style="margin-bottom:12px;">📍 Gunakan Lokasi HP Saat Ini</button>

      <div class="section-title">Transaksi &amp; Loyalitas</div>
      <div class="form-group"><label>Pajak Default (%)</label><input type="number" id="pg-pajak" value="${escapeHtml(p.pajak_persen || '0')}"></div>
      <div class="form-group"><label>Poin per Rupiah (cth 0.0001 = 1 poin/Rp10.000)</label><input type="text" id="pg-poin" value="${escapeHtml(p.poin_per_rupiah || '0')}"></div>
      <div class="form-group"><label>Auto-Logout (menit tidak aktif)</label><input type="number" id="pg-logout" value="${escapeHtml(p.auto_logout_menit || '20')}"></div>

      <button class="btn btn-primary" id="btn-simpan-pengaturan" style="margin-top:6px;">Simpan Pengaturan</button>
    </div>`;

  document.getElementById('btn-pakai-lokasi-sekarang').addEventListener('click', async () => {
    try {
      const lokasi = await ambilLokasiGPS();
      document.getElementById('pg-lat').value = lokasi.lat;
      document.getElementById('pg-lng').value = lokasi.lng;
      toast('Lokasi saat ini diterapkan. Jangan lupa Simpan.', 'success');
    } catch (err) { tampilkanError(err); }
  });

  document.getElementById('btn-simpan-pengaturan').addEventListener('click', async () => {
    const btn = document.getElementById('btn-simpan-pengaturan');
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    try {
      await apiPost('updatePengaturan', withIdUser({
        kv: {
          nama_apotek: document.getElementById('pg-nama').value,
          alamat_apotek: document.getElementById('pg-alamat').value,
          telepon_apotek: document.getElementById('pg-telp').value,
          gps_lat: document.getElementById('pg-lat').value,
          gps_lng: document.getElementById('pg-lng').value,
          gps_radius: document.getElementById('pg-radius').value,
          pajak_persen: document.getElementById('pg-pajak').value,
          poin_per_rupiah: document.getElementById('pg-poin').value,
          auto_logout_menit: document.getElementById('pg-logout').value
        }
      }));
      AppState.pengaturan = await apiGet('getPengaturan', {});
      document.getElementById('topbar-title').textContent = AppState.pengaturan.nama_apotek || 'APOTEK ANA FARMA';
      toast('Pengaturan disimpan.', 'success');
    } catch (err) { tampilkanError(err); }
    btn.disabled = false; btn.textContent = 'Simpan Pengaturan';
  });
};

// =====================================================================
// LAYAR: MANAJEMEN USER (OWNER)
// =====================================================================
SCREEN_RENDERERS.users = async function (root) {
  root.innerHTML = `
    <div class="container">
      <button class="btn btn-primary" id="btn-tambah-user" style="margin-bottom:12px;">+ Tambah User</button>
      <div id="us-list"></div>
    </div>`;
  document.getElementById('btn-tambah-user').addEventListener('click', () => bukaFormUserModal(null));
  const data = await apiGet('getUsers', { idUser: AppState.user ? AppState.user.idUser : null });
  const listEl = document.getElementById('us-list');
  listEl.innerHTML = data.map(u => `
    <div class="list-item" data-id="${u.idUser}">
      <div class="li-main">
        <div class="li-title">${escapeHtml(u.nama)} <span style="color:var(--text-faint);font-weight:400;">@${escapeHtml(u.username)}</span></div>
        <div class="li-sub">${u.role}${u.role !== 'Owner' ? (u.wajibGPS ? ' • GPS Wajib' : ' • GPS Nonaktif (mode antar)') : ''}</div>
      </div>
      <span class="pill ${u.aktif ? 'pill-success' : 'pill-gray'}">${u.aktif ? 'Aktif' : 'Nonaktif'}</span>
    </div>`).join('');
  listEl.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
    const u = data.find(x => x.idUser === el.dataset.id);
    bukaFormUserModal(u);
  }));
};

function bukaFormUserModal(u) {
  const isEdit = !!u;
  bukaModal({
    title: isEdit ? 'Edit User' : 'Tambah User',
    bodyHtml: `
      ${!isEdit ? `<div class="form-group"><label>Username</label><input type="text" id="uf-username"></div>
      <div class="form-group"><label>Password Awal</label><input type="text" id="uf-password" value="12345678"></div>` : ''}
      <div class="form-group"><label>Nama Lengkap</label><input type="text" id="uf-nama" value="${isEdit ? escapeHtml(u.nama) : ''}"></div>
      <div class="form-group"><label>Role</label>
        <select id="uf-role" ${isEdit && u.role === 'Owner' ? 'disabled' : ''}>
          <option value="Pegawai" ${isEdit && u.role === 'Pegawai' ? 'selected' : ''}>Pegawai</option>
          <option value="Owner" ${isEdit && u.role === 'Owner' ? 'selected' : ''}>Owner</option>
        </select>
      </div>
      ${isEdit && u.role !== 'Owner' ? `
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="uf-gps" style="width:auto;" ${u.wajibGPS ? 'checked' : ''}> Wajib GPS saat mulai shift</label>
        <div class="form-hint">Nonaktifkan hanya untuk kasir yang sedang bertugas mengantar/di luar apotek.</div>
      </div>` : ''}
      ${isEdit ? `<div class="form-group"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="uf-aktif" style="width:auto;" ${u.aktif ? 'checked' : ''}> Akun Aktif</label></div>` : ''}
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-simpan-user">Simpan</button>
      </div>
      ${isEdit ? `<button class="btn btn-outline" id="btn-reset-password" style="margin-top:8px;">Reset Password</button>` : ''}`,
    onMount: (root) => {
      root.querySelector('#btn-simpan-user').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-simpan-user');
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
          if (isEdit) {
            await apiPost('updateUser', withIdUser({ idUser: u.idUser, nama: root.querySelector('#uf-nama').value, role: root.querySelector('#uf-role').value, aktif: root.querySelector('#uf-aktif').checked }));
            const gpsEl = root.querySelector('#uf-gps');
            if (gpsEl) await apiPost('toggleGPSUser', withIdUser({ idUser: u.idUser, wajibGPS: gpsEl.checked }));
          } else {
            const username = root.querySelector('#uf-username').value.trim();
            if (!username) { toast('Username wajib diisi.', 'warn'); btn.disabled = false; btn.textContent = 'Simpan'; return; }
            await apiPost('addUser', withIdUser({ username: username, password: root.querySelector('#uf-password').value, nama: root.querySelector('#uf-nama').value, role: root.querySelector('#uf-role').value }));
          }
          toast('User disimpan.', 'success');
          tutupModal();
          renderScreen('users');
        } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan'; }
      });
      const btnReset = root.querySelector('#btn-reset-password');
      if (btnReset) btnReset.addEventListener('click', async () => {
        const ok = await konfirmasi('Reset password ' + u.nama + ' ke default (12345678)?', 'Reset Password');
        if (!ok) return;
        try {
          await apiPost('resetPasswordUser', withIdUser({ idUser: u.idUser, passwordBaru: '12345678' }));
          toast('Password direset ke 12345678.', 'success');
        } catch (err) { tampilkanError(err); }
      });
    }
  });
}

// =====================================================================
// LAYAR: PROFIL / LAINNYA (hub menu sekunder + akun)
// =====================================================================
SCREEN_RENDERERS.profil = async function (root) {
  const u = AppState.user;
  const isOwner = u.role === 'Owner';
  const menuSekunder = isOwner
    ? [
        { key: 'riwayat', icon: '🕘', label: 'Riwayat Transaksi' },
        { key: 'pembelian', icon: '🚚', label: 'Pembelian' },
        { key: 'retur', icon: '↩️', label: 'Retur' },
        { key: 'pelanggan', icon: '👥', label: 'Pelanggan' },
        { key: 'supplier', icon: '🏭', label: 'Supplier' },
        { key: 'opname', icon: '📋', label: 'Stok Opname' },
        { key: 'users', icon: '🔐', label: 'Manajemen User' },
        { key: 'pengaturan', icon: '⚙️', label: 'Pengaturan Apotek' }
      ]
    : [];

  root.innerHTML = `
    <div class="container">
      <div class="card" style="display:flex;align-items:center;gap:12px;">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--primary-light);color:var(--primary-dark);
          display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex-shrink:0;">${escapeHtml((u.nama || '?').charAt(0).toUpperCase())}</div>
        <div style="min-width:0;">
          <div style="font-weight:800;font-size:15.5px;">${escapeHtml(u.nama)}</div>
          <div style="font-size:12.5px;color:var(--text-dim);">@${escapeHtml(u.username)} • ${u.role}</div>
        </div>
      </div>

      ${menuSekunder.length ? `<div class="section-title">Menu</div><div id="profil-menu"></div>` : ''}

      <div class="section-title">Akun</div>
      ${u.role === 'Owner' ? `<button class="btn btn-outline" id="btn-ganti-password" style="margin-bottom:10px;">🔑 Ganti Password</button>` : ''}
      <button class="btn btn-outline" id="btn-install-app" style="margin-bottom:10px;display:none;">⬇️ Pasang Aplikasi ke HP</button>
      <button class="btn btn-danger" id="btn-logout">Keluar</button>

      <div style="text-align:center;font-size:11px;color:var(--text-faint);margin-top:22px;">Apotek Ana Farma • v2026.07</div>
    </div>`;

  if (menuSekunder.length) {
    document.getElementById('profil-menu').innerHTML = menuSekunder.map(m => `
      <div class="list-item" data-nav="${m.key}" style="cursor:pointer;">
        <div class="li-main" style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:19px;">${m.icon}</span><span class="li-title" style="font-size:14px;">${m.label}</span>
        </div>
        <span style="color:var(--text-faint);">›</span>
      </div>`).join('');
    document.querySelectorAll('#profil-menu [data-nav]').forEach(el => el.addEventListener('click', () => navigasiKe(el.dataset.nav)));
  }

  const btnGantiPassword = document.getElementById('btn-ganti-password');
  if (btnGantiPassword) btnGantiPassword.addEventListener('click', bukaGantiPasswordModal);
  document.getElementById('btn-logout').addEventListener('click', async () => {
    const ok = await konfirmasi('Keluar dari akun ini?', 'Keluar');
    if (ok) logout();
  });

  if (AppState.deferredInstallPrompt) {
    const btnInstall = document.getElementById('btn-install-app');
    btnInstall.style.display = 'flex';
    btnInstall.addEventListener('click', async () => {
      AppState.deferredInstallPrompt.prompt();
      await AppState.deferredInstallPrompt.userChoice;
      AppState.deferredInstallPrompt = null;
      btnInstall.style.display = 'none';
    });
  }
};

function bukaGantiPasswordModal() {
  bukaModal({
    title: 'Ganti Password', center: true,
    bodyHtml: `
      <div class="form-group"><label>Password Lama</label><input type="password" id="gp-lama"></div>
      <div class="form-group"><label>Password Baru (min. 6 karakter)</label><input type="password" id="gp-baru"></div>
      <button class="btn btn-primary" id="btn-simpan-password">Simpan</button>`,
    onMount: (root) => {
      root.querySelector('#btn-simpan-password').addEventListener('click', async () => {
        const btn = root.querySelector('#btn-simpan-password');
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
          await apiPost('gantiPassword', { idUser: AppState.user.idUser, passwordLama: root.querySelector('#gp-lama').value, passwordBaru: root.querySelector('#gp-baru').value });
          toast('Password berhasil diubah.', 'success');
          tutupModal();
        } catch (err) { tampilkanError(err); btn.disabled = false; btn.textContent = 'Simpan'; }
      });
    }
  });
}

// =====================================================================
// INISIALISASI APLIKASI
// =====================================================================
function pasangLogoKeUI() {
  // Logo di splash & login pakai logo lengkap (dengan teks) supaya jelas terbaca;
  // logo di topbar pakai lambang saja (LOGO_EMBLEM_B64) supaya pas di ruang sempit.
  const splashImg = document.getElementById('splash-logo-img');
  const loginImg = document.getElementById('login-logo-img');
  const topbarImg = document.getElementById('topbar-logo-img');
  if (typeof LOGO_EMBLEM_B64 !== 'undefined') {
    if (splashImg) splashImg.src = LOGO_EMBLEM_B64;
    if (topbarImg) topbarImg.src = LOGO_EMBLEM_B64;
  }
  if (typeof LOGO_FULL_B64 !== 'undefined' && loginImg) loginImg.src = LOGO_FULL_B64;
}

function sembunyikanSplash() {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 550);
  }
}

function pasangBannerOffline() {
  const banner = document.getElementById('offline-banner');
  function update() {
    AppState.isOnline = navigator.onLine;
    banner.classList.toggle('show', !AppState.isOnline);
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

async function masukKeAplikasi(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-shell').classList.remove('hidden');
  document.getElementById('topbar-user').textContent = user.nama + ' • ' + user.role;
  try {
    AppState.pengaturan = await apiGet('getPengaturan', {});
    document.getElementById('topbar-title').textContent = AppState.pengaturan.nama_apotek || 'APOTEK ANA FARMA';
  } catch (e) {
    AppState.pengaturan = AppState.pengaturan || {};
  }
  const brandEl = document.querySelector('.topbar .brand-text');
  if (brandEl) {
    brandEl.style.cursor = 'pointer';
    brandEl.addEventListener('click', () => navigasiKe('dashboard'));
  }
  resetAutoLogoutTimer();
  renderBottomNav();
  navigasiKe('dashboard', true);
}

function pasangFormLogin() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-submit');
    const errEl = document.getElementById('login-error');
    errEl.classList.remove('show');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) return;
    btn.disabled = true; btn.textContent = 'Memproses...';
    try {
      const user = await login(username, password);
      await masukKeAplikasi(user);
    } catch (err) {
      const msg = err.message === 'KONFIGURASI_BELUM_SELESAI'
        ? 'Aplikasi belum terhubung ke server (API_URL belum diisi di app.js).'
        : err.message;
      errEl.textContent = msg;
      errEl.classList.add('show');
    }
    btn.disabled = false; btn.textContent = 'Masuk';
  });
}

function pasangInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.deferredInstallPrompt = e;
  });
}

function pasangServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
}

async function initAplikasi() {
  pasangLogoKeUI();
  pasangBannerOffline();
  pasangFormLogin();
  pasangInstallPrompt();
  pasangServiceWorker();
  document.getElementById('btn-profil').addEventListener('click', () => {
    if (AppState.user) navigasiKe('profil');
  });

  muatSesi();

  if (isApiBelumDikonfigurasi()) {
    sembunyikanSplash();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-error').textContent = 'Aplikasi belum dikonfigurasi. Owner perlu mengisi API_URL di file app.js sesuai URL Web App Apps Script.';
    document.getElementById('login-error').classList.add('show');
    return;
  }

  if (AppState.user) {
    try {
      // Validasi sesi masih berlaku dengan menyegarkan status shift & pengaturan
      await segarkanSesiShift();
      await masukKeAplikasi(AppState.user);
    } catch (err) {
      hapusSesi();
      document.getElementById('login-screen').classList.remove('hidden');
    }
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
  }
  sembunyikanSplash();

  // Segarkan cache produk & tombol keranjang berkala saat layar Kasir terbuka
  setInterval(() => {
    if (AppState.currentScreen === 'kasir' && AppState.user) {
      ambilProduk(true).then(list => {
        const searchEl = document.getElementById('kasir-search');
        if (searchEl) renderKasirList(list, searchEl.value);
      }).catch(() => {});
    }
  }, PRODUK_CACHE_MS);
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest &&
    e.target.closest('#kasir-list [data-pilihan-kode]');

  if (!btn) return;
  if (btn.disabled) return;
  if (btn.dataset.txHandled === '1') return;

  btn.dataset.txHandled = '1';

  const kode = btn.getAttribute('data-pilihan-kode');
  const satuan = btn.getAttribute('data-pilihan-satuan');

  const produk = AppState.produkCache.find(
    x => String(x.Kode_Obat) === String(kode)
  );

  if (produk) {
    e.preventDefault();
    e.stopPropagation();

    tambahKeKeranjang(produk, satuan);
  }

  setTimeout(() => {
    try {
      delete btn.dataset.txHandled;
    } catch (_) {}
  }, 0);
}, true);
