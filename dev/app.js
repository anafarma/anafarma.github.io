/*
 * =====================================================================
 * APOTEK ANA FARMA — app.js
 * ARSITEKTUR ONLINE–OFFLINE
 * =====================================================================
 * Versi ditulis ulang dari struktur aplikasi utama.
 *
 * Prinsip:
 * 1. Server Apps Script = sumber kebenaran data.
 * 2. GET: server -> cache IndexedDB -> UI.
 * 3. POST/mutasi saat offline -> Outbox IndexedDB -> sinkron otomatis.
 * 4. Setiap mutasi mempunyai requestId yang sama saat retry.
 * 5. Tidak ada window.apiPost. API tetap berupa apiGet()/apiPost().
 * 6. Satu router, satu init, satu event delegation.
 *
 * TAHAP 1:
 * - fondasi stabil
 * - API
 * - IndexedDB/cache/outbox
 * - online/offline engine
 * - session/login
 * - router
 * - dashboard
 * - kasir dasar + keranjang + checkout
 * - PWA/service worker
 *
 * Modul bisnis lain akan dipasang di atas fondasi ini setelah tahap ini
 * lulus uji loading + login + online/offline.
 * =====================================================================
 */

// =====================================================================
// 01. KONFIGURASI
// =====================================================================

const API_URL =
  'https://script.google.com/macros/s/AKfycby6e72NoImYbWFs-O9Okcj1-cAoh0BiOpnWuPOqVau-KTmmQ60tdKF32xtZrn_qhv7O/exec';

const APP_VERSION = '2026-08-18-ONLINE-OFFLINE-01';
const STORAGE_KEY = 'anafarma_sesi_v2';
const DB_NAME = 'anafarma_offline_v2';
const DB_VERSION = 1;
const PRODUK_CACHE_MS = 60 * 60 * 1000;
const DEFAULT_AUTO_LOGOUT_MIN = 20;
const MAX_SYNC_RETRY = 8;

// POST yang aman disimpan ke Outbox saat offline.
// login sengaja TIDAK dimasukkan.
const OFFLINE_MUTATIONS = new Set([
  'createTransaksi',
  'mulaiShift',
  'selesaiShift',
  'adjustStok',
  'addPembelian',
  'addRetur',
  'simpanStokOpname',
  'simpanPengaturan',
  'simpanUser',
  'ubahPassword',
  'simpanPelanggan',
  'simpanSupplier',
  'ajukanPembelian',
  'setujuiPengajuanPembelian',
  'tolakPengajuanPembelian'
]);

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

function sekarangISO() {
  return new Date().toISOString();
}

function formatRupiah(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(n);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function totalKeranjang() {
  return AppState.cart.reduce(
    (sum, item) => sum + (Number(item.hargaSatuan) || 0) * (Number(item.qty) || 0),
    0
  );
}

function jumlahItemKeranjang() {
  return AppState.cart.reduce(
    (sum, item) => sum + (Number(item.qty) || 0),
    0
  );
}

function withIdUser(data = {}) {
  return {
    ...data,
    idUser: AppState.user ? AppState.user.idUser : null
  };
}

function errorMessage(error) {
  if (!error) return 'Terjadi kesalahan.';
  return error.message || String(error);
}

function isApiBelumDikonfigurasi() {
  return !API_URL || API_URL.includes('PASTE_URL_WEB_APP');
}

function isNetworkError(error) {
  const message =
    errorMessage(error).toLowerCase();

  return (
    !navigator.onLine ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('tidak bisa terhubung') ||
    message.includes('offline') ||
    message.includes('server http 503') ||
    message.includes('server http 502') ||
    message.includes('server http 504') ||
    message.includes('server http 500')
  );
}

// =====================================================================
// 04. TOAST / ERROR UI
// =====================================================================

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');

  if (!container) {
    console[type === 'error' ? 'error' : 'log'](message);
    return;
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => el.remove(), 3500);
}

function tampilkanError(error) {
  console.error('[Ana Farma]', error);
  toast(errorMessage(error), 'error');
}

// =====================================================================
// 05. INDEXEDDB
// =====================================================================

let dbPromise = null;

function bukaDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Browser tidak mendukung IndexedDB.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('outbox')) {
        const store = db.createObjectStore('outbox', { keyPath: 'requestId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => {
      AppState.dbReady = true;
      resolve(request.result);
    };
  });

  return dbPromise;
}

