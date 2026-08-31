/**
 * ANA FARMA DEV — SALES ENGINE V4
 * Server-authoritative POS + rollback + idempotency.
 *
 * Integration contract:
 * - routePost/withUser remains the security boundary.
 * - createTransaksiV4(data,user) assumes the caller already holds the script lock.
 * - createTransaksiV4Direct is available for isolated manual tests and acquires a lock.
 * - Does not change existing sheet headers.
 */

function normalizeSaleUnitV4_(product, requestedUnit) {
  var baseUnit = String(product.Satuan || 'Pcs').trim() || 'Pcs';
  var basePrice = Number(product.Harga_Jual || 0);
  var altName = String(product.Satuan_Jual_2 || '').trim();
  var altFactor = Number(product.Isi_Per_Satuan_2 || 0);
  var altPrice = Number(product.Harga_Jual_2 || 0);
  var altActive = product.Aktif_Satuan_2 === true || String(product.Aktif_Satuan_2).toUpperCase() === 'TRUE' || String(product.Aktif_Satuan_2).toLowerCase() === 'ya';
  var requested = String(requestedUnit || '').trim();
  var u = requested.toUpperCase();
  if (!requested || u === 'PRIMARY' || u === 'NORMAL' || u === baseUnit.toUpperCase() || u === 'PCS') {
    if (!Number.isFinite(basePrice) || basePrice <= 0) throw new Error('Harga jual ' + baseUnit + ' belum valid.');
    return { name: baseUnit, factor: 1, price: basePrice };
  }
  if (altActive && altName && Number.isInteger(altFactor) && altFactor > 0 && altPrice > 0 && u === altName.toUpperCase()) return { name: altName, factor: altFactor, price: altPrice };
  throw new Error('Satuan penjualan "' + requested + '" tidak valid untuk ' + product.Nama_Obat + '.');
}

function buildSalePlanV4_(data) {
  if (!data || typeof data !== 'object') throw new Error('Data transaksi tidak valid.');
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('Keranjang kosong.');
  var sh = getSheet(SHEET_NAMES.OBAT);
  if (sh.getLastRow() < 2) throw new Error('Data obat kosong.');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var idx = function(n) { return headers.indexOf(n); };
  ['Kode_Obat','Nama_Obat','Stok','Harga_Jual','Satuan'].forEach(function(n) { if (idx(n) < 0) throw new Error('Header Obat tidak lengkap: ' + n + '.'); });
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  var byCode = {};
  rows.forEach(function(row, i) { var code = String(row[idx('Kode_Obat')] || '').trim(); if (code && !byCode[code]) byCode[code] = { row: row, rowIndex: i + 2 }; });
  var aggregate = {};
  var plan = [];
  data.items.forEach(function(item, i) {
    var code = String(item && item.kodeObat || '').trim();
    if (!code) throw new Error('Item #' + (i + 1) + ' tidak memiliki kode obat.');
    var ref = byCode[code];
    if (!ref) throw new Error('Produk "' + code + '" tidak ditemukan.');
    var r = ref.row;
    var activeRaw = idx('Aktif') >= 0 ? r[idx('Aktif')] : true;
    var active = activeRaw === true || String(activeRaw).toUpperCase() === 'TRUE' || String(activeRaw).toLowerCase() === 'ya';
    if (!active) throw new Error('Produk "' + r[idx('Nama_Obat')] + '" sedang tidak aktif.');
    var product = { Kode_Obat:r[idx('Kode_Obat')], Nama_Obat:r[idx('Nama_Obat')], Stok:r[idx('Stok')], Harga_Jual:r[idx('Harga_Jual')], Satuan:r[idx('Satuan')], Satuan_Jual_2:idx('Satuan_Jual_2')>=0?r[idx('Satuan_Jual_2')]:'' , Isi_Per_Satuan_2:idx('Isi_Per_Satuan_2')>=0?r[idx('Isi_Per_Satuan_2')]:0, Harga_Jual_2:idx('Harga_Jual_2')>=0?r[idx('Harga_Jual_2')]:0, Aktif_Satuan_2:idx('Aktif_Satuan_2')>=0?r[idx('Aktif_Satuan_2')]:false };
    var unit = normalizeSaleUnitV4_(product, item.satuanJual);
    var qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty) throw new Error('Qty ' + product.Nama_Obat + ' harus bilangan bulat > 0.');
    var qtyDasar = qty * unit.factor;
    if (!Number.isSafeInteger(qtyDasar) || qtyDasar <= 0) throw new Error('Konversi qty ' + product.Nama_Obat + ' tidak valid.');
    var subtotal = qty * unit.price;
    if (!Number.isSafeInteger(subtotal) || subtotal < 0) throw new Error('Subtotal ' + product.Nama_Obat + ' tidak valid.');
    if (!aggregate[code]) aggregate[code] = { qtyDasar:0, name:product.Nama_Obat, rowIndex:ref.rowIndex };
    aggregate[code].qtyDasar += qtyDasar;
    plan.push({ rowIndex:ref.rowIndex, kodeObat:code, namaObat:String(product.Nama_Obat||''), qtyJual:qty, satuanJual:unit.name, konversiKeDasar:unit.factor, qtyDasar:qtyDasar, hargaSatuanJual:unit.price, subtotal:subtotal });
  });
  Object.keys(aggregate).forEach(function(code) { var a=aggregate[code]; var stock=Number(rows[a.rowIndex-2][idx('Stok')])||0; a.stokSebelum=stock; if(a.qtyDasar>stock) throw new Error('Stok '+a.name+' tidak cukup (tersedia '+stock+', diperlukan '+a.qtyDasar+' unit dasar).'); });
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

