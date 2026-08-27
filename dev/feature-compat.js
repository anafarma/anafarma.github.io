/**
 * APOTEK ANA FARMA — DEV FEATURE COMPATIBILITY BRIDGE
 * V18.2
 *
 * Menyatukan nama fungsi yang dipakai features-runtime.js dengan engine
 * app.js. File ini tidak membuat router/API/IndexedDB baru.
 */
(function(){
  'use strict';

  function install(){
    if(typeof AppState==='undefined' || typeof setScreen!=='function' || typeof sinkronkanOutbox!=='function'){
      setTimeout(install,25);
      return;
    }
    if(window.__ANA_FARMA_FEATURE_COMPAT__) return;
    window.__ANA_FARMA_FEATURE_COMPAT__=true;

    window.navigasiKe=function(name){ return setScreen(name); };
    window.syncOutbox=function(){ return sinkronkanOutbox(); };
    window.renderKasirCartStatus=function(){
      if(typeof renderCart==='function') return renderCart();
    };
    window.kosongkanKeranjang=function(){
      AppState.cart=[];
      AppState.cartCustomer=null;
      if(typeof renderCart==='function') renderCart();
      try{localStorage.removeItem('anafarma_dev_cart_v18_1');}catch(_){ }
    };
    window.prosesCheckout=function(){
      if(typeof checkoutKeranjang==='function') return checkoutKeranjang();
    };
    window.masukKeAplikasi=function(){
      if(typeof bootApp==='function') return bootApp();
    };
    window.invalidasiCacheProduk=function(){
      AppState.produkCache=[];
      AppState.produkCacheAt=0;
      return true;
    };
    window.segarkanSesiShift=async function(){
      if(!AppState.user || typeof apiGet!=='function') return null;
      try{
        const data=await apiGet('getShiftStatus',{idUser:AppState.user.idUser},{cache:false});
        AppState.user.shiftAktif=data||null;
        return data;
      }catch(error){
        console.warn('[DEV SHIFT REFRESH]',error);
        return null;
      }
    };
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