async function dbGet(storeName, key) {
  const db = await bukaDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, value) {
  const db = await bukaDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);

    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await bukaDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll(storeName) {
  const db = await bukaDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// =====================================================================
// 06. CACHE DATA
// =====================================================================

function cacheKey(action, params = {}) {
  return `${action}:${JSON.stringify(params)}`;
}

async function simpanCache(action, params, data) {
  try {
    await dbPut('cache', {
      key: cacheKey(action, params),
      action,
      params,
      data,
      savedAt: Date.now()
    });
  } catch (error) {
    console.warn('[CACHE PUT]', error);
  }
}

async function bacaCache(action, params, maxAge = Infinity) {
  try {
    const item = await dbGet('cache', cacheKey(action, params));

    if (!item) return null;

    if (Date.now() - item.savedAt > maxAge) return null;

    return item.data;
  } catch (error) {
    console.warn('[CACHE GET]', error);
    return null;
  }
}

// =====================================================================
// 07. OUTBOX OFFLINE
// =====================================================================

async function masukkanOutbox(action, data, requestId) {
  const item = {
    requestId,
    action,
    data,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    retryCount: 0,
    status: 'pending',
    lastError: ''
  };

  await dbPut('outbox', item);
  updateOfflineUI();

  return item;
}

async function ambilOutbox() {
  const items = await dbGetAll('outbox');

  return items.sort((a, b) => {
    return Number(a.createdAt) - Number(b.createdAt);
  });
}

async function jumlahOutbox() {
  const items = await ambilOutbox();
  return items.filter(x => x.status === 'pending' || x.status === 'retry').length;
}

// =====================================================================
// 08. API ONLINE
// =====================================================================

async function requestGetOnline(action, params) {
  if (isApiBelumDikonfigurasi()) {
    throw new Error('KONFIGURASI_BELUM_SELESAI');
  }

  const query = new URLSearchParams({
    action,
    ...(params || {})
  });

  let response;

  try {
    response = await fetch(`${API_URL}?${query.toString()}`, {
      method: 'GET',
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error(
      'Tidak bisa terhubung ke server. Periksa koneksi internet.'
    );
  }

  if (!response.ok) {
    throw new Error(`Server HTTP ${response.status}.`);
  }

  let json;

  try {
    json = await response.json();
  } catch (error) {
    throw new Error('Respons server bukan JSON yang valid.');
  }

  if (!json.ok) {
    throw new Error(json.error || 'Server menolak permintaan.');
  }

  return json.data;
}

async function requestPostOnline(action, data, requestId) {
  if (isApiBelumDikonfigurasi()) {
    throw new Error('KONFIGURASI_BELUM_SELESAI');
  }

  const payload = {
    action,
    data: data || {},
    requestId: requestId || uuidKecil()
  };

  let response;

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error(
      'Tidak bisa terhubung ke server. Periksa koneksi internet.'
    );
  }

  if (!response.ok) {
    throw new Error(`Server HTTP ${response.status}.`);
  }

  let json;

  try {
    json = await response.json();
  } catch (error) {
    throw new Error('Respons server bukan JSON yang valid.');
  }

  if (!json.ok) {
    throw new Error(json.error || 'Server menolak permintaan.');
  }

  return json.data;
}

// =====================================================================
// 09. API PUBLIC
// =====================================================================

async function apiGet(action, params = {}, options = {}) {
  const allowCache = options.cache !== false;
  const cacheAge = Number(options.maxAge || PRODUK_CACHE_MS);

  if (!AppState.isOnline) {
    const cached = await bacaCache(action, params, Infinity);

    if (cached !== null) {
      return cached;
    }

    throw new Error(
      'OFFLINE_DATA_TIDAK_TERSEDIA: Data belum pernah disimpan di perangkat.'
    );
  }

  try {
    const data = await requestGetOnline(action, params);

    if (allowCache) {
      await simpanCache(action, params, data);
    }

    return data;
  } catch (error) {
    if (isNetworkError(error) && allowCache) {
      const cached = await bacaCache(action, params, cacheAge);

      if (cached !== null) {
        toast('Server tidak tersedia. Menampilkan data terakhir.', 'warn');
        return cached;
      }
    }

    throw error;
  }
}

async function apiPost(action, data = {}, options = {}) {
  const requestId = options.requestId || uuidKecil();
  const bolehOffline =
    options.allowOffline === true ||
    OFFLINE_MUTATIONS.has(action);

  if (!AppState.isOnline) {
    if (!bolehOffline) {
      throw new Error(
        'Fitur ini membutuhkan koneksi internet.'
      );
    }

    await masukkanOutbox(action, data, requestId);

    return {
      offlinePending: true,
      requestId,
      action
    };
  }

  try {
    return await requestPostOnline(action, data, requestId);
  } catch (error) {
    if (!bolehOffline || !isNetworkError(error)) {
      throw error;
    }

    await masukkanOutbox(action, data, requestId);

    updateOfflineUI();

    return {
      offlinePending: true,
      requestId,
      action
    };
  }
}

// =====================================================================
// 10. ONLINE/OFFLINE ENGINE
// =====================================================================

function setStatusOnline(isOnline) {
  AppState.isOnline = Boolean(isOnline);
  updateOfflineUI();

  if (AppState.isOnline) {
    syncOutbox();
  }
}

async function syncOutbox() {
  if (!AppState.isOnline || AppState.syncRunning) return;

  AppState.syncRunning = true;

  try {
    const items = await ambilOutbox();

    for (const item of items) {
      if (!AppState.isOnline) break;
      if (item.status === 'done') continue;

      try {
        await dbPut('outbox', {
          ...item,
          status: 'syncing',
          updatedAt: Date.now()
        });

        const result = await requestPostOnline(
          item.action,
          item.data,
          item.requestId
        );

        await dbDelete('outbox', item.requestId);

        window.dispatchEvent(
          new CustomEvent('anafarma:sync-success', {
            detail: {
              item,
              result
            }
          })
        );
      } catch (error) {
        const retryCount = Number(item.retryCount || 0) + 1;

        await dbPut('outbox', {
          ...item,
          retryCount,
          status: retryCount >= MAX_SYNC_RETRY ? 'failed' : 'retry',
          updatedAt: Date.now(),
          lastError: errorMessage(error)
        });

        if (isNetworkError(error)) {
          break;
        }

        console.error(
          '[OUTBOX]',
          item.action,
          item.requestId,
          error
        );
      }
    }
  } finally {
    AppState.syncRunning = false;
    updateOfflineUI();
  }
}

function pasangOnlineOfflineListener() {
  window.addEventListener('online', () => {
    setStatusOnline(true);
    toast('Koneksi kembali. Sinkronisasi dimulai.', 'success');
  });

  window.addEventListener('offline', () => {
    setStatusOnline(false);
    toast('Offline. Perubahan akan disimpan dan disinkronkan otomatis.', 'warn');
  });
}

function mulaiSyncPeriodik() {
  if (AppState.syncTimer) {
    clearInterval(AppState.syncTimer);
  }

  AppState.syncTimer = setInterval(() => {
    if (AppState.isOnline) syncOutbox();
  }, 15000);
}

function updateOfflineUI() {
  const banner = document.getElementById('offline-banner');

  if (banner) {
    banner.classList.toggle('show', !AppState.isOnline);

    const pendingPromise = jumlahOutbox();

    pendingPromise.then(count => {
      if (!AppState.isOnline) {
        banner.textContent =
          count > 0
            ? `⚠️ Offline • ${count} data menunggu sinkronisasi`
            : '⚠️ Tidak ada koneksi internet';
      } else {
        banner.textContent =
          count > 0
            ? `🔄 ${count} data sedang menunggu sinkronisasi`
            : '✓ Online';
      }
    });
  }
}

// =====================================================================
// 11. SESSION / AUTH
// =====================================================================

function simpanSesi(user) {
  AppState.user = user;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.warn('[SESSION]', error);
  }
}

function muatSesi() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return;

    const user = JSON.parse(raw);

    if (user && user.idUser) {
      AppState.user = user;
    }
  } catch (error) {
    AppState.user = null;
    localStorage.removeItem(STORAGE_KEY);
  }
}

