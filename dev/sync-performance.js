/* ANA FARMA DEV — SYNC PERFORMANCE
 * Optimizes synchronization bookkeeping only. No API contract or business rules changed.
 */
(function(){'use strict';
const VERSION='2026-08-31.2';
let uiTimer=0;
let lastCount=-1;
let countRunning=false;

function countStoreStatus(db,status){
  return new Promise((resolve,reject)=>{
    try{
      const tx=db.transaction('outbox','readonly');
      const idx=tx.objectStore('outbox').index('status');
      const req=idx.count(IDBKeyRange.only(status));
      req.onsuccess=()=>resolve(Number(req.result||0));
      req.onerror=()=>reject(req.error);
    }catch(e){reject(e)}
  });
}

async function fastOutboxCount(){
  try{
    if(typeof bukaDB!=='function') return null;
    const db=await bukaDB();
    const counts=await Promise.all(['pending','retry','syncing','failed'].map(s=>countStoreStatus(db,s)));
    return counts.reduce((a,b)=>a+b,0);
  }catch(e){console.warn('[SYNC COUNT]',e);return null}
}

async function fastUpdateOfflineUI(){
  const banner=document.getElementById('offline-banner');
  if(banner){
    banner.classList.toggle('show',!AppState.isOnline);
    banner.textContent=AppState.isOnline?'ONLINE':'OFFLINE — Transaksi baru akan disimpan di perangkat.';
  }
  if(countRunning)return;
  countRunning=true;
  try{
    const count=await fastOutboxCount();
    if(count===null)return;
    lastCount=count;
    document.querySelectorAll('[data-sync-count]').forEach(el=>{
      el.textContent=String(count);
      el.classList.toggle('hidden',count<=0);
    });
    document.querySelectorAll('[data-sync-status]').forEach(el=>{
      el.textContent=AppState.syncRunning?(count>0?`Menyinkronkan ${count} item…`:'Menyinkronkan…'):(count>0?`${count} item menunggu sinkronisasi`:'Sinkronisasi selesai');
    });
  }finally{countRunning=false}
}

function scheduleFastUI(){clearTimeout(uiTimer);uiTimer=setTimeout(fastUpdateOfflineUI,120)}

function install(){
  if(window.__ANA_FARMA_SYNC_PERF__)return;
  window.__ANA_FARMA_SYNC_PERF__=VERSION;
  if(typeof window.updateOfflineUI==='function')window.updateOfflineUI=fastUpdateOfflineUI;
  const originalSchedule=window.jadwalkanSync;
  if(typeof originalSchedule==='function')window.jadwalkanSync=function(delay=350){return originalSchedule(Math.min(Number(delay)||350,350));};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)fastUpdateOfflineUI()});
  window.addEventListener('online',scheduleFastUI);
  scheduleFastUI();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();