const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../generador/vendor/pdf-lib.min.js');
const { photoPDF, mergePDFs, textPDF } = require('../generador/pdf.js');
const image = fs.readFileSync(path.join(__dirname, 'fixtures/photo.jpg'));
const vehicle = { plate: 'DEMO01', brand: 'Marca de prueba', line: 'Línea', year: '2020', service: 'AD-TEST' };
const photo = (category = 0) => ({ data: image, caption: 'Inspección de prueba: fotografía sin distorsión.', category });

test('simple: paginates seven photos and embeds each image', async () => {
  const result = await photoPDF({ vehicle, photos: Array.from({ length: 7 }, () => photo()), density: 4 }, lib);
  const pdf = await lib.PDFDocument.load(result.bytes);
  assert.equal(result.pages, 2);
  assert.deepEqual(pdf.getPages().map(p => p.node.Resources().lookup(lib.PDFName.of('XObject')).keys().length), [4, 3]);
});
test('classified: starts each nonempty category on a new page', async () => {
  const result = await photoPDF({ vehicle, photos: [photo(1), photo(4), photo(1), photo(6)], classified: true, density: 4 }, lib);
  const pdf = await lib.PDFDocument.load(result.bytes);
  assert.equal(result.pages, 3);
  assert.deepEqual(pdf.getPages().map(p => p.node.Resources().lookup(lib.PDFName.of('XObject')).keys().length), [2, 1, 1]);
});
test('photo validation rejects missing plate, empty lists and unsupported layout', async () => {
  await assert.rejects(photoPDF({ vehicle: {}, photos: [photo()] }, lib), /placa/);
  await assert.rejects(photoPDF({ vehicle, photos: [] }, lib), /fotografía/);
  await assert.rejects(photoPDF({ vehicle, photos: [photo()], density: 3 }, lib), /2, 4 o 6/);
});
test('merge preserves page order and dimensions', async () => {
  const a = await lib.PDFDocument.create(); a.addPage([200, 300]); a.addPage([250, 350]);
  const b = await lib.PDFDocument.create(); b.addPage([600, 400]);
  const merged = await mergePDFs([{ data: await a.save() }, { data: await b.save() }], lib);
  const doc = await lib.PDFDocument.load(merged.bytes);
  assert.deepEqual(doc.getPages().map(p => [p.getWidth(), p.getHeight()]), [[200, 300], [250, 350], [600, 400]]);
  await assert.rejects(mergePDFs([{ data: await a.save() }], lib), /dos PDFs/);
});
test('text conversion paginates long text, accented text and unsupported symbols', async () => {
  const result = await textPDF('Revisión técnica: identificación, ñ y á. 🚙\n'.repeat(200), 'Prueba', lib);
  assert(result.pages > 1);
  assert.equal((await lib.PDFDocument.load(result.bytes)).getPageCount(), result.pages);
  await assert.rejects(textPDF('   ', '', lib), /texto/);
});
