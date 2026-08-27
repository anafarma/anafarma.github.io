/*
 * APOTEK ANA FARMA — DEV PREMIUM UI
 * V18.8
 *
 * Presentation/UX layer only.
 * - Tidak membuat API, router, IndexedDB, atau state baru.
 * - Menjaga owner/pegawai separation di UI.
 * - Mengganti emoji UI dengan inline SVG yang ringan dan konsisten.
 * - Menambahkan visual premium, responsive chrome, skeleton/loading state,
 *   focus states, reduced-motion support, dan proteksi klik menu terlarang.
 */
(function () {
  'use strict';

  const VERSION = '2026-08-27-DEV-PREMIUM-18-8';
  const READY = '__ANA_FARMA_PREMIUM_UI_READY__';
  const ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    transaction: '<path d="M5 3h11a2 2 0 0 1 2 2v14H6a3 3 0 0 1 0-6h12"/><path d="M6 13h12M8 7h6M8 10h5"/>',
    stock: '<path d="m7 4 3-2 7 4-3 2zM4 7l6-3 10 5-6 3zM4 7v8l10 5v-8zM20 9v7"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5M12 7v5l3 2"/>',
    purchase: '<path d="M3 6h12v13H3zM7 6V4h7l3 2v13h-5"/><path d="M6 10h6M6 13h5M6 16h4"/>',
    return: '<path d="M9 7H4l4-4M4 7a8 8 0 1 1 0 10"/><path d="M13 17h7V9h-7"/>',
    customer: '<path d="M16 20v-1.5a4.5 4.5 0 0 0-9 0V20M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18 12a3 3 0 0 1 3 3v2M18 5a3 3 0 0 1 0 6"/>',
    report: '<path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V7M16 16v-8"/>',
    opname: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5M8 18h3"/>',
    settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.5h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h2.5v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.5H21a1.7 1.7 0 0 0-1.6 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<path d="M16 20v-1.5a4.5 4.5 0 0 0-9 0V20M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18 5a3 3 0 0 1 0 6M19 20v-1a4 4 0 0 0-2.5-3.7"/>',
    logout: '<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M15 16l4-4-4-4M19 12H9"/>',
    sync: '<path d="M20 7V3h-4M4 17v4h4M20 3a8 8 0 0 0-14 3M4 21a8 8 0 0 0 14-3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    cart: '<path d="M4 5h2l2 10h9l3-7H7M10 19a1 1 0 1 0 0 .01M17 19a1 1 0 1 0 0 .01"/>'
  };

  const EMOJI = {
    '⌂': 'home', '🏠': 'home', '🛒': 'cart', '🧾': 'transaction', '📦': 'stock', '💊': 'stock',
    '🕘': 'history', '📊': 'report', '🚚': 'purchase', '↩️': 'return', '↩': 'return', '👥': 'customer',
    '📋': 'opname', '⚙️': 'settings', '⚙': 'settings', '👤': 'user', '👨‍👩‍👧‍👦': 'users', '🔐': 'users',
    '🚪': 'logout', '🔄': 'sync', '🔎': 'search', '🔍': 'search', '←': 'back', '✕': 'close', '＋': 'plus', '+': 'plus'
  };

  function state() { return window.AppState || null; }
  function user() { return state() && state().user; }
  function isOwner() { return String(user()?.role || '').trim().toLowerCase() === 'owner'; }
  function svg(name, cls) {
    const body = ICONS[name] || ICONS.user;
    return `<svg class="af-icon ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  function injectStyle() {
    if (document.getElementById('ana-premium-style')) return;
    const style = document.createElement('style');
    style.id = 'ana-premium-style';
    style.textContent = `
      :root{--af-primary:#0f8f83;--af-primary-2:#0b6f68;--af-ink:#142326;--af-muted:#68777a;--af-line:#e3e9e8;--af-surface:#ffffff;--af-bg:#f4f8f7;--af-gold:#c9a24b;--af-shadow:0 10px 30px rgba(20,35,38,.08);--af-shadow-lg:0 18px 45px rgba(20,35,38,.13)}
      html,body{background:radial-gradient(circle at 10% 0%,rgba(15,143,131,.06),transparent 28%),radial-gradient(circle at 100% 20%,rgba(201,162,75,.08),transparent 26%),var(--af-bg)}
      #app{background:transparent}
      .af-icon{width:1.15em;height:1.15em;display:inline-block;vertical-align:-.18em;flex:none}
      .nav-icon .af-icon,.menu-icon .af-icon{width:22px;height:22px;vertical-align:middle}
      .btn .af-icon{width:18px;height:18px}
      .icon-btn .af-icon,.dev-icon-btn .af-icon{width:19px;height:19px}
      .screen.active{animation:afScreenIn .18s ease both}
      @keyframes afScreenIn{from{opacity:.2;transform:translateY(4px)}to{opacity:1;transform:none}}
      .card,.stat-card,.list-item,.menu-item{border:1px solid rgba(20,35,38,.055);box-shadow:var(--af-shadow)}
      .card{backdrop-filter:blur(6px)}
      .menu-item{transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
      .menu-item:hover{transform:translateY(-2px);box-shadow:var(--af-shadow-lg);border-color:rgba(15,143,131,.18)}
      .menu-item.menu-item-unggulan{background:linear-gradient(135deg,var(--af-primary),var(--af-primary-2));}
      .btn-primary{background:linear-gradient(135deg,var(--af-primary),var(--af-primary-2));box-shadow:0 7px 18px rgba(15,143,131,.18)}
      .btn-outline{border-color:rgba(15,143,131,.42);background:rgba(255,255,255,.9)}
      .search-bar{box-shadow:0 5px 18px rgba(20,35,38,.04)}
      .search-bar:focus-within{border-color:var(--af-primary);box-shadow:0 0 0 4px rgba(15,143,131,.09)}
      .form-group input:focus,.form-group select:focus,.form-group textarea:focus{box-shadow:0 0 0 4px rgba(15,143,131,.09)}
      #dev-app-topbar{background:rgba(255,255,255,.92)!important;backdrop-filter:blur(14px);border-bottom:1px solid rgba(20,35,38,.05);box-shadow:0 6px 24px rgba(20,35,38,.06)!important}
      #dev-app-topbar .dev-back.show{display:flex}
      #dev-app-topbar .dev-role{color:var(--af-primary)}
      #dev-account-menu{backdrop-filter:blur(16px);border-color:rgba(20,35,38,.08)!important;box-shadow:var(--af-shadow-lg)!important}
      #dev-account-menu button{display:flex;align-items:center;gap:9px}
      #bottom-nav{backdrop-filter:blur(14px);background:rgba(255,255,255,.94);box-shadow:0 -8px 28px rgba(20,35,38,.08)}
      #bottom-nav .nav-item{font-weight:650}
      #bottom-nav .nav-item.active{color:var(--af-primary)}
      .empty-state{min-height:130px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px}
      .af-skeleton{background:linear-gradient(90deg,#eef3f2 25%,#f8faf9 50%,#eef3f2 75%);background-size:200% 100%;animation:afShimmer 1.2s infinite;border-radius:10px}
      @keyframes afShimmer{to{background-position:-200% 0}}
      .af-denied{opacity:.45!important;pointer-events:none!important;filter:grayscale(1)}
      [data-owner-only="1"].hidden{display:none!important}
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
      @media(min-width:700px){.container{max-width:960px}.menu-grid{gap:14px}.menu-item{min-height:112px}}
    `;
    document.head.appendChild(style);
  }

  function replaceEmojiText(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const value = node.nodeValue || '';
      let changed = false;
      const frag = document.createDocumentFragment();
      let remaining = value;
      for (;;) {
        let found = null;
        for (const [token, name] of Object.entries(EMOJI)) {
          const idx = remaining.indexOf(token);
          if (idx >= 0 && (!found || idx < found.idx)) found = { token, name, idx };
        }
        if (!found) break;
        if (found.idx > 0) frag.appendChild(document.createTextNode(remaining.slice(0, found.idx)));
        const holder = document.createElement('span');
        holder.className = 'af-icon-holder';
        holder.innerHTML = svg(found.name);
        frag.appendChild(holder.firstElementChild);
        remaining = remaining.slice(found.idx + found.token.length);
        changed = true;
      }
      if (changed) {
        if (remaining) frag.appendChild(document.createTextNode(remaining));
        node.parentNode?.replaceChild(frag, node);
      }
    });
  }

  function setOwnerVisibility() {
    const owner = isOwner();
    document.querySelectorAll('[data-owner-only="1"]').forEach(el => el.classList.toggle('hidden', !owner));
    document.querySelectorAll('[data-screen="stok"], [data-screen-target="stok"], [data-nav="stok"]').forEach(el => {
      if (!owner) el.classList.add('hidden'); else el.classList.remove('hidden');
    });
    if (!owner) {
      document.querySelectorAll('[data-nav="pengaturan"],[data-nav="users"],[data-screen-target="pengaturan"],[data-screen-target="users"]').forEach(el => el.classList.add('hidden'));
    }
  }

  function normalizePrimaryAction() {
    const owner = isOwner();
    document.querySelectorAll('[data-nav="stok"], [data-screen="stok"]').forEach(el => {
      if (!owner) return;
      const label = el.querySelector('.menu-label') || el.querySelector('[data-label]');
      if (label) label.textContent = 'Kelola Stok';
    });
    document.querySelectorAll('[data-nav="kasir"], [data-screen="kasir"]').forEach(el => {
      const label = el.querySelector('.menu-label') || el.querySelector('[data-label]');
      if (label) label.textContent = 'Transaksi';
    });
  }

  let enhanceScheduled = false;
  function enhance() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    requestAnimationFrame(() => {
      enhanceScheduled = false;
      setOwnerVisibility();
      normalizePrimaryAction();
      replaceEmojiText(document.body);
      document.documentElement.dataset.afPremium = VERSION;
    });
  }

  function installGuards() {
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-screen],[data-nav]');
      if (!target || isOwner()) return;
      const screen = target.dataset.screen || target.dataset.nav;
      if (['stok','users','pengaturan','supplier','laporan','pengajuan'].includes(screen)) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof window.toast === 'function') window.toast('Menu ini hanya tersedia untuk Owner.', 'warn');
      }
    }, true);
  }

  function installObserver() {
    const observer = new MutationObserver(() => enhance());
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();
  }

  function init() {
    if (window[READY]) return;
    window[READY] = true;
    injectStyle();
    installGuards();
    installObserver();
    console.info('[DEV PREMIUM UI] installed', VERSION);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
