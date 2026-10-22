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
  doc.addPage=(...args)=>{const page=addPage(...args),texts=[];pages.push(texts);texts.images=[];const drawImage=page.drawImage.bind(page);page.drawImage=(image,options)=>{texts.images.push(options);return drawImage(image,options);};const draw=page.drawText.bind(page);page.drawText=(text,options)=>{texts.push({text,...options});return draw(text,options);};return page;};return doc;
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
 assert(texts[0].indexOf('Concepto del peritaje')>texts[0].indexOf('Resumen del peritaje'));
 assert(texts[0].indexOf('Concepto del peritaje')<texts[0].indexOf('Información del vehículo'));assert(!texts[0].includes('Observaciones generales'));assert(texts[2].includes('Observaciones generales'));
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
test('annex photos fit their printed rectangle without upscaling or changing orientation',()=>{
 for(const [w,h,expected] of [[6000,4000,{width:1400,height:933}],[6000,1000,{width:1400,height:233}],[2000,6000,{width:333,height:1000}],[180,45,{width:180,height:45}]])assert.deepEqual(P.photoSize(w,h),expected);
 for(const [w,h] of [[0,200],[100,-1],[Infinity,200]])assert.throws(()=>P.photoSize(w,h),/dimensiones/);
});
test('already compact JPEG photos are reused byte for byte on repeat export',async()=>{
 const jpeg='data:image/jpeg;base64,'+fs.readFileSync(require('node:path').join(__dirname,'fixtures/photo.jpg')).toString('base64');
 context.Image=class{naturalWidth=180;naturalHeight=45;set src(value){queueMicrotask(()=>this.onload());}};
 try{assert.equal(await P.optimizePhoto(jpeg),jpeg);assert.equal(await P.optimizePhoto(await P.optimizePhoto(jpeg)),jpeg);}finally{delete context.Image;}
});
test('body and chassis use independent columns and mechanics starts on its own page',async()=>{
 const {pages}=await render(P.example()),technical=pages[1],mechanics=pages[2];
 const body=technical.find(t=>t.text==='Carrocería y pintura'),chassis=technical.find(t=>t.text==='Chasis y estructura');
 assert.equal(body.x,36);assert.equal(chassis.x,318);assert.equal(body.y,chassis.y);
 assert(mechanics.some(t=>t.text==='Estado de llantas'));assert(mechanics.some(t=>t.text==='Fugas de fluidos'));assert(mechanics.some(t=>t.text==='Firma del responsable'));
 assert(!technical.some(t=>t.text==='Estado de llantas'));assert(!pages.flat().some(t=>/HOJA [234]/.test(t.text)));
});
test('both inspection columns paginate long rows without losing endings or crossing their bounds',async()=>{
 const d=P.example();d.body=Array.from({length:45},(_,i)=>({element:'Carrocería '+i,finding:'Hallazgo izquierdo '+i}));d.chassis=Array.from({length:35},(_,i)=>({element:'Estructura '+i,finding:'Hallazgo derecho '+i}));
 d.body.push({element:'Pieza extensa',finding:'Detalle largo. '.repeat(500)+'FIN IZQUIERDA'});d.chassis.push({element:'Estructura extensa',finding:'Estructura larga. '.repeat(600)+'FIN DERECHA'});
 const {pages}=await render(d),all=pages.flat().map(t=>t.text).join(' ').replace(/\s+/g,' ');
 for(let i=0;i<45;i++)assert(all.includes('Hallazgo izquierdo '+i));for(let i=0;i<35;i++)assert(all.includes('Hallazgo derecho '+i));
 for(const ending of ['FIN IZQUIERDA','FIN DERECHA'])assert(all.includes(ending));
 const mechanicsIndex=pages.findIndex(p=>p.some(t=>t.text==='Estado de llantas'));assert(mechanicsIndex>2);
 for(const page of pages.slice(1,mechanicsIndex))for(const t of page.filter(t=>t.y<650&&t.size>=9)){
  assert(t.y>=78,`Footer overlap: ${t.text}`);assert(t.x+t.font.widthOfTextAtSize(t.text,t.size)<=(t.x<318?294:576)+.01,`Column overflow: ${t.text}`);
 }
});
test('long fluid findings and old free-text leaks keep their endings before clauses',async()=>{
 const d=P.example();d.leakRows[0].finding='Estado del motor. '.repeat(600)+'FIN SISTEMA';d.leaks='Texto antiguo. '.repeat(600)+'FIN FUGAS';
 const {pages}=await render(d),text=pages.slice(0,-1).flat().map(t=>t.text).join(' ').replace(/\s+/g,' ');
 for(const ending of ['FIN SISTEMA','FIN FUGAS','Firma del responsable'])assert(text.includes(ending));
 for(const p of pages)for(const t of p.filter(t=>t.size>=9))assert(t.y>=78,`Footer overlap: ${t.text}`);
});
test('only the first page has the large header; continuations are compact and clauses have none',async()=>{
 const d=P.example();d.service='AD-143';d.concept='Concepto técnico. '.repeat(300);d.body=Array.from({length:35},(_,i)=>({element:'Elemento '+i,finding:'Hallazgo'}));
 const {pages}=await render(d);assert(pages.length>4);
 const firstPlate=pages[0].find(t=>t.text===d.plate&&t.y>700);assert.equal(firstPlate.size,24);
 for(const p of pages.slice(1,-1)){
  const title=p.find(t=>t.text==='INFORME TÉCNICO VEHICULAR'),service=p.find(t=>t.text==='Servicio: AD-143'),plate=p.find(t=>t.text===d.plate&&t.y>700);
  for(const t of [title,service])assert(Math.abs(t.x+t.font.widthOfTextAtSize(t.text,t.size)/2-306)<.01);
  assert(service.font.name.includes('Bold'));assert(plate.size<firstPlate.size);
  const section=p.find(t=>/^0[1234] \/ /.test(t.text));assert(section.y>pages[0].find(t=>t.text==='01 / RESUMEN DEL PERITAJE').y);
 }
 const clauses=pages.at(-1);assert(!clauses.some(t=>['INFORME TÉCNICO VEHICULAR','Servicio: AD-143',d.plate,'COLOMBIA'].includes(t.text)));
 assert(clauses.some(t=>t.text==='05 / CLÁUSULAS Y ALCANCE'&&t.y>730));
 assert(clauses.some(t=>t.size===9.2));assert(clauses.find(t=>t.text==='Cali – Valle del Cauca').y>=78);
});
test('tire average includes all four values, including zero, and stays pending for incomplete or invalid data',()=>{
 assert.equal(P.tireAverage(['25','45','75','95']),60);
 assert.equal(P.tireAverage(['0','0','0','0']),0);
 assert.equal(P.tireAverage(['80','80','80','81']),80.25);
 for(const values of [['80','80','','80'],['80','80',null,'80'],['80','80','101','80'],['80','80','-1','80'],['80','80','x','80'],['80','80','80']])assert.equal(P.tireAverage(values),null);
});
test('mechanics page keeps the colored tire average between the title and table',async()=>{
 const d=P.example();d.tires=['25','45','75','95'];const {pages}=await render(d),p=pages.find(p=>p.some(t=>t.text==='Estado de llantas'));
 const title=p.find(t=>t.text==='Estado de llantas'),label=p.find(t=>t.text==='Calificación general: '),score=p.find(t=>t.text==='60%'),table=p.find(t=>t.text==='Posición');
 assert.equal(title.x,36);assert.equal(label.x,title.x);assert(title.y>label.y&&label.y>table.y);assert.equal(score.color.red,.68);assert(score.font.name.includes('Bold'));
 d.tires=['80','','80','80'];const pending=await render(d);assert(pending.pages.flat().some(t=>t.text==='Calificación general: pendiente (4 valores)'));
});
test('inspection catalogs search accents, word order and aliases without duplicate suggestions',()=>{
 for(const [kind,query,expected] of [['body','PARAGOLPES tras','Bómper trasero'],['body','bumper delantero','Bómper delantero'],['body','guardafango derecho','Guardafango delantero derecho'],['body','capota','Techo / capota'],['body','cinturon','Cinturón de seguridad'],['chassis','motor cuna','Cuna de motor'],['findings','bueno','Bien']])assert(P.suggestions(kind,query).includes(expected),query);
 assert.deepEqual(P.suggestions('findings','bueno'),['Bien']);
 assert.deepEqual(P.suggestions('body','pieza personalizada no catalogada'),[]);
 for(const [kind,count] of [['body',83],['chassis',34],['findings',32]]){const entries=P.suggestions(kind);assert.equal(entries.length,count);assert.equal(new Set(entries.map(x=>x.toLocaleLowerCase('es'))).size,count);}
 assert(!P.CATALOGS.findings.includes('Bueno'));
});
test('custom and legacy inspection text survives draft round-trip and PDF generation',async()=>{
 const d=P.example();d.body=[{element:'Guardafango izquierdo',finding:'Bueno'},{element:'Pieza personalizada <especial>',finding:'Primera observación libre.\nSegunda observación libre.'}];d.chassis=[{element:'Cuna',finding:'Hallazgo propio sin catálogo'}];
 const roundTrip=P.normalize(JSON.parse(JSON.stringify(d)));assert.deepEqual(roundTrip.body,d.body);assert.deepEqual(roundTrip.chassis,d.chassis);
 const {pages}=await render(roundTrip),text=pages.flat().map(t=>t.text).join(' ');
 for(const expected of ['Guardafango izquierdo','Bueno','Pieza personalizada <especial>','Primera observación libre.','Segunda observación libre.','Hallazgo propio sin catálogo'])assert(text.includes(expected),expected);
});

