/*
 * =====================================================================
 * APOTEK ANA FARMA — app.js
 * ARSITEKTUR ONLINE–OFFLINE
 * =====================================================================
 * V18.2 — renderer contract fix.
 *
 * Prinsip:
 * 1. Server Apps Script = sumber kebenaran data.
 * 2. GET: server -> cache IndexedDB -> UI.
 * 3. POST/mutasi saat offline -> Outbox IndexedDB -> sinkron otomatis.
 * 4. Setiap mutasi mempunyai requestId yang sama saat retry.
 * 5. Tidak ada window.apiPost. API tetap berupa apiGet()/apiPost().
 * 6. Satu router, satu init, satu event delegation.
 * 7. Screen renderer menerima root element. Renderer lama yang tidak
 *    memakai parameter tetap kompatibel karena JavaScript mengabaikan argumen.
 * =====================================================================
 */

// =====================================================================
// 01. KONFIGURASI
// =====================================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxcAPMcgyu7eNyEISUvIJHs0grSIFJCJ_DOnM2wX_b2gWfWUn9VSUi4sF81X9ndz5JU/exec';
const API_DEPLOYMENT_ID = 'AKfycbxcAPMcgyu7eNyEISUvIJHs0grSIFJCJ_DOnM2wX_b2gWfWUn9VSUi4sF81X9ndz5JU';
const APP_VERSION = '2026-08-27-DEV-OFFLINE-V18-2';
const STORAGE_KEY = 'anafarma_sesi_v2';
const DB_NAME = 'anafarma_offline_v2';
const DB_VERSION = 1;
const PRODUK_CACHE_MS = 60 * 60 * 1000;
const DEFAULT_AUTO_LOGOUT_MIN = 20;
const MAX_SYNC_RETRY = 8;
const OFFLINE_MUTATIONS = new Set(['createTransaksi']);

// =====================================================================
// 02. STATE
// =====================================================================
const AppState = {
  user: null,
  pengaturan: {},
  currentScreen: 'dashboard',
  produkCache: [],
  produkCacheAt: 0,
  cart: [],
  cartCustomer: null,
  isOnline: navigator.onLine,
  syncRunning: false,
  syncTimer: null,
  autoLogoutTimer: null,
  deferredInstallPrompt: null,
  dbReady: false
};

// =====================================================================
// 03. UTILITAS
// =====================================================================
function uuidKecil() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function sekarangISO() { return new Date().toISOString(); }
function formatRupiah(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
}
function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}
function totalKeranjang() {
  return AppState.cart.reduce((sum, item) => sum + (Number(item.hargaSatuan) || 0) * (Number(item.qty) || 0), 0);
}
function jumlahItemKeranjang() {
  return AppState.cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}
function withIdUser(data = {}) { return { ...data, idUser: AppState.user ? AppState.user.idUser : null }; }
function errorMessage(error) { return error ? (error.message || String(error)) : 'Terjadi kesalahan.'; }
function makeApiError(message, kind = 'unknown', extra = {}) { const error = new Error(String(message || 'Terjadi kesalahan.')); error.kind = kind; Object.assign(error, extra); return error; }
function isRetryableTransportError(error) {
  if (!error) return false;
  if (error.kind === 'network' || error.kind === 'response-parse') return true;
  if (error.kind === 'http') { const status = Number(error.httpStatus || 0); return status === 408 || status === 425 || status === 429 || status >= 500; }
  return false;
}
function isApiBelumDikonfigurasi() { return !API_URL || API_URL.includes('PASTE_URL_WEB_APP'); }
function isNetworkError(error) {
  const message = errorMessage(error).toLowerCase();
  return !navigator.onLine || message.includes('network') || message.includes('failed to fetch') || message.includes('tidak bisa terhubung') || message.includes('offline') || message.includes('server http 503') || message.includes('server http 502') || message.includes('server http 504') || message.includes('server http 500');
}

// =====================================================================
// 04. TOAST / ERROR UI
// =====================================================================
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) { console[type === 'error' ? 'error' : 'log'](message); return; }
  const el = document.createElement('div'); el.className = `toast toast-${type}`; el.textContent = message; container.appendChild(el); setTimeout(() => el.remove(), 3500);
}
function tampilkanError(error) { console.error('[Ana Farma]', error); toast(errorMessage(error), 'error'); }

