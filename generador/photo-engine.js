(function(root){
'use strict';
const DEFAULT_CATEGORIES=[['documentos','Documentación',true],['general','Vista general',false],['habitaculo','Habitáculo',false],['instrumentos','Instrumentación',true],['identificacion','Identificación',true],['mecanica','Mecánica / parte inferior',false],['hallazgos','Hallazgos',true],['otros','Otros',false]];
const PROFILES={compact:{dpi:160,detailDpi:220,name:'Compacto',max:1000,detail:1500,q:.72,dq:.84,budget:135000,detailBudget:320000},balanced:{dpi:200,detailDpi:280,name:'Equilibrado',max:1400,detail:2000,q:.82,dq:.90,budget:230000,detailBudget:480000},detail:{dpi:260,detailDpi:340,name:'Más detalle',max:2200,detail:2800,q:.92,dq:.95,budget:520000,detailBudget:900000}};
function blank(){return {version:1,kind:'autodiagnostico-photos',plate:'',vehicle:'',service:'',package:'Paquete full diagnóstico',date:new Date().toLocaleDateString('sv-SE'),company:'AutoDiagnóstico',phones:'322 674 9787 · 310 757 4933',email:'autodiagnostico.peritajes@gmail.com',social:'instagram.com/autodiagnostico_cali/',logo:root.DEFAULT_LOGO||'',profile:'balanced',columns:4,layout:'classified',categories:DEFAULT_CATEGORIES.map(([id,name,detail])=>({id,name,detail})),photos:[]};}
const uid=()=>root.crypto?.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const fmtBytes=n=>n>=1048576?(n/1048576).toLocaleString('es-CO',{maximumFractionDigits:2})+' MB':Math.max(1,Math.round(n/1024))+' KB';
const tick=()=>new Promise(r=>setTimeout(r,0));
let heicPromise;
function loadHeic(){
 if(root.heic2any)return Promise.resolve();
 if(!heicPromise)heicPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/generador/vendor/heic2any.min.js';script.onload=resolve;script.onerror=()=>{heicPromise=null;script.remove();reject(Error('No se pudo cargar el lector HEIC. Usa JPG o vuelve a intentarlo.'));};document.head.appendChild(script);});
 return heicPromise;
}
async function decode(blob){
 async function native(b){
  if(typeof createImageBitmap==='function'){try{const im=await createImageBitmap(b,{imageOrientation:'from-image'});return {source:im,width:im.width,height:im.height,close:()=>im.close()};}catch{}}
  const url=URL.createObjectURL(b),im=new Image();try{await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=url;});return {source:im,width:im.naturalWidth,height:im.naturalHeight,close:()=>URL.revokeObjectURL(url)};}catch{URL.revokeObjectURL(url);throw Error('Formato de imagen no compatible');}
 }
 try{return await native(blob);}catch(e){
  const head=new Uint8Array(await blob.slice(0,32).arrayBuffer());const magic=String.fromCharCode(...head);
  const heic=/heic|heif/i.test(blob.type||'')||(/ftyp/.test(magic)&&/heic|heix|hevc|hevx|mif1|msf1/.test(magic));
  if(heic){await loadHeic();let converted=await root.heic2any({blob,toType:'image/png'});if(Array.isArray(converted))converted=converted[0];return native(converted);}
  throw Error('No se pudo abrir esta imagen. Prueba con JPG, PNG o WebP.');
 }
}
function canvasFor(decoded,rotation,max){const odd=rotation%180!==0;const w=odd?decoded.height:decoded.width,h=odd?decoded.width:decoded.height,scale=Math.min(1,max/Math.max(w,h));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.translate(c.width/2,c.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(decoded.source,-decoded.width*scale/2,-decoded.height*scale/2,decoded.width*scale,decoded.height*scale);return c;}
const blobOf=(c,q)=>new Promise((ok,no)=>c.toBlob(b=>b?ok(b):no(Error('No se pudo procesar la imagen.')),'image/jpeg',q));
async function thumbnail(blob){const d=await decode(blob);try{if(d.width*d.height>110000000)throw Error('La imagen excede 110 megapíxeles.');const c=canvasFor(d,0,380);const thumb=c.toDataURL('image/jpeg',.72);c.width=c.height=1;return {thumb,width:d.width,height:d.height};}finally{d.close();}}
function optimizationSettings(profile,protect=false,large=false,columns=null){
 const p=PROFILES[profile]||PROFILES.balanced,detail=protect||large;
 let max=detail?p.detail:p.max;
 if(columns!==null){
  const count=large?1:protect?2:([2,3,4].includes(+columns)?+columns:4);
  const width=(540-12*(count-1))/count,height=count===1?275:count===2?165:count===3?119:90;
  max=Math.min(max,Math.ceil(Math.max(width,height)*(detail?p.detailDpi:p.dpi)/72));
 }
 return {max,quality:detail?p.dq:p.q,budget:detail?p.detailBudget:p.budget,floor:detail?.78:.62};
}
async function optimize(photo,profile,protect=false,columns=null){
 const settings=optimizationSettings(profile,protect,photo.large,columns),d=await decode(photo.blob);
 try{
  if(d.width*d.height>110000000)throw Error('La imagen excede 110 megapíxeles.');
  let c=canvasFor(d,photo.rotation||0,settings.max),quality=settings.quality,blob=await blobOf(c,quality);
  while(blob.size>settings.budget&&quality>settings.floor+.01){quality=Math.max(settings.floor,quality-.06);blob=await blobOf(c,quality);}
  // Bound unusually detailed/noisy images without progressively recompressing JPEGs.
  while(blob.size>settings.budget&&Math.max(c.width,c.height)>Math.min(settings.max,protect||photo.large?700:300)){
   const max=Math.max(Math.min(settings.max,protect||photo.large?700:300),Math.floor(Math.max(c.width,c.height)*.85));
   c.width=c.height=1;c=canvasFor(d,photo.rotation||0,max);blob=await blobOf(c,quality);
  }
  const out={blob,width:c.width,height:c.height,quality};c.width=c.height=1;return out;
 }finally{d.close();}
}
function validateMetadata(raw){if(raw?.version!==1||raw.kind!=='autodiagnostico-photos'||!Array.isArray(raw.categories)||!Array.isArray(raw.photos))throw Error('Este archivo no es un borrador del anexo fotográfico.');if(raw.categories.length>30||raw.photos.length>200)throw Error('El borrador supera 30 categorías o 200 fotografías.');const clean=blank();clean.layout=raw.layout==='simple'?'simple':'classified';for(const k of ['plate','vehicle','service','package','date','company','phones','email','social'])if(typeof raw[k]==='string')clean[k]=raw[k].slice(0,k==='vehicle'?95:120);if(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(raw.logo||'')&&raw.logo.length<4000000)clean.logo=raw.logo;clean.profile=PROFILES[raw.profile]?raw.profile:'balanced';clean.columns=[2,3,4].includes(+raw.columns)?+raw.columns:4;clean.categories=raw.categories.slice(0,30).map(c=>({id:String(c.id).slice(0,100),name:String(c.name||'Categoría').slice(0,55),detail:!!c.detail}));if(!clean.categories.length)throw Error('El borrador no contiene categorías.');if(new Set(clean.categories.map(c=>c.id)).size!==clean.categories.length)throw Error('El borrador contiene categorías duplicadas.');clean.photos=raw.photos.slice(0,200).map(p=>({id:String(p.id).slice(0,100),name:String(p.name||'Fotografía').slice(0,200),size:Math.max(0,+p.size||0),type:String(p.type||'image/jpeg'),width:+p.width||0,height:+p.height||0,category:clean.categories.some(c=>c.id===p.category)?p.category:clean.categories[0].id,caption:String(p.caption||'').slice(0,180),rotation:[0,90,180,270].includes(p.rotation)?p.rotation:0,large:!!p.large,path:String(p.path||'')}));if(new Set(clean.photos.map(p=>p.id)).size!==clean.photos.length)throw Error('El borrador contiene fotos duplicadas.');return clean;}
function photoOrder(d){return d.categories.flatMap(cat=>d.photos.filter(p=>p.category===cat.id));}
function cleanFilename(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'anexo';}
async function buildPDF(d,items,onProgress=()=>{},lib=root.PDFLib){
 if(!d.plate.trim())throw Error('Escribe la placa.');
 if(!d.photos.length)throw Error('Agrega al menos una fotografía.');
 if(![2,3,4].includes(+d.columns))throw Error('Selecciona 2, 3 o 4 fotos por fila.');
 if(d.photos.some(p=>!d.categories.some(c=>c.id===p.category)))throw Error('Hay fotografías sin categoría válida.');
 if(d.layout==='simple')d={...d,categories:[{id:'all',name:'Registro fotográfico',detail:false}],photos:photoOrder(d).map(p=>({...p,category:'all'}))};
 const {PDFDocument,StandardFonts,rgb}=lib,pdf=await PDFDocument.create(),reg=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const color={ink:rgb(.06,.13,.24),muted:rgb(.38,.44,.53),line:rgb(.85,.88,.92),pale:rgb(.97,.98,.99)};let page,y=0;
 const safe=s=>Array.from(String(s||'')).map(c=>{try{reg.encodeText(c);return c;}catch{return c==='\n'?' ':'?';}}).join('');
 const wrap=(s,w,size,font=reg)=>{const lines=[];let line='';for(const word of safe(s).split(/\s+/)){for(const part of font.widthOfTextAtSize(word,size)>w?Array.from(word):[word]){const join=font.widthOfTextAtSize(word,size)>w?'':' ';if(line&&font.widthOfTextAtSize(line+join+part,size)>w){lines.push(line);line=part;}else line+=(line?join:'')+part;}}if(line)lines.push(line);return lines.length?lines:[''];};
 const text=(s,x,t,size=9,font=reg,c=color.ink)=>page.drawText(safe(s),{x,y:792-t-size,size,font,color:c});
 const line=t=>page.drawLine({start:{x:36,y:792-t},end:{x:576,y:792-t},color:color.line,thickness:.6});
 const fit=(im,x,t,w,h)=>{const s=Math.min(w/im.width,h/im.height),iw=im.width*s,ih=im.height*s;page.drawImage(im,{x:x+(w-iw)/2,y:792-t-(h+ih)/2,width:iw,height:ih});};
 let logo;if(d.logo)logo=d.logo.startsWith('data:image/png')?await pdf.embedPng(d.logo):await pdf.embedJpg(d.logo);
 function newPage(){page=pdf.addPage([612,792]);if(logo)fit(logo,36,17,140,59);else text(d.company,36,32,16,bold);text('ANEXO FOTOGRÁFICO',310,25,13,bold);const vehicle=[d.plate.toUpperCase(),d.vehicle].filter(Boolean).join(' | ');wrap(vehicle,266,9,bold).slice(0,2).forEach((s,i)=>text(s,310,47+i*12,9,bold));const desc=[d.package,d.service].filter(Boolean).join(' · ');wrap(desc,266,8).slice(0,2).forEach((s,i)=>text(s,310,74+i*10,8,reg,color.muted));if(d.date)text('Fecha: '+d.date.split('-').reverse().join('/'),36,88,8,reg,color.muted);line(105);y=119;}
 function section(cat,idx,continuation=false){const rows=wrap(String(idx+1).padStart(2,'0')+'. '+cat.name.toUpperCase()+(continuation?' · CONTINUACIÓN':''),540,10,bold);rows.forEach((r,i)=>text(r,36,y+i*13,10,bold));y+=rows.length*13+11;}
 let num=0;newPage();
 for(let ci=0;ci<d.categories.length;ci++){
  const cat=d.categories[ci],photos=d.photos.filter(p=>p.category===cat.id);if(!photos.length)continue;
  let cursor=0,started=false;
  while(cursor<photos.length){const count=photos[cursor].large?1:(cat.detail?Math.min(2,+d.columns):+d.columns),batch=[];for(let j=0;j<count&&cursor<photos.length;j++){if(batch.length&&photos[cursor].large)break;batch.push(photos[cursor++]);}
   const gap=12,width=(540-gap*(count-1))/count,height=count===1?275:count===2?165:count===3?119:90;
   const captions=batch.map(p=>wrap(p.caption,width,8.5));const capH=Math.max(...captions.map(v=>v.length))*11;const rowH=height+17+capH+17;
   if(y+rowH+(!started?37:0)>717){newPage();section(cat,ci,started);started=true;}else if(!started){section(cat,ci);started=true;}
   for(let j=0;j<batch.length;j++){const p=batch[j],item=items.get(p.id);if(!item)throw Error('Falta una imagen del anexo. Vuelve a exportar.');const bytes=await item.blob.arrayBuffer(),im=await pdf.embedJpg(bytes),x=36+j*(width+gap);page.drawRectangle({x,y:792-y-height,width,height,color:color.pale});fit(im,x,y,width,height);num++;text('FOTO '+String(num).padStart(2,'0'),x,y+height+5,8,bold,color.muted);captions[j].forEach((s,k)=>text(s,x,y+height+19+k*11,8.5));onProgress(num,d.photos.length);await tick();}
   y+=rowH;
  }
  y+=5;
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>{page=p;line(735);text(wrap(d.company+' | Peritaje automotriz profesional',480,8,bold)[0],36,744,8,bold);const contact=[d.phones,d.email].filter(Boolean).join(' · ');wrap(contact,470,7).slice(0,1).forEach(s=>text(s,36,757,7,reg,color.muted));text(wrap(d.social,470,7)[0],36,769,7,reg,color.muted);text((i+1)+' de '+pages.length,535,744,8,reg,color.muted);});
 pdf.setTitle('Anexo fotográfico '+d.plate.toUpperCase());pdf.setAuthor(d.company);pdf.setSubject('Registro fotográfico clasificado del vehículo');return {bytes:await pdf.save(),pages:pages.length};
}
root.PhotoEngine={blank,uid,fmtBytes,decode,thumbnail,optimize,photoOrder,cleanFilename,buildPDF,PROFILES,optimizationSettings,validateMetadata};
if(typeof module!=='undefined'&&module.exports)module.exports=root.PhotoEngine;
})(typeof window!=='undefined'?window:globalThis);
