'use strict';
(function(root){
 async function request(op,{method='GET',body,params={}}={}){
  const url='/api/history?'+new URLSearchParams({op,...params});let response;
  try{response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});}catch{throw Error('No hay conexión con el historial. Conserva el borrador y vuelve a intentarlo.');}
  let value;try{value=await response.json();}catch{throw Error('El historial no está disponible en esta versión. Abre la aplicación desde su URL pública.');}
  if(!response.ok)throw Object.assign(Error(value.error||'No se pudo completar la operación.'),{status:response.status});return value;
 }
 async function session(){if(!/^https?:$/.test(location.protocol))return {configured:false,authenticated:false};return request('session');}
 async function authenticate(){
  const state=await session();if(!state.configured)throw Error('El historial todavía no está configurado en el servidor.');if(state.authenticated)return;
  await new Promise((resolve,reject)=>{
   const dialog=document.createElement('dialog');dialog.className='history-login';
   dialog.innerHTML='<form><h2>Acceso al historial</h2><p>Ingresa la contraseña del equipo para guardar y consultar informes.</p><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="512"></label><p class="history-error" role="alert" hidden></p><div class="history-actions"><button type="button" data-cancel>Cancelar</button><button class="primary" type="submit">Entrar</button></div></form>';
   document.body.append(dialog);let completed=false,submitting=false;
   const close=()=>{dialog.close();};dialog.querySelector('[data-cancel]').onclick=close;
   dialog.addEventListener('close',()=>{dialog.remove();if(!completed)reject(Error('No se inició sesión. El informe no se guardó en el historial.'));},{once:true});
   dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();if(submitting)return;submitting=true;const button=dialog.querySelector('[type=submit]');button.disabled=true;
    try{await request('login',{method:'POST',body:{password:dialog.querySelector('input').value}});completed=true;close();resolve();}
    catch(error){const message=dialog.querySelector('[role=alert]');message.textContent=error.message;message.hidden=false;}
    finally{submitting=false;button.disabled=false;}
   };
   dialog.showModal();dialog.querySelector('input').focus();
  });
 }
 const uploaded=new Set();
 async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
 async function pack(source,onProgress=()=>{}){
  const data=structuredClone(source);const slots=[[data,'logo'],[data,'signature'],...data.photos.map(p=>[p,'image'])];let done=0;
  for(const [owner,key] of slots){const image=owner[key];if(image){if(typeof image!=='string'||image.length>4000000)throw Error('Una imagen supera el tamaño admitido. Vuelve a adjuntarla para optimizarla.');const hash=await digest(image);onProgress(`Guardando imagen ${++done}…`);if(!uploaded.has(hash)){await request('asset',{method:'POST',body:{hash,data:image}});uploaded.add(hash);}owner[key]={asset:hash};}}
  return data;
 }
 async function save(source,reference,action,onProgress=()=>{}){
  await authenticate();const data=await pack(source,onProgress),fingerprint=await digest(JSON.stringify({data,action}));
  if(!reference.pending||reference.pending.fingerprint!==fingerprint)reference.pending={fingerprint,eventId:crypto.randomUUID()};
  onProgress('Guardando el informe…');
  const result=await request('save',{method:'POST',body:{reportId:reference.id,baseVersion:reference.version||null,eventId:reference.pending.eventId,action,data}});
  reference.version=result.versionId;delete reference.pending;return result;
 }
 async function open(reportId,version,onProgress=()=>{}){
  await authenticate();const report=await request('report',{params:{id:reportId,...(version?{version}:{})}}),data=report.data;
  const slots=[[data,'logo'],[data,'signature'],...data.photos.map(p=>[p,'image'])],cache=new Map();let done=0;
  for(const [owner,key] of slots){if(owner[key]?.asset){const hash=owner[key].asset;onProgress(`Recuperando imagen ${++done}…`);if(!cache.has(hash))cache.set(hash,(await request('asset',{params:{hash}})).data);owner[key]=cache.get(hash);}}
  return {...report,data};
 }
 root.ReportHistory={request,session,authenticate,save,open};
})(window);