test('v1 drafts migrate photos, codes and free-text leaks without changing findings or inventing statuses',()=>{
 const jpeg='data:image/jpeg;base64,'+fs.readFileSync(require('node:path').join(__dirname,'fixtures/photo.jpg')).toString('base64');
 const old={...P.example(),version:1,leaks:'Motor: fuga antigua',imprints:[{label:'VIN',code:'ABC123',image:jpeg},{label:'Serie',code:'SERIE SIN FOTO',image:''},{label:'Motor',code:'',image:''}]};delete old.photos;delete old.leakRows;
 const migrated=P.normalize(old);assert.equal(migrated.version,2);assert.equal(migrated.photos.length,2);assert.equal(migrated.photos[0].image,jpeg);assert.equal(migrated.photos[0].caption,'ABC123');assert.equal(migrated.photos[0].legacyLabel,'VIN');assert.equal(migrated.photos[1].caption,'SERIE SIN FOTO');assert.equal(migrated.leaks,old.leaks);assert(migrated.leakRows.every(r=>r.finding===''));
 assert.deepEqual(P.normalize(JSON.parse(JSON.stringify(migrated))),migrated);assert.equal(P.blank().photos.length,2);assert(P.blank().leakRows.every(r=>r.finding===''));
});
test('photo annex grows with attachments, excludes empty slots, and always precedes clauses',async()=>{
 const jpeg='data:image/jpeg;base64,'+fs.readFileSync(require('node:path').join(__dirname,'fixtures/photo.jpg')).toString('base64');
 context.Image=class{naturalWidth=180;naturalHeight=45;set src(value){queueMicrotask(()=>this.onload());}};
 try{
  for(const count of [0,1,2,5,6,7,12,13]){
   const d=P.example();d.photos=Array.from({length:count},(_,i)=>({image:jpeg,caption:'Evidencia '+i}));d.photos.push({image:'',caption:''});
   const {pages}=await render(d),annex=pages.filter(p=>p.some(t=>t.text.startsWith('04 / ANEXO FOTOGRÁFICO')));
   assert.equal(annex.length,Math.ceil(count/6));assert.equal(annex.reduce((sum,p)=>sum+p.images.length,0),count);assert.equal(pages.length,4+Math.ceil(count/6));
   assert(pages.at(-1).some(t=>t.text==='05 / CLÁUSULAS Y ALCANCE'));
   for(let i=0;i<count;i++)assert(annex.flat().some(t=>t.text==='Evidencia '+i));
   for(const p of annex){assert(!p.some(t=>['VIN','Serie','Motor','Impronta no adjunta'].includes(t.text)));for(const im of p.images)assert(im.y>=78&&im.x>=36&&im.x+im.width<=576);}
  }
 }finally{delete context.Image;}
});
test('fuel, vehicle type and legacy identification-only codes remain visible in the report',async()=>{
 const d=P.example();d.photos=[{image:'',caption:'CÓDIGO CONSERVADO',legacyLabel:'VIN'}];const {pages}=await render(d),first=pages[0].map(t=>t.text).join(' ');
 assert(first.includes(d.fuel));assert(first.includes(d.vehicleType));assert(pages[2].some(t=>t.text==='CÓDIGO CONSERVADO'));
});