function hapusSesi() {
  AppState.user = null;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[SESSION]', error);
  }
}

async function login(username, password) {
  // Login selalu harus online. Jangan pernah memasukkan password
  // ke IndexedDB/outbox.
  if (!AppState.isOnline) {
    throw new Error(
      'Login membutuhkan koneksi internet.'
    );
  }

  const user = await apiPost(
    'login',
    {
      username,
      password
    },
    {
      allowOffline: false
    }
  );

  if (!user || !user.idUser) {
    throw new Error('Respons login tidak valid.');
  }

  simpanSesi(user);
  return user;
}

function logout() {
  hapusSesi();

  AppState.cart = [];
  AppState.cartCustomer = null;

  clearTimeout(AppState.autoLogoutTimer);

  const main = document.getElementById('main-shell');
  const loginScreen = document.getElementById('login-screen');

  if (main) main.classList.add('hidden');
  if (loginScreen) loginScreen.classList.remove('hidden');

  const username = document.getElementById('login-username');
  const password = document.getElementById('login-password');

  if (username) username.value = '';
  if (password) password.value = '';
}

async function segarkanSesiShift() {
  if (!AppState.user || !AppState.isOnline) return;

  try {
    const shift = await apiGet(
      'getShiftStatus',
      {
        idUser: AppState.user.idUser
      },
      {
        cache: false
      }
    );

    AppState.user.shiftAktif =
      shift && shift.status === 'Aktif'
        ? shift
        : null;

    simpanSesi(AppState.user);
  } catch (error) {
    console.warn('[SHIFT]', error);
  }
}

function resetAutoLogoutTimer() {
  clearTimeout(AppState.autoLogoutTimer);

  if (!AppState.user) return;

  const menit =
    Number(
      AppState.pengaturan &&
      AppState.pengaturan.auto_logout_menit
    ) || DEFAULT_AUTO_LOGOUT_MIN;

  AppState.autoLogoutTimer = setTimeout(() => {
    toast(
      'Sesi berakhir karena tidak aktif. Silakan login kembali.',
      'warn'
    );

    logout();
  }, menit * 60 * 1000);
}

function pasangAutoLogout() {
  ['click', 'touchstart', 'keydown', 'scroll'].forEach(eventName => {
    document.addEventListener(
      eventName,
      () => {
        resetAutoLogoutTimer();
      },
      {
        passive: true
      }
    );
  });
}

// =====================================================================
// 12. LOGO / SPLASH / PWA
// =====================================================================

function pasangLogoKeUI() {
  const splash = document.getElementById('splash-logo-img');
  const loginImg = document.getElementById('login-logo-img');
  const topbar = document.getElementById('topbar-logo-img');

  if (typeof LOGO_EMBLEM_B64 !== 'undefined') {
    if (splash) splash.src = LOGO_EMBLEM_B64;
    if (topbar) topbar.src = LOGO_EMBLEM_B64;
  }

  if (
    typeof LOGO_FULL_B64 !== 'undefined' &&
    loginImg
  ) {
    loginImg.src = LOGO_FULL_B64;
  }
}

function sembunyikanSplash() {
  const splash = document.getElementById('splash');

  if (!splash) return;

  splash.classList.add('fade-out');

  setTimeout(() => {
    if (splash.parentNode) splash.remove();
  }, 550);
}

function pasangInstallPrompt() {
  window.addEventListener(
    'beforeinstallprompt',
    event => {
      event.preventDefault();
      AppState.deferredInstallPrompt = event;
    }
  );
}

function pasangServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration =
        await navigator.serviceWorker.register(
          'service-worker.js',
          {
            updateViaCache: 'none'
          }
        );

      await registration.update();

      console.log(
        '[SW] terdaftar:',
        registration.scope
      );

    } catch (error) {
      console.error(
        '[SW REGISTER]',
        error
      );
    }
  });
}
// =====================================================================
// 13. ROUTER
// =====================================================================

const SCREENS_OWNER = [
  'dashboard',
  'kasir',
  'stok',
  'riwayat',
  'pembelian',
  'retur',
  'pelanggan',
  'supplier',
  'laporan',
  'opname',
  'pengaturan',
  'users',
  'profil'
];

const SCREENS_PEGAWAI = [
  'dashboard',
  'kasir',
  'riwayat',
  'pembelian',
  'retur',
  'pelanggan',
  'opname',
  'profil'
];

function screensUntukRole() {
  if (!AppState.user) return [];

  return AppState.user.role === 'Owner'
    ? SCREENS_OWNER
    : SCREENS_PEGAWAI;
}

const NAV_ITEMS = {
  dashboard: { icon: '🏠', label: 'Beranda' },
  kasir: { icon: '🧾', label: 'Transaksi' },
  stok: { icon: '📦', label: 'Stok' },
  riwayat: { icon: '🕘', label: 'Riwayat' },
  laporan: { icon: '📊', label: 'Laporan' },
  pembelian: { icon: '🚚', label: 'Pembelian' },
  retur: { icon: '↩️', label: 'Retur' },
  opname: { icon: '📋', label: 'Opname' },
  pelanggan: { icon: '👥', label: 'Pelanggan' },
  profil: { icon: '⋯', label: 'Lainnya' }
};

function navUtamaUntukRole() {
  if (!AppState.user) return [];

  if (AppState.user.role === 'Owner') {
    return [
      'dashboard',
      'kasir',
      'stok',
      'laporan',
      'profil'
    ];
  }

  return [
    'kasir',
    'riwayat',
    'pembelian',
    'retur',
    'opname',
    'pelanggan'
  ];
}

