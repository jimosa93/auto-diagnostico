'use strict';
// Bound browser storage waits: WebKit may leave an IndexedDB request pending after navigation.
(function(root){
 const TIMEOUT=5000;
 function connect(factory=root.indexedDB,timeout=TIMEOUT){
  return new Promise((resolve,reject)=>{
   let request,settled=false;
   const timer=setTimeout(()=>finish(Error('El almacenamiento no respondió a tiempo.')),timeout);
   function finish(error,connection){
    if(settled){connection?.close();return;}
    settled=true;clearTimeout(timer);error?reject(error):resolve(connection);
   }
   try{
    request=factory.open('autodiagnostico-fotografias-v1',1);
    request.onupgradeneeded=()=>{
     if(settled){request.transaction.abort();return;}
     for(const name of ['session','images'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);
    };
    request.onsuccess=()=>{
     const connection=request.result;
     connection.onversionchange=()=>connection.close();
     finish(null,connection);
    };
    request.onerror=()=>finish(request.error||Error('No se pudo abrir el almacenamiento.'));
    request.onblocked=()=>finish(Error('Otra pestaña mantiene ocupado el almacenamiento.'));
   }catch(error){finish(error);}
  });
 }
 function run(connection,stores,mode,operation,timeout=TIMEOUT){
  return new Promise((resolve,reject)=>{
   let tx,result,settled=false;
   function finish(error){
    if(settled)return;
    settled=true;clearTimeout(timer);
    if(error){try{tx?.abort();}catch{}connection.close();reject(error);}
    else resolve(typeof result==='function'?result():result?.result);
   }
   const timer=setTimeout(()=>finish(Error('El almacenamiento no respondió a tiempo.')),timeout);
   try{
    tx=connection.transaction(stores,mode);
    tx.oncomplete=()=>finish();
    tx.onerror=()=>finish(tx.error||Error('No se pudo acceder al borrador.'));
    tx.onabort=()=>finish(tx.error||Error('No se guardaron los datos.'));
    result=operation(tx);
   }catch(error){finish(error);}
  });
 }
 function load(connection,validate,timeout=TIMEOUT){
  // Recover the whole draft atomically; never expose or save a partially restored draft.
  return run(connection,['session','images'],'readonly',tx=>{
   let snapshot=null;const missing=[];
   const request=tx.objectStore('session').get('current');
   request.onsuccess=()=>{
    try{
     if(!request.result)return;
     snapshot=validate(request.result);
     const photos=snapshot.photos;snapshot.photos=[];
     for(const photo of photos){
      const image=tx.objectStore('images').get(photo.id);
      image.onsuccess=()=>{if(image.result?.blob)snapshot.photos.push({...photo,...image.result});else missing.push(photo.name);};
     }
    }catch{tx.abort();}
   };
   return ()=>({snapshot,missing});
  },timeout);
 }
 root.PhotoStorage={connect,run,load};
 if(typeof module!=='undefined')module.exports=root.PhotoStorage;
})(typeof window!=='undefined'?window:globalThis);
