/**
 * APOTEK ANA FARMA — DEV SERVICE WORKER V18.3
 *
 * Navigation: network-first with bounded timeout.
 * Runtime scripts: network-first with exact/base fallback.
 * Static assets: cache-first.
 * Apps Script: network-only, never cached.
 */
const CACHE_VERSION='ana-farma-dev-v18-3';
const NAV_TIMEOUT_MS=2500;
const SCRIPT_TIMEOUT_MS=2200;
const NEW_API_URL='https://script.google.com/macros/s/AKfycbxcAPMcgyu7eNyEISUvIJHs0grSIFJCJ_DOnM2wX_b2gWfWUn9VSUi4sF81X9ndz5JU/exec';
const LEGACY_API_URL='https://script.google.com/macros/s/AKfycby6e72NoImYbWFs-O9Okcj1-cAoh0BiOpnWuPOqVau-KTmmQ60tdKF32xtZrn_qhv7O/exec';
const LEGACY_API_ORIGIN_PATH=new URL(LEGACY_API_URL).origin+new URL(LEGACY_API_URL).pathname;
const APP_SHELL=['./','./index.html','./app.js','./logo_data.js','./api-context.js','./feature-compat.js','./features-runtime.js','./manifest.json','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];
function absolute(path){return new URL(path,self.registration.scope).href;}
function isAppsScript(url){return url.hostname==='script.google.com'||url.hostname==='script.googleusercontent.com'||url.hostname.endsWith('.googleusercontent.com');}
function sameOrigin(url){return url.origin===self.location.origin;}
function normalizeApiRequest(request){const incoming=new URL(request.url);if(incoming.origin+incoming.pathname!==LEGACY_API_ORIGIN_PATH)return request;const target=new URL(NEW_API_URL);target.search=incoming.search;return new Request(target.href,request);}
async function fetchTimeout(request,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(request,{signal:c.signal});}finally{clearTimeout(t);}}
async function cachePut(request,response){if(!response||!response.ok)return;try{const c=await caches.open(CACHE_VERSION);await c.put(request,response.clone());}catch(e){console.warn('[DEV SW CACHE]',e);}}
async function installShell(){const c=await caches.open(CACHE_VERSION);await Promise.all(APP_SHELL.map(async p=>{try{const r=await fetch(absolute(p),{cache:'no-store'});if(r.ok)await c.put(absolute(p),r.clone());}catch(e){console.warn('[DEV SW INSTALL]',p,e);}}));}
self.addEventListener('install',e=>e.waitUntil(installShell().then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ana-farma-dev-')&&k!==CACHE_VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function navigation(event){try{const r=await fetchTimeout(event.request,NAV_TIMEOUT_MS);if(r&&r.ok){event.waitUntil(cachePut(absolute('./index.html'),r));return r;}}catch(_){}return (await caches.match(absolute('./index.html')))||new Response('Offline - index.html belum tersedia.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
async function runtimeScript(event){const req=event.request;try{const r=await fetchTimeout(req,SCRIPT_TIMEOUT_MS);if(r&&r.ok){event.waitUntil(cachePut(req,r));const u=new URL(req.url);u.search='';event.waitUntil(cachePut(new Request(u.href),r));return r;}}catch(_){}const exact=await caches.match(req);if(exact)return exact;const u=new URL(req.url);u.search='';return (await caches.match(u.href))||new Response('',{status:504,statusText:'Offline resource unavailable'});}
async function staticAsset(event){const c=await caches.match(event.request,{ignoreSearch:true});if(c)return c;const r=await fetch(event.request);if(r&&r.ok)event.waitUntil(cachePut(event.request,r));return r;}
self.addEventListener('fetch',event=>{const req=event.request;const u=new URL(req.url);if((req.method==='GET'||req.method==='POST')&&isAppsScript(u)){const normalized=normalizeApiRequest(req);event.respondWith(fetch(normalized).catch(()=>new Response(JSON.stringify({ok:false,error:'Tidak ada koneksi internet.'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8'}})));return;}if(req.method!=='GET')return;if(!sameOrigin(u))return;if(req.mode==='navigate'){event.respondWith(navigation(event));return;}const p=u.pathname.replace(/\\+/g,'/');if(p.endsWith('/app.js')||p.endsWith('/logo_data.js')||p.endsWith('/api-context.js')||p.endsWith('/feature-compat.js')||p.endsWith('/features-runtime.js')){event.respondWith(runtimeScript(event));return;}event.respondWith(staticAsset(event).catch(async()=>{const f=await caches.match(absolute('./index.html'));return f||new Response('Offline - resource tidak tersedia.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}));});
