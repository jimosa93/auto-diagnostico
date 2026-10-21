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
 for(const [score,color] of [['64%',{red:.68,green:.13,blue:.13}],['65%',{red:.60,green:.36,blue:.03}],['80%',{red:.06,green:.40,blue:.28}]]){
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