// =====================================================================
// 05. INDEXEDDB
// =====================================================================
let dbPromise = null;
function bukaDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Browser tidak mendukung IndexedDB.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('outbox')) {
        const store = db.createObjectStore('outbox', { keyPath: 'requestId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    request.onsuccess = () => { AppState.dbReady = true; resolve(request.result); };
  });
  return dbPromise;
}
async function dbGet(storeName, key) {
  const db = await bukaDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readonly'); const request = tx.objectStore(storeName).get(key); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
}
async function dbPut(storeName, value) {
  const db = await bukaDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(value); tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); });
}
async function dbDelete(storeName, key) {
  const db = await bukaDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
async function dbGetAll(storeName) {
  const db = await bukaDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readonly'); const request = tx.objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
}

// =====================================================================
// 06. CACHE DATA
// =====================================================================
function cacheKey(action, params = {}) { return `${action}:${JSON.stringify(params)}`; }
async function simpanCache(action, params, data) { try { await dbPut('cache', { key: cacheKey(action, params), action, params, data, savedAt: Date.now() }); } catch (error) { console.warn('[CACHE PUT]', error); } }
async function bacaCache(action, params, maxAge = Infinity) { try { const item = await dbGet('cache', cacheKey(action, params)); if (!item) return null; if (Date.now() - item.savedAt > maxAge) return null; return item.data; } catch (error) { console.warn('[CACHE GET]', error); return null; } }

// =====================================================================
// 07. OUTBOX OFFLINE
// =====================================================================
async function masukkanOutbox(action, data, requestId) {
  const existing = await dbGet('outbox', requestId);
  const item = existing ? { ...existing, action, data, updatedAt: Date.now(), status: existing.status === 'failed' || existing.status === 'done' ? 'pending' : existing.status } : { requestId, action, data, createdAt: Date.now(), updatedAt: Date.now(), retryCount: 0, status: 'pending', lastError: '' };
  await dbPut('outbox', item); updateOfflineUI(); return item;
}
async function ambilOutbox() { const items = await dbGetAll('outbox'); return items.sort((a, b) => Number(a.createdAt) - Number(b.createdAt)); }
async function jumlahOutbox() { const items = await ambilOutbox(); return items.filter(item => ['pending','retry','syncing','failed'].includes(item.status)).length; }

// =====================================================================
// 08. API ONLINE
// =====================================================================
async function requestGetOnline(action, params) {
  if (isApiBelumDikonfigurasi()) throw new Error('KONFIGURASI_BELUM_SELESAI');
  const query = new URLSearchParams({ action, ...(params || {}) });
  let response;
  try { response = await fetch(`${API_URL}?${query.toString()}`, { method: 'GET', cache: 'no-store' }); }
  catch (error) { throw makeApiError('Tidak bisa terhubung ke server. Periksa koneksi internet.', 'network', { cause: error }); }
  if (!response.ok) throw makeApiError(`Server HTTP ${response.status}.`, 'http', { httpStatus: response.status });
  let json; try { json = await response.json(); } catch (error) { throw makeApiError('Respons server bukan JSON yang valid.', 'response-parse', { cause: error }); }
  if (!json.ok) throw makeApiError(json.error || 'Server menolak permintaan.', 'server', { serverResponse: json });
  return json.data;
}
async function requestPostOnline(action, data, requestId) {
  if (isApiBelumDikonfigurasi()) throw makeApiError('KONFIGURASI_BELUM_SELESAI', 'config');
  const payload = { action, data: data || {}, requestId: requestId || uuidKecil() };
  let response;
  try { response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }); }
  catch (error) { throw makeApiError('Tidak bisa terhubung ke server. Periksa koneksi internet.', 'network', { cause: error }); }
  if (!response.ok) throw makeApiError('Server HTTP ' + response.status + '.', 'http', { httpStatus: response.status });
  let json; try { json = await response.json(); } catch (error) { throw makeApiError('Respons server bukan JSON yang valid.', 'response-parse', { cause: error }); }
  if (!json.ok) throw makeApiError(json.error || 'Server menolak permintaan.', 'server', { serverResponse: json, requestId: json.requestId || requestId || null });
  return json.data;
}
async function apiGet(action, params = {}, options = {}) {
  const allowCache = options.cache !== false; const cacheAge = Number(options.maxAge || PRODUK_CACHE_MS);
  if (!AppState.isOnline) { const cached = await bacaCache(action, params, Infinity); if (cached !== null) return cached; throw new Error('OFFLINE_DATA_TIDAK_TERSEDIA: Data belum pernah disimpan di perangkat.'); }
  try { const data = await requestGetOnline(action, params); if (allowCache) await simpanCache(action, params, data); return data; }
  catch (error) { if (isNetworkError(error) && allowCache) { const cached = await bacaCache(action, params, cacheAge); if (cached !== null) { toast('Server tidak tersedia. Menampilkan data terakhir.', 'warn'); return cached; } } throw error; }
}
async function apiPost(action, data = {}, options = {}) {
  const requestId = options.requestId || uuidKecil(); const bolehOffline = options.allowOffline === true || OFFLINE_MUTATIONS.has(action);
  if (!AppState.isOnline) { if (!bolehOffline) throw new Error('Fitur ini membutuhkan koneksi internet.'); await masukkanOutbox(action, data, requestId); return { queued: true, requestId }; }
  try { return await requestPostOnline(action, data, requestId); }
  catch (error) { if (bolehOffline && isRetryableTransportError(error)) { await masukkanOutbox(action, data, requestId); return { queued: true, requestId }; } throw error; }
}

