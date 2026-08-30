/*
 * ANA FARMA DEV — Human-first operational UI system
 * Visual-only layer. Intentionally avoids changing business logic, data flow,
 * authentication, API calls, routing rules, or production files.
 * Version: 2026-08-31
 */
(function(){
  'use strict';
  const VERSION='2026-08-31-DEV-UI-1-0';
  const STYLE_ID='ana-dev-ui-system';

  const CSS=`
  :root{
    --primary:#0b766d;
    --primary-dark:#075e57;
    --primary-light:#e6f3f1;
    --bg:#f7f8f7;
    --card:#ffffff;
    --text:#172325;
    --text-dim:#617073;
    --text-faint:#8a989a;
    --border:#dce4e2;
    --border-strong:#c7d3d0;
    --radius:8px;
    --radius-sm:6px;
    --shadow:none;
    --shadow-lg:0 12px 30px rgba(18,35,38,.10);
  }

  html,body{
    background:var(--bg)!important;
    color:var(--text)!important;
    font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif!important;
  }
  body{font-size:14px!important;line-height:1.45!important;}
  #app{background:transparent!important;}
  #screen-root{padding-bottom:calc(68px + var(--safe-bottom))!important;}
  .screen{min-height:100dvh!important;}
  .container{max-width:1180px!important;padding:20px 18px 28px!important;}

  /* Remove the visual fingerprints of generic AI dashboard templates. */
  .card,.stat-card,.list-item,.menu-item{
    background:#fff!important;
    border:1px solid var(--border)!important;
    border-radius:var(--radius)!important;
    box-shadow:none!important;
  }
  .card{padding:16px!important;margin-bottom:14px!important;}
  .stat-card{padding:15px!important;}
  .grid-2,.grid-3,.menu-grid{gap:10px!important;}

  .menu-item{
    min-height:88px!important;
    padding:13px 10px!important;
    transition:border-color .12s ease,background .12s ease!important;
  }
  .menu-item:hover,.menu-item:focus-visible{
    transform:none!important;
    background:#f7faf9!important;
    border-color:#a9c9c4!important;
    box-shadow:none!important;
  }
  .menu-item-unggulan{
    background:var(--primary)!important;
    color:#fff!important;
    min-height:58px!important;
    border-color:var(--primary)!important;
  }
  .menu-icon{font-size:21px!important;}
  .menu-label{font-size:12px!important;font-weight:750!important;}
  .menu-item-unggulan .menu-label{font-size:14px!important;}

  .btn{
    border-radius:var(--radius-sm)!important;
    min-height:40px!important;
    padding:10px 14px!important;
    font-weight:700!important;
    box-shadow:none!important;
    background-image:none!important;
  }
  .btn-primary{background:var(--primary)!important;color:#fff!important;}
  .btn-primary:hover,.btn-primary:focus-visible{background:var(--primary-dark)!important;}
  .btn-outline{background:#fff!important;border:1px solid #9fbcb8!important;color:var(--primary-dark)!important;}
  .btn-secondary{background:#eef2f1!important;color:#263638!important;}
  .btn-danger{background:#c92f2f!important;}
  .btn-sm{min-height:34px!important;padding:7px 10px!important;}

  .form-group{margin-bottom:14px!important;}
  .form-group label{font-size:12px!important;font-weight:700!important;color:#46575a!important;}
  .form-group input,.form-group select,.form-group textarea{
    border:1px solid var(--border-strong)!important;
    border-radius:var(--radius-sm)!important;
    padding:10px 11px!important;
    box-shadow:none!important;
    background:#fff!important;
  }
  .form-group input:focus,.form-group select:focus,.form-group textarea:focus{
    border-color:var(--primary)!important;
    box-shadow:0 0 0 3px rgba(11,118,109,.10)!important;
  }
  .search-bar{
    border:1px solid var(--border-strong)!important;
    border-radius:var(--radius-sm)!important;
    background:#fff!important;
    box-shadow:none!important;
    margin-bottom:10px!important;
  }

  .section-title{
    color:#506164!important;
    font-size:11px!important;
    font-weight:800!important;
    letter-spacing:.07em!important;
    margin:22px 2px 8px!important;
  }
  .stat-label{font-size:11px!important;font-weight:700!important;}
  .stat-value{font-size:20px!important;font-weight:800!important;}
  .list-item{padding:12px!important;margin-bottom:6px!important;}
  .li-title{font-weight:750!important;}
  .pill{border-radius:6px!important;padding:3px 7px!important;font-size:10px!important;}

  /* Operational data tables: density and scanability over decoration. */
  table{width:100%;border-collapse:separate!important;border-spacing:0!important;background:#fff!important;}
  thead th{
    background:#f4f7f6!important;
    color:#526265!important;
    font-size:11px!important;
    font-weight:800!important;
    text-transform:none!important;
    letter-spacing:.01em!important;
    border-bottom:1px solid var(--border)!important;
    padding:9px 10px!important;
  }
  tbody td{
    border-bottom:1px solid #edf1f0!important;
    padding:9px 10px!important;
    font-size:13px!important;
    vertical-align:middle!important;
  }
  tbody tr:last-child td{border-bottom:0!important;}
  tbody tr:hover td{background:#fafcfb!important;}

  /* Navigation: quiet, solid, unmistakably app-like. */
  #dev-app-topbar{
    background:#fff!important;
    backdrop-filter:none!important;
    border-bottom:1px solid var(--border)!important;
    box-shadow:none!important;
    padding-top:calc(8px + env(safe-area-inset-top))!important;
    padding-bottom:8px!important;
  }
  #dev-app-topbar .dev-brand-emblem{width:34px!important;height:34px!important;}
  #dev-app-topbar .dev-brand-text b{font-size:14px!important;color:#17423e!important;}
  #dev-app-topbar .dev-brand-text span{font-size:10px!important;color:#6b797b!important;}
  #dev-app-topbar .dev-icon-btn{
    width:36px!important;height:36px!important;
    border-radius:var(--radius-sm)!important;
    background:#f0f4f3!important;
    font-size:17px!important;
  }
  #dev-account-menu{
    background:#fff!important;
    backdrop-filter:none!important;
    border:1px solid var(--border)!important;
    border-radius:10px!important;
    box-shadow:var(--shadow-lg)!important;
  }
  #dev-account-menu button{border-radius:6px!important;}
  #dev-account-menu button:hover{background:#f3f7f6!important;}

  .bottomnav{
    background:#fff!important;
    backdrop-filter:none!important;
    border-top:1px solid var(--border)!important;
    box-shadow:none!important;
  }
  .nav-item{min-height:58px!important;font-size:10px!important;font-weight:700!important;}
  .nav-item.active{color:var(--primary)!important;}
  .nav-icon{font-size:18px!important;}

  /* Modals should feel like focused work surfaces, not marketing cards. */
  .modal-overlay{background:rgba(20,31,33,.42)!important;backdrop-filter:none!important;}
  .modal-sheet,.modal-center{
    border-radius:12px!important;
    box-shadow:0 20px 55px rgba(16,30,32,.18)!important;
  }
  .modal-sheet{max-height:92vh!important;}
  .modal-header{padding:13px 15px!important;}
  .modal-body{padding:15px!important;}
  .modal-close{border-radius:6px!important;width:32px!important;height:32px!important;}

  #login-screen{
    background:#f7f8f7!important;
    padding:20px!important;
  }
  .login-box{width:min(100%,380px)!important;}
  .login-logo{width:76px!important;height:76px!important;filter:none!important;margin-bottom:12px!important;}
  .login-title{font-size:22px!important;color:#173f3b!important;letter-spacing:-.015em!important;}
  .login-sub{font-size:12px!important;margin:4px 0 18px!important;}
  .login-card{
    background:#fff!important;
    border:1px solid var(--border)!important;
    border-radius:10px!important;
    box-shadow:none!important;
    backdrop-filter:none!important;
    padding:18px!important;
  }

  #splash{background:#fff!important;}
  .splash-logo{width:92px!important;height:92px!important;filter:none!important;}
  .splash-title{font-size:18px!important;color:#17423e!important;}
  .splash-sub{font-size:10px!important;letter-spacing:.12em!important;}
  .splash-dots{display:none!important;}

  .offline-banner{background:#9e2525!important;padding:6px 10px!important;font-size:11px!important;}
  #toast-container{align-items:flex-end!important;left:auto!important;right:12px!important;width:min(92vw,380px)!important;}
  .toast{border-radius:7px!important;box-shadow:0 8px 24px rgba(20,35,38,.16)!important;padding:9px 12px!important;font-size:12px!important;}

  .empty-state{padding:34px 18px!important;}
  .empty-icon{font-size:28px!important;}

  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{
    outline:2px solid rgba(11,118,109,.55)!important;
    outline-offset:2px!important;
  }

  @media(min-width:700px){
    .container{padding:24px 30px 36px!important;}
    .grid-2{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
    .grid-3{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
  }
  @media(max-width:699px){
    .container{padding-left:14px!important;padding-right:14px!important;}
    .grid-3{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
  }
  @media(prefers-reduced-motion:reduce){
    *,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important;}
  }
  `;

  function install(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=CSS;
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-ana-ui','human-first');
    document.body.classList.add('ana-ui-polished');
    window.__ANA_FARMA_DEV_UI_VERSION__=VERSION;
    console.info('[DEV UI]',VERSION);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