function renderBottomNav() {
  const nav = document.getElementById('bottomnav');

  if (!nav) return;

  const items = navUtamaUntukRole();

  nav.innerHTML = items
    .map(key => {
      const item = NAV_ITEMS[key];

      const active =
        key === AppState.currentScreen ||
        (
          key === 'profil' &&
          !['dashboard', 'kasir', 'stok', 'laporan'].includes(
            AppState.currentScreen
          )
        );

      return `
        <button
          type="button"
          class="nav-item ${active ? 'active' : ''}"
          data-nav="${escapeHtml(key)}">
          <span class="nav-icon">${item.icon}</span>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `;
    })
    .join('');
}

function navigasiKe(screen, pushState = true) {
  if (!AppState.user) return;

  if (!screensUntukRole().includes(screen)) {
    screen = 'dashboard';
  }

  AppState.currentScreen = screen;

  if (pushState) {
    history.pushState(
      {
        screen
      },
      '',
      `#${screen}`
    );
  }

  renderBottomNav();
  renderScreen(screen);

  window.scrollTo(0, 0);
}

window.addEventListener('popstate', event => {
  if (!AppState.user) return;

  let screen =
    event.state &&
    event.state.screen
      ? event.state.screen
      : 'dashboard';

  if (!screensUntukRole().includes(screen)) {
    screen = 'dashboard';
  }

  AppState.currentScreen = screen;

  renderBottomNav();
  renderScreen(screen);
});

// =====================================================================
// 14. DATA PRODUK
// =====================================================================

async function ambilProduk(forceRefresh = false) {
  const now = Date.now();

  if (
    !forceRefresh &&
    AppState.produkCache.length > 0 &&
    now - AppState.produkCacheAt < PRODUK_CACHE_MS
  ) {
    return AppState.produkCache;
  }

  const params = {
    idUser: AppState.user
      ? AppState.user.idUser
      : null
  };

  // OFFLINE: baca cache produk berdasarkan key API yang sama.
  if (!AppState.isOnline) {
    const cached = await bacaCache(
      'getProduk',
      params,
      Infinity
    );

    if (Array.isArray(cached) && cached.length > 0) {
      AppState.produkCache = cached;
      AppState.produkCacheAt = now;
      return AppState.produkCache;
    }

    throw new Error(
      'OFFLINE_DATA_TIDAK_TERSEDIA: Data produk belum tersedia di perangkat.'
    );
  }

  // ONLINE: ambil dari server melalui apiGet(), sekaligus menyimpan cache.
  const data = await apiGet(
    'getProduk',
    params,
    {
      cache: true,
      maxAge: PRODUK_CACHE_MS
    }
  );

  AppState.produkCache =
    Array.isArray(data)
      ? data
      : [];

  AppState.produkCacheAt = now;

  return AppState.produkCache;
}

async function cekCacheProdukOffline() {
  const params = {
    idUser: AppState.user
      ? AppState.user.idUser
      : null
  };

  const cached = await bacaCache(
    'getProduk',
    params,
    Infinity
  );

  return {
    online: AppState.isOnline,
    idUser: params.idUser,
    jumlahProduk: Array.isArray(cached)
      ? cached.length
      : 0,
    adaCache: Array.isArray(cached)
  };
}
// =====================================================================
// 15. KASIR — KERANJANG
// =====================================================================

function cekBolehTransaksi() {
  const user = AppState.user;

  if (!user) {
    return 'Sesi pengguna tidak ditemukan.';
  }

  if (
    user.role !== 'Owner' &&
    (!user.shiftAktif ||
      user.shiftAktif.status !== 'Aktif')
  ) {
    return (
      'Anda belum memulai shift. ' +
      'Mulai shift dari Beranda terlebih dahulu.'
    );
  }

  return null;
}

function tambahKeKeranjang(produk, satuan = null) {
  const error = cekBolehTransaksi();

  if (error) {
    toast(error, 'warn');
    return;
  }

  const kodeObat =
    produk.Kode_Obat ??
    produk.kodeObat;

  const namaObat =
    produk.Nama_Obat ??
    produk.namaObat ??
    '-';

  const stok =
    Number(
      produk.Stok ??
      produk.stok ??
      0
    );

  const satuanJual =
    satuan ||
    produk.satuanJual ||
    'Ecer';

  const isiPerSatuan = Math.max(
    1,
    Number(
      produk.isiPerSatuan ??
      produk.Isi_Per_Satuan ??
      1
    )
  );

  const hargaDasar =
    Number(
      produk.Harga_Jual ??
      produk.hargaJual ??
      produk.hargaSatuan ??
      0
    );

  const namaSatuan =
    produk.namaSatuan ||
    satuanJual;

  const existing =
    AppState.cart.find(
      item =>
        String(item.kodeObat) ===
          String(kodeObat) &&
        String(item.satuanJual) ===
          String(satuanJual)
    );

  const maxQty =
    Math.floor(stok / isiPerSatuan);

  if (maxQty <= 0) {
    toast(
      `Stok ${namaObat} tidak tersedia.`,
      'warn'
    );
    return;
  }

  if (existing) {
    if (existing.qty >= maxQty) {
      toast(
        `Stok ${namaObat} tidak mencukupi.`,
        'warn'
      );
      return;
    }

    existing.qty += 1;
  } else {
    AppState.cart.push({
      kodeObat,
      namaObat,
      hargaSatuan: hargaDasar,
      qty: 1,
      stokTersedia: stok,
      satuanJual,
      namaSatuan,
      isiPerSatuan,
      synced: false
    });
  }

  renderKasirCartStatus();
  toast(`${namaObat} ditambahkan.`, 'success');
}

function ubahQtyKeranjang(kodeObat, satuanJual, delta) {
  const item = AppState.cart.find(
    x =>
      String(x.kodeObat) === String(kodeObat) &&
      String(x.satuanJual) === String(satuanJual)
  );

  if (!item) return;

  const maxQty = Math.floor(
    Number(item.stokTersedia || 0) /
      Math.max(1, Number(item.isiPerSatuan || 1))
  );

  const next = Number(item.qty || 0) + Number(delta || 0);

  if (next <= 0) {
    AppState.cart =
      AppState.cart.filter(x => x !== item);
  } else if (next <= maxQty) {
    item.qty = next;
    item.synced = false;
  } else {
    toast('Jumlah melebihi stok.', 'warn');
  }

  renderKasirCartStatus();
}

function kosongkanKeranjang() {
  AppState.cart = [];
  AppState.cartCustomer = null;
  renderKasirCartStatus();
}

function renderKasirCartStatus() {
  const el = document.getElementById('kasir-actions');

  if (!el) return;

  if (AppState.cart.length === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';

  const count = document.getElementById(
    'cart-items-count'
  );

  const total = document.getElementById(
    'cart-total'
  );

  if (count) {
    count.textContent =
      String(jumlahItemKeranjang());
  }

  if (total) {
    total.textContent =
      formatRupiah(totalKeranjang());
  }
}

// =====================================================================
// 16. KASIR — RENDER
// =====================================================================

function renderKasirList(source, query = '') {
  const list = document.getElementById('kasir-list');

  if (!list) return;

  const q =
    String(query || '')
      .trim()
      .toLowerCase();

  const products =
    Array.isArray(source)
      ? source
      : [];

  const filtered =
    q
      ? products.filter(item => {
          const nama = String(
            item.Nama_Obat ??
            item.namaObat ??
            ''
          ).toLowerCase();

          const kode = String(
            item.Kode_Obat ??
            item.kodeObat ??
            ''
          ).toLowerCase();

          return (
            nama.includes(q) ||
            kode.includes(q)
          );
        })
      : products;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        Obat tidak ditemukan.
      </div>
    `;
    return;
  }

  list.innerHTML = filtered
    .map(item => {
      const kode =
        item.Kode_Obat ??
        item.kodeObat;

      const nama =
        item.Nama_Obat ??
        item.namaObat ??
        '-';

      const stok =
        Number(
          item.Stok ??
          item.stok ??
          0
        );

      const harga =
        Number(
          item.Harga_Jual ??
          item.hargaJual ??
          item.hargaSatuan ??
          0
        );

      const satuan =
        item.satuanJual ||
        'Ecer';

      const disabled =
        stok <= 0
          ? 'disabled'
          : '';

      return `
        <div class="card product-card">
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div style="min-width:0;">
              <div style="font-weight:700;">
                ${escapeHtml(nama)}
              </div>
              <div style="font-size:12px;color:var(--text-dim);">
                ${escapeHtml(kode)}
              </div>
              <div style="margin-top:5px;">
                ${formatRupiah(harga)}
              </div>
              <div style="font-size:12px;margin-top:3px;">
                Stok: ${stok}
              </div>
            </div>

            <button
              type="button"
              class="btn btn-primary btn-sm"
              data-pilih-produk="${escapeHtml(String(kode))}"
              ${disabled}>
              + Tambah
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function renderKasir(root) {
  root.innerHTML = `
    <div class="container">

      <div class="section-title">
        Transaksi
      </div>

      <div class="search-bar">
        <span>🔍</span>
        <input
          type="text"
          id="kasir-search"
          placeholder="Cari nama obat atau kode..."
          autocomplete="off">
      </div>

      <div id="kasir-list"></div>

      <div
        id="kasir-actions"
        style="
          display:none;
          position:sticky;
          bottom:calc(64px + var(--safe-bottom));
          padding:10px 0 8px;
          background:linear-gradient(
            to top,
            var(--bg) 75%,
            rgba(244,246,247,0)
          );
          z-index:30;">

        <button
          type="button"
          class="btn btn-primary btn-block"
          id="btn-lanjut-keranjang">

          🛒 Keranjang
          (<span id="cart-items-count">0</span>)
          •
          <span id="cart-total">Rp0</span>
        </button>

        <div
          style="
            text-align:center;
            font-size:11px;
            color:var(--text-faint);
            margin-top:5px;">

          Data transaksi:
          ${AppState.isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>
    </div>
  `;

  const search = root.querySelector(
    '#kasir-search'
  );

  const list = root.querySelector(
    '#kasir-list'
  );

  let products;

  try {
    products = await ambilProduk(false);
  } catch (error) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        ${escapeHtml(errorMessage(error))}
      </div>
    `;
    return;
  }

  renderKasirList(products, '');

  search.addEventListener(
    'input',
    debounce(() => {
      renderKasirList(
        AppState.produkCache,
        search.value
      );
    }, 150)
  );

  const lanjut =
    root.querySelector(
      '#btn-lanjut-keranjang'
    );

  if (lanjut) {
    lanjut.addEventListener(
      'click',
      bukaKeranjangModal
    );
  }

  renderKasirCartStatus();
}

// =====================================================================
// 17. CHECKOUT
// =====================================================================

function buildPayloadTransaksi() {
  return withIdUser({
    items: AppState.cart.map(item => {
      const isi =
        Math.max(
          1,
          Number(item.isiPerSatuan) || 1
        );

      return {
        kodeObat: item.kodeObat,

        // Backend menyimpan stok dalam satuan terkecil.
        qty:
          Number(item.qty || 0) * isi,

        hargaSatuan:
          Number(item.hargaSatuan || 0) / isi,

        satuanJual:
          item.satuanJual,

        namaSatuan:
          item.namaSatuan || ''
      };
    }),

    idPelanggan:
      AppState.cartCustomer
        ? AppState.cartCustomer.idPelanggan
        : '',

    diskon: 0,
    pajak: 0,

    metodeBayar: 'Tunai',

    bayar: totalKeranjang()
  });
}

async function prosesCheckout() {
  const error = cekBolehTransaksi();

  if (error) {
    throw new Error(error);
  }

  if (!AppState.cart.length) {
    throw new Error('Keranjang masih kosong.');
  }

  const payload =
    buildPayloadTransaksi();

  const hasil = await apiPost(
    'createTransaksi',
    payload,
    {
      allowOffline: true
    }
  );

  if (
    hasil &&
    hasil.offlinePending === true
  ) {
    toast(
      'Transaksi disimpan di perangkat. Akan disinkronkan saat online.',
      'warn'
    );

    // PENTING:
    // keranjang TIDAK dikosongkan ketika offline.
    return hasil;
  }

  // Hanya server yang boleh menyebabkan cart kosong.
  kosongkanKeranjang();
  invalidasiCacheProduk();

  toast(
    'Transaksi berhasil disimpan.',
    'success'
  );

  return hasil;
}

function bukaKeranjangModal() {
  const modalRoot =
    document.getElementById('modal-root');

  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-checkout">
      <div class="modal">
        <div class="modal-header">
          <strong>Keranjang</strong>
          <button
            type="button"
            class="icon-btn"
            id="btn-tutup-modal">
            ✕
          </button>
        </div>

        <div class="modal-body">
          <div id="cart-modal-items"></div>

          <div
            style="
              display:flex;
              justify-content:space-between;
              font-weight:700;
              margin-top:14px;">

            <span>Total</span>
            <span id="modal-cart-total">
              ${formatRupiah(totalKeranjang())}
            </span>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline"
            id="btn-tutup-modal-2">
            Tutup
          </button>

          <button
            type="button"
            class="btn btn-primary"
            id="btn-proses-bayar">
            Proses & Simpan
          </button>
        </div>
      </div>
    </div>
  `;

  renderCartModalItems();

  const close = () => {
    modalRoot.innerHTML = '';
  };

  modalRoot
    .querySelector('#btn-tutup-modal')
    .addEventListener('click', close);

  modalRoot
    .querySelector('#btn-tutup-modal-2')
    .addEventListener('click', close);

  modalRoot
    .querySelector('#btn-proses-bayar')
    .addEventListener('click', async event => {
      const button = event.currentTarget;

      button.disabled = true;
      button.textContent = 'Memproses...';

      try {
        const result =
          await prosesCheckout();

        if (
          result &&
          result.offlinePending
        ) {
          close();
          return;
        }

        close();
        navigasiKe('kasir');
      } catch (error) {
        tampilkanError(error);
        button.disabled = false;
        button.textContent =
          'Proses & Simpan';
      }
    });
}

function renderCartModalItems() {
  const root =
    document.getElementById(
      'cart-modal-items'
    );

  if (!root) return;

  if (!AppState.cart.length) {
    root.innerHTML = `
      <div class="empty-state">
        Keranjang kosong.
      </div>
    `;
    return;
  }

  root.innerHTML = AppState.cart
    .map(item => `
      <div
        class="card"
        style="margin-bottom:8px;">

        <div style="font-weight:700;">
          ${escapeHtml(item.namaObat)}
        </div>

        <div
          style="
            font-size:12px;
            color:var(--text-dim);
            margin-top:3px;">

          ${escapeHtml(item.namaSatuan || 'Ecer')}
          • ${formatRupiah(item.hargaSatuan)}
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-top:8px;">

          <div>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              data-cart-minus="${escapeHtml(String(item.kodeObat))}"
              data-cart-satuan="${escapeHtml(String(item.satuanJual || ''))}">
              −
            </button>

            <strong style="padding:0 12px;">
              ${Number(item.qty || 0)}
            </strong>

            <button
              type="button"
              class="btn btn-outline btn-sm"
              data-cart-plus="${escapeHtml(String(item.kodeObat))}"
              data-cart-satuan="${escapeHtml(String(item.satuanJual || ''))}">
              +
            </button>
          </div>

          <strong>
            ${formatRupiah(
              Number(item.hargaSatuan || 0) *
              Number(item.qty || 0)
            )}
          </strong>
        </div>
      </div>
    `)
    .join('');

  root
    .querySelectorAll('[data-cart-minus]')
    .forEach(button => {
      button.addEventListener('click', () => {
        ubahQtyKeranjang(
          button.dataset.cartMinus,
          button.dataset.cartSatuan,
          -1
        );
        renderCartModalItems();
      });
    });

  root
    .querySelectorAll('[data-cart-plus]')
    .forEach(button => {
      button.addEventListener('click', () => {
        ubahQtyKeranjang(
          button.dataset.cartPlus,
          button.dataset.cartSatuan,
          1
        );
        renderCartModalItems();
      });
    });
}

// =====================================================================
// 18. DASHBOARD
// =====================================================================

async function renderDashboard(root) {
  const user = AppState.user;

  if (!user) return;

  root.innerHTML = `
    <div class="container">

      <div class="section-title">
        Selamat datang
      </div>

      <div class="card">
        <div style="font-size:18px;font-weight:700;">
          ${escapeHtml(user.nama || user.username || '')}
        </div>

        <div
          style="
            color:var(--text-dim);
            margin-top:4px;">

          ${escapeHtml(user.role || '')}
        </div>

        <div
          style="
            margin-top:10px;
            font-size:12px;">

          Status:
          <strong>
            ${AppState.isOnline ? 'ONLINE' : 'OFFLINE'}
          </strong>
        </div>
      </div>

      <div class="section-title">
        Akses Cepat
      </div>

      <div class="grid-2">
        <button
          type="button"
          class="btn btn-primary"
          data-nav="kasir">
          🧾 Transaksi Baru
        </button>

        <button
          type="button"
          class="btn btn-outline"
          data-nav="stok">
          📦 Stok
        </button>

        <button
          type="button"
          class="btn btn-outline"
          data-nav="pembelian">
          🚚 Pembelian
        </button>

        <button
          type="button"
          class="btn btn-outline"
          data-nav="pelanggan">
          👥 Pelanggan
        </button>

        <button
          type="button"
          class="btn btn-outline"
          data-nav="riwayat">
          🕘 Riwayat
        </button>

        ${
          user.role === 'Owner'
            ? `
              <button
                type="button"
                class="btn btn-outline"
                data-nav="laporan">
                📊 Laporan
              </button>
            `
            : ''
        }
      </div>

      <div class="card" style="margin-top:14px;">
        <div style="font-weight:700;">
          Sinkronisasi
        </div>

        <div
          id="dashboard-sync-status"
          style="
            font-size:12px;
            color:var(--text-dim);
            margin-top:5px;">
          Memeriksa...
        </div>

        <button
          type="button"
          class="btn btn-outline btn-sm"
          id="btn-sync-now"
          style="margin-top:10px;">
          🔄 Sinkronkan Sekarang
        </button>
      </div>
    </div>
  `;

  root
    .querySelectorAll('[data-nav]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => navigasiKe(button.dataset.nav)
      );
    });

  const syncStatus =
    root.querySelector(
      '#dashboard-sync-status'
    );

  const updateSyncStatus =
    async () => {
      const count =
        await jumlahOutbox();

      syncStatus.textContent =
        count > 0
          ? `${count} data menunggu sinkronisasi.`
          : 'Tidak ada data tertunda.';
    };

  updateSyncStatus();

  root
    .querySelector('#btn-sync-now')
    .addEventListener(
      'click',
      async () => {
        if (!AppState.isOnline) {
          toast(
            'Belum ada koneksi internet.',
            'warn'
          );
          return;
        }

        await syncOutbox();
        await updateSyncStatus();
      }
    );
}

