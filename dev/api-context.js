(function(){'use strict';
function install(){
  if(typeof apiGet!=='function'||typeof apiPost!=='function'||typeof AppState==='undefined'){setTimeout(install,25);return;}
  if(window.__ANA_FARMA_DEV_API_CONTEXT__)return;
  window.__ANA_FARMA_DEV_API_CONTEXT__=true;
  const protectedGet=new Set(['getProduk','getSupplier','getPelanggan','getTransaksi','getDetailTransaksi','getLogStok','getPembelian','getRetur','getStokOpnameLog','getLaporanPenjualan','getLaporanLabaRugi','getLaporanKadaluarsa','getAnalisisPenjualan','getOmzetPerKasir','getShiftStatus','getShiftLog','getUsers','getDashboardSummary','getPengajuanPembelian','getPengaturan','getLokasi']);
  const targetActions=new Set(['updateUser','toggleGPSUser','resetPasswordUser']);
  const originalGet=window.apiGet;
  const originalPost=window.apiPost;
  window.apiGet=function(action,params,options){
    const p=Object.assign({},params||{});
    if(protectedGet.has(action)&&!p.idUser&&AppState.user)p.idUser=AppState.user.idUser;
    return originalGet.call(this,action,p,options);
  };
  window.apiGet.__devContextWrapped=true;
  window.apiPost=function(action,data,options){
    let p=Object.assign({},data||{});
    if(targetActions.has(action)&&AppState.user){
      const sessionId=String(AppState.user.idUser||'');
      const suppliedId=String(p.idUser||'');
      if(!p.targetUserId&&suppliedId&&suppliedId!==sessionId)p.targetUserId=suppliedId;
      p.idUser=sessionId;
    }
    return originalPost.call(this,action,p,options);
  };
  window.apiPost.__devContextWrapped=true;
}
install();
})();
