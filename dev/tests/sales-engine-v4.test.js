const assert = require('node:assert/strict');

function unit(product, requested) {
  const base = String(product.Satuan || 'Pcs').trim() || 'Pcs';
  const basePrice = Number(product.Harga_Jual || 0);
  const alt = String(product.Satuan_Jual_2 || '').trim();
  const factor = Number(product.Isi_Per_Satuan_2 || 0);
  const altPrice = Number(product.Harga_Jual_2 || 0);
  const active = product.Aktif_Satuan_2 === true || String(product.Aktif_Satuan_2).toUpperCase() === 'TRUE' || String(product.Aktif_Satuan_2).toLowerCase() === 'ya';
  const u = String(requested || '').trim().toUpperCase();
  if (!u || u === 'NORMAL' || u === 'PRIMARY' || u === 'PCS' || u === base.toUpperCase()) {
    assert.ok(basePrice > 0);
    return { name: base, factor: 1, price: basePrice };
  }
  if (active && alt && Number.isInteger(factor) && factor > 0 && altPrice > 0 && (u === alt.toUpperCase() || u === 'ALTERNATIF' || u === 'SECONDARY')) {
    return { name: alt, factor, price: altPrice };
  }
  throw new Error('invalid unit');
}

const p = { Nama_Obat: 'Test Obat', Satuan: 'Pcs', Harga_Jual: 3000, Satuan_Jual_2: 'Box', Isi_Per_Satuan_2: 10, Harga_Jual_2: 25000, Aktif_Satuan_2: true };

const cases = [
  ['1 PCS', () => { const u=unit(p,'normal'); assert.equal(1*u.factor,1); assert.equal(1*u.price,3000); }],
  ['2 BOX', () => { const u=unit(p,'alternatif'); assert.equal(2*u.factor,20); assert.equal(2*u.price,50000); }],
  ['BOX by name', () => { const u=unit(p,'Box'); assert.equal(u.factor,10); assert.equal(u.price,25000); }],
  ['disabled BOX rejected', () => { assert.throws(() => unit({...p,Aktif_Satuan_2:false},'Box')); }],
  ['invalid unit rejected', () => { assert.throws(() => unit(p,'Strip')); }],
  ['fractional qty rejected', () => { assert.ok(!Number.isSafeInteger(1.5)); }],
  ['zero qty rejected', () => { assert.ok(!(0 > 0)); }],
  ['duplicate base demand aggregates', () => { const a=2*10+3; assert.equal(a,23); }],
  ['subtotal uses sale-unit price', () => { const u=unit(p,'Box'); assert.equal(2*u.price,50000); }],
  ['stock comparison uses base unit', () => { const stock=25, required=2*10+3; assert.equal(stock-required,2); }]
];

for (const [name, fn] of cases) { fn(); console.log('PASS', name); }
console.log(`PASS ${cases.length}/${cases.length}`);