function rollbackAppendedRowsV4_(snapshots) {
  Object.keys(snapshots).forEach(function(key) { var s=snapshots[key], current=s.sheet.getLastRow(); if(current>s.lastRow) s.sheet.deleteRows(s.lastRow+1,current-s.lastRow); });
}

function findTransactionByRequestIdV4_(requestId) { return requestId && typeof findOfflineRequest_==='function' ? findOfflineRequest_(requestId) : null; }

function resultFromExistingTransactionV4_(idTransaksi) {
  if(!idTransaksi) return null;
  var rows=getAllAsObjects(SHEET_NAMES.TRANSAKSI).filter(function(r){return String(r.ID_Transaksi)===String(idTransaksi);});
  if(!rows.length) return null;
  var r=rows[0];
  return {idTransaksi:r.ID_Transaksi,ID_Transaksi:r.ID_Transaksi,total:Number(r.Total)||0,subtotal:Number(r.Subtotal)||0,diskon:Number(r.Diskon)||0,pajak:Number(r.Pajak)||0,bayar:Number(r.Bayar)||0,kembali:Number(r.Kembali)||0,poinDidapat:Number(r.Poin_Didapat)||0,status:r.Status};
}

/** Canonical V4 entry. Caller must already hold the script lock via withUser(). */
function createTransaksiV4(data,user) {
  if(!user||!user.ID_User) throw new Error('Sesi kasir tidak valid.');
  var requestId=String(data&&data.requestId||'').trim();
  if(requestId){
    var existing=findTransactionByRequestIdV4_(requestId);
    if(existing){
      if(existing.payloadHash&&typeof hashOfflinePayload_==='function'&&hashOfflinePayload_(data)!==String(existing.payloadHash)) throw new Error('RequestId sudah pernah digunakan untuk payload berbeda.');
      if(existing.status===OFFLINE_SYNC_SYNCED){var prior=resultFromExistingTransactionV4_(existing.idTransaksi);if(prior)return prior;throw new Error('Transaksi sudah tercatat tetapi hasil tidak tersedia. Hubungi Owner.');}
      if(existing.status===OFFLINE_SYNC_PENDING) throw new Error('Transaksi dengan RequestId tersebut sedang diproses. Jangan kirim ulang.');
    } else if(typeof createOfflineRequest_==='function') createOfflineRequest_(requestId,'createTransaksi',user.ID_User,data);
  }
  var built=buildSalePlanV4_(data), now=new Date(), idTransaksi=nextId('TR',SHEET_NAMES.TRANSAKSI,'ID_Transaksi'), shift=getShiftStatus(user.ID_User), idShift=shift&&shift.idShift?shift.idShift:'';
  var snapshots={obat:{},pelanggan:null,shift:null}, appended={}, committed=false;
  try{
    var shTr=getSheet(SHEET_NAMES.TRANSAKSI), shDetail=getSheet(SHEET_NAMES.DETAIL_TRANSAKSI), shLog=getSheet(SHEET_NAMES.LOG_STOK);
    appended.tr={sheet:shTr,lastRow:shTr.getLastRow()}; appended.detail={sheet:shDetail,lastRow:shDetail.getLastRow()}; appended.log={sheet:shLog,lastRow:shLog.getLastRow()};
    var namaPelanggan=data.namaPelanggan||'', poinDidapat=0;
    if(data.idPelanggan){
      var rowP=findRowIndexByKey(SHEET_NAMES.PELANGGAN,'ID_Pelanggan',data.idPelanggan); if(rowP===-1) throw new Error('Pelanggan tidak ditemukan.');
      var shPel=getSheet(SHEET_NAMES.PELANGGAN), hp=HEADERS.Pelanggan, poinCol=hp.indexOf('Poin')+1,totalCol=hp.indexOf('Total_Belanja')+1,namaCol=hp.indexOf('Nama')+1;
      snapshots.pelanggan={sheet:shPel,row:rowP,poinCol:poinCol,totalCol:totalCol,oldPoin:Number(shPel.getRange(rowP,poinCol).getValue())||0,oldTotal:Number(shPel.getRange(rowP,totalCol).getValue())||0};
      namaPelanggan=shPel.getRange(rowP,namaCol).getValue()||''; poinDidapat=Math.floor(built.total*Number(getPengaturan().poin_per_rupiah||0));
    }
    appendObjectRow(SHEET_NAMES.TRANSAKSI,{ID_Transaksi:idTransaksi,Tanggal:now,ID_Kasir:user.ID_User,Nama_Kasir:user.Nama,ID_Pelanggan:data.idPelanggan||'',Nama_Pelanggan:namaPelanggan,Subtotal:built.subtotal,Diskon:built.diskon,Pajak:built.pajak,Total:built.total,Metode_Bayar:data.metodeBayar||'Tunai',Bayar:built.bayar,Kembali:built.kembali,Poin_Didapat:poinDidapat,Status:'Diproses',ID_Shift:idShift,Catatan:data.catatan||''});
    var dh=shDetail.getRange(1,1,1,shDetail.getLastColumn()).getValues()[0];
    var detailRows=built.plan.map(function(p){var o={ID_Detail:nextId('DT',SHEET_NAMES.DETAIL_TRANSAKSI,'ID_Detail'),ID_Transaksi:idTransaksi,Kode_Obat:p.kodeObat,Nama_Obat:p.namaObat,Qty:p.qtyDasar,Harga_Satuan:p.qtyDasar?p.subtotal/p.qtyDasar:0,Subtotal:p.subtotal,Satuan_Jual:p.satuanJual,Qty_Satuan_Jual:p.qtyJual,Konversi_Ke_Dasar:p.konversiKeDasar,Harga_Satuan_Jual:p.hargaSatuanJual};return dh.map(function(h){return o[h]===undefined?'':o[h];});});
    if(detailRows.length) shDetail.getRange(shDetail.getLastRow()+1,1,detailRows.length,dh.length).setValues(detailRows);
    var oh=shObatHeadersV4_(), stockCol=oh.indexOf('Stok')+1, updatedCol=oh.indexOf('Diperbarui_Pada')+1;
    Object.keys(built.aggregate).forEach(function(code){var a=built.aggregate[code],row=a.rowIndex;var oldStock=Number(shTrV4Obat_().getRange(row,stockCol).getValue())||0;snapshots.obat[code]={sheet:shTrV4Obat_(),row:row,stockCol:stockCol,updatedCol:updatedCol,oldStock:oldStock,oldUpdated:updatedCol>0?shTrV4Obat_().getRange(row,updatedCol).getValue():null};if(a.qtyDasar>oldStock)throw new Error('Stok '+a.name+' berubah sebelum mutasi.');var after=oldStock-a.qtyDasar;shTrV4Obat_().getRange(row,stockCol).setValue(after);if(updatedCol>0)shTrV4Obat_().getRange(row,updatedCol).setValue(now);tulisLogStok(code,a.name,'Penjualan',oldStock,-a.qtyDasar,after,'Transaksi '+idTransaksi,user.Nama,idTransaksi);});
    if(snapshots.pelanggan){snapshots.pelanggan.sheet.getRange(snapshots.pelanggan.row,snapshots.pelanggan.poinCol).setValue(snapshots.pelanggan.oldPoin+poinDidapat);snapshots.pelanggan.sheet.getRange(snapshots.pelanggan.row,snapshots.pelanggan.totalCol).setValue(snapshots.pelanggan.oldTotal+built.total);}
    if(idShift){var rowShift=findRowIndexByKey(SHEET_NAMES.SHIFT,'ID_Shift',idShift);if(rowShift===-1)throw new Error('Shift aktif tidak ditemukan.');var shShift=getSheet(SHEET_NAMES.SHIFT),st=HEADERS.Shift,totalShiftCol=st.indexOf('Total_Penjualan')+1;snapshots.shift={sheet:shShift,row:rowShift,col:totalShiftCol,old:Number(shShift.getRange(rowShift,totalShiftCol).getValue())||0};shShift.getRange(rowShift,totalShiftCol).setValue(snapshots.shift.old+built.total);}
    var trRow=findRowIndexByKey(SHEET_NAMES.TRANSAKSI,'ID_Transaksi',idTransaksi);shTr.getRange(trRow,HEADERS.Transaksi.indexOf('Status')+1).setValue('Selesai');committed=true;
    if(requestId&&typeof markOfflineRequestSynced_==='function')markOfflineRequestSynced_(requestId,{ID_Transaksi:idTransaksi});
    return {idTransaksi:idTransaksi,ID_Transaksi:idTransaksi,total:built.total,subtotal:built.subtotal,diskon:built.diskon,pajak:built.pajak,bayar:built.bayar,kembali:built.kembali,poinDidapat:poinDidapat,status:'Selesai'};
  }catch(err){
    if(!committed){Object.keys(snapshots.obat).forEach(function(code){var s=snapshots.obat[code];s.sheet.getRange(s.row,s.stockCol).setValue(s.oldStock);if(s.updatedCol>0)s.sheet.getRange(s.row,s.updatedCol).setValue(s.oldUpdated);});if(snapshots.pelanggan){snapshots.pelanggan.sheet.getRange(snapshots.pelanggan.row,snapshots.pelanggan.poinCol).setValue(snapshots.pelanggan.oldPoin);snapshots.pelanggan.sheet.getRange(snapshots.pelanggan.row,snapshots.pelanggan.totalCol).setValue(snapshots.pelanggan.oldTotal);}if(snapshots.shift)snapshots.shift.sheet.getRange(snapshots.shift.row,snapshots.shift.col).setValue(snapshots.shift.old);rollbackAppendedRowsV4_(appended);}
    if(requestId&&typeof markOfflineRequestFailed_==='function')markOfflineRequestFailed_(requestId,err);throw err;
  }
}

function shObatHeadersV4_(){var sh=getSheet(SHEET_NAMES.OBAT);return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];}
function shTrV4Obat_(){return getSheet(SHEET_NAMES.OBAT);}
function createTransaksiV4Direct(data,user){var lock=LockService.getScriptLock();if(!lock.tryLock(25000))throw new Error('Sistem sedang sibuk, coba lagi beberapa detik.');try{return createTransaksiV4(data,user);}finally{lock.releaseLock();}}
EOF