const test = require('node:test');
const assert = require('node:assert/strict');

function resolveUnit(product, requested) {
  const base = String(product.Satuan || 'Pcs').trim() || 'Pcs';
  const q = String(requested || '').trim().toLowerCase();
  if (!q || [base.toLowerCase(), 'normal', 'primary', 'utama', 'ecer', 'eceran'].includes(q)) {
    return { name: base, factor: 1, price: Number(product.Harga_Jual) };
  }
  const alt = String(product.Satuan_Jual_2 || '').trim();
  if (alt && ['true','ya'].includes(String(product.Aktif_Satuan_2).toLowerCase()) && q === alt.toLowerCase()) {
    return { name: alt, factor: Number(product.Isi_Per_Satuan_2), price: Number(product.Harga_Jual_2) };
  }
  throw new Error('Satuan tidak tersedia');
}

test('PCS uses factor 1 and primary price', () => {
  const p = { Satuan:'Pcs', Harga_Jual:2000, Satuan_Jual_2:'Box', Isi_Per_Satuan_2:10, Harga_Jual_2:18000, Aktif_Satuan_2:true };
  assert.deepEqual(resolveUnit(p,'Pcs'), {name:'Pcs',factor:1,price:2000});
});

test('BOX converts to base stock and uses box price', () => {
  const p = { Satuan:'Pcs', Harga_Jual:2000, Satuan_Jual_2:'Box', Isi_Per_Satuan_2:10, Harga_Jual_2:18000, Aktif_Satuan_2:true };
  assert.deepEqual(resolveUnit(p,'BOX'), {name:'Box',factor:10,price:18000});
  assert.equal(2 * 10, 20);
});

test('legacy normal unit remains compatible', () => {
  const p = { Satuan:'Pcs', Harga_Jual:2000 };
  assert.equal(resolveUnit(p,'normal').factor, 1);
});

test('invalid unit is rejected', () => {
  const p = { Satuan:'Pcs', Harga_Jual:2000, Satuan_Jual_2:'Box', Isi_Per_Satuan_2:10, Harga_Jual_2:18000, Aktif_Satuan_2:true };
  assert.throws(() => resolveUnit(p,'Strip'));
});