test('short inspection rows stay together across page breaks',async()=>{
 const d=P.example();d.body=Array.from({length:40},(_,i)=>({element:'Elemento de carrocería '+i,finding:'Hallazgo específico número '+i}));
 const {pages}=await render(d);
 for(let i=0;i<40;i++)assert(pages.some(page=>page.filter(t=>t.x<294&&t.y<650).map(t=>t.text).join(' ').includes('Elemento de carrocería '+i+' Hallazgo específico número '+i)),String(i));
});
test('optional tire and additional notes appear independently in order and omit whitespace-only sections',async()=>{
 for(const [tireNotes,additionalNotes] of [['',''],[' \n\t ','\n '],['Revisar desgaste interior.',''],['','Verificar accesorios.'],['Revisar desgaste interior.','Verificar accesorios.']]){
  const d=P.example();Object.assign(d,{tireNotes,additionalNotes});const {pages}=await render(d),texts=pages.flat().map(t=>t.text),tireTitle=texts.indexOf('Observación de llantas:'),additionalTitle=texts.indexOf('Observaciones adicionales');
  assert.equal(tireTitle>=0,!!tireNotes.trim());assert.equal(additionalTitle>=0,!!additionalNotes.trim());
  if(tireNotes.trim()){assert(tireTitle>texts.indexOf('Trasera'));assert(tireTitle<texts.indexOf('Fugas de fluidos'));assert(texts.indexOf(tireNotes)>tireTitle);}
  if(additionalNotes.trim()){assert(additionalTitle>texts.indexOf('Observaciones generales'));assert(additionalTitle<texts.indexOf('Responsable de la inspección y firma'));assert(texts.indexOf(additionalNotes)>additionalTitle);}
 }
});
test('new notes default to empty in older drafts and retain multiline text through saving and PDF continuation',async()=>{
 const old=P.example();delete old.tireNotes;delete old.additionalNotes;
 for(const version of [1,2]){const migrated=P.normalize({...old,version});assert.equal(migrated.tireNotes,'');assert.equal(migrated.additionalNotes,'');}
 const d={...P.example(),tireNotes:'Primera observación de llantas.\n'+'Desgaste irregular. '.repeat(450)+'FIN LLANTAS',additionalNotes:'Primera observación adicional.\n'+'Revisión complementaria. '.repeat(350)+'FIN ADICIONALES'};
 const stored=P.normalize(JSON.parse(JSON.stringify(d)));assert.equal(stored.tireNotes,d.tireNotes);assert.equal(stored.additionalNotes,d.additionalNotes);
 const {pages}=await render(stored),text=pages.slice(0,-1).flat().map(t=>t.text).join(' ').replace(/\s+/g,' ');
 assert(text.includes('FIN LLANTAS'));assert(text.includes('FIN ADICIONALES'));assert(pages.at(-1).some(t=>t.text==='05 / CLÁUSULAS Y ALCANCE'));
});
