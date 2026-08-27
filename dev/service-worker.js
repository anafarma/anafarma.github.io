/** APOTEK ANA FARMA — DEV SERVICE WORKER V18 */
const CACHE_VERSION='ana-farma-dev-v18';
const NAV_TIMEOUT_MS=2500;
const SCRIPT_TIMEOUT_MS=2000;
const SHELL=['./','./index.html','./app.js','./logo_data.js','./runtime-hardening.js','./manifest.json','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];

function abs(p){return new URL(p,self.registration.scope).href;}
function appsScript(u){return u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com');}
function fetchTimeout(req,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);return fetch(req,{signal:c.signal}).finally(()=>clearTimeout(t));}
async function cachePut(req,res){if(!res||!res.ok)return;try{const c=await caches.open(CACHE_VERSION);await c.put(req,res.clone());}catch(e){console.warn('[DEV SW CACHE]',e);}}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(c=>c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ana-farma-')&&k!==CACHE_VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

async function navigationResponse(event){
  try{
    const res=await fetchTimeout(event.request,NAV_TIMEOUT_MS);
    if(res&&res.ok)event.waitUntil(cachePut(new Request(abs('./index.html')),res));
    return res;
  }catch(_){
    const cached=await caches.match(abs('./index.html'));
    return cached||new Response('Offline - index.html belum tersedia.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
}

async function scriptResponse(event){
  const req=event.request;
  const cached=await caches.match(req)||await caches.match(req,{ignoreSearch:true});
  const update=fetchTimeout(req,SCRIPT_TIMEOUT_MS).then(async res=>{if(res&&res.ok){event.waitUntil(cachePut(req,res));const u=new URL(req.url);u.search='';event.waitUntil(cachePut(new Request(u.toString()),res));}return res;}).catch(()=>null);
  if(cached){event.waitUntil(update);return cached;}
  const res=await update;
  return res||new Response('',{status:504,statusText:'Offline resource unavailable'});
}

async function staticResponse(event){
  const cached=await caches.match(event.request,{ignoreSearch:true});
  if(cached)return cached;
  const res=await fetch(event.request);
  if(res&&res.ok)event.waitUntil(cachePut(event.request,res));
  return res;
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const u=new URL(req.url);
  if(appsScript(u)){
    event.respondWith(fetch(req).catch(()=>new Response(JSON.stringify({ok:false,error:'Tidak ada koneksi internet.'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8'}})));
    return;
  }
  if(u.origin!==self.location.origin)return;

  if(req.mode==='navigate'){
    event.respondWith(navigationResponse(event));
    return;
  }

  const p=u.pathname.replace(/\/+/g,'/');
  if(p.endsWith('/app.js')||p.endsWith('/logo_data.js')||p.endsWith('/runtime-hardening.js')){
    event.respondWith(scriptResponse(event));
    return;
  }

  event.respondWith(staticResponse(event).catch(async()=>{
    const index=await caches.match(abs('./index.html'));
    return index||new Response('Offline - resource tidak tersedia.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }));
});
