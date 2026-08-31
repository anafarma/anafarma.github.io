/**
 * ANA FARMA DEV — SALES ENGINE V3
 *
 * Server-authoritative multi-unit POS.
 *
 * IMPORTANT:
 * - This file is intentionally named with V3 symbols so it can be audited
 *   before replacing the legacy createTransaksi() implementation.
 * - After validation, replace the legacy createTransaksi() body with
 *   createTransaksiV3(data, user), OR route the createTransaksi action to
 *   createTransaksiV3.
 * - Do NOT deploy this file alone to Production.
 */

function normalizeSaleUnitV3_(product, requestedUnit) {
  var baseUnit = String(product.Satuan || 'Pcs').trim() || 'Pcs';
  var basePrice = Number(product.Harga_Jual || 0);
  var altName = String(product.Satuan_Jual_2 || '').trim();
  var altFactor = Number(product.Isi_Per_Satuan_2 || 0);
  var altPrice = Number(product.Harga_Jual_2 || 0);
  var altActive = product.Aktif_Satuan_2 === true ||
    String(product.Aktif_Satuan_2).toUpperCase() === 'TRUE' ||
    String(product.Aktif_Satuan_2).toLowerCase() === 'ya';

  var requested = String(requestedUnit || '').trim();
  var requestedUpper = requested.toUpperCase();

  if (!requested ||
      requestedUpper === 'PRIMARY' ||
      requestedUpper === 'NORMAL' ||
      requestedUpper === 'PCS' ||
      requestedUpper === baseUnit.toUpperCase()) {
    if (basePrice <= 0) throw new Error('Harga jual produk ' + baseUnit + ' belum valid.');
    return { key: 'PRIMARY', name: baseUnit, factor: 1, price: basePrice };
  }

  if (altActive && altName &&
      Number.isInteger(altFactor) && altFactor > 0 &&
      altPrice > 0 && requestedUpper === altName.toUpperCase()) {
    return { key: 'SECONDARY', name: altName, factor: altFactor, price: altPrice };
  }

  throw new Error('Satuan penjualan "' + requested + '" tidak valid untuk produk ' + product.Nama_Obat + '.');
}

