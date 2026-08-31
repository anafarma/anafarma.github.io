/* ANA FARMA DEV — Sales Engine V3 pure contract tests. */
'use strict';

function normalize(product, requestedUnit) {
  const baseUnit = String(product.Satuan || 'Pcs').trim() || 'Pcs';
  const basePrice = Number(product.Harga_Jual || 0);
  const altName = String(product.Satuan_Jual_2 || '').trim();
  const altFactor = Number(product.Isi_Per_Satuan_2 || 0);
  const altPrice = Number(product.Harga_Jual_2 || 0);
  const active = product.Aktif_Satuan_2 === true || String(product.Aktif_Satuan_2).toUpperCase() === 'TRUE' || String(product.Aktif_Satuan_2).toLowerCase() === 'ya';
  const req = String(requestedUnit || '').trim().toUpperCase();
  if (!req || req === 'PRIMARY' || req === 'NORMAL' || req === 'PCS' || req === baseUnit.toUpperCase()) {
    if (basePrice <= 0) throw new Error('base price invalid');
    return { key: 'PRIMARY', name: baseUnit, factor: 1, price: basePrice };
  }
  if (active && altName && Number.isInteger(altFactor) && altFactor > 0 && altPrice > 0 && req === altName.toUpperCase()) {
    return { key: 'SECONDARY', name: altName, factor: altFactor, price: altPrice };
  }
  throw new Error('invalid selling unit');
}

function calc(product, qty, unit) {
  if (!Number.isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty) throw new Error('invalid qty');
  const u = normalize(product, unit);
  return { baseQty: qty * u.factor, subtotal: qty * u.price, unit: u };
}

const product = { Satuan: 'Pcs', Harga_Jual: 3000, Satuan_Jual_2: 'Box', Isi_Per_Satuan_2: 10, Harga_Jual_2: 25000, Aktif_Satuan_2: true };
const tests = [];
function pass(name, fn) { fn(); tests.push(name); }

pass('2 BOX x 10 = 20 base units', () => { const r = calc(product, 2, 'Box'); if (r.baseQty !== 20) throw new Error('wrong base qty'); });
pass('2 BOX = Rp50.000', () => { const r = calc(product, 2, 'Box'); if (r.subtotal !== 50000) throw new Error('wrong subtotal'); });
pass('3 PCS = 3 base units', () => { const r = calc(product, 3, 'Pcs'); if (r.baseQty !== 3) throw new Error('wrong base qty'); });
pass('3 PCS = Rp9.000', () => { const r = calc(product, 3, 'Pcs'); if (r.subtotal !== 9000) throw new Error('wrong subtotal'); });
pass('unknown unit rejected', () => { let rejected = false; try { calc(product, 1, 'Strip'); } catch (_) { rejected = true; } if (!rejected) throw new Error('unknown unit accepted'); });
pass('inactive secondary unit rejected', () => { let rejected = false; try { calc({ ...product, Aktif_Satuan_2: false }, 1, 'Box'); } catch (_) { rejected = true; } if (!rejected) throw new Error('inactive unit accepted'); });
pass('fractional quantity rejected', () => { let rejected = false; try { calc(product, 1.5, 'Box'); } catch (_) { rejected = true; } if (!rejected) throw new Error('fractional qty accepted'); });
pass('zero quantity rejected', () => { let rejected = false; try { calc(product, 0, 'Pcs'); } catch (_) { rejected = true; } if (!rejected) throw new Error('zero qty accepted'); });

console.log(`PASS ${tests.length}/${tests.length}`);
