const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../generador/photo-engine.js');
const lib=require('../generador/vendor/pdf-lib.min.js');
const image=fs.readFileSync(path.join(__dirname,'fixtures/photo.jpg'));
function fixture(count=12){const d=E.blank();d.plate='TEST01';d.photos=Array.from({length:count},(_,i)=>({id:String(i),category:'general',caption:'Fotografía de prueba '+i,large:false}));return d;}
const items=d=>new Map(d.photos.map(p=>[p.id,{blob:new Blob([image],{type:'image/jpeg'})}]));
test('optimization responds to printed size, protection and quality profile',()=>{
 const small=E.optimizationSettings('balanced',false,false,4);
 assert(small.max<500);
 assert(E.optimizationSettings('balanced',false,false,2).max>small.max);
 assert(E.optimizationSettings('balanced',true,false,4).max>small.max);
 assert(E.optimizationSettings('balanced',false,true,4).max>E.optimizationSettings('balanced',true,false,4).max);
 assert(E.optimizationSettings('compact',false,false,4).max<small.max);
 assert(E.optimizationSettings('detail',false,false,4).max>small.max);
});
test('metadata preserves layout and transforms and rejects excessive/duplicate imports',()=>{
 const d=fixture(1);d.layout='simple';d.photos[0].rotation=90;d.photos[0].large=true;
 const copy=E.validateMetadata(JSON.parse(JSON.stringify(d)));
 assert.equal(copy.layout,'simple');assert.equal(copy.photos[0].rotation,90);assert.equal(copy.photos[0].large,true);
 assert.throws(()=>E.validateMetadata({...d,photos:[d.photos[0],d.photos[0]]}),/duplicadas/);
 assert.throws(()=>E.validateMetadata({...d,photos:Array(201).fill(d.photos[0])}),/200/);
});
test('four columns pack twelve ordinary photos on one page',async()=>{
 const d=fixture();const output=await E.buildPDF(d,items(d),()=>{},lib);
 assert.equal(output.pages,1);
 const pdf=await lib.PDFDocument.load(output.bytes);
 assert.equal(pdf.getPage(0).node.Resources().lookup(lib.PDFName.of('XObject')).keys().length,12);
});
test('detail categories and full-width images increase the space used',async()=>{
 const d=fixture();d.photos.forEach(p=>p.category='documentos');
 const detail=await E.buildPDF(d,items(d),()=>{},lib);assert(detail.pages>1);
 d.photos.forEach(p=>p.large=true);
 const large=await E.buildPDF(d,items(d),()=>{},lib);assert(large.pages>detail.pages);
});
test('simple mode includes every photo and supports a custom category',async()=>{
 const d=fixture(3);d.categories.push({id:'custom',name:'Categoría de prueba',detail:false});d.photos[0].category='custom';d.layout='simple';
 const output=await E.buildPDF(d,items(d),()=>{},lib);assert.equal(output.pages,1);
 d.photos[0].category='invalid';await assert.rejects(E.buildPDF(d,items(d),()=>{},lib),/categoría válida/);
});
