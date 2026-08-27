/**
 * APOTEK ANA FARMA — DEV FEATURE COMPATIBILITY BRIDGE
 * V18.11
 *
 * Menyatukan kontrak cart/transaksi DEV dengan backend production:
 * - createTransaksi memakai kodeObat + qty + hargaSatuan + satuanJual + namaSatuan;
 * - alur checkout membuka Pembayaran sebelum penyimpanan;
 * - validasi item mencegah "Item transaksi tidak valid";
 * - createTransaksi tetap mendukung outbox saat offline;
 * - detail keranjang menampilkan LOKASI RAK -> STOK -> HARGA;
 * - renderer cart aman dari mutation loop.
 *
 * Production tidak disentuh. File ini hanya dipakai oleh /dev.
 */
(function(){
  'use strict';

  const CART_KEY='anafarma_dev_cart_v18_1';
  const MODAL_ID='dev-transaction-payment-modal';
  let checkoutBusy=false;
  let cartObserver=null;
  let cartRenderScheduled=false;

  const esc=v=>typeof window.escapeHtml==='function'?window.escapeHtml(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>typeof window.formatRupiah==='function'?window.formatRupiah(v):`Rp ${Number(v||0).toLocaleString('id-ID')}`;

  function install(){
    if(typeof AppState==='undefined'||typeof setScreen!=='function'||typeof sinkronkanOutbox!=='function'){setTimeout(install,25);return;}
    if(window.__ANA_FARMA_FEATURE_COMPAT__)return;
    window.__ANA_FARMA_FEATURE_COMPAT__=true;

    window.navigasiKe=name=>setScreen(name);
    window.syncOutbox=()=>sinkronkanOutbox();
    window.renderKasirCartStatus=()=>scheduleCartRender();
    window.kosongkanKeranjang=()=>{
      AppState.cart=[];AppState.cartCustomer=null;scheduleCartRender();
      try{localStorage.removeItem(CART_KEY);}catch(_){ }
    };
    window.prosesCheckout=()=>mulaiPembayaran();
    window.masukKeAplikasi=()=>typeof bootApp==='function'?bootApp():undefined;
    window.invalidasiCacheProduk=()=>{AppState.produkCache=[];AppState.produkCacheAt=0;return true;};
    window.segarkanSesiShift=async()=>{
      if(!AppState.user||typeof apiGet!=='function')return null;
      try{const data=await apiGet('getShiftStatus',{idUser:AppState.user.idUser},{cache:false});AppState.user.shiftAktif=data||null;return data;}
      catch(error){console.warn('[DEV SHIFT REFRESH]',error);return null;}
    };

    installCheckoutInterceptor();
    installCartRenderer();
  }

  function getProductForCart(item){
    const list=Array.isArray(AppState.produkCache)?AppState.produkCache:[];
    const key=String(item?.kodeObat||item?.kode||item?.idProduk||'');
    return list.find(p=>String(p?.Kode_Obat??p?.kode??p?.Kode??p?.idProduk??p?.IDProduk??'')===key)||list.find(p=>String(p?.idProduk??p?.IDProduk??'')===key)||null;
  }

  function normalizeCartItem(item){
    const product=getProductForCart(item);
    const kode=String(item?.kodeObat||item?.kode||item?.idProduk||product?.Kode_Obat||product?.kode||product?.Kode||'').trim();
    const nama=String(item?.namaObat||item?.nama||product?.Nama_Obat||product?.nama||'Obat tanpa nama').trim();
    const qty=Number(item?.qty||0);
    const isi=Math.max(1,Number(item?.isiPerSatuan||1)||1);
    const harga=Number(item?.hargaSatuan||product?.Harga_Jual||0);
    const stok=Number(item?.stokTersedia??product?.Stok??0);
    const satuan=String(item?.namaSatuan||product?.Satuan||'Pcs').trim()||'Pcs';
    return {original:item,product,kodeObat:kode,namaObat:nama,qty,isiPerSatuan:isi,hargaSatuan:harga,stokTersedia:stok,satuanJual:String(item?.satuanJual||'normal'),namaSatuan:satuan};
  }

  function validateCart(){
    const cart=Array.isArray(AppState.cart)?AppState.cart:[];
    if(!cart.length)return {ok:false,error:'Keranjang masih kosong.'};
    const items=cart.map(normalizeCartItem);
    for(const item of items){
      if(!item.kodeObat)return {ok:false,error:`Kode obat untuk ${item.namaObat} tidak ditemukan. Segarkan daftar obat lalu coba lagi.`};
      if(!Number.isFinite(item.qty)||item.qty<=0)return {ok:false,error:`Jumlah ${item.namaObat} tidak valid.`};
      if(!Number.isFinite(item.hargaSatuan)||item.hargaSatuan<0)return {ok:false,error:`Harga ${item.namaObat} tidak valid.`};
    }
    return {ok:true,items};
  }

  function backendItems(items){
    return items.map(item=>({
      kodeObat:item.kodeObat,
      qty:Number(item.qty)*Math.max(1,Number(item.isiPerSatuan)||1),
      hargaSatuan:Number(item.hargaSatuan||0)/Math.max(1,Number(item.isiPerSatuan)||1),
      satuanJual:item.satuanJual||'normal',
      namaSatuan:item.namaSatuan||'Pcs'
    }));
  }

  async function verifyStock(items){
    if(!AppState.isOnline)return {ok:true,offline:true};
    if(typeof apiPost!=='function')return {ok:true};
    for(const item of items){
      try{
        const result=await apiPost('verifikasiStokFast',withIdUser({kodeObat:item.kodeObat}));
        if(result&&result.stok!==undefined){
          const available=Number(result.stok)||0;
          const required=Number(item.qty)*Math.max(1,Number(item.isiPerSatuan)||1);
          if(available<required)return {ok:false,error:`Stok ${item.namaObat} tidak mencukupi. Tersedia ${available}, dibutuhkan ${required}.`};
        }
      }catch(error){console.warn('[DEV CHECKOUT VERIFY]',error);}
    }
    return {ok:true};
  }

  function closePaymentModal(){
    const el=document.getElementById(MODAL_ID);if(!el)return;
    el.classList.remove('show');setTimeout(()=>el.remove(),180);
  }

  function openPaymentModal(customers){
    closePaymentModal();
    const validation=validateCart();if(!validation.ok){toast(validation.error,'error');return;}
    const subtotal=validation.items.reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.hargaSatuan)||0),0);
    const options='<option value="">-- Tanpa Pelanggan --</option>'+(Array.isArray(customers)?customers:[]).map(p=>`<option value="${esc(p.ID_Pelanggan??p.idPelanggan??'')}">${esc(p.Nama??p.nama??'-')} (${Number(p.Poin??p.poin??0)} poin)</option>`).join('');
    const modal=document.createElement('div');
    modal.id=MODAL_ID;modal.className='modal-overlay center-align';
    modal.innerHTML=`<div class="modal-sheet modal-center" style="max-width:460px;width:min(100%,460px)"><div class="modal-header"><div><h3>Pembayaran</h3><div style="font-size:11px;color:var(--text-dim);margin-top:2px">${validation.items.length} jenis obat • ${money(subtotal)}</div></div><button type="button" class="modal-close" data-pay-close aria-label="Tutup">×</button></div><div class="modal-body"><div class="form-group"><label>Pelanggan (opsional)</label><select id="dev-pay-customer">${options}</select></div><div class="form-group"><label>Diskon (Rp)</label><input id="dev-pay-discount" type="number" min="0" value="0" inputmode="numeric"></div><div class="form-group"><label>Metode Pembayaran</label><select id="dev-pay-method"><option value="Tunai">Tunai</option><option value="QRIS">QRIS</option><option value="E-Wallet">E-Wallet</option></select></div><div class="form-group"><label>Jumlah Dibayar</label><input id="dev-pay-paid" type="number" min="0" value="${subtotal}" inputmode="numeric"></div><div style="background:var(--bg);border-radius:12px;padding:12px;margin:10px 0 14px;font-size:13px"><div style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div style="display:flex;justify-content:space-between;margin-top:7px"><span>Total</span><strong id="dev-pay-total">${money(subtotal)}</strong></div><div style="display:flex;justify-content:space-between;margin-top:7px"><span>Kembalian</span><strong id="dev-pay-change">${money(0)}</strong></div></div><div id="dev-pay-status" style="font-size:12px;color:var(--text-dim);text-align:center;min-height:18px;margin-bottom:8px"></div><button type="button" class="btn btn-primary" id="dev-pay-submit">Proses &amp; Simpan Transaksi</button></div></div>`;
    document.body.appendChild(modal);requestAnimationFrame(()=>modal.classList.add('show'));
    const discount=modal.querySelector('#dev-pay-discount'),paid=modal.querySelector('#dev-pay-paid'),totalEl=modal.querySelector('#dev-pay-total'),changeEl=modal.querySelector('#dev-pay-change'),status=modal.querySelector('#dev-pay-status'),submit=modal.querySelector('#dev-pay-submit');
    const update=()=>{const diskon=Math.max(0,Number(discount.value||0)),total=Math.max(0,subtotal-diskon),bayar=Math.max(0,Number(paid.value||0));totalEl.textContent=money(total);changeEl.textContent=money(Math.max(0,bayar-total));submit.disabled=checkoutBusy||bayar<total;};
    discount.addEventListener('input',update);paid.addEventListener('input',update);modal.querySelector('[data-pay-close]').onclick=closePaymentModal;modal.addEventListener('click',e=>{if(e.target===modal)closePaymentModal();});
    submit.onclick=async()=>{
      if(checkoutBusy)return;
      const diskon=Math.max(0,Number(discount.value||0)),total=Math.max(0,subtotal-diskon),bayar=Math.max(0,Number(paid.value||0));
      if(bayar<total){toast('Jumlah dibayar masih kurang.','warn');update();return;}
      const current=validateCart();if(!current.ok){toast(current.error,'error');closePaymentModal();return;}
      checkoutBusy=true;submit.disabled=true;submit.textContent='Memproses...';status.textContent=AppState.isOnline?'Memverifikasi stok...':'OFFLINE — transaksi akan disimpan di perangkat.';
      try{
        const verification=await verifyStock(current.items);if(!verification.ok)throw new Error(verification.error);
        status.textContent='Menyimpan transaksi...';
        const requestId=typeof uuidKecil==='function'?uuidKecil():String(Date.now());
        const payload=withIdUser({items:backendItems(current.items),idPelanggan:modal.querySelector('#dev-pay-customer').value||'',diskon,pajak:0,metodeBayar:modal.querySelector('#dev-pay-method').value,bayar});
        const result=await apiPost('createTransaksi',payload,{requestId,allowOffline:true});
        AppState.cart=[];AppState.cartCustomer=null;try{localStorage.removeItem(CART_KEY);}catch(_){ }
        scheduleCartRender();closePaymentModal();
        if(result?.queued)toast('Transaksi disimpan offline dan akan dikirim saat online.','warn');
        else{toast('Transaksi berhasil disimpan.','success');showReceipt(result,total,bayar);}
        if(typeof window.renderCart==='function')window.renderCart();
      }catch(error){
        console.error('[DEV CHECKOUT]',error);toast(error?.message||String(error),'error');submit.disabled=false;submit.textContent='Proses & Simpan Transaksi';checkoutBusy=false;status.textContent='Periksa data lalu coba lagi.';update();return;
      }
      checkoutBusy=false;
    };
    update();
  }

  function showReceipt(result,total,bayar){
    const id=result?.ID_Transaksi||result?.idTransaksi||result?.id||result?.ID||'Tersimpan';
    const kembalian=Math.max(0,Number(bayar||0)-Number(total||0));
    const modal=document.createElement('div');modal.className='modal-overlay center-align';
    modal.innerHTML=`<div class="modal-sheet modal-center" style="max-width:420px"><div class="modal-header"><h3>Transaksi Berhasil</h3><button type="button" class="modal-close" data-close-receipt>×</button></div><div class="modal-body"><div style="text-align:center;padding:8px 0 16px"><div style="font-size:34px;margin-bottom:8px">✓</div><div style="font-weight:900;font-size:16px">${esc(id)}</div><div style="color:var(--text-dim);font-size:12px;margin-top:4px">Total ${money(total)}</div><div style="color:var(--text-dim);font-size:12px;margin-top:2px">Kembalian ${money(kembalian)}</div></div><button class="btn btn-primary" data-close-receipt>Tutup</button></div></div>`;
    document.body.appendChild(modal);requestAnimationFrame(()=>modal.classList.add('show'));modal.querySelectorAll('[data-close-receipt]').forEach(b=>b.onclick=()=>{modal.classList.remove('show');setTimeout(()=>modal.remove(),180);});
  }

  async function mulaiPembayaran(){
    if(checkoutBusy)return;
    if(!AppState.user){toast('Sesi tidak tersedia. Silakan login lagi.','error');return;}
    const validation=validateCart();if(!validation.ok){toast(validation.error,'warn');return;}
    let customers=[];
    if(AppState.isOnline&&typeof apiGet==='function'){try{customers=await apiGet('getPelanggan',{idUser:AppState.user.idUser},{cache:true,maxAge:2*60*1000});}catch(error){console.warn('[DEV CHECKOUT CUSTOMER]',error);}}
    openPaymentModal(customers);
  }

  function installCheckoutInterceptor(){
    document.addEventListener('click',function(event){
      const trigger=event.target.closest?.('[data-action="checkout"]');if(!trigger)return;
      if(!AppState.user||AppState.currentScreen!=='kasir')return;
      event.preventDefault();event.stopImmediatePropagation();mulaiPembayaran().catch(error=>{checkoutBusy=false;console.error('[DEV PAYMENT]',error);toast(error?.message||String(error),'error');});
    },true);
  }

  function cartHtml(){
    if(!Array.isArray(AppState.cart)||!AppState.cart.length)return '<div class="empty-state"><div class="empty-icon">🛒</div><div>Keranjang masih kosong.</div></div>';
    return AppState.cart.map(item=>{
      const n=normalizeCartItem(item);
      const rack=n.product?.Lokasi_Rak??n.product?.lokasiRak??n.product?.Lokasi??n.product?.Nama_Display??'Belum teridentifikasi';
      return `<div class="list-item" style="align-items:center"><div class="li-main"><div class="li-title">${esc(n.namaObat)}</div><div class="li-sub">Rak: <strong style="color:var(--primary-dark)">${esc(rack||'Belum teridentifikasi')}</strong> · Stok ${Number(n.stokTersedia)||0} · ${money(n.hargaSatuan)}</div></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><button class="btn btn-secondary btn-sm" data-action="cart-minus" data-id-produk="${esc(n.kodeObat)}" aria-label="Kurangi">−</button><strong>${Number(n.qty)||0}</strong><button class="btn btn-secondary btn-sm" data-action="cart-plus" data-id-produk="${esc(n.kodeObat)}" aria-label="Tambah">+</button></div><div class="li-right"><div class="li-value">${money((Number(n.hargaSatuan)||0)*(Number(n.qty)||0))}</div></div></div>`;
    }).join('');
  }

  function renderCartDetail(){
    const root=document.querySelector('[data-cart-root]');if(!root)return;
    const html=cartHtml();
    if(root.innerHTML===html)return;
    root.innerHTML=html;
  }

  function scheduleCartRender(){
    if(cartRenderScheduled)return;
    cartRenderScheduled=true;
    requestAnimationFrame(()=>{cartRenderScheduled=false;renderCartDetail();updateDockSafe();});
  }

  function updateDockSafe(){
    document.querySelectorAll('#ana-farma-kasir-dock [data-kasir-dock-count]').forEach(el=>el.textContent=String(AppState.cart.reduce((s,x)=>s+(Number(x.qty)||0),0)));
    document.querySelectorAll('#ana-farma-kasir-dock [data-kasir-dock-total]').forEach(el=>el.textContent=money(AppState.cart.reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.hargaSatuan)||0),0)));
  }

  function installCartRenderer(){
    const attach=()=>{
      const root=document.querySelector('[data-cart-root]');if(!root||root.__devCompatAttached)return;
      root.__devCompatAttached=true;
      if(cartObserver)cartObserver.disconnect();
      cartObserver=new MutationObserver(()=>scheduleCartRender());
      cartObserver.observe(root,{childList:true,subtree:true,characterData:true});
      scheduleCartRender();
    };
    const observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});attach();
    window.addEventListener('online',scheduleCartRender);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();