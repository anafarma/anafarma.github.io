/**
 * ANA FARMA DEV — SALES ENGINE V4
 *
 * Canonical sales engine candidate.
 * IMPORTANT: doPost() already owns requestId/offline idempotency in this
 * project, so this engine deliberately does NOT create a second ledger.
 * createTransaksiV4() is intended to be called from the existing withUser()
 * security/lock boundary.
 */

function resolveSaleUnitV4_(product, requested) {
  var base = String(product.Satuan || 'Pcs').trim() || 'Pcs';
  var basePrice = Number(product.Harga_Jual || 0);
  var alt = String(product.Satuan_Jual_2 || '').trim();
  var factor = Number(product.Isi_Per_Satuan_2 || 0);
  var altPrice = Number(product.Harga_Jual_2 || 0);
  var active = product.Aktif_Satuan_2 === true || String(product.Aktif_Satuan_2).toUpperCase() === 'TRUE' || String(product.Aktif_Satuan_2).toLowerCase() === 'ya';
  var u = String(requested || '').trim().toUpperCase();

  if (!u || u === 'NORMAL' || u === 'PRIMARY' || u === 'PCS' || u === base.toUpperCase()) {
    if (!Number.isFinite(basePrice) || basePrice <= 0) throw new Error('Harga jual ' + base + ' belum valid.');
    return { name: base, factor: 1, price: basePrice };
  }
  if (active && alt && Number.isInteger(factor) && factor > 0 && altPrice > 0 && (u === alt.toUpperCase() || u === 'ALTERNATIF' || u === 'SECONDARY')) {
    return { name: alt, factor: factor, price: altPrice };
  }
  throw new Error('Satuan penjualan "' + requested + '" tidak tersedia untuk ' + product.Nama_Obat + '.');
}

function buildSalePlanV4_(data) {
  if (!data || typeof data !== 'object') throw new Error('Data transaksi tidak valid.');
  if (!Array.isArray(data.items) || !data.items.length) throw new Error('Keranjang kosong.');

  var sh = getSheet(SHEET_NAMES.OBAT);
  if (sh.getLastRow() < 2) throw new Error('Data obat kosong.');
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var ix = function(n) { return h.indexOf(n); };
  ['Kode_Obat','Nama_Obat','Stok','Harga_Jual','Satuan','Satuan_Jual_2','Isi_Per_Satuan_2','Harga_Jual_2','Aktif_Satuan_2'].forEach(function(n) { if (ix(n) < 0) throw new Error('Header Obat tidak lengkap: ' + n + '.'); });
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues();
  var byCode = {};
  rows.forEach(function(r, i) { var code = String(r[ix('Kode_Obat')] || '').trim(); if (code && !byCode[code]) byCode[code] = { row: r, rowIndex: i + 2 }; });
  var aggregate = {}, plan = [];

  data.items.forEach(function(item, n) {
    var code = String(item && item.kodeObat || '').trim();
    if (!code) throw new Error('Item #' + (n + 1) + ' tidak memiliki kode obat.');
    var ref = byCode[code];
    if (!ref) throw new Error('Produk "' + code + '" tidak ditemukan.');
    var r = ref.row;
    var active = r[ix('Aktif')] === true || String(r[ix('Aktif')]).toUpperCase() === 'TRUE' || String(r[ix('Aktif')]).toLowerCase() === 'ya';
    if (!active) throw new Error('Produk "' + r[ix('Nama_Obat')] + '" sedang tidak aktif.');
    var product = { Kode_Obat:r[ix('Kode_Obat')], Nama_Obat:r[ix('Nama_Obat')], Stok:r[ix('Stok')], Harga_Jual:r[ix('Harga_Jual')], Satuan:r[ix('Satuan')], Satuan_Jual_2:r[ix('Satuan_Jual_2')], Isi_Per_Satuan_2:r[ix('Isi_Per_Satuan_2')], Harga_Jual_2:r[ix('Harga_Jual_2')], Aktif_Satuan_2:r[ix('Aktif_Satuan_2')] };
    var unit = resolveSaleUnitV4_(product, item.satuanJual);
    var qty = Number(item.qty);
    if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error('Qty ' + product.Nama_Obat + ' harus bilangan bulat lebih dari 0.');
    var qtyDasar = qty * unit.factor;
    if (!Number.isSafeInteger(qtyDasar) || qtyDasar <= 0) throw new Error('Konversi qty ' + product.Nama_Obat + ' tidak valid.');
    var lineTotal = qty * unit.price;
    if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) throw new Error('Subtotal ' + product.Nama_Obat + ' tidak valid.');
    if (!aggregate[code]) aggregate[code] = { rowIndex:ref.rowIndex, name:String(product.Nama_Obat || ''), qtyDasar:0 };
    aggregate[code].qtyDasar += qtyDasar;
    plan.push({ kodeObat:code, namaObat:String(product.Nama_Obat || ''), qtyJual:qty, satuanJual:unit.name, konversiKeDasar:unit.factor, qtyDasar:qtyDasar, hargaSatuanJual:unit.price, subtotal:lineTotal, rowIndex:ref.rowIndex });
  });

  Object.keys(aggregate).forEach(function(code) { var a=aggregate[code]; var stock=Number(rows[a.rowIndex-2][ix('Stok')])||0; a.stokSebelum=stock; if(a.qtyDasar>stock) throw new Error('Stok '+a.name+' tidak cukup (tersedia '+stock+', diperlukan '+a.qtyDasar+' unit dasar).'); });
  var subtotal=plan.reduce(function(s,x){return s+x.subtotal;},0);
  var diskon=Number(data.diskon||0), pajak=Number(data.pajak||0);
  if(!Number.isFinite(diskon)||diskon<0) throw new Error('Diskon tidak valid.');
  if(!Number.isFinite(pajak)||pajak<0) throw new Error('Pajak tidak valid.');
  if(diskon>subtotal) throw new Error('Diskon tidak boleh melebihi subtotal.');
  var total=Math.max(0,subtotal-diskon+pajak);
  var bayar=Number(data.bayar===undefined?total:data.bayar);
  if(!Number.isFinite(bayar)||bayar<total) throw new Error('Pembayaran kurang dari total transaksi.');
  return {plan:plan,aggregate:aggregate,subtotal:subtotal,diskon:diskon,pajak:pajak,total:total,bayar:bayar,kembali:bayar-total};
}