// =====================================================================
// 19. SCREEN PLACEHOLDER TERKONTROL
// =====================================================================
//
// Sengaja satu fungsi fallback. Ini jauh lebih aman daripada membiarkan
// router memanggil fungsi yang belum ada lalu menghasilkan ReferenceError.
// Modul berikutnya akan mengganti renderer satu per satu.

function renderPlaceholder(root, title, description) {
  root.innerHTML = `
    <div class="container">
      <div class="section-title">
        ${escapeHtml(title)}
      </div>

      <div class="card">
        <div style="font-weight:700;">
          Modul sedang dipasang.
        </div>

        <div
          style="
            margin-top:6px;
            font-size:13px;
            color:var(--text-dim);">
          ${escapeHtml(description)}
        </div>
      </div>
    </div>
  `;
}

const SCREEN_RENDERERS = {
  dashboard: renderDashboard,
  kasir: renderKasir,

  stok: root =>
    renderPlaceholder(
      root,
      'Stok',
      'Modul stok akan menggunakan API backend yang sudah ada.'
    ),

  riwayat: root =>
    renderPlaceholder(
      root,
      'Riwayat',
      'Modul riwayat akan dipasang setelah fondasi online–offline lulus.'
    ),

  pembelian: root =>
    renderPlaceholder(
      root,
      'Pembelian',
      'Modul pembelian akan dipasang pada tahap berikutnya.'
    ),

  retur: root =>
    renderPlaceholder(
      root,
      'Retur',
      'Modul retur akan dipasang pada tahap berikutnya.'
    ),

  pelanggan: root =>
    renderPlaceholder(
      root,
      'Pelanggan',
      'Modul pelanggan akan dipasang pada tahap berikutnya.'
    ),

  supplier: root =>
    renderPlaceholder(
      root,
      'Supplier',
      'Modul supplier akan dipasang pada tahap berikutnya.'
    ),

  laporan: root =>
    renderPlaceholder(
      root,
      'Laporan',
      'Modul laporan akan dipasang pada tahap berikutnya.'
    ),

  opname: root =>
    renderPlaceholder(
      root,
      'Stok Opname',
      'Modul stok opname akan dipasang pada tahap berikutnya.'
    ),

  pengaturan: root =>
    renderPlaceholder(
      root,
      'Pengaturan',
      'Modul pengaturan akan dipasang pada tahap berikutnya.'
    ),

  users: root =>
    renderPlaceholder(
      root,
      'Pengguna',
      'Modul pengguna akan dipasang pada tahap berikutnya.'
    ),

  profil: root =>
    renderPlaceholder(
      root,
      'Profil',
      'Modul profil akan dipasang pada tahap berikutnya.'
    )
};

// =====================================================================
// 20. RENDER SCREEN
// =====================================================================

function renderScreen(screen) {
  const root =
    document.getElementById('screen-root');

  if (!root) return;

  root.innerHTML = `
    <div class="container">
      <div class="empty-state">
        Memuat...
      </div>
    </div>
  `;

  const renderer =
    SCREEN_RENDERERS[screen];

  if (!renderer) {
    root.innerHTML = `
      <div class="container">
        <div class="empty-state">
          Halaman tidak ditemukan.
        </div>
      </div>
    `;
    return;
  }

  Promise.resolve()
    .then(() => renderer(root))
    .catch(error => {
      console.error(
        `[SCREEN:${screen}]`,
        error
      );

      root.innerHTML = `
        <div class="container">
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>

            Gagal memuat halaman.

            <div
              style="
                margin-top:8px;
                font-size:12px;">
              ${escapeHtml(
                errorMessage(error)
              )}
            </div>

            <button
              type="button"
              class="btn btn-outline btn-sm"
              id="btn-retry-screen"
              style="margin-top:12px;">
              Coba Lagi
            </button>
          </div>
        </div>
      `;

      const retry =
        document.getElementById(
          'btn-retry-screen'
        );

      if (retry) {
        retry.addEventListener(
          'click',
          () => renderScreen(screen)
        );
      }
    });
}

// =====================================================================
// 21. GLOBAL EVENT DELEGATION
// =====================================================================

function pasangEventGlobal() {
  document.addEventListener(
    'click',
    event => {
      const nav =
        event.target.closest &&
        event.target.closest(
          '[data-nav]'
        );

      if (nav) {
        event.preventDefault();
        navigasiKe(nav.dataset.nav);
        return;
      }

      const productButton =
        event.target.closest &&
        event.target.closest(
          '#kasir-list [data-pilih-produk]'
        );

      if (productButton) {
        event.preventDefault();

        const kode =
          productButton.dataset.pilihProduk;

        const produk =
          AppState.produkCache.find(
            item =>
              String(
                item.Kode_Obat ??
                item.kodeObat
              ) === String(kode)
          );

        if (produk) {
          tambahKeKeranjang(produk);
        }
      }
    }
  );

  const profileButton =
    document.getElementById(
      'btn-profil'
    );

  if (profileButton) {
    profileButton.addEventListener(
      'click',
      () => {
        if (AppState.user) {
          navigasiKe('profil');
        }
      }
    );
  }

  const backButton =
    document.getElementById('btn-back');

  if (backButton) {
    backButton.addEventListener(
      'click',
      () => history.back()
    );
  }
}

