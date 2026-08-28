/*
 * APOTEK ANA FARMA — DEV NAVIGATION SHELL V19.0
 * Role + shift aware SPA navigation.
 * Owner: full access, primary dashboard action = Kelola Stok.
 * Pegawai: primary dashboard action = Transaksi, but MUST start shift first.
 */
(function(){
  'use strict';
  const VERSION='2026-08-28-DEV-NAV-19-0';
  const ROLE_OWNER='Owner', ROLE_PEGAWAI='Pegawai';
  const MARK='ana-farma-dev', TOPBAR_ID='dev-app-topbar', MENU_ID='dev-account-menu';
  const OPERATIONAL=['kasir','riwayat','pembelian','retur','opname','pelanggan'];
  const OWNER_SCREENS=['dashboard','kasir','stok','riwayat','pembelian','retur','pelanggan','supplier','laporan','opname','pengajuan','pengaturan','users','profil'];
  const EMPLOYEE_SCREENS=['dashboard','kasir','riwayat','pembelian','retur','pelanggan','opname','profil'];
  let originalSetScreen=null, installed=false, historyReady=false, lastUserKey=null, shiftRefreshKey=null;

  const state=()=>window.AppState||null;
  const user=()=>state()?.user||null;
  const isOwner=()=>String(user()?.role||'').trim().toLowerCase()==='owner';
  const isShiftActive=()=>{const s=user()?.shiftAktif; return !!(s && (s.status==='Aktif'||s.status==='active'||s.aktif===true));};
  const canWork=()=>isOwner()||isShiftActive();
  const allowed=()=>isOwner()?OWNER_SCREENS:EMPLOYEE_SCREENS;
  const shiftBlocked=screen=>!isOwner()&&!isShiftActive()&&OPERATIONAL.includes(screen);
  const valid=screen=>{let s=allowed().includes(screen)?screen:'dashboard';if(shiftBlocked(s))s='dashboard';return s;};
  const esc=v=>typeof window.escapeHtml==='function'?window.escapeHtml(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));

  function injectStyle(){
    if(document.getElementById('dev-shell-19-style'))return;
    const style=document.createElement('style');style.id='dev-shell-19-style';style.textContent=`
      #${TOPBAR_ID}{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;background:rgba(255,255,255,.95);backdrop-filter:blur(16px);border-bottom:1px solid rgba(20,35,38,.06);box-shadow:0 6px 24px rgba(20,35,38,.06)}
      #${TOPBAR_ID}.hidden{display:none!important}#${TOPBAR_ID} .dev-brand-emblem{width:38px;height:38px;object-fit:contain;flex-shrink:0}#${TOPBAR_ID} .dev-brand-text{flex:1;min-width:0;cursor:pointer}#${TOPBAR_ID} .dev-brand-text b{display:block;font-size:15px;font-weight:900;color:#0b6f68;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${TOPBAR_ID} .dev-brand-text span{display:block;font-size:11px;color:#68777a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}#${TOPBAR_ID} .dev-top-actions{display:flex;align-items:center;gap:7px}#${TOPBAR_ID} .dev-icon-btn{width:40px;height:40px;border:0;border-radius:50%;background:#eef3f2;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}#${TOPBAR_ID} .dev-back{display:none}.dev-back.show{display:flex!important}.dev-role{font-size:10px;font-weight:900;color:#0f8f83}
      #${MENU_ID}{position:fixed;right:12px;top:calc(64px + env(safe-area-inset-top));z-index:120;width:min(300px,calc(100vw - 24px));padding:8px;background:rgba(255,255,255,.97);backdrop-filter:blur(18px);border:1px solid rgba(20,35,38,.08);border-radius:17px;box-shadow:0 18px 45px rgba(20,35,38,.14);display:none}#${MENU_ID}.show{display:block}#${MENU_ID} .dev-account-head{padding:11px 10px 13px;border-bottom:1px solid #e3e9e8;margin-bottom:6px}#${MENU_ID} button{width:100%;display:flex;align-items:center;gap:9px;border:0;background:transparent;text-align:left;padding:11px 10px;border-radius:10px;font-size:13px;font-weight:750}#${MENU_ID} button:hover{background:#f4f8f7}.dev-danger{color:#dc2626!important}.dev-shift-lock{margin:8px 10px 10px;padding:9px 10px;border-radius:11px;background:#fff7e6;color:#8a5b00;font-size:11px;font-weight:750}
      @media(min-width:700px){#${TOPBAR_ID}{padding-left:24px;padding-right:24px}#${MENU_ID}{right:24px}}
    `;document.head.appendChild(style);
  }

  function ensureChrome(){
    const app=document.getElementById('app'), root=document.getElementById('screen-root');if(!app||!root)return false;
    let top=document.getElementById(TOPBAR_ID);
    if(!top){top=document.createElement('header');top.id=TOPBAR_ID;top.className='hidden';top.innerHTML=`<button class="dev-icon-btn dev-back" data-dev-shell="back" aria-label="Kembali">←</button><img class="dev-brand-emblem" src="icon-192.png" alt="Ana Farma" decoding="async"><div class="dev-brand-text" data-dev-shell="home"><b>APOTEK ANA FARMA</b><span data-dev-shell="user">-</span></div><div class="dev-top-actions"><button class="dev-icon-btn" data-dev-shell="profile" aria-label="Akun">♙</button></div>`;app.insertBefore(top,root);}
    let menu=document.getElementById(MENU_ID);
    if(!menu){menu=document.createElement('div');menu.id=MENU_ID;menu.innerHTML=`<div class="dev-account-head"><div style="font-size:14px;font-weight:900" data-dev-account="name">-</div><div style="font-size:11px;color:#68777a;margin-top:3px" data-dev-account="role">-</div></div><div class="dev-shift-lock hidden" data-dev-shift-lock>Shift belum dimulai. Mulai shift untuk membuka menu operasional.</div><button data-dev-menu="profil">♙ Profil</button><button data-dev-menu="pengaturan" data-owner-only="1">⚙ Pengaturan</button><button data-dev-menu="users" data-owner-only="1">♙ Manajemen Pengguna</button><button class="dev-danger" data-dev-menu="logout">↪ Keluar</button>`;document.body.appendChild(menu);}
    return true;
  }

  function renderChrome(){
    const top=document.getElementById(TOPBAR_ID), menu=document.getElementById(MENU_ID), nav=document.getElementById('bottom-nav'), u=user();if(!top)return;
    top.classList.toggle('hidden',!u);if(!u){menu?.classList.remove('show');nav?.classList.add('hidden');return;}
    const online=state()?.isOnline?'ONLINE':'OFFLINE', role=u.role||ROLE_PEGAWAI;
    const userEl=top.querySelector('[data-dev-shell="user"]');if(userEl)userEl.innerHTML=`${esc(u.nama||u.username||'Pengguna')} • <span class="dev-role">${esc(role)} • ${online}</span>`;
    menu?.querySelector('[data-dev-account="name"]')&&(menu.querySelector('[data-dev-account="name"]').textContent=u.nama||u.username||'Pengguna');
    menu?.querySelector('[data-dev-account="role"]')&&(menu.querySelector('[data-dev-account="role"]').textContent=`${role} • ${u.username||''}`);
    menu?.querySelector('[data-dev-shift-lock]')?.classList.toggle('hidden',canWork());
    menu?.querySelectorAll('[data-owner-only="1"]').forEach(el=>el.classList.toggle('hidden',!isOwner()));
    if(!nav)return;
    nav.classList.remove('hidden');
    let items=isOwner()?['dashboard','stok','kasir','laporan','profil']:canWork()?['kasir','riwayat','pembelian','retur','opname','pelanggan']:['dashboard','profil'];
    const current=valid(state()?.currentScreen||'dashboard');
    const labels={dashboard:'Beranda',stok:'Kelola Stok',kasir:'Transaksi',laporan:'Laporan',profil:'Profil',riwayat:'Riwayat',pembelian:'Pembelian',retur:'Retur',opname:'Opname',pelanggan:'Pelanggan'};
    const icons={dashboard:'⌂',stok:'▣',kasir:'▤',laporan:'◫',profil:'♙',riwayat:'◷',pembelian:'▱',retur:'↶',opname:'▤',pelanggan:'♧'};
    nav.innerHTML=items.map(k=>`<button class="nav-item ${current===k?'active':''}" data-action="navigate" data-screen="${k}" aria-label="${esc(labels[k])}"><span class="nav-icon">${icons[k]}</span><span>${esc(labels[k])}</span></button>`).join('');
    top.querySelector('[data-dev-shell="back"]')?.classList.toggle('show',current!=='dashboard');
  }

  async function refreshShift(){
    const u=user();if(!u||isOwner()||!state()?.isOnline||typeof window.apiGet!=='function')return;
    const key=String(u.idUser||u.username||'');if(shiftRefreshKey===key)return;shiftRefreshKey=key;
    try{const data=await window.apiGet('getShiftStatus',{idUser:u.idUser},{cache:false});u.shiftAktif=data&&data.status==='Aktif'?data:null;try{localStorage.setItem('anafarma_sesi_v2',JSON.stringify({user:u,savedAt:Date.now()}));}catch(_){}renderChrome();}
    catch(e){shiftRefreshKey=null;console.warn('[SHIFT REFRESH]',e);}
  }

  function initHistory(){if(historyReady)return;const initial=valid(state()?.currentScreen||'dashboard'),s=history.state;if(!s||s[MARK]!==true)history.replaceState({...(s||{}),[MARK]:true,screen:initial},'',`#${initial}`);historyReady=true;}

  function navigate(screen,push=true){
    if(!user())return;
    if(shiftBlocked(screen)){window.toast?.('Mulai shift terlebih dahulu sebelum menggunakan menu operasional.','warn');screen='dashboard';}
    const target=valid(screen);initHistory();const current=valid(state()?.currentScreen||'dashboard');
    if(push&&current!==target)history.pushState({[MARK]:true,screen:target},'',`#${target}`);
    if(typeof originalSetScreen==='function')originalSetScreen(target);
    if(state())state().currentScreen=target;renderChrome();
  }

  function onPop(event){if(!user())return;const target=event.state&&event.state[MARK]?event.state.screen:'dashboard';if(shiftBlocked(target)){window.toast?.('Mulai shift terlebih dahulu untuk membuka menu operasional.','warn');navigate('dashboard',false);return;}navigate(target,false);}

  function logout(){
    if(typeof window.logout==='function')window.logout();
    else{localStorage.removeItem('anafarma_sesi_v2');if(state()){state().user=null;state().cart=[];state().cartCustomer=null;}window.tampilkanLogin?.();}
    history.replaceState({[MARK]:true,screen:'login'},'','#login');historyReady=false;renderChrome();
  }

  function installEvents(){
    document.addEventListener('click',event=>{
      const target=event.target.closest?.('[data-action="navigate"],[data-nav]');
      if(target){event.preventDefault();event.stopImmediatePropagation();navigate(target.dataset.screen||target.dataset.nav,true);return;}
      const back=event.target.closest?.('[data-dev-shell="back"]');
      if(back){event.preventDefault();event.stopImmediatePropagation();if(state()?.currentScreen&&state().currentScreen!=='dashboard')history.back();else navigate('dashboard',false);return;}
      const profile=event.target.closest?.('[data-dev-shell="profile"]');if(profile){event.preventDefault();event.stopImmediatePropagation();document.getElementById(MENU_ID)?.classList.toggle('show');return;}
      const home=event.target.closest?.('[data-dev-shell="home"]');if(home){event.preventDefault();navigate('dashboard',true);return;}
      const item=event.target.closest?.('[data-dev-menu]');if(item){event.preventDefault();document.getElementById(MENU_ID)?.classList.remove('show');const a=item.dataset.devMenu;if(a==='logout')logout();else navigate(a,true);return;}
      const menu=document.getElementById(MENU_ID),profileBtn=document.querySelector(`#${TOPBAR_ID} [data-dev-shell="profile"]`);if(menu?.classList.contains('show')&&!menu.contains(event.target)&&!profileBtn?.contains(event.target))menu.classList.remove('show');
    },true);
    window.addEventListener('popstate',onPop);window.addEventListener('online',()=>{shiftRefreshKey=null;renderChrome();refreshShift();});window.addEventListener('offline',renderChrome);
  }

  function monitor(){const check=()=>{const u=user(),key=u?String(u.idUser||u.username||u.nama||'logged'):null;if(key!==lastUserKey){lastUserKey=key;shiftRefreshKey=null;if(u){initHistory();navigate(valid(state()?.currentScreen||'dashboard'),false);refreshShift();}else{historyReady=false;document.getElementById(MENU_ID)?.classList.remove('show');renderChrome();}}};setInterval(check,1000);check();}

  function init(){if(installed)return;installed=true;injectStyle();if(!ensureChrome()){installed=false;setTimeout(init,100);return;}originalSetScreen=window.setScreen;if(typeof originalSetScreen==='function')window.setScreen=screen=>navigate(screen,true);installEvents();monitor();window.__ANA_FARMA_DEV_NAV_VERSION__=VERSION;console.info('[DEV NAV]',VERSION);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
