/* ANA FARMA DEV — PROFESSIONAL PHARMACY UX LAYER
 * Presentation + interaction layer only. No API/data/business logic changes.
 * Applies to /dev only.
 */
(function(){
'use strict';
const ID='ana-professional-ux';
const CANONICAL_API='https://script.google.com/macros/s/AKfycbwIwBcjBfV64-W-nk4sjdvAnO-uKr3wV2Hm_NIliqqWAGRME-NAxoghuMz9-c4joXSUYQ/exec';
const LEGACY_API_PATHS=new Set([
'https://script.google.com/macros/s/AKfycbxsXBhnitGIOqd69aSx0c7ABZpsnwrnyCGtNa-OLjiWhrVt18KaIBSs8O4nSUf-uTcitA/exec',
'https://script.google.com/macros/s/AKfycby6e72NoImYbWFs-O9Okcj1-cAoh0BiOpnWuPOqVau-KTmmQ60tdKF32xtZrn_qhv7O/exec'
]);
/* The DEV frontend previously referenced an older Apps Script deployment.
 * Keep the application code untouched and route only those DEV requests to
 * the canonical DEV deployment already defined by the DEV service worker.
 */
if(!window.__ANA_FARMA_DEV_API_ROUTE__){
 const originalFetch=window.fetch.bind(window);
 window.fetch=async function(input,init){
   try{
     const raw=typeof input==='string'?input:input?.url;
     if(raw){
       const u=new URL(raw,location.href);
       const path=u.origin+u.pathname;
       if(LEGACY_API_PATHS.has(path)){
         const target=new URL(CANONICAL_API);
         target.search=u.search;
         if(typeof input==='string') input=target.href;
         else input=new Request(target.href,input);
       }
     }
   }catch(_){/* preserve original fetch behavior */}
   return originalFetch(input,init);
 };
 window.__ANA_FARMA_DEV_API_ROUTE__=CANONICAL_API;
}
const SCREENS={
 dashboard:{title:'Beranda',sub:'Ringkasan kondisi operasional apotek'},
 kasir:{title:'Transaksi',sub:'Penjualan dan pelayanan pelanggan'},
 stok:{title:'Kelola Stok',sub:'Persediaan, lokasi rak, minimum stok, dan kedaluwarsa'},
 riwayat:{title:'Riwayat Transaksi',sub:'Telusuri transaksi dan jejak aktivitas'},
 pembelian:{title:'Pembelian',sub:'Pengadaan dan penerimaan barang'},
 retur:{title:'Retur',sub:'Pengembalian barang dan koreksi transaksi'},
 pelanggan:{title:'Pelanggan',sub:'Data pelanggan dan riwayat layanan'},
 supplier:{title:'Supplier',sub:'Pemasok dan informasi pengadaan'},
 laporan:{title:'Laporan',sub:'Informasi untuk pemantauan dan pengambilan keputusan'},
 opname:{title:'Stok Opname',sub:'Bandingkan stok fisik dengan stok sistem'},
 pengajuan:{title:'Pengajuan',sub:'Permintaan yang menunggu pemeriksaan atau persetujuan'},
 pengaturan:{title:'Pengaturan',sub:'Konfigurasi sistem dan operasional'},
 users:{title:'Pengguna',sub:'Akun, peran, dan akses sistem'},
 profil:{title:'Profil',sub:'Informasi akun dan sesi aktif'}
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function css(){if(document.getElementById(ID+'-css'))return;const s=document.createElement('style');s.id=ID+'-css';s.textContent=`
.ana-pagehead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:4px 0 12px;border-bottom:1px solid #dce4e2;margin-bottom:14px}.ana-pagehead h1{font-size:21px;line-height:1.2;font-weight:850;letter-spacing:-.02em;margin:0}.ana-pagehead p{font-size:12px;color:#617073;margin:5px 0 0}.ana-breadcrumb{font-size:10px;color:#8a989a;font-weight:700;margin-bottom:5px}.ana-context{font-size:11px;color:#617073;background:#f2f6f5;border:1px solid #dce4e2;border-radius:6px;padding:7px 9px;white-space:nowrap}.ana-section{margin-top:18px}.ana-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.ana-section-head h2{font-size:13px;font-weight:800;margin:0}.ana-section-head span{font-size:10px;color:#8a989a}.ana-command{position:fixed;inset:0;z-index:500;background:rgba(20,31,33,.42);display:none;align-items:flex-start;justify-content:center;padding:12vh 16px}.ana-command.show{display:flex}.ana-command-box{width:min(620px,100%);background:#fff;border:1px solid #dce4e2;border-radius:10px;box-shadow:0 20px 55px rgba(16,30,32,.18);overflow:hidden}.ana-command-search{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid #dce4e2}.ana-command-search input{border:0;outline:0;flex:1;font-size:15px}.ana-command-list{max-height:55vh;overflow:auto;padding:6px}.ana-command-item{width:100%;display:flex;align-items:center;gap:10px;text-align:left;background:#fff;border:0;border-radius:6px;padding:10px;font-size:13px}.ana-command-item:hover,.ana-command-item.active{background:#f2f6f5}.ana-command-item small{margin-left:auto;color:#8a989a}.ana-kbd{font-size:10px;border:1px solid #c7d3d0;border-radius:4px;padding:2px 5px;color:#617073;background:#fafcfb}.ana-note{font-size:11px;color:#617073;padding:8px 10px;border-left:3px solid #9fbcb8;background:#f5f8f7;margin:8px 0}.ana-risk{border-left:3px solid #c92f2f!important}.ana-warn{border-left:3px solid #d28a00!important}.ana-ok{border-left:3px solid #23856f!important}@media(max-width:699px){.ana-pagehead{align-items:flex-start}.ana-context{display:none}.ana-pagehead h1{font-size:19px}.ana-command{padding-top:7vh}}
`;document.head.appendChild(s)}
function root(){return document.querySelector('.screen.active .container')||document.querySelector('.screen.active')}
function screen(){return window.AppState?.currentScreen||document.querySelector('.screen.active')?.dataset.screen||'dashboard'}
function addHeader(){const r=root(),k=screen(),m=SCREENS[k];if(!r||!m)return;if(r.querySelector(':scope > .ana-pagehead'))return;const h=document.createElement('div');h.className='ana-pagehead';h.innerHTML=`<div><div class="ana-breadcrumb">APOTEK ANA FARMA / ${esc(k.toUpperCase())}</div><h1>${esc(m.title)}</h1><p>${esc(m.sub)}</p></div><div class="ana-context">${navigator.onLine?'Terhubung':'Offline'}</div>`;r.prepend(h)}
function annotate(){const r=root();if(!r)return;const labels=[...r.querySelectorAll('.section-title')];labels.forEach(x=>{if(x.dataset.anaDone)return;x.dataset.anaDone='1';x.classList.add('ana-section')});r.querySelectorAll('input[placeholder]').forEach(x=>{if(/cari/i.test(x.placeholder)&&!x.getAttribute('aria-label'))x.setAttribute('aria-label',x.placeholder)});r.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='±')b.title='Sesuaikan stok';if(/hapus|delete/i.test(b.textContent))b.title='Tindakan ini menghapus data'});}
function palette(){if(document.getElementById('ana-command'))return;const w=document.createElement('div');w.id='ana-command';w.className='ana-command';w.innerHTML=`<div class="ana-command-box" role="dialog" aria-label="Navigasi cepat"><div class="ana-command-search"><span>⌕</span><input id="ana-command-q" placeholder="Cari menu atau pekerjaan…" autocomplete="off"><span class="ana-kbd">ESC</span></div><div class="ana-command-list" id="ana-command-list"></div></div>`;document.body.appendChild(w);const q=w.querySelector('#ana-command-q');const list=w.querySelector('#ana-command-list');const draw=()=>{const term=q.value.toLowerCase();const items=Object.entries(SCREENS).filter(([k,v])=>`${k} ${v.title} ${v.sub}`.toLowerCase().includes(term));list.innerHTML=items.map(([k,v])=>`<button class="ana-command-item" data-go="${esc(k)}"><span>${esc(v.title)}</span><small>${esc(v.sub)}</small></button>`).join('')||'<div class="ana-note">Tidak ada menu yang cocok.</div>';list.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{w.classList.remove('show');window.navigasiKe?.(b.dataset.go);});};q.oninput=draw;w.onclick=e=>{if(e.target===w)w.classList.remove('show')};draw()}
function openPalette(){palette();const w=document.getElementById('ana-command');w.classList.add('show');const q=document.getElementById('ana-command-q');q.value='';q.focus()}
function shortcuts(e){if(!window.AppState?.user)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return}if(e.key==='Escape'){document.getElementById('ana-command')?.classList.remove('show');return}if(e.key==='/'&&!/input|textarea|select/i.test(e.target.tagName)){e.preventDefault();const i=root()?.querySelector('input[placeholder*="Cari" i],input[type="search"]');i?.focus()}}
function observe(){const mo=new MutationObserver(()=>{addHeader();annotate()});mo.observe(document.getElementById('screen-root')||document.body,{childList:true,subtree:true});setInterval(()=>{addHeader();annotate()},800)}
function init(){css();palette();document.addEventListener('keydown',shortcuts,true);observe();addHeader();annotate();window.__ANA_FARMA_PRO_UX__='2026-08-31';}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
