'use strict';
const {S3Client,PutObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');
const {sha}=require('./security.cjs');
const HASH=/^[a-f0-9]{64}$/;
function fail(message,status=503){throw Object.assign(Error(message),{status});}
function configuration(env=process.env){
 const keys=['R2_ACCOUNT_ID','R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
 if(!keys.some(key=>env[key]))return 'neon';
 return keys.every(key=>env[key])&&/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID)&&(!env.R2_REGION||env.R2_REGION==='auto')?'r2':'incomplete';
}
function createStore(env=process.env){
 const state=configuration(env);
 if(state==='neon')return null;
 if(state!=='r2')fail('Revisa las variables de R2 en Vercel. R2_ACCOUNT_ID debe contener sólo el identificador de la cuenta.');
 const client=new S3Client({region:'auto',endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY},maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
 return {
  async put(key,bytes,mime){await client.send(new PutObjectCommand({Bucket:env.R2_BUCKET_NAME,Key:key,Body:bytes,ContentType:mime,CacheControl:'private, no-store'}),{abortSignal:AbortSignal.timeout(10000)});},
  async get(key){
   const result=await client.send(new GetObjectCommand({Bucket:env.R2_BUCKET_NAME,Key:key}),{abortSignal:AbortSignal.timeout(10000)});
   const chunks=[];let size=0;
   try{for await(const chunk of result.Body){size+=chunk.length;if(size>3000000)fail('La imagen guardada supera el tamaño permitido.');chunks.push(chunk);}}finally{result.Body?.destroy?.();}
   return Buffer.concat(chunks);
  }
 };
}
function decode(hash,data){
 if(!HASH.test(hash||'')||typeof data!=='string'||data.length>4000000||sha(data)!==hash)fail('Imagen no válida o demasiado grande.',400);
 const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
 if(!match)fail('Imagen no válida o demasiado grande.',400);
 const bytes=Buffer.from(match[2],'base64'),mime='image/'+match[1];
 // Exact reconstruction keeps all existing content hashes and report versions valid.
 if(bytes.toString('base64')!==match[2])fail('La codificación de la imagen no es válida.',400);
 return {bytes,mime,key:`reports/assets/${hash.slice(0,2)}/${hash}.${match[1]==='jpeg'?'jpg':'png'}`};
}
function encode(bytes,mime){return `data:${mime};base64,${bytes.toString('base64')}`;}
async function uploadVerified(store,hash,data){
 const image=decode(hash,data);
 await store.put(image.key,image.bytes,image.mime);
 const restored=await store.get(image.key);
 if(sha(encode(restored,image.mime))!==hash)fail('No se pudo verificar la imagen en R2. La copia de Neon se conserva.');
 return image;
}
async function move(db,row,store){
 const image=await uploadVerified(store,row.hash,row.data);
 // A retry or another browser may have migrated this same immutable asset already.
 await db.query(`UPDATE ad_assets SET object_key=$2,mime_type=$3,byte_size=$4,migrated_at=now(),data=NULL WHERE hash=$1 AND data=$5`,[row.hash,image.key,image.mime,image.bytes.length,row.data]);
}
async function putAsset(db,body,store=createStore()){
 decode(body.hash,body.data);
 const [existing]=await db.query('SELECT hash,data,object_key FROM ad_assets WHERE hash=$1',[body.hash]);
 if(existing){if(store&&existing.data!==null)await move(db,existing,store);return {hash:body.hash};}
 if(!store){await db.query('INSERT INTO ad_assets(hash,data) VALUES($1,$2) ON CONFLICT(hash) DO NOTHING',[body.hash,body.data]);return {hash:body.hash};}
 const image=await uploadVerified(store,body.hash,body.data);
 await db.query(`INSERT INTO ad_assets(hash,data,object_key,mime_type,byte_size,migrated_at) VALUES($1,NULL,$2,$3,$4,now()) ON CONFLICT(hash) DO NOTHING`,[body.hash,image.key,image.mime,image.bytes.length]);
 return {hash:body.hash};
}
async function getAsset(db,hash,store){
 if(!HASH.test(hash||''))fail('Imagen no válida.',400);
 const [row]=await db.query('SELECT data,object_key,mime_type FROM ad_assets WHERE hash=$1',[hash]);
 if(!row)fail('No se encontró una imagen del informe.',404);
 // Legacy images remain readable even if R2 is unavailable or misconfigured.
 if(row.data!==null)return {data:row.data};
 store=store===undefined?createStore():store;
 if(!store||!row.object_key)fail('No se puede recuperar la imagen. Revisa la configuración de R2.');
 const data=encode(await store.get(row.object_key),row.mime_type);
 if(sha(data)!==hash)fail('La imagen recuperada no coincide con el archivo guardado.');
 return {data};
}
async function status(db){
 const [row]=await db.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE object_key IS NOT NULL)::int AS r2_count,count(*) FILTER(WHERE data IS NOT NULL)::int AS pending,COALESCE(sum(byte_size) FILTER(WHERE object_key IS NOT NULL),0)::text AS r2_bytes,COALESCE(sum(octet_length(data)),0)::text AS neon_base64_bytes FROM ad_assets`);
 return {mode:configuration(),total:row.total,r2Count:row.r2_count,pending:row.pending,r2Bytes:Number(row.r2_bytes),neonBase64Bytes:Number(row.neon_base64_bytes)};
}
async function migrateNext(db,store=createStore()){
 if(!store)fail('Configura R2 antes de trasladar las imágenes.');
 const [row]=await db.query('SELECT hash,data FROM ad_assets WHERE data IS NOT NULL ORDER BY created_at,hash LIMIT 1');
 if(row)await move(db,row,store);
 return {migrated:!!row,...await status(db)};
}
module.exports={configuration,createStore,putAsset,getAsset,status,migrateNext};
