/**
 * ANA FARMA DEV — Diagnostic V3
 * Safe diagnostic: READ ONLY, never mutates business data.
 *
 * Paste this file into the DEVELOPMENT Apps Script project.
 * Run diagnosticPenjualanV3().
 */

function diagnosticPenjualanV3() {
  var started = new Date();
  var result = {
    ok: false,
    version: '2026-08-31-DIAGNOSTIC-V3',
    startedAt: started.toISOString(),
    checks: [],
    warnings: [],
    errors: []
  };

  function check(name, fn) {
    var item = { name: name, ok: false };
    try {
      item.value = fn();
      item.ok = true;
    } catch (e) {
      item.error = {
        name: e && e.name ? String(e.name) : 'Error',
        message: e && e.message ? String(e.message) : String(e),
        stack: e && e.stack ? String(e.stack) : ''
      };
      result.errors.push({
        check: name,
        name: item.error.name,
        message: item.error.message,
        stack: item.error.stack
      });
    }
    result.checks.push(item);
    return item.ok;
  }

  check('Spreadsheet aktif', function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Spreadsheet aktif tidak ditemukan.');
    return { name: ss.getName(), id: ss.getId() };
  });

  check('Timezone Spreadsheet', function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    if (!tz) throw new Error('Timezone Spreadsheet kosong.');
    return tz;
  });

  check('Sheet Obat', function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Obat');
    if (!sh) throw new Error('Sheet Obat tidak ditemukan.');
    return { rows: sh.getLastRow(), columns: sh.getLastColumn() };
  });

  check('Header Obat', function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Obat');
    if (!sh) throw new Error('Sheet Obat tidak ditemukan.');
    var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    var required = ['Kode_Obat', 'Nama_Obat', 'Stok', 'Harga_Jual', 'Satuan'];
    var missing = required.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) throw new Error('Header wajib hilang: ' + missing.join(', '));
    return { headers: headers, missing: missing };
  });

  check('Field multi-satuan', function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Obat');
    if (!sh) throw new Error('Sheet Obat tidak ditemukan.');
    var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    var fields = ['Satuan_Jual_2', 'Isi_Per_Satuan_2', 'Harga_Jual_2', 'Aktif_Satuan_2'];
    var missing = fields.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) throw new Error('Field multi-satuan hilang: ' + missing.join(', '));
    return 'Semua field multi-satuan tersedia.';
  });

  check('Sheet Detail_Transaksi', function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Detail_Transaksi');
    if (!sh) throw new Error('Sheet Detail_Transaksi tidak ditemukan.');
    return { rows: sh.getLastRow(), columns: sh.getLastColumn() };
  });

  check('Header Detail_Transaksi kompatibel', function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Detail_Transaksi');
    if (!sh) throw new Error('Sheet Detail_Transaksi tidak ditemukan.');
    var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    var base = ['ID_Detail', 'ID_Transaksi', 'Kode_Obat', 'Nama_Obat', 'Qty', 'Harga_Satuan', 'Subtotal'];
    var missingBase = base.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missingBase.length) throw new Error('Header dasar hilang: ' + missingBase.join(', '));
    var recommended = ['Satuan_Jual', 'Qty_Satuan_Jual', 'Konversi_Ke_Dasar', 'Harga_Satuan_Jual'];
    var missingRecommended = recommended.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missingRecommended.length) result.warnings.push({ check: 'Detail_Transaksi', missing: missingRecommended });
    return { headers: headers, missingRecommended: missingRecommended };
  });

  check('Sheet Offline_Sync', function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Offline_Sync');
    if (!sh) throw new Error('Sheet Offline_Sync tidak ditemukan.');
    return { rows: sh.getLastRow(), columns: sh.getLastColumn() };
  });

  check('Offline_Sync header', function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Offline_Sync');
    if (!sh) throw new Error('Sheet Offline_Sync tidak ditemukan.');
    var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    var required = ['RequestId', 'Action', 'IdUser', 'CreatedAt', 'SyncedAt', 'Status', 'ID_Transaksi', 'PayloadHash', 'Error'];
    var missing = required.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) throw new Error('Header Offline_Sync hilang: ' + missing.join(', '));
    return headers;
  });

  check('Fungsi createTransaksi', function () {
    if (typeof createTransaksi !== 'function') throw new Error('createTransaksi tidak tersedia.');
    return 'FUNCTION_EXISTS';
  });

  check('Fungsi getShiftStatus', function () {
    if (typeof getShiftStatus !== 'function') throw new Error('getShiftStatus tidak tersedia.');
    return 'FUNCTION_EXISTS';
  });

  check('Format tanggal manusiawi', function () {
    if (typeof formatTanggalManusiawi_ !== 'function') throw new Error('formatTanggalManusiawi_ tidak tersedia.');
    var value = formatTanggalManusiawi_(new Date());
    if (!value) throw new Error('Hasil format tanggal kosong.');
    return String(value);
  });

  check('Konstanta timezone legacy', function () {
    if (typeof TIMEZONE === 'undefined') throw new Error('TIMEZONE tidak tersedia.');
    return String(TIMEZONE);
  });

  check('Konstanta timezone offset legacy', function () {
    if (typeof TIMEZONE_OFFSET === 'undefined') throw new Error('TIMEZONE_OFFSET tidak tersedia.');
    return String(TIMEZONE_OFFSET);
  });

  check('Model transaksi multi-satuan — pure calculation', function () {
    var qtyBox = 2;
    var isiPerBox = 10;
    var hargaBox = 25000;
    var baseQty = qtyBox * isiPerBox;
    var subtotal = qtyBox * hargaBox;
    if (baseQty !== 20) throw new Error('Konversi BOX gagal: expected 20, got ' + baseQty);
    if (subtotal !== 50000) throw new Error('Subtotal BOX gagal.');
    return { qtyJual: qtyBox, satuanJual: 'BOX', isiPerSatuan: isiPerBox, qtyDasar: baseQty, subtotal: subtotal };
  });

  result.finishedAt = new Date().toISOString();
  var failed = result.checks.filter(function (x) { return !x.ok; });
  result.ok = failed.length === 0;
  result.summary = {
    total: result.checks.length,
    passed: result.checks.filter(function (x) { return x.ok; }).length,
    failed: failed.length,
    warnings: result.warnings.length
  };

  Logger.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  return result;
}