function deleteAppendedV4_(snap) {
  Object.keys(snap).forEach(function(k) { var s=snap[k], now=s.sheet.getLastRow(); if(now>s.lastRow) s.sheet.deleteRows(s.lastRow+1, now-s.lastRow); });
}

/** Called by routePost through withUser(); do not acquire another script lock here. */
function createTransaksiV4(data, user) {
  if (!user || !user.ID_User) throw new Error('Sesi kasir tidak valid.');
  var built=buildSalePlanV4_(data), now=new Date();
  var shift=getShiftStatus(user.ID_User), idShift=shift&&shift.idShift?shift.idShift:'';
  var id=nextId('TR',SHEET_NAMES.TRANSAKSI,'ID_Transaksi');
  var snap={obat:{},pelanggan:null,shift:null}, appended={};
  var shTr=getSheet(SHEET_NAMES.TRANSAKSI), shDetail=getSheet(SHEET_NAMES.DETAIL_TRANSAKSI), shObat=getSheet(SHEET_NAMES.OBAT), shLog=getSheet(SHEET_NAMES.LOG_STOK);
  appended.tr={sheet:shTr,lastRow:shTr.getLastRow()}; appended.detail={sheet:shDetail,lastRow:shDetail.getLastRow()}; appended.log={sheet:shLog,lastRow:shLog.getLastRow()};
  try {
    var namaPelanggan=data.namaPelanggan||'', poin=0;
    if(data.idPelanggan){
      var rp=findRowIndexByKey(SHEET_NAMES.PELANGGAN,'ID_Pelanggan',data.idPelanggan); if(rp===-1) throw new Error('Pelanggan tidak ditemukan.');
      var sp=getSheet(SHEET_NAMES.PELANGGAN), hp=HEADERS.Pelanggan, pc=hp.indexOf('Poin')+1, tc=hp.indexOf('Total_Belanja')+1, nc=hp.indexOf('Nama')+1;
      snap.pelanggan={sheet:sp,row:rp,poinCol:pc,totalCol:tc,oldPoin:Number(sp.getRange(rp,pc).getValue())||0,oldTotal:Number(sp.getRange(rp,tc).getValue())||0};
      namaPelanggan=sp.getRange(rp,nc).getValue()||''; poin=Math.floor(built.total*Number(getPengaturan().poin_per_rupiah||0));
    }
    appendObjectRow(SHEET_NAMES.TRANSAKSI,{ID_Transaksi:id,Tanggal:now,ID_Kasir:user.ID_User,Nama_Kasir:user.Nama,ID_Pelanggan:data.idPelanggan||'',Nama_Pelanggan:namaPelanggan,Subtotal:built.subtotal,Diskon:built.diskon,Pajak:built.pajak,Total:built.total,Metode_Bayar:data.metodeBayar||'Tunai',Bayar:built.bayar,Kembali:built.kembali,Poin_Didapat:poin,Status:'Diproses',ID_Shift:idShift,Catatan:data.catatan||''});
    var dh=shDetail.getRange(1,1,1,shDetail.getLastColumn()).getValues()[0];
    var detailRows=built.plan.map(function(p){var o={ID_Detail:nextId('DT',SHEET_NAMES.DETAIL_TRANSAKSI,'ID_Detail'),ID_Transaksi:id,Kode_Obat:p.kodeObat,Nama_Obat:p.namaObat,Qty:p.qtyDasar,Harga_Satuan:p.qtyDasar?p.subtotal/p.qtyDasar:0,Subtotal:p.subtotal,Satuan_Jual:p.satuanJual,Qty_Satuan_Jual:p.qtyJual,Konversi_Ke_Dasar:p.konversiKeDasar,Harga_Satuan_Jual:p.hargaSatuanJual};return dh.map(function(x){return o[x]===undefined?'':o[x];});});
    shDetail.getRange(shDetail.getLastRow()+1,1,detailRows.length,dh.length).setValues(detailRows);
    var oh=shObat.getRange(1,1,1,shObat.getLastColumn()).getValues()[0], sc=oh.indexOf('Stok')+1, uc=oh.indexOf('Diperbarui_Pada')+1;
    Object.keys(built.aggregate).forEach(function(code){var a=built.aggregate[code], before=Number(shObat.getRange(a.rowIndex,sc).getValue())||0;snap.obat[code]={sheet:shObat,row:a.rowIndex,stockCol:sc,updatedCol:uc,oldStock:before,oldUpdated:uc>0?shObat.getRange(a.rowIndex,uc).getValue():null};if(before<a.qtyDasar)throw new Error('Stok berubah sebelum penyimpanan transaksi.');var after=before-a.qtyDasar;shObat.getRange(a.rowIndex,sc).setValue(after);if(uc>0)shObat.getRange(a.rowIndex,uc).setValue(now);tulisLogStok(code,a.name,'Penjualan',before,-a.qtyDasar,after,'Transaksi '+id,user.Nama,id);});
    if(snap.pelanggan){snap.pelanggan.sheet.getRange(snap.pelanggan.row,snap.pelanggan.poinCol).setValue(snap.pelanggan.oldPoin+poin);snap.pelanggan.sheet.getRange(snap.pelanggan.row,snap.pelanggan.totalCol).setValue(snap.pelanggan.oldTotal+built.total);}
    if(idShift){var rs=findRowIndexByKey(SHEET_NAMES.SHIFT,'ID_Shift',idShift);if(rs===-1)throw new Error('Shift aktif tidak ditemukan.');var ss=getSheet(SHEET_NAMES.SHIFT), hs=HEADERS.Shift, stc=hs.indexOf('Total_Penjualan')+1;snap.shift={sheet:ss,row:rs,col:stc,old:Number(ss.getRange(rs,stc).getValue())||0};ss.getRange(rs,stc).setValue(snap.shift.old+built.total);}
    var rt=findRowIndexByKey(SHEET_NAMES.TRANSAKSI,'ID_Transaksi',id);shTr.getRange(rt,HEADERS.Transaksi.indexOf('Status')+1).setValue('Selesai');
    return {idTransaksi:id,ID_Transaksi:id,total:built.total,subtotal:built.subtotal,diskon:built.diskon,pajak:built.pajak,bayar:built.bayar,kembali:built.kembali,poinDidapat:poin,status:'Selesai'};
  } catch(err) {
    Object.keys(snap.obat).forEach(function(k){var s=snap.obat[k];s.sheet.getRange(s.row,s.stockCol).setValue(s.oldStock);if(s.updatedCol>0)s.sheet.getRange(s.row,s.updatedCol).setValue(s.oldUpdated);});
    if(snap.pelanggan){snap.pelanggan.sheet.getRange(snap.pelanggan.row,snap.pelanggan.poinCol).setValue(snap.pelanggan.oldPoin);snap.pelanggan.sheet.getRange(snap.pelanggan.row,snap.pelanggan.totalCol).setValue(snap.pelanggan.oldTotal);}
    if(snap.shift)snap.shift.sheet.getRange(snap.shift.row,snap.shift.col).setValue(snap.shift.old);
    deleteAppendedV4_(appended);
    throw err;
  }
}

function createTransaksiV4Direct(data,user){var lock=LockService.getScriptLock();if(!lock.tryLock(25000))throw new Error('Sistem sedang sibuk, coba lagi beberapa detik.');try{return createTransaksiV4(data,user);}finally{lock.releaseLock();}}
