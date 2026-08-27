/*
 * APOTEK ANA FARMA — DEV APP SHELL / NAVIGATION
 * V18.7
 * Menyatukan chrome aplikasi DEV dengan pola production tanpa mengubah backend.
 *
 * Aturan navigasi:
 * - Owner: Kelola Stok menjadi aksi utama.
 * - Pegawai: Transaksi menjadi aksi utama.
 * - Screen kasir tetap satu screen/fungsi untuk kedua role; label konsisten: Transaksi.
 * - Back memakai history SPA dan tidak keluar dari aplikasi secara tidak sengaja.
 */
(function () {
  'use strict';

  const ROLE_OWNER = 'Owner';
  const ROLE_PEGAWAI = 'Pegawai';
  const TOPBAR_ID = 'dev-app-topbar';
  const MENU_ID = 'dev-account-menu';
  const HISTORY_MARK = 'ana-farma-dev';
  let originalSetScreen = null;
  let initialized = false;
  let historyReady = false;
  let suppressHistory = false;
  let lastUserId = null;

  const NAV = {
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

  const OWNER_SCREENS = ['dashboard','kasir','stok','riwayat','pembelian','retur','pelanggan','supplier','laporan','opname','pengajuan','pengaturan','users','profil'];
  const PEGAWAI_SCREENS = ['dashboard','kasir','riwayat','pembelian','retur','pelanggan','opname','profil'];

  function user() { return window.AppState && window.AppState.user; }
  function role() { return user() && String(user().role || '').trim().toLowerCase() === 'owner' ? ROLE_OWNER : ROLE_PEGAWAI; }
  function isOwner() { return role() === ROLE_OWNER; }
  function allowedScreens() { return isOwner() ? OWNER_SCREENS : PEGAWAI_SCREENS; }
  function validScreen(name) { return allowedScreens().includes(name) ? name : 'dashboard'; }
  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function injectStyle() {
    if (document.getElementById('dev-app-shell-style')) return;
    const style = document.createElement('style');
    style.id = 'dev-app-shell-style';
    style.textContent = `
      #${TOPBAR_ID}{position:sticky;top:0;z-index:50;background:#fff;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.06)}
      #${TOPBAR_ID}.hidden{display:none!important}
      #${TOPBAR_ID} .dev-brand-emblem{width:34px;height:34px;object-fit:contain;flex-shrink:0}
      #${TOPBAR_ID} .dev-brand-text{flex:1;min-width:0;cursor:pointer}
      #${TOPBAR_ID} .dev-brand-text b{display:block;font-size:15px;color:#0f766e;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${TOPBAR_ID} .dev-brand-text span{display:block;font-size:11px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${TOPBAR_ID} .dev-top-actions{display:flex;align-items:center;gap:8px}
      #${TOPBAR_ID} .dev-icon-btn{width:38px;height:38px;border-radius:50%;border:none;background:#f4f6f7;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
      #${TOPBAR_ID} .dev-icon-btn:active{background:#e5e7eb}
      #${TOPBAR_ID} .dev-back{display:none}
      #${TOPBAR_ID} .dev-back.show{display:flex}
      #${TOPBAR_ID} .dev-role{font-size:10px;font-weight:800;letter-spacing:.2px;color:#0d9488;margin-left:4px}
      #${MENU_ID}{position:fixed;right:12px;top:calc(58px + env(safe-area-inset-top));z-index:120;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.16);width:min(280px,calc(100vw - 24px));padding:8px;display:none}
      #${MENU_ID}.show{display:block}
      #${MENU_ID} .dev-account-head{padding:10px 10px 12px;border-bottom:1px solid #e5e7eb;margin-bottom:6px}
      #${MENU_ID} .dev-account-name{font-weight:800;font-size:14px}
      #${MENU_ID} .dev-account-sub{font-size:11px;color:#6b7280;margin-top:3px}
      #${MENU_ID} button{width:100%;border:none;background:#fff;text-align:left;padding:11px 10px;border-radius:9px;font-weight:650;font-size:13px}
      #${MENU_ID} button:active{background:#f4f6f7}
      #${MENU_ID} .dev-danger{color:#dc2626}
      @media(min-width:700px){#${TOPBAR_ID}{padding-left:20px;padding-right:20px}#${MENU_ID}{right:20px}}
    `;
    document.head.appendChild(style);
  }

  function ensureChrome() {
    const app = document.getElementById('app');
    const screenRoot = document.getElementById('screen-root');
    if (!app || !screenRoot) return false;

    let topbar = document.getElementById(TOPBAR_ID);
    if (!topbar) {
      topbar = document.createElement('header');
      topbar.id = TOPBAR_ID;
      topbar.className = 'hidden';
      topbar.innerHTML = `
        <button class="dev-icon-btn dev-back" data-dev-shell="back" title="Kembali" aria-label="Kembali">←</button>
        <img class="dev-brand-emblem" src="icon-192.png" alt="Ana Farma" decoding="async">
        <div class="dev-brand-text" data-dev-shell="home">
          <b data-dev-shell="title">APOTEK ANA FARMA</b>
          <span data-dev-shell="user">-</span>
        </div>
        <div class="dev-top-actions">
          <button class="dev-icon-btn" data-dev-shell="profile" title="Akun" aria-label="Akun">👤</button>
        </div>`;
      app.insertBefore(topbar, screenRoot);
    }

    let menu = document.getElementById(MENU_ID);
    if (!menu) {
      menu = document.createElement('div');
      menu.id = MENU_ID;
      menu.innerHTML = `
        <div class="dev-account-head">
          <div class="dev-account-name" data-dev-account="name">-</div>
          <div class="dev-account-sub" data-dev-account="role">-</div>
        </div>
        <button data-dev-menu="profil">👤 Profil</button>
        <button data-dev-menu="pengaturan" data-owner-only="1">⚙️ Pengaturan</button>
        <button data-dev-menu="users" data-owner-only="1">🔐 Manajemen Pengguna</button>
        <button class="dev-danger" data-dev-menu="logout">🚪 Keluar</button>`;
      document.body.appendChild(menu);
    }
    return true;
  }

  function renderTopbar() {
    const topbar = document.getElementById(TOPBAR_ID);
    const menu = document.getElementById(MENU_ID);
    const u = user();
    if (!topbar) return;
    topbar.classList.toggle('hidden', !u);
    if (!u) { menu?.classList.remove('show'); return; }
    const userEl = topbar.querySelector('[data-dev-shell="user"]');
    const name = u.nama || u.username || 'Pengguna';
    const r = u.role || ROLE_PEGAWAI;
    if (userEl) userEl.innerHTML = `${esc(name)} • <span class="dev-role">${esc(r)}${window.AppState?.isOnline ? ' • ONLINE' : ' • OFFLINE'}</span>`;
    if (menu) {
      menu.querySelector('[data-dev-account="name"]').textContent = name;
      menu.querySelector('[data-dev-account="role"]').textContent = `${r} • ${u.username || ''}`;
      menu.querySelectorAll('[data-owner-only="1"]').forEach(el => el.classList.toggle('hidden', !isOwner()));
    }
  }

  function renderBottomNav() {
    const nav = document.getElementById('bottom-nav');
    const u = user();
    if (!nav) return;
    if (!u) { nav.classList.add('hidden'); return; }
    nav.classList.remove('hidden');

    const items = isOwner()
      ? ['dashboard','stok','kasir','laporan','profil']
      : ['kasir','riwayat','pembelian','retur','opname','pelanggan'];

    const current = validScreen(window.AppState.currentScreen || 'dashboard');
    nav.innerHTML = items.map(key => {
      const item = NAV[key];
      const label = isOwner() && key === 'stok' ? 'Kelola Stok' : item.label;
      const active = key === 'profil'
        ? ['profil','riwayat','pembelian','retur','pelanggan','supplier','opname','pengaturan','users','pengajuan'].includes(current)
        : current === key;
      return `<button class="nav-item ${active ? 'active' : ''}" data-action="navigate" data-screen="${key}"><span class="nav-icon">${item.icon}</span><span>${label}</span></button>`;
    }).join('');
  }

  function closeMenu() { document.getElementById(MENU_ID)?.classList.remove('show'); }

  function pushInitialHistory(screen) {
    if (historyReady) return;
    screen = validScreen(screen || 'dashboard');
    const state = history.state;
    if (!state || state[HISTORY_MARK] !== true) {
      history.replaceState({ ...(state || {}), [HISTORY_MARK]: true, screen }, '', `#${screen}`);
    } else if (!state.screen) {
      history.replaceState({ ...state, [HISTORY_MARK]: true, screen }, '', `#${screen}`);
    }
    historyReady = true;
  }

  function navigate(screen, push = true) {
    const target = validScreen(screen);
    if (!window.AppState || !window.AppState.user) return;
    closeMenu();
    pushInitialHistory(window.AppState.currentScreen || 'dashboard');
    if (push && !suppressHistory) {
      const current = window.AppState.currentScreen || 'dashboard';
      if (current !== target) history.pushState({ [HISTORY_MARK]: true, screen: target }, '', `#${target}`);
    }
    suppressHistory = true;
    try {
      if (typeof originalSetScreen === 'function') originalSetScreen(target);
    } finally { suppressHistory = false; }
    window.AppState.currentScreen = target;
    renderTopbar();
    renderBottomNav();
    const back = document.querySelector(`#${TOPBAR_ID} [data-dev-shell="back"]`);
    if (back) back.classList.toggle('show', target !== 'dashboard');
  }

  function onPopState(event) {
    if (!user()) return;
    const state = event.state;
    if (state && state[HISTORY_MARK]) {
      navigate(state.screen || 'dashboard', false);
      return;
    }
    history.pushState({ [HISTORY_MARK]: true, screen: 'dashboard' }, '', '#dashboard');
    navigate('dashboard', false);
  }

  function installRouter() {
    if (initialized) return;
    initialized = true;
    originalSetScreen = window.setScreen;
    if (typeof originalSetScreen === 'function') {
      window.setScreen = function (screen) { return navigate(validScreen(screen), true); };
    }

    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action="navigate"]');
      if (target) {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigate(target.dataset.screen, true);
        return;
      }

      const back = event.target.closest('[data-dev-shell="back"]');
      if (back) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.AppState?.currentScreen !== 'dashboard' && history.length > 1) history.back();
        else navigate('dashboard', false);
        return;
      }

      const profile = event.target.closest('[data-dev-shell="profile"]');
      if (profile) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const menu = document.getElementById(MENU_ID);
        renderTopbar();
        menu?.classList.toggle('show');
        return;
      }

      const home = event.target.closest('[data-dev-shell="home"]');
      if (home) {
        event.preventDefault();
        navigate('dashboard', true);
        return;
      }

      const menuItem = event.target.closest('[data-dev-menu]');
      if (menuItem) {
        event.preventDefault();
        const action = menuItem.dataset.devMenu;
        closeMenu();
        if (action === 'logout') {
          if (typeof window.logout === 'function') window.logout();
          else {
            localStorage.removeItem('anafarma_sesi_v2');
            if (window.AppState) {
              window.AppState.user = null;
              window.AppState.cart = [];
              window.AppState.cartCustomer = null;
            }
            if (typeof window.tampilkanLogin === 'function') window.tampilkanLogin();
            else location.reload();
          }
        } else {
          navigate(action, true);
        }
        return;
      }

      const menu = document.getElementById(MENU_ID);
      const profileButton = document.querySelector(`#${TOPBAR_ID} [data-dev-shell="profile"]`);
      if (menu?.classList.contains('show') && !menu.contains(event.target) && !profileButton?.contains(event.target)) closeMenu();
    }, true);

    window.addEventListener('popstate', onPopState);
    window.addEventListener('online', renderTopbar);
    window.addEventListener('offline', renderTopbar);
  }

  function monitorLoginState() {
    let last = null;
    setInterval(() => {
      const u = user();
      const id = u ? (u.idUser || u.username || 'logged') : null;
      if (id !== last) {
        last = id;
        renderTopbar();
        renderBottomNav();
        if (u) {
          if (!historyReady) pushInitialHistory(window.AppState.currentScreen || 'dashboard');
          navigate(window.AppState.currentScreen || 'dashboard', false);
        } else {
          historyReady = false;
          closeMenu();
        }
      } else if (u) {
        renderTopbar();
        renderBottomNav();
      }
    }, 250);
  }

  function init() {
    injectStyle();
    if (!ensureChrome()) return setTimeout(init, 100);
    installRouter();
    renderTopbar();
    renderBottomNav();
    monitorLoginState();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