function buildSalePlanV3_(data, user) {
  if (!data || typeof data !== 'object') throw new Error('Data transaksi tidak valid.');
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('Keranjang kosong.');

  var shObat = getSheet(SHEET_NAMES.OBAT);
  var lastRow = shObat.getLastRow();
  var lastCol = shObat.getLastColumn();
  if (lastRow < 2) throw new Error('Data obat kosong.');

  var headers = shObat.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = function(name) { return headers.indexOf(name); };
  var kodeCol = idx('Kode_Obat');
  var namaCol = idx('Nama_Obat');
  var stokCol = idx('Stok');
  var aktifCol = idx('Aktif');
  var hargaJualCol = idx('Harga_Jual');
  var satuanCol = idx('Satuan');
  var altUnitCol = idx('Satuan_Jual_2');
  var altFactorCol = idx('Isi_Per_Satuan_2');
  var altPriceCol = idx('Harga_Jual_2');
  var altActiveCol = idx('Aktif_Satuan_2');

  var required = ['Kode_Obat','Nama_Obat','Stok','Harga_Jual','Satuan'];
  var missing = required.filter(function(name) { return idx(name) === -1; });
  if (missing.length) throw new Error('Header Obat tidak lengkap: ' + missing.join(', ') + '.');

  var rows = shObat.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var byCode = {};
  rows.forEach(function(row, offset) {
    var code = String(row[kodeCol] || '').trim();
    if (code && !byCode[code]) {
      byCode[code] = { row: row, rowIndex: offset + 2 };
    }
  });

  // Aggregate base-unit demand by product before checking stock.
  // This prevents two cart lines for the same product from independently
  // passing a stock check and then collectively over-selling it.
  var aggregate = {};
  var plan = [];

  data.items.forEach(function(item, itemIndex) {
    var code = String(item && item.kodeObat || '').trim();
    if (!code) throw new Error('Item #' + (itemIndex + 1) + ' tidak memiliki kode obat.');

    var ref = byCode[code];
    if (!ref) throw new Error('Produk "' + code + '" tidak ditemukan.');

    var row = ref.row;
    var active = aktifCol === -1 ? true : row[aktifCol];
    var isActive = active === true || String(active).toUpperCase() === 'TRUE' || String(active).toLowerCase() === 'ya';
    if (!isActive) throw new Error('Produk "' + row[namaCol] + '" sedang tidak aktif.');

    var product = {
      Kode_Obat: row[kodeCol],
      Nama_Obat: row[namaCol],
      Stok: row[stokCol],
      Harga_Jual: row[hargaJualCol],
      Satuan: row[satuanCol]
    };
    if (altUnitCol !== -1) product.Satuan_Jual_2 = row[altUnitCol];
    if (altFactorCol !== -1) product.Isi_Per_Satuan_2 = row[altFactorCol];
    if (altPriceCol !== -1) product.Harga_Jual_2 = row[altPriceCol];
    if (altActiveCol !== -1) product.Aktif_Satuan_2 = row[altActiveCol];

    var unit = normalizeSaleUnitV3_(product, item.satuanJual);
    var qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty) {
      throw new Error('Qty untuk ' + product.Nama_Obat + ' harus berupa bilangan bulat lebih dari 0.');
    }

    var qtyDasar = qty * unit.factor;
    if (!Number.isSafeInteger(qtyDasar) || qtyDasar <= 0) {
      throw new Error('Konversi qty ' + product.Nama_Obat + ' tidak valid.');
    }

    var harga = unit.price;
    var subtotal = qty * harga;
    if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error('Subtotal produk tidak valid.');

    if (!aggregate[code]) {
      aggregate[code] = { qtyDasar: 0, stok: Number(row[stokCol]) || 0, name: product.Nama_Obat };
    }
    aggregate[code].qtyDasar += qtyDasar;

    plan.push({
      rowIndex: ref.rowIndex,
      kodeObat: code,
      namaObat: String(product.Nama_Obat || ''),
      qtyJual: qty,
      satuanJual: unit.name,
      konversiKeDasar: unit.factor,
      qtyDasar: qtyDasar,
      hargaSatuanJual: harga,
      subtotal: subtotal,
      stokSebelum: Number(row[stokCol]) || 0
    });
  });

  Object.keys(aggregate).forEach(function(code) {
    var a = aggregate[code];
    if (a.qtyDasar > a.stok) {
      throw new Error('Stok ' + a.name + ' tidak cukup (tersedia ' + a.stok + ', diperlukan ' + a.qtyDasar + ' unit dasar).');
    }
  });

  var subtotal = plan.reduce(function(sum, item) { return sum + item.subtotal; }, 0);
  var diskon = Number(data.diskon || 0);
  var pajak = Number(data.pajak || 0);
  if (!Number.isFinite(diskon) || diskon < 0) throw new Error('Diskon tidak valid.');
  if (!Number.isFinite(pajak) || pajak < 0) throw new Error('Pajak tidak valid.');
  if (diskon > subtotal) throw new Error('Diskon tidak boleh melebihi subtotal.');

  var total = Math.max(0, subtotal - diskon + pajak);
  var bayar = Number(data.bayar === undefined ? total : data.bayar);
  if (!Number.isFinite(bayar) || bayar < total) throw new Error('Jumlah pembayaran kurang dari total transaksi.');

  return {
    plan: plan,
    aggregate: aggregate,
    subtotal: subtotal,
    diskon: diskon,
    pajak: pajak,
    total: total,
    bayar: bayar,
    kembali: bayar - total
  };
}

/**
 * Server-authoritative transaction implementation.
 * Compatible with the existing 11-column Detail_Transaksi schema.
 */
