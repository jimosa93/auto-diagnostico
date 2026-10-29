'use strict';
(function(root){
 const KEY='ad-generator-pending-v1';
 function snapshot(state){
  // Deliberate allowlist: never serialize state, photos, captions, blobs or logos.
  const data={};for(const key of ['plate','vehicle','service','date','package','company','profile','layout','columns'])data[key]=state[key];
  data.plate=data.plate.trim().toUpperCase();data.photoCount=state.photos.length;return data;
 }
 function createRecorder({onChange,storage,request=root.fetch.bind(root)}){
  let pending=[],running=false,last=null,error='';
  try{storage=storage||root.sessionStorage;}catch{}
  try{const saved=JSON.parse(storage.getItem(KEY)||'[]');if(Array.isArray(saved))pending=saved;}catch{}
  function update(){
   try{storage.setItem(KEY,JSON.stringify(pending));}catch{}
   onChange({pending:pending.length,running,last,error});
  }
  async function retry(){
   if(running)return;running=true;error='';update();
   try{
    while(pending.length){
     const event=pending[0];let response;
     try{response=await request('/api/history?op=generator-save',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(event),signal:AbortSignal.timeout(15000)});}
     catch{throw Error('No se pudo conectar con el historial.');}
     const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo guardar el registro.');
     pending.shift();last={plate:event.data.plate,action:event.action,savedAt:result.savedAt};update();
    }
   }catch(e){error=e.message;}
   finally{running=false;update();}
  }
  function record(state,action){
   const data=snapshot(state);if(!data.plate)throw Error('Escribe la placa para guardar el registro.');
   pending.push({eventId:root.crypto.randomUUID(),action,data});update();return retry();
  }
  update();return {record,retry};
 }
 root.GeneratorHistory={snapshot,createRecorder};
})(typeof window==='undefined'?globalThis:window);