// =====================================================================
// 22. MASUK KE APLIKASI
// =====================================================================

async function masukKeAplikasi(user) {
  const loginScreen =
    document.getElementById(
      'login-screen'
    );

  const mainShell =
    document.getElementById(
      'main-shell'
    );

  if (loginScreen) {
    loginScreen.classList.add('hidden');
  }

  if (mainShell) {
    mainShell.classList.remove('hidden');
  }

  const topbarUser =
    document.getElementById(
      'topbar-user'
    );

  if (topbarUser) {
    topbarUser.textContent =
      `${user.nama || user.username || '-'} • ${user.role || '-'}`;
  }

  if (AppState.isOnline) {
    try {
      AppState.pengaturan =
        await apiGet(
          'getPengaturan',
          {},
          {
            cache: true,
            maxAge: 10 * 60 * 1000
          }
        );
    } catch (error) {
      console.warn(
        '[PENGATURAN]',
        error
      );
    }

    await segarkanSesiShift();
  } else {
    const cached =
      await bacaCache(
        'getPengaturan',
        {},
        Infinity
      );

    if (cached) {
      AppState.pengaturan = cached;
    }
  }

  const title =
    document.getElementById(
      'topbar-title'
    );

  if (title) {
    title.textContent =
      AppState.pengaturan.nama_apotek ||
      'APOTEK ANA FARMA';
  }

  resetAutoLogoutTimer();
  renderBottomNav();

  navigasiKe(
    location.hash
      ? location.hash.slice(1)
      : 'dashboard',
    false
  );
}

// =====================================================================
// 23. FORM LOGIN
// =====================================================================

function pasangFormLogin() {
  const form =
    document.getElementById(
      'login-form'
    );

  if (!form) return;

  form.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const button =
        document.getElementById(
          'login-submit'
        );

      const errorEl =
        document.getElementById(
          'login-error'
        );

      const username =
        document.getElementById(
          'login-username'
        ).value.trim();

      const password =
        document.getElementById(
          'login-password'
        ).value;

      if (errorEl) {
        errorEl.classList.remove(
          'show'
        );
        errorEl.textContent = '';
      }

      if (!username || !password) {
        return;
      }

      button.disabled = true;
      button.textContent =
        'Memproses...';

      try {
        const user =
          await login(
            username,
            password
          );

        await masukKeAplikasi(user);
      } catch (error) {
        const message =
          error.message ===
          'KONFIGURASI_BELUM_SELESAI'
            ? 'API_URL belum dikonfigurasi.'
            : errorMessage(error);

        if (errorEl) {
          errorEl.textContent =
            message;
          errorEl.classList.add(
            'show'
          );
        }
      } finally {
        button.disabled = false;
        button.textContent = 'Masuk';
      }
    }
  );
}

// =====================================================================
// 24. INIT
// =====================================================================

async function initAplikasi() {
  try {
    await bukaDB();
  } catch (error) {
    console.error(
      '[INIT][IndexedDB]',
      error
    );
  }

  pasangLogoKeUI();
  pasangOnlineOfflineListener();
  pasangInstallPrompt();
  pasangServiceWorker();
  pasangFormLogin();
  pasangAutoLogout();
  pasangEventGlobal();
  mulaiSyncPeriodik();

  muatSesi();

  if (isApiBelumDikonfigurasi()) {
    sembunyikanSplash();

    const loginScreen =
      document.getElementById(
        'login-screen'
      );

    const errorEl =
      document.getElementById(
        'login-error'
      );

    if (loginScreen) {
      loginScreen.classList.remove(
        'hidden'
      );
    }

    if (errorEl) {
      errorEl.textContent =
        'Aplikasi belum dikonfigurasi. API_URL belum diisi.';
      errorEl.classList.add('show');
    }

    return;
  }

  if (AppState.user) {
    try {
      await masukKeAplikasi(
        AppState.user
      );
    } catch (error) {
      console.error(
        '[INIT][SESSION]',
        error
      );

      hapusSesi();

      const loginScreen =
        document.getElementById(
          'login-screen'
        );

      if (loginScreen) {
        loginScreen.classList.remove(
          'hidden'
        );
      }
    }
  } else {
    const loginScreen =
      document.getElementById(
        'login-screen'
      );

    if (loginScreen) {
      loginScreen.classList.remove(
        'hidden'
      );
    }
  }

  updateOfflineUI();
  sembunyikanSplash();

  if (AppState.isOnline) {
    syncOutbox();
  }
}

window.addEventListener(
  'error',
  event => {
    console.error(
      '[GLOBAL ERROR]',
      event.error || event.message
    );
  }
);

window.addEventListener(
  'unhandledrejection',
  event => {
    console.error(
      '[UNHANDLED PROMISE]',
      event.reason
    );
  }
);

document.addEventListener(
  'DOMContentLoaded',
  initAplikasi,
  {
    once: true
  }
);

// =====================================================================
// 25. DEBUG TERKONTROL
// =====================================================================

window.AnaFarmaDebug = {
  version: APP_VERSION,

  state() {
    return {
      online: AppState.isOnline,
      user: AppState.user,
      screen: AppState.currentScreen,
      cartItems: AppState.cart.length,
      syncRunning: AppState.syncRunning
    };
  },

  async outbox() {
    return ambilOutbox();
  },

  async cacheProduk() {
    return cekCacheProdukOffline();
  },

  sync() {
    return syncOutbox();
  },

  clearSession() {
    logout();
  }
};
