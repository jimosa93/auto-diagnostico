const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lib=require('../generador/vendor/pdf-lib.min.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const context={};
new Function('window',[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('root.Peritaje=')))(context);
const P=context.Peritaje;
async function render(data){
 const pages=[];
 const instrumented={...lib,PDFDocument:{create:async()=>{
  const doc=await lib.PDFDocument.create(),addPage=doc.addPage.bind(doc);
  doc.addPage=(...args)=>{const page=addPage(...args),texts=[];pages.push(texts);const draw=page.drawText.bind(page);page.drawText=(text,options)=>{texts.push({text,...options});return draw(text,options);};return page;};return doc;
 }}};
 const bytes=await P.makePDF(data,instrumented);return {bytes,pages};
}
test('priority observations migrate old drafts without losing rows and round-trip as text',()=>{
 const d=P.blank();assert.equal(d.priority,'');
 const imported=P.normalize({...d,priority:[{element:'Luz',finding:'Defectuosa'},{element:'',finding:'Solo hallazgo'},{element:'Freno',finding:''},{element:'',finding:''}]});
 assert.equal(imported.priority,'Luz: Defectuosa\nSolo hallazgo\nFreno');
 assert.equal(P.normalize(JSON.parse(JSON.stringify(imported))).priority,imported.priority);
 const long=P.normalize({...d,priority:Array.from({length:6},()=>({element:'Elemento',finding:'x'.repeat(4000)}))});
 assert.equal(P.normalize(JSON.parse(JSON.stringify(long))).priority,long.priority);
});
test('percentage colors include exact boundaries and reject empty or invalid scores',()=>{
 for(const [value,tone] of [[0,'red'],[64,'red'],['64,9','red'],[65,'amber'],[79.9,'amber'],[80,'green'],[100,'green'],['','muted'],['abc','muted'],[101,'muted'],[-1,'muted']])assert.equal(P.scoreTone(value),tone);
});
test('report puts concept on first page, highlights percentages and appends one complete clauses page',async()=>{
 const d=P.example();d.perito='Perito de prueba';d.body[0].finding='Desgaste 64%, remanente 65% y referencia 80%.';d.tires=['0','64','65','100'];
 const {bytes,pages}=await render(d);
 assert.equal((await lib.PDFDocument.load(bytes)).getPageCount(),4);
 const texts=pages.map(p=>p.map(t=>t.text).join('\n'));
 assert(texts[0].indexOf('Concepto del peritaje')>texts[0].indexOf('Resultado del peritaje'));
 assert(texts[0].indexOf('Concepto del peritaje')<texts[0].indexOf('Observaciones para lectura prioritaria'));
 assert(texts[0].includes('Sistemas de identificación'));
 assert(pages[0].some(t=>t.text===d.plate&&t.size===24));
 for(const [score,color] of [['64%',{red:.68,green:.13,blue:.13}],['65%',{red:181/255,green:96/255,blue:0}],['80%',{red:.06,green:.40,blue:.28}]]){
  const t=pages[1].find(t=>t.text===score);assert(t,score);assert(t.font.name.includes('Bold'));assert(t.size>9.5);for(const key of Object.keys(color))assert.equal(t.color[key],color[key]);
 }
 for(const title of ['EVIDENCIA FOTOGRÁFICA','INFORMACIÓN DOCUMENTAL EXTERNA','ALCANCE DEL SERVICIO','CONDICIÓN DE LA INSPECCIÓN','METODOLOGÍA Y ACCESIBILIDAD','INSPECCIÓN SIN DESMONTAJE','FALLAS NO EVIDENCIABLES','DIAGNÓSTICO Y ESTIMACIONES','USO DEL INFORME'])assert(texts.at(-1).includes(title),title);
 assert(!texts.slice(0,-1).some(t=>t.includes('CLÁUSULAS Y ALCANCE')));
 for(const t of pages.at(-1).filter(t=>t.y>63))assert(t.x+t.font.widthOfTextAtSize(t.text,t.size)<=577,`Overflow: ${t.text}`);
 const slogan=pages.at(-1).find(t=>t.text==='Cali – Valle del Cauca');assert(slogan.y>=78,`Clauses overflow footer: ${slogan.y}`);
});
test('long observations and continuation retain their endings before final clauses',async()=>{
 const d=P.example();d.priority=('Observación extensa del vehículo. '.repeat(300))+'FIN PRIORIDAD';d.continuation=('Detalle adicional del expediente. '.repeat(300))+'FIN CONTINUACIÓN';
 const {pages}=await render(d),texts=pages.map(p=>p.map(t=>t.text).join('\n'));
 assert(texts[0].includes('Concepto del peritaje'));
 assert(texts.slice(0,-1).join(' ').replace(/\s+/g,' ').includes('FIN PRIORIDAD'));
 assert(texts.slice(0,-1).join(' ').replace(/\s+/g,' ').includes('FIN CONTINUACIÓN'));
 assert(texts.at(-1).includes('CLÁUSULAS Y ALCANCE'));
});
test('a concept longer than one page continues without dropping text',async()=>{
 const d=P.example();d.concept='INICIO CONCEPTO '+('Concepto técnico y recomendaciones. '.repeat(300))+'FIN CONCEPTO';
 const {pages}=await render(d),texts=pages.map(p=>p.map(t=>t.text).join(' ').replace(/\s+/g,' '));
 assert(texts[0].includes('INICIO CONCEPTO'));
 assert(texts.slice(1,-1).join(' ').includes('FIN CONCEPTO'));
 assert(texts.at(-1).includes('CLÁUSULAS Y ALCANCE'));
});
test('status colors survive wrapped table cells and agree with summary and technical detail',async()=>{
 const tones={APROBADO:[.06,.40,.28],'APROBADO CON OBSERVACIONES':[181/255,96/255,0],'NO APROBADO':[.68,.13,.13],'SIN EVALUAR':[.36,.42,.51]};
 for(const [state,color] of Object.entries(tones)){
  const d=P.example();d.result=state;d.bodyState=state;d.chassisState=state;
  const {pages}=await render(d);
  const statusRuns=pages.slice(0,2).flat().filter(t=>t.text===state||(state==='APROBADO CON OBSERVACIONES'&&['APROBADO CON','OBSERVACIONES'].includes(t.text)));
  assert(statusRuns.length>=5,state);
  for(const t of statusRuns){assert(t.font.name.includes('Bold'));assert.deepEqual([t.color.red,t.color.green,t.color.blue],color);}
  const plate=pages[0].find(t=>t.text===d.plate&&t.y>700);assert(plate.x>=442&&plate.x+plate.font.widthOfTextAtSize(plate.text,plate.size)<=576);assert.equal(plate.color.red,0);
  assert(pages[0].some(t=>t.text==='COLOMBIA'));
  const vehicle=pages[0].find(t=>t.text.startsWith('Nissan March'));assert(vehicle.font.name.includes('Bold'));assert.equal(vehicle.size,15);
 }
});
test('imprints fit their printed rectangle without upscaling or changing orientation',()=>{
 for(const [w,h,expected] of [[6000,4000,{width:450,height:300}],[6000,1000,{width:1000,height:167}],[2000,6000,{width:100,height:300}],[180,45,{width:180,height:45}]])assert.deepEqual(P.imprintSize(w,h),expected);
 for(const [w,h] of [[0,200],[100,-1],[Infinity,200]])assert.throws(()=>P.imprintSize(w,h),/dimensiones/);
});
test('already compact JPEG imprints are reused byte for byte on repeat export',async()=>{
 const jpeg='data:image/jpeg;base64,'+fs.readFileSync(require('node:path').join(__dirname,'fixtures/photo.jpg')).toString('base64');
 context.Image=class{naturalWidth=180;naturalHeight=45;set src(value){queueMicrotask(()=>this.onload());}};
 try{assert.equal(await P.optimizeImprint(jpeg),jpeg);assert.equal(await P.optimizeImprint(await P.optimizeImprint(jpeg)),jpeg);}finally{delete context.Image;}
});
test('short leaks stay below side-by-side chassis and tires on the technical page',async()=>{
 const d=P.example();d.leaks='MOTOR-FUGA\nCAJA-FUGA\nHIDRÁULICO-FUGA\nREFRIGERANTE-FUGA';d.chassisState='APROBADO CON OBSERVACIONES';
 const {pages}=await render(d);assert.equal(pages.length,4);
 const technical=pages[1],chassis=technical.find(t=>t.text==='Chasis y estructura'),tires=technical.find(t=>t.text==='Llantas'),leaks=technical.find(t=>t.text==='Fugas');
 assert.equal(chassis.x,36);assert.equal(tires.x,318);assert.equal(chassis.y,tires.y);assert(leaks.y<chassis.y);
 assert(technical.some(t=>t.text==='REFRIGERANTE-FUGA'));
 const columnBody=technical.filter(t=>t.y<chassis.y&&t.y>leaks.y);
 for(const t of columnBody)assert(t.x+t.font.widthOfTextAtSize(t.text,t.size)<=(t.x<318?294:576)+.01,`Column overflow: ${t.text}`);
});
test('stacked layout stays when everything fits or body already needs continuation',async()=>{
 for(const count of [3,16,35]){
  const d=P.example();d.body=Array.from({length:count},(_,i)=>({element:'Elemento '+i,finding:'Hallazgo '+i}));d.leaks='Fuga de motor';
  const {pages}=await render(d);const tires=pages.flat().find(t=>t.text==='Llantas');assert.equal(tires.x,36,`Body rows: ${count}`);
  assert(pages.flat().some(t=>t.text==='Hallazgo '+(count-1)));
  assert(pages.flat().some(t=>t.text==='Fuga de motor'));
 }
});
test('long chassis and leaks keep full-width pagination and preserve their final text',async()=>{
 for(const kind of ['chassis','leaks']){
  const d=P.example();if(kind==='chassis')d.chassis=[{element:'Cuna',finding:'Detalle técnico. '.repeat(600)+'FIN CHASIS'}];else d.leaks='Fuga observada. '.repeat(600)+'FIN FUGAS';
  const {pages}=await render(d);assert.equal(pages.flat().find(t=>t.text==='Llantas').x,36);
  assert(pages.slice(1,-1).flat().map(t=>t.text).join(' ').replace(/\s+/g,' ').includes(kind==='chassis'?'FIN CHASIS':'FIN FUGAS'));
  assert(pages.at(-1).some(t=>t.text==='04 / CLÁUSULAS Y ALCANCE'));
 }
});
test('near page boundaries columns never spill into the footer or lose leak lines',async()=>{
 for(const count of [9,10,11,12,13,14])for(const leakLines of [1,4,12]){
  const d=P.example();d.body=Array.from({length:count},(_,i)=>({element:'Pieza '+i,finding:'Hallazgo reportado'}));d.leaks=Array.from({length:leakLines},(_,i)=>'Fuga '+i).join('\n');
  const {pages}=await render(d);const technical=pages.slice(1,-1).flat();for(let i=0;i<leakLines;i++)assert(technical.some(t=>t.text==='Fuga '+i));
  for(const t of technical.filter(t=>t.size>=9))assert(t.y>=78,`Footer overlap: ${count}/${leakLines}: ${t.text}`);
  const columnPage=pages.find(p=>p.some(t=>t.text==='Llantas'&&t.x===318));if(columnPage)assert(columnPage.some(t=>t.text==='Fuga '+(leakLines-1)));
 }
});
test('only the first page has the large header; continuations are compact and clauses have none',async()=>{
 const d=P.example();d.service='AD-143';d.concept='Concepto técnico. '.repeat(300);d.body=Array.from({length:35},(_,i)=>({element:'Elemento '+i,finding:'Hallazgo'}));
 const {pages}=await render(d);assert(pages.length>4);
 const firstPlate=pages[0].find(t=>t.text===d.plate&&t.y>700);assert.equal(firstPlate.size,24);
 for(const p of pages.slice(1,-1)){
  const title=p.find(t=>t.text==='INFORME TÉCNICO VEHICULAR'),service=p.find(t=>t.text==='Servicio: AD-143'),plate=p.find(t=>t.text===d.plate&&t.y>700);
  for(const t of [title,service])assert(Math.abs(t.x+t.font.widthOfTextAtSize(t.text,t.size)/2-306)<.01);
  assert(service.font.name.includes('Bold'));assert(plate.size<firstPlate.size);
  const section=p.find(t=>/^0[123] \/ /.test(t.text));assert(section.y>pages[0].find(t=>t.text==='01 / RESUMEN DE LA INSPECCIÓN').y);
 }
 const clauses=pages.at(-1);assert(!clauses.some(t=>['INFORME TÉCNICO VEHICULAR','Servicio: AD-143',d.plate,'COLOMBIA'].includes(t.text)));
 assert(clauses.some(t=>t.text==='04 / CLÁUSULAS Y ALCANCE'&&t.y>730));
 assert(clauses.some(t=>t.size===9.2));assert(clauses.find(t=>t.text==='Cali – Valle del Cauca').y>=78);
});