function createTransaksiV3(data, user) {
  if (!user || !user.ID_User) throw new Error('Sesi kasir tidak valid.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('Sistem sedang sibuk, coba lagi beberapa detik.');

  try {
    var built = buildSalePlanV3_(data, user);
    var now = new Date();
    var idTransaksi = nextId('TR', SHEET_NAMES.TRANSAKSI, 'ID_Transaksi');
    var shift = getShiftStatus(user.ID_User);
    var idShift = shift && shift.idShift ? shift.idShift : '';

    // Re-read stock after acquiring the lock so the validation is based on
    // the serialized critical section, not on a stale frontend snapshot.
    var shObat = getSheet(SHEET_NAMES.OBAT);
    var obatHeaders = shObat.getRange(1, 1, 1, shObat.getLastColumn()).getValues()[0];
    var stockCol = obatHeaders.indexOf('Stok') + 1;
    var updatedCol = obatHeaders.indexOf('Diperbarui_Pada') + 1;
    var codeCol = obatHeaders.indexOf('Kode_Obat');
    var currentRows = shObat.getRange(2, 1, shObat.getLastRow() - 1, obatHeaders.length).getValues();
    var currentByCode = {};
    currentRows.forEach(function(row, offset) {
      currentByCode[String(row[codeCol] || '').trim()] = { row: row, rowIndex: offset + 2 };
    });

    Object.keys(built.aggregate).forEach(function(code) {
      var ref = currentByCode[code];
      if (!ref) throw new Error('Produk ' + code + ' hilang saat validasi stok.');
      var currentStock = Number(ref.row[stockCol - 1]) || 0;
      if (built.aggregate[code].qtyDasar > currentStock) {
        throw new Error('Stok ' + built.aggregate[code].name + ' berubah. Tersedia ' + currentStock + ', diperlukan ' + built.aggregate[code].qtyDasar + '. Silakan muat ulang produk.');
      }
    });

    // Build the transaction record first as a clear audit anchor. Status
    // becomes Selesai only after stock + details have been written.
    var namaPelanggan = data.namaPelanggan || '';
    var poinDidapat = 0;
    var customerUpdate = null;
    if (data.idPelanggan) {
      var rowP = findRowIndexByKey(SHEET_NAMES.PELANGGAN, 'ID_Pelanggan', data.idPelanggan);
      if (rowP === -1) throw new Error('Pelanggan tidak ditemukan.');
      var shPel = getSheet(SHEET_NAMES.PELANGGAN);
      var hp = HEADERS.Pelanggan;
      var pelRow = shPel.getRange(rowP, 1, 1, hp.length).getValues()[0];
      namaPelanggan = pelRow[hp.indexOf('Nama')] || '';
      var pengaturan = getPengaturan();
      poinDidapat = Math.floor(built.total * Number(pengaturan.poin_per_rupiah || 0));
      customerUpdate = { sheet: shPel, rowIndex: rowP, headers: hp, oldPoin: Number(pelRow[hp.indexOf('Poin')]) || 0, oldTotal: Number(pelRow[hp.indexOf('Total_Belanja')]) || 0 };
    }

    appendObjectRow(SHEET_NAMES.TRANSAKSI, {
      ID_Transaksi: idTransaksi,
      Tanggal: now,
      ID_Kasir: user.ID_User,
      Nama_Kasir: user.Nama,
      ID_Pelanggan: data.idPelanggan || '',
      Nama_Pelanggan: namaPelanggan,
      Subtotal: built.subtotal,
      Diskon: built.diskon,
      Pajak: built.pajak,
      Total: built.total,
      Metode_Bayar: data.metodeBayar || 'Tunai',
      Bayar: built.bayar,
      Kembali: built.kembali,
      Poin_Didapat: poinDidapat,
      Status: 'Diproses',
      ID_Shift: idShift,
      Catatan: data.catatan || ''
    });

    // Stock is kept in the base unit. Aggregate duplicate product lines so
    // one physical stock mutation occurs per product.
    Object.keys(built.aggregate).forEach(function(code) {
      var a = built.aggregate[code];
      var ref = currentByCode[code];
      var before = Number(ref.row[stockCol - 1]) || 0;
      var after = before - a.qtyDasar;
      shObat.getRange(ref.rowIndex, stockCol).setValue(after);
      if (updatedCol > 0) shObat.getRange(ref.rowIndex, updatedCol).setValue(now);
      tulisLogStok(code, a.name, 'Penjualan', before, -a.qtyDasar, after, 'Transaksi ' + idTransaksi, user.Nama, idTransaksi);
    });

    var shDetail = getSheet(SHEET_NAMES.DETAIL_TRANSAKSI);
    var detailHeaders = shDetail.getRange(1, 1, 1, shDetail.getLastColumn()).getValues()[0];
    var detailRows = built.plan.map(function(item) {
      var object = {
        ID_Detail: nextId('DT', SHEET_NAMES.DETAIL_TRANSAKSI, 'ID_Detail'),
        ID_Transaksi: idTransaksi,
        Kode_Obat: item.kodeObat,
        Nama_Obat: item.namaObat,
        Qty: item.qtyDasar,
        Harga_Satuan: item.qtyDasar ? item.subtotal / item.qtyDasar : 0,
        Subtotal: item.subtotal,
        Satuan_Jual: item.satuanJual,
        Qty_Satuan_Jual: item.qtyJual,
        Konversi_Ke_Dasar: item.konversiKeDasar,
        Harga_Satuan_Jual: item.hargaSatuanJual
      };
      return detailHeaders.map(function(h) { return object[h] !== undefined ? object[h] : ''; });
    });
    if (detailRows.length) shDetail.getRange(shDetail.getLastRow() + 1, 1, detailRows.length, detailHeaders.length).setValues(detailRows);

    if (customerUpdate) {
      var h = customerUpdate.headers;
      customerUpdate.sheet.getRange(customerUpdate.rowIndex, h.indexOf('Poin') + 1).setValue(customerUpdate.oldPoin + poinDidapat);
      customerUpdate.sheet.getRange(customerUpdate.rowIndex, h.indexOf('Total_Belanja') + 1).setValue(customerUpdate.oldTotal + built.total);
    }

    var trRow = findRowIndexByKey(SHEET_NAMES.TRANSAKSI, 'ID_Transaksi', idTransaksi);
    var trHeaders = HEADERS.Transaksi;
    shTr = getSheet(SHEET_NAMES.TRANSAKSI);
    shTr.getRange(trRow, trHeaders.indexOf('Status') + 1).setValue('Selesai');

    return {
      idTransaksi: idTransaksi,
      ID_Transaksi: idTransaksi,
      total: built.total,
      subtotal: built.subtotal,
      diskon: built.diskon,
      pajak: built.pajak,
      bayar: built.bayar,
      kembali: built.kembali,
      poinDidapat: poinDidapat,
      items: built.plan.map(function(item) {
        return {
          kodeObat: item.kodeObat,
          namaObat: item.namaObat,
          satuanJual: item.satuanJual,
          qtySatuanJual: item.qtyJual,
          konversiKeDasar: item.konversiKeDasar,
          qtyDasar: item.qtyDasar,
          hargaSatuanJual: item.hargaSatuanJual,
          subtotal: item.subtotal
        };
      })
    };
  } finally {
    lock.releaseLock();
  }
}

/** Read-only audit of multi-unit product configuration. */
function auditMultiSatuanV3() {
  var sh = getSheet(SHEET_NAMES.OBAT);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var rows = sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  var i = function(name) { return headers.indexOf(name); };
  var result = { totalProducts: rows.length, secondaryConfigured: 0, activeSecondary: 0, invalid: [], checkedAt: formatTanggalManusiawi_(new Date()) };
  rows.forEach(function(r, n) {
    var name = String(r[i('Nama_Obat')] || '');
    var unit = String(r[i('Satuan_Jual_2')] || '').trim();
    var factor = Number(r[i('Isi_Per_Satuan_2')] || 0);
    var price = Number(r[i('Harga_Jual_2')] || 0);
    var active = r[i('Aktif_Satuan_2')] === true || String(r[i('Aktif_Satuan_2')]).toUpperCase() === 'TRUE' || String(r[i('Aktif_Satuan_2')]).toLowerCase() === 'ya';
    if (unit || factor !== 1 || price !== 0 || active) result.secondaryConfigured++;
    if (active) result.activeSecondary++;
    if (active && (!unit || !Number.isInteger(factor) || factor <= 1 || price <= 0)) {
      result.invalid.push({ row: n + 2, namaObat: name, satuanJual2: unit, isiPerSatuan2: factor, hargaJual2: price });
    }
  });
  result.ok = result.invalid.length === 0;
  return result;
}
