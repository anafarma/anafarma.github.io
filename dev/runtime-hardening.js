/* APOTEK ANA FARMA — DEV runtime hardening V18 */
(function(){
  'use strict';
  const VERSION='20260827-DEV-HARDENING-V18';
  const CART_PREFIX='anafarma_dev_cart_v18:';
  const CART_MAX_AGE=24*60*60*1000;
  let retryTimer=null;
  let retryAttempt=0;

  function state(){
    if(window.AppState) return window.AppState;
    try{return window.eval('AppState');}catch(_){return null;}
  }
  function uid(){const s=state();return s&&s.user?String(s.user.idUser||''):'';}
  function key(){const id=uid();return id?CART_PREFIX+id:'';}
  function readCart(){
    const k=key(); if(!k)return null;
    try{
      const v=JSON.parse(localStorage.getItem(k)||'null');
      if(!v||!Array.isArray(v.cart))return null;
      if(Date.now()-Number(v.savedAt||0)>CART_MAX_AGE){localStorage.removeItem(k);return null;}
      return v;
    }catch(e){console.warn('[DEV CART READ]',e);return null;}
  }
  function saveCart(){
    const s=state(),k=key(); if(!s||!k)return;
    try{localStorage.setItem(k,JSON.stringify({savedAt:Date.now(),cart:s.cart||[],customer:s.cartCustomer||null}));}
    catch(e){console.warn('[DEV CART WRITE]',e);}
  }
  function clearCart(){const k=key();if(!k)return;try{localStorage.removeItem(k);}catch(e){console.warn('[DEV CART CLEAR]',e);}}
  function restoreCart(){
    const s=state(),v=readCart();
    if(!s||!v)return false;
    s.cart=v.cart;s.cartCustomer=v.customer||null;
    if(typeof window.renderKasirCartStatus==='function')window.renderKasirCartStatus();
    window.dispatchEvent(new CustomEvent('anafarma:cart-restored',{detail:{count:v.cart.length,savedAt:v.savedAt}}));
    return true;
  }
  function wrap(name,after){
    const original=window[name];
    if(typeof original!=='function'||original.__anaFarmaDevWrapped)return;
    const wrapped=function(){const r=original.apply(this,arguments);try{after(r);}catch(e){console.warn('[DEV HARDENING]',name,e);}return r;};
    wrapped.__anaFarmaDevWrapped=true;wrapped.__anaFarmaDevOriginal=original;window[name]=wrapped;
  }
  function installHooks(){
    wrap('tambahKeKeranjang',saveCart);
    wrap('ubahQtyKeranjang',saveCart);
    wrap('kosongkanKeranjang',clearCart);
    const checkout=window.prosesCheckout;
    if(typeof checkout==='function'&&!checkout.__anaFarmaDevWrapped){
      const wrapped=async function(){const r=await checkout.apply(this,arguments);r&&r.offlinePending===true?saveCart():clearCart();return r;};
      wrapped.__anaFarmaDevWrapped=true;wrapped.__anaFarmaDevOriginal=checkout;window.prosesCheckout=wrapped;
    }
    const enter=window.masukKeAplikasi;
    if(typeof enter==='function'&&!enter.__anaFarmaDevWrapped){
      const wrapped=async function(){const r=await enter.apply(this,arguments);installHooks();restoreCart();return r;};
      wrapped.__anaFarmaDevWrapped=true;wrapped.__anaFarmaDevOriginal=enter;window.masukKeAplikasi=wrapped;
    }
  }
  function patchNetworkClassifier(){
    const original=window.isNetworkError;
    if(typeof original!=='function'||original.__anaFarmaDevClassification)return;
    const wrapped=function(error){
      if(!error)return !navigator.onLine;
      const kind=String(error.kind||'').toLowerCase(),status=Number(error.httpStatus||0);
      if(kind==='server'||kind==='config')return false;
      if(kind==='network'||kind==='timeout'||kind==='response-parse')return true;
      if(kind==='http')return status===408||status===425||status===429||status>=500;
      return original(error);
    };
    wrapped.__anaFarmaDevClassification=true;window.isNetworkError=wrapped;
  }
  function patchRetryClassifier(){
    const original=window.isRetryableTransportError;
    if(typeof original!=='function'||original.__anaFarmaDevClassification)return;
    const wrapped=function(error){
      if(!error)return !navigator.onLine;
      const kind=String(error.kind||'').toLowerCase(),status=Number(error.httpStatus||0);
      if(kind==='server'||kind==='config')return false;
      if(kind==='network'||kind==='timeout'||kind==='response-parse')return true;
      if(kind==='http')return status===408||status===425||status===429||status>=500;
      return original(error);
    };
    wrapped.__anaFarmaDevClassification=true;window.isRetryableTransportError=wrapped;
  }
  function scheduleRetry(){
    if(!navigator.onLine||retryTimer||typeof window.syncOutbox!=='function')return;
    const delay=Math.min(60000,5000*Math.pow(2,Math.min(4,retryAttempt)));
    retryTimer=setTimeout(function(){retryTimer=null;retryAttempt++;Promise.resolve(window.syncOutbox()).catch(function(e){console.warn('[DEV SYNC RETRY]',e);scheduleRetry();});},delay);
  }
  function install(){
    installHooks();patchNetworkClassifier();patchRetryClassifier();
    window.addEventListener('anafarma:sync-success',function(){retryAttempt=0;if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}});
    window.addEventListener('anafarma:sync-failed',function(e){if(!(e.detail||{}).terminal)scheduleRetry();});
    window.AnaFarmaDevRuntime={version:VERSION,cart:readCart,restoreCart:restoreCart,clearCart:clearCart,retryNow:function(){retryAttempt=0;return typeof window.syncOutbox==='function'?window.syncOutbox():Promise.resolve();}};
    setTimeout(function(){installHooks();restoreCart();},0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