// =====================================================================
// 10. SYNC ENGINE
// =====================================================================
function retryDelay(retryCount) { return Math.min(60000, 1000 * Math.pow(2, Math.max(0, Number(retryCount) || 0))); }
async function tandaiOutbox(requestId, patch) { const current = await dbGet('outbox', requestId); if (!current) return; await dbPut('outbox', { ...current, ...patch, updatedAt: Date.now() }); }
async function prosesSatuOutbox(item) {
  if (!item || item.status === 'done') return;
  await tandaiOutbox(item.requestId, { status: 'syncing' });
  try { const result = await requestPostOnline(item.action, item.data, item.requestId); await tandaiOutbox(item.requestId, { status: 'done', serverResult: result, syncedAt: Date.now(), lastError: '' }); await dbDelete('outbox', item.requestId); return true; }
  catch (error) {
    const retryCount = Number(item.retryCount || 0) + 1;
    if (error.kind === 'server' || !isRetryableTransportError(error) || retryCount >= MAX_SYNC_RETRY) { await tandaiOutbox(item.requestId, { status: 'failed', retryCount, lastError: errorMessage(error) }); return false; }
    await tandaiOutbox(item.requestId, { status: 'retry', retryCount, nextRetryAt: Date.now() + retryDelay(retryCount), lastError: errorMessage(error) }); return false;
  }
}
async function sinkronkanOutbox() {
  if (AppState.syncRunning || !AppState.isOnline || !AppState.user) return;
  AppState.syncRunning = true; updateOfflineUI();
  try { const items = await ambilOutbox(); const now = Date.now(); for (const item of items) { if (!AppState.isOnline) break; if (item.status === 'retry' && Number(item.nextRetryAt || 0) > now) continue; if (item.status === 'failed') continue; await prosesSatuOutbox(item); } }
  finally { AppState.syncRunning = false; updateOfflineUI(); }
}
function jadwalkanSync(delay = 1200) { clearTimeout(AppState.syncTimer); AppState.syncTimer = setTimeout(() => sinkronkanOutbox().catch(tampilkanError), delay); }

// =====================================================================
// 11. ONLINE / OFFLINE UI
// =====================================================================
async function updateOfflineUI() {
  const banner = document.getElementById('offline-banner');
  if (banner) { banner.classList.toggle('show', !AppState.isOnline); banner.textContent = AppState.isOnline ? 'ONLINE' : 'OFFLINE — Transaksi baru akan disimpan di perangkat.'; }
  const count = await jumlahOutbox().catch(() => 0);
  document.querySelectorAll('[data-sync-count]').forEach(el => { el.textContent = String(count); el.classList.toggle('hidden', count <= 0); });
}
function setOnlineState(isOnline) { AppState.isOnline = Boolean(isOnline); updateOfflineUI(); if (AppState.isOnline) jadwalkanSync(500); }

// =====================================================================
// 12. SESSION
// =====================================================================
function simpanSesi(user) { if (!user) { localStorage.removeItem(STORAGE_KEY); return; } localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, savedAt: Date.now() })); }
function bacaSesi() { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); if (!parsed || !parsed.user) return null; return parsed.user; } catch (error) { console.warn('[SESSION]', error); return null; } }
function clearAutoLogoutTimer() { if (AppState.autoLogoutTimer) { clearTimeout(AppState.autoLogoutTimer); AppState.autoLogoutTimer = null; } }
function scheduleAutoLogout() { clearAutoLogoutTimer(); const minutes = Number(AppState.pengaturan.autoLogoutMenit || DEFAULT_AUTO_LOGOUT_MIN); if (!AppState.user || minutes <= 0) return; AppState.autoLogoutTimer = setTimeout(() => logout(), minutes * 60 * 1000); }
async function login(username, password) { const user = await requestPostOnline('login', { username, password }, uuidKecil()); AppState.user = user; simpanSesi(user); scheduleAutoLogout(); return user; }
function logout() { clearAutoLogoutTimer(); AppState.user = null; AppState.cart = []; AppState.cartCustomer = null; simpanSesi(null); tampilkanLogin(); }

// =====================================================================
// 13. UI LOGIN
// =====================================================================
function tampilkanLogin() { document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active')); const screen = document.getElementById('login-screen'); if (screen) screen.classList.add('active'); const bottomNav = document.getElementById('bottom-nav'); if (bottomNav) bottomNav.classList.add('hidden'); }
function handleLoginSubmit(event) {
  event.preventDefault(); const form = event.currentTarget; const username = form.querySelector('[name="username"]')?.value.trim(); const password = form.querySelector('[name="password"]')?.value || ''; if (!username || !password) { toast('Username dan password wajib diisi.', 'error'); return; }
  const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
  login(username, password).then(() => { toast('Login berhasil.', 'success'); bootApp(); }).catch(error => { tampilkanError(error); }).finally(() => { if (button) button.disabled = false; });
}

// =====================================================================
// 14. RENDERER DASAR
// =====================================================================
const SCREEN_RENDERERS = {};
function registerScreen(name, renderer) { SCREEN_RENDERERS[name] = renderer; }
function setScreen(name) {
  AppState.currentScreen = name;
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === name));
  document.querySelectorAll('[data-screen-target]').forEach(button => button.classList.toggle('active', button.dataset.screenTarget === name));
  const renderer = SCREEN_RENDERERS[name];
  if (renderer) {
    const root = document.querySelector(`[data-screen="${CSS.escape(name)}"]`);
    Promise.resolve().then(() => renderer(root)).catch(tampilkanError);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// =====================================================================
// 15. DASHBOARD
// =====================================================================
registerScreen('dashboard', async function renderDashboard() {
  const root = document.querySelector('[data-screen="dashboard"]'); if (!root || !AppState.user) return;
  root.innerHTML = `<div class="container"><div class="section-title">Ringkasan</div><div class="grid-2"><div class="stat-card"><div class="stat-label">Total Produk</div><div class="stat-value" data-dashboard="totalProduk">—</div></div><div class="stat-card"><div class="stat-label">Stok Menipis</div><div class="stat-value" data-dashboard="stokMenipis">—</div></div><div class="stat-card"><div class="stat-label">Penjualan Hari Ini</div><div class="stat-value" data-dashboard="penjualanHariIni">—</div></div><div class="stat-card good"><div class="stat-label">Transaksi Hari Ini</div><div class="stat-value" data-dashboard="transaksiHariIni">—</div></div></div><div class="section-title">Akses Cepat</div><div class="menu-grid"><button class="menu-item menu-item-unggulan" data-action="navigate" data-screen="kasir"><span class="menu-icon">🛒</span><span class="menu-label">Kasir</span></button><button class="menu-item" data-action="navigate" data-screen="stok"><span class="menu-icon">💊</span><span class="menu-label">Stok</span></button><button class="menu-item" data-action="navigate" data-screen="riwayat"><span class="menu-icon">🧾</span><span class="menu-label">Riwayat</span></button><button class="menu-item" data-action="navigate" data-screen="pembelian"><span class="menu-icon">📦</span><span class="menu-label">Pembelian</span></button><button class="menu-item" data-action="navigate" data-screen="retur"><span class="menu-icon">↩️</span><span class="menu-label">Retur</span></button><button class="menu-item" data-action="navigate" data-screen="pelanggan"><span class="menu-icon">👥</span><span class="menu-label">Pelanggan</span></button><button class="menu-item" data-action="navigate" data-screen="laporan"><span class="menu-icon">📊</span><span class="menu-label">Laporan</span></button><button class="menu-item" data-action="navigate" data-screen="opname"><span class="menu-icon">📋</span><span class="menu-label">Opname</span></button><button class="menu-item" data-action="navigate" data-screen="pengaturan"><span class="menu-icon">⚙️</span><span class="menu-label">Pengaturan</span></button></div><div class="section-title">Status</div><div class="card"><div class="list-item" style="box-shadow:none;margin:0;padding:0;"><div class="li-main"><div class="li-title">Koneksi</div><div class="li-sub" data-status-online>Memeriksa…</div></div><span class="pill pill-gray" data-status-sync>Sync</span></div></div></div>`;
  const totalProdukEl = root.querySelector('[data-dashboard="totalProduk"]'); const stokMenipisEl = root.querySelector('[data-dashboard="stokMenipis"]'); const penjualanEl = root.querySelector('[data-dashboard="penjualanHariIni"]'); const transaksiEl = root.querySelector('[data-dashboard="transaksiHariIni"]'); const onlineEl = root.querySelector('[data-status-online]'); const syncEl = root.querySelector('[data-status-sync]');
  if (onlineEl) onlineEl.textContent = AppState.isOnline ? 'Online' : 'Offline';
  if (syncEl) { const outbox = await jumlahOutbox().catch(() => 0); syncEl.textContent = outbox > 0 ? `${outbox} pending` : 'Tersinkron'; syncEl.className = outbox > 0 ? 'pill pill-warn' : 'pill pill-success'; }
  try { const summary = await apiGet('getDashboardSummary', withIdUser(), { maxAge: 2 * 60 * 1000 }); if (totalProdukEl) totalProdukEl.textContent = summary.totalProduk ?? 0; if (stokMenipisEl) stokMenipisEl.textContent = summary.stokMenipis ?? 0; if (penjualanEl) penjualanEl.textContent = formatRupiah(summary.penjualanHariIni ?? 0); if (transaksiEl) transaksiEl.textContent = summary.transaksiHariIni ?? 0; } catch (error) { console.warn('[DASHBOARD]', error); }
}

// =====================================================================
// 16. KASIR
// =====================================================================
function tambahKeKeranjang(product, qty = 1) { const existing = AppState.cart.find(item => String(item.idProduk) === String(product.idProduk)); if (existing) existing.qty += qty; else AppState.cart.push({ idProduk: product.idProduk, namaObat: product.Nama_Obat ?? product.namaObat ?? '-', hargaSatuan: Number(product.Harga_Jual ?? product.hargaJual ?? 0), qty }); renderCart(); }
function ubahQtyKeranjang(idProduk, delta) { const item = AppState.cart.find(x => String(x.idProduk) === String(idProduk)); if (!item) return; item.qty += delta; if (item.qty <= 0) AppState.cart = AppState.cart.filter(x => String(x.idProduk) !== String(idProduk)); renderCart(); }
function renderCart() { const root = document.querySelector('[data-screen="kasir"]'); if (!root) return; const rows = AppState.cart.map(item => `<div class="list-item"><div class="li-main"><div class="li-title">${escapeHtml(item.namaObat)}</div><div class="li-sub">${formatRupiah(item.hargaSatuan)}</div></div><div class="li-right"><button class="btn btn-outline btn-sm" data-action="cart-minus" data-id-produk="${escapeHtml(item.idProduk)}">−</button><span>${item.qty}</span><button class="btn btn-outline btn-sm" data-action="cart-plus" data-id-produk="${escapeHtml(item.idProduk)}">+</button></div></div>`).join(''); const cart = root.querySelector('#cart-list'); if (cart) cart.innerHTML = rows || '<div class="empty-state">Keranjang kosong.</div>'; const total = root.querySelector('#cart-total'); if (total) total.textContent = formatRupiah(totalKeranjang()); }
async function checkoutKeranjang() { if (!AppState.cart.length) { toast('Keranjang masih kosong.', 'warn'); return; } const total = totalKeranjang(); const requestId = uuidKecil(); const data = withIdUser({ items: AppState.cart.map(item => ({ idProduk: item.idProduk, qty: Number(item.qty), hargaSatuan: Number(item.hargaSatuan) })), total, idPelanggan: AppState.cartCustomer?.idPelanggan || null, metodePembayaran: 'TUNAI' }); const result = await apiPost('createTransaksi', data, { requestId, allowOffline: true }); if (result?.queued) toast('Transaksi disimpan offline dan akan dikirim saat online.', 'warn'); else toast('Transaksi berhasil disimpan.', 'success'); AppState.cart = []; AppState.cartCustomer = null; renderCart(); }

// =====================================================================
// 17. BOOT
// =====================================================================
function bindGlobalEvents() {
  if (window.__ANA_FARMA_GLOBAL_EVENTS__) return; window.__ANA_FARMA_GLOBAL_EVENTS__ = true;
  window.addEventListener('online', () => setOnlineState(true)); window.addEventListener('offline', () => setOnlineState(false));
  document.addEventListener('submit', event => { if (event.target?.id === 'login-form') handleLoginSubmit(event); });
  document.addEventListener('click', event => { const target = event.target.closest('[data-action]'); if (!target) return; const action = target.dataset.action; if (action === 'navigate') { event.preventDefault(); setScreen(target.dataset.screen); return; } if (action === 'cart-minus') { ubahQtyKeranjang(target.dataset.idProduk, -1); return; } if (action === 'cart-plus') { ubahQtyKeranjang(target.dataset.idProduk, +1); return; } if (action === 'add-cart') { const product = AppState.produkCache.find(p => String(p.idProduk) === String(target.dataset.idProduk)); if (product) tambahKeKeranjang(product, 1); return; } if (action === 'checkout') { checkoutKeranjang().catch(tampilkanError); return; } if (action === 'logout') { logout(); return; } });
}
async function registerServiceWorker() { if (!('serviceWorker' in navigator)) return; try { const registration = await navigator.serviceWorker.register('service-worker.js', { scope: './' }); registration.update().catch(() => {}); } catch (error) { console.warn('[SW]', error); } }
async function bootApp() { bindGlobalEvents(); if (!AppState.user) { tampilkanLogin(); return; } const bottomNav = document.getElementById('bottom-nav'); if (bottomNav) bottomNav.classList.remove('hidden'); setScreen('dashboard'); updateOfflineUI(); if (AppState.isOnline) jadwalkanSync(500); }
async function initApp() { bindGlobalEvents(); await bukaDB(); const savedUser = bacaSesi(); if (savedUser) { AppState.user = savedUser; scheduleAutoLogout(); } await registerServiceWorker(); const splash = document.getElementById('splash'); if (splash) setTimeout(() => splash.classList.add('fade-out'), 250); await bootApp(); }
document.addEventListener('DOMContentLoaded', () => { initApp().catch(error => { console.error('[INIT]', error); toast('Aplikasi gagal diinisialisasi: ' + errorMessage(error), 'error'); }); });
window.AppState = AppState; window.apiGet = apiGet; window.apiPost = apiPost; window.SCREEN_RENDERERS = SCREEN_RENDERERS; window.registerScreen = registerScreen; window.formatRupiah = formatRupiah; window.escapeHtml = escapeHtml; window.toast = toast; window.tampilkanError = tampilkanError; window.withIdUser = withIdUser; window.uuidKecil = uuidKecil; window.setScreen = setScreen; window.renderCart = renderCart; window.checkoutKeranjang = checkoutKeranjang; window.sinkronkanOutbox = sinkronkanOutbox; window.ambilOutbox = ambilOutbox; window.jumlahOutbox = jumlahOutbox; window.bacaCache = bacaCache; window.simpanCache = simpanCache; window.API_URL = API_URL; window.API_DEPLOYMENT_ID = API_DEPLOYMENT_ID; window.APP_VERSION = APP_VERSION;
