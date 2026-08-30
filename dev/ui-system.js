/*
 * ANA FARMA DEV — PROFESSIONAL PHARMACY UI SYSTEM
 * Visual/interaction presentation layer for /dev only.
 * No API, auth, routing, storage, stock logic, or production files are touched.
 * Version: 2026-08-31.2
 */
(function(){
  'use strict';
  const VERSION='2026-08-31-DEV-PRO-UI-2-0';
  const STYLE_ID='ana-dev-ui-system';

  const CSS=`
  :root{
    --primary:#0b766d;--primary-dark:#075e57;--primary-soft:#e8f3f1;
    --bg:#f6f8f7;--surface:#fff;--surface-subtle:#f1f5f4;
    --text:#172325;--text-2:#4f6062;--text-3:#7d8b8d;
    --border:#d8e2df;--border-strong:#bdceca;
    --danger:#b52d2d;--danger-soft:#fbeaea;--warning:#a96800;--warning-soft:#fff4dc;
    --success:#18794e;--success-soft:#e8f5ee;--info:#245ea8;--info-soft:#eaf1fb;
    --radius:7px;--radius-sm:5px;--safe-top:env(safe-area-inset-top);--safe-bottom:env(safe-area-inset-bottom);
  }
  html,body{background:var(--bg)!important;color:var(--text)!important;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif!important;font-size:14px!important;line-height:1.45!important}
  body{min-height:100dvh!important}*{box-sizing:border-box!important;-webkit-tap-highlight-color:transparent}h1,h2,h3,h4,h5,p{margin:0}button,input,select,textarea{font:inherit!important;color:inherit}
  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid rgba(11,118,109,.55)!important;outline-offset:2px!important}
  #app,#screen-root{background:transparent!important}.screen{min-height:100dvh!important}.container{max-width:1240px!important;padding:20px 18px 32px!important;margin:auto}
  .card,.stat-card,.list-item,.menu-item{background:var(--surface)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important;box-shadow:none!important}
  .card{padding:16px!important;margin-bottom:12px!important}.stat-card{padding:14px!important}.grid-2,.grid-3,.menu-grid{gap:9px!important}
  .section-title{color:#536467!important;font-size:11px!important;font-weight:800!important;letter-spacing:.06em!important;text-transform:uppercase!important;margin:20px 2px 8px!important}
  .stat-label{font-size:11px!important;font-weight:700!important;color:var(--text-2)!important}.stat-value{font-size:20px!important;font-weight:800!important;margin-top:3px!important}
  .btn{border-radius:var(--radius-sm)!important;min-height:39px!important;padding:9px 13px!important;font-weight:700!important;box-shadow:none!important;background-image:none!important}.btn-primary{background:var(--primary)!important;color:#fff!important}.btn-primary:hover{background:var(--primary-dark)!important}.btn-outline{background:#fff!important;border:1px solid #9ebbb6!important;color:var(--primary-dark)!important}.btn-secondary{background:#edf2f1!important}.btn-danger{background:var(--danger)!important}.btn-sm{min-height:32px!important;padding:6px 9px!important}
  .btn-row{gap:7px!important}.form-group{margin-bottom:12px!important}.form-group label{font-size:12px!important;font-weight:700!important;color:var(--text-2)!important}.form-group input,.form-group select,.form-group textarea{border:1px solid var(--border-strong)!important;border-radius:var(--radius-sm)!important;padding:9px 10px!important;box-shadow:none!important;background:#fff!important}.form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:var(--primary)!important;box-shadow:0 0 0 3px rgba(11,118,109,.09)!important}
  .search-bar{border:1px solid var(--border-strong)!important;border-radius:var(--radius-sm)!important;background:#fff!important;box-shadow:none!important;padding:9px 10px!important;margin-bottom:9px!important}.search-bar input{font-size:14px!important}
  .list-item{padding:11px!important;margin-bottom:5px!important}.li-title{font-weight:750!important}.li-sub{font-size:11px!important;color:var(--text-3)!important}.li-value{font-size:14px!important;font-weight:800!important}
  .pill{border-radius:5px!important;padding:3px 6px!important;font-size:10px!important;font-weight:750!important}.pill-success{background:var(--success-soft)!important;color:var(--success)!important}.pill-warn{background:var(--warning-soft)!important;color:var(--warning)!important}.pill-danger{background:var(--danger-soft)!important;color:var(--danger)!important}
  table{width:100%!important;border-collapse:separate!important;border-spacing:0!important;background:#fff!important;border:1px solid var(--border)!important;border-radius:7px!important;overflow:hidden!important}thead th{position:sticky!important;top:0!important;background:#f1f5f4!important;color:#526265!important;font-size:11px!important;font-weight:800!important;text-align:left!important;border-bottom:1px solid var(--border)!important;padding:9px 10px!important;white-space:nowrap!important}tbody td{border-bottom:1px solid #edf1f0!important;padding:9px 10px!important;font-size:12.5px!important;vertical-align:middle!important}tbody tr:last-child td{border-bottom:0!important}tbody tr:hover td{background:#fafcfb!important}
  .menu-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.menu-item{min-height:80px!important;padding:12px 9px!important;transition:background .12s,border-color .12s!important}.menu-item:hover{transform:none!important;background:#f7faf9!important;border-color:#aac6c1!important}.menu-item-unggulan{background:var(--primary)!important;color:#fff!important;border-color:var(--primary)!important;min-height:56px!important}.menu-icon{font-size:20px!important}.menu-label{font-size:11.5px!important;font-weight:750!important}.menu-item-unggulan .menu-label{font-size:14px!important}
  #dev-app-topbar{background:#fff!important;backdrop-filter:none!important;border-bottom:1px solid var(--border)!important;box-shadow:none!important;padding-top:calc(8px + var(--safe-top))!important;padding-bottom:8px!important}#dev-app-topbar .dev-brand-emblem{width:34px!important;height:34px!important}#dev-app-topbar .dev-brand-text b{font-size:14px!important;color:#17423e!important}#dev-app-topbar .dev-brand-text span{font-size:10px!important;color:var(--text-3)!important}#dev-app-topbar .dev-icon-btn{width:36px!important;height:36px!important;border-radius:var(--radius-sm)!important;background:#eff4f3!important}
  #dev-account-menu{background:#fff!important;backdrop-filter:none!important;border:1px solid var(--border)!important;border-radius:8px!important;box-shadow:0 18px 42px rgba(20,35,38,.15)!important}#dev-account-menu button{border-radius:5px!important}
  .bottomnav{background:#fff!important;backdrop-filter:none!important;border-top:1px solid var(--border)!important;box-shadow:none!important}.nav-item{min-height:57px!important;font-size:10px!important;font-weight:700!important}.nav-icon{font-size:18px!important}
  .modal-overlay{background:rgba(20,31,33,.43)!important;backdrop-filter:none!important}.modal-sheet,.modal-center{border-radius:10px!important;box-shadow:0 20px 55px rgba(16,30,32,.18)!important}.modal-sheet{max-height:92vh!important}.modal-header{padding:13px 15px!important}.modal-body{padding:15px!important}.modal-close{border-radius:5px!important;width:32px!important;height:32px!important}
  #login-screen{background:#f6f8f7!important}.login-logo{width:72px!important;height:72px!important;filter:none!important}.login-title{font-size:22px!important;color:#173f3b!important}.login-card{background:#fff!important;border:1px solid var(--border)!important;border-radius:9px!important;box-shadow:none!important;backdrop-filter:none!important;padding:18px!important}
  #splash{background:#fff!important}.splash-logo{width:92px!important;height:92px!important;filter:none!important}.splash-title{font-size:18px!important;color:#17423e!important}.splash-dots{display:none!important}
  #toast-container{left:auto!important;right:12px!important;width:min(92vw,390px)!important;align-items:flex-end!important}.toast{border-radius:6px!important;box-shadow:0 8px 24px rgba(20,35,38,.16)!important;padding:9px 12px!important;font-size:12px!important}
  .empty-state{padding:32px 18px!important}.empty-icon{font-size:26px!important}

  /* Professional page shell */
  .ana-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:2px 0 14px;border-bottom:1px solid var(--border);margin-bottom:14px}.ana-page-copy{min-width:0}.ana-page-title{font-size:21px;font-weight:800;letter-spacing:-.02em;color:#18302f}.ana-page-desc{font-size:12px;color:var(--text-3);margin-top:3px}.ana-page-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.ana-context{display:flex;gap:7px;flex-wrap:wrap;margin:-5px 0 13px}.ana-context span{font-size:10.5px;color:#526265;background:#eef3f2;border:1px solid #dce5e2;border-radius:5px;padding:4px 7px}.ana-kpi-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}.ana-kpi{background:#fff;border:1px solid var(--border);border-radius:7px;padding:11px 12px}.ana-kpi-label{font-size:10px;color:var(--text-3);font-weight:700}.ana-kpi-value{font-size:18px;font-weight:800;margin-top:2px}.ana-divider{height:1px;background:var(--border);margin:16px 0}.ana-table-wrap{overflow:auto;border-radius:7px}.ana-note{font-size:11px;color:var(--text-3);margin-top:7px}.ana-command{position:fixed;inset:0;z-index:500;background:rgba(20,31,33,.38);display:none;align-items:flex-start;justify-content:center;padding:10vh 14px}.ana-command.show{display:flex}.ana-command-box{width:min(620px,100%);background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 20px 55px rgba(16,30,32,.22);overflow:hidden}.ana-command-input{width:100%;border:0;border-bottom:1px solid var(--border);padding:14px 15px;outline:0;font-size:15px!important}.ana-command-list{max-height:52vh;overflow:auto}.ana-command-item{display:flex;align-items:center;justify-content:space-between;width:100%;border:0;background:#fff;padding:11px 14px;text-align:left}.ana-command-item:hover,.ana-command-item:focus{background:#f4f7f6;outline:0}.ana-command-key{font-size:10px;color:var(--text-3)}
  .ana-risk{border-left:3px solid var(--warning)!important;background:#fffaf0!important}.ana-critical{border-left:3px solid var(--danger)!important;background:#fff8f8!important}.ana-ok{border-left:3px solid var(--success)!important}.ana-muted{color:var(--text-3)!important}.ana-sticky-toolbar{position:sticky;top:calc(51px + var(--safe-top));z-index:20;background:rgba(246,248,247,.97);padding:8px 0;border-bottom:1px solid var(--border)}
  @media(max-width:699px){.container{padding:16px 13px 28px!important}.ana-page-head{display:block}.ana-page-actions{justify-content:flex-start;margin-top:10px}.ana-kpi-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.ana-sticky-toolbar{top:calc(51px + var(--safe-top))}.menu-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.menu-item-unggulan{grid-column:1/-1!important}}
  @media(min-width:700px){.container{padding:24px 30px 36px!important}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))!important}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
  `;

  const PAGES={
    dashboard:['Beranda','Ringkasan operasional apotek','Pantau penjualan, stok, shift, dan pekerjaan yang perlu ditindaklanjuti.'],
    kasir:['Transaksi','Penjualan & pelayanan pasien','Kerjakan transaksi dengan cepat, jelas, dan minim langkah.'],
    stok:['Stok Obat','Persediaan & lokasi penyimpanan','Cari, periksa, dan kendalikan stok, rak, minimum stok, dan kedaluwarsa.'],
    riwayat:['Riwayat Transaksi','Audit transaksi penjualan','Telusuri transaksi berdasarkan waktu, pengguna, dan status.'],
    pembelian:['Pembelian','Pengadaan persediaan','Kelola kebutuhan pembelian, pemasok, penerimaan, dan status pengadaan.'],
    retur:['Retur','Pengembalian barang','Kelola retur dengan alasan dan jejak perubahan yang jelas.'],
    pelanggan:['Pelanggan','Data pelanggan','Kelola data pelanggan secara ringkas dan mudah dicari.'],
    supplier:['Supplier','Data pemasok','Kelola pemasok dan informasi pengadaan.'],
    laporan:['Laporan','Analisis operasional','Gunakan laporan untuk keputusan, bukan sekadar tampilan angka.'],
    opname:['Stok Opname','Pemeriksaan persediaan fisik','Bandingkan stok sistem dengan stok fisik dan tindak lanjuti selisih.'],
    pengajuan:['Pengajuan','Persetujuan pekerjaan','Tinjau pekerjaan yang membutuhkan keputusan pemilik.'],
    pengaturan:['Pengaturan','Konfigurasi aplikasi','Kelola pengaturan tanpa mengganggu alur kerja harian.'],
    users:['Pengguna','Akun & hak akses','Kelola pengguna, peran, dan akses secara terkontrol.'],
    profil:['Profil','Akun saya','Informasi akun, status sesi, dan preferensi pengguna.']
  };

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=CSS;document.head.appendChild(style);
  }
  function screen(){return document.querySelector('.screen.active')?.dataset.screen||window.AppState?.currentScreen||'dashboard';}
  function rootFor(){return document.querySelector('.screen.active .container');}
  function hasPageHead(root){return !!root?.querySelector(':scope > .ana-page-head');}
  function addPageHead(){
    const root=rootFor(), key=screen(), meta=PAGES[key];
    if(!root||!meta||key==='login'||hasPageHead(root)) return;
    const head=document.createElement('div');head.className='ana-page-head';head.innerHTML=`<div class="ana-page-copy"><div class="ana-page-title">${meta[0]}</div><div class="ana-page-desc">${meta[2]}</div></div><div class="ana-page-actions"><span class="ana-context-status">${navigator.onLine===false?'OFFLINE':'ONLINE'}</span></div>`;
    root.prepend(head);
    const status=head.querySelector('.ana-context-status');status.className='ana-context-status';status.style.cssText='font-size:10.5px;font-weight:700;padding:6px 8px;border:1px solid var(--border);border-radius:5px;color:var(--text-2);background:#f4f7f6';
  }
  function improveTables(){document.querySelectorAll('.screen.active table').forEach(t=>{if(t.parentElement?.classList.contains('ana-table-wrap'))return;const w=document.createElement('div');w.className='ana-table-wrap';t.parentNode.insertBefore(w,t);w.appendChild(t);});}
  function improveFormLabels(){document.querySelectorAll('.screen.active input,.screen.active select,.screen.active textarea').forEach(el=>{if(!el.getAttribute('aria-label')&&!el.id){const p=el.closest('.form-group');const l=p?.querySelector('label');if(l)el.setAttribute('aria-label',l.textContent.trim());}});}
  function markRisk(){document.querySelectorAll('.screen.active .pill-danger').forEach(p=>p.closest('.list-item,.card')?.classList.add('ana-critical'));document.querySelectorAll('.screen.active .pill-warn').forEach(p=>p.closest('.list-item,.card')?.classList.add('ana-risk'));}
  function addTableCounts(){document.querySelectorAll('.screen.active table').forEach(t=>{const wrap=t.parentElement;if(wrap.querySelector('.ana-note'))return;const n=t.tBodies?.[0]?.rows?.length||0;if(n) {const note=document.createElement('div');note.className='ana-note';note.textContent=`Menampilkan ${n.toLocaleString('id-ID')} baris pada tampilan ini.`;wrap.appendChild(note);}});}

  const COMMANDS=[
    ['Cari di halaman','/'],['Beranda','dashboard'],['Transaksi','kasir'],['Stok Obat','stok'],['Riwayat Transaksi','riwayat'],['Pembelian','pembelian'],['Retur','retur'],['Pelanggan','pelanggan'],['Supplier','supplier'],['Laporan','laporan'],['Stok Opname','opname'],['Pengguna','users'],['Pengaturan','pengaturan'],['Profil','profil']
  ];
  function navigateTo(s){if(typeof window.navigasiKe==='function')window.navigasiKe(s);else if(typeof window.setScreen==='function')window.setScreen(s);}
  function openCommand(){
    let overlay=document.querySelector('.ana-command');
    if(!overlay){overlay=document.createElement('div');overlay.className='ana-command';overlay.innerHTML='<div class="ana-command-box"><input class="ana-command-input" placeholder="Cari menu atau pekerjaan..." autocomplete="off"><div class="ana-command-list"></div></div>';document.body.appendChild(overlay);overlay.addEventListener('click',e=>{if(e.target===overlay)closeCommand();});}
    const input=overlay.querySelector('input'),list=overlay.querySelector('.ana-command-list');overlay.classList.add('show');
    const draw=()=>{const q=input.value.trim().toLowerCase();list.innerHTML=COMMANDS.filter(x=>!q||x[0].toLowerCase().includes(q)).map((x,i)=>`<button class="ana-command-item" data-cmd="${x[1]}"><span>${x[0]}</span><span class="ana-command-key">${i<1?'shortcut':''}</span></button>`).join('');list.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>{const s=b.dataset.cmd;if(s==='/'){closeCommand();document.querySelector('.screen.active input')?.focus();}else{closeCommand();navigateTo(s);}});};
    input.oninput=draw;draw();requestAnimationFrame(()=>input.focus());
  }
  function closeCommand(){document.querySelector('.ana-command')?.classList.remove('show');}
  function keyboard(e){
    if(e.key==='Escape'){closeCommand();return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand();return}
    if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement?.tagName||'')){e.preventDefault();const i=document.querySelector('.screen.active input');if(i)i.focus();else openCommand();}
  }
  function decorate(){
    const r=rootFor();if(!r)return;addPageHead();improveTables();improveFormLabels();markRisk();addTableCounts();
    document.body.dataset.anaScreen=screen();
  }
  function watch(){
    const target=document.getElementById('screen-root');if(!target)return setTimeout(watch,100);
    let timer;const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(decorate,30);});obs.observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('hashchange',()=>setTimeout(decorate,60));window.addEventListener('online',decorate);window.addEventListener('offline',decorate);document.addEventListener('keydown',keyboard,true);setTimeout(decorate,120);
  }
  function install(){installStyle();document.documentElement.setAttribute('data-ana-ui','professional-pharmacy');window.__ANA_FARMA_DEV_UI_VERSION__=VERSION;watch();console.info('[DEV UI]',VERSION);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
