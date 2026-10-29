'use strict';
const {id,fail,stable,filters}=require('./reports.cjs');
const {sha}=require('./security.cjs');
const textFields={plate:12,vehicle:95,service:40,date:10,package:85,company:65};
function keys(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('El registro sólo admite datos básicos del anexo.');
}
function validate(body){
 keys(body,['eventId','action','data']);id(body.eventId);
 if(!['save','export'].includes(body.action))fail('Acción no válida.');
 keys(body.data,[...Object.keys(textFields),'photoCount','profile','layout','columns']);
 const data={};
 for(const [key,max] of Object.entries(textFields)){
  const value=body.data[key]??'';
  if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))fail('Datos del anexo no válidos.');
  data[key]=value.trim();
 }
 data.plate=data.plate.toUpperCase();if(!data.plate)fail('Escribe la placa para guardar el registro.');
 if(data.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!Number.isFinite(Date.parse(data.date))||new Date(data.date).toISOString().slice(0,10)!==data.date))fail('Fecha de inspección no válida.');
 if(!Number.isInteger(body.data.photoCount)||body.data.photoCount<0||body.data.photoCount>200)fail('Cantidad de fotos no válida.');
 if(!['balanced','compact','detail'].includes(body.data.profile)||!['classified','simple'].includes(body.data.layout)||![2,3,4].includes(body.data.columns))fail('Opciones del anexo no válidas.');
 for(const key of ['photoCount','profile','layout','columns'])data[key]=body.data[key];
 return data;
}
async function save(db,body){
 const data=validate(body),hash=sha(stable({action:body.action,data}));
 // A repeated request may follow a lost response. Never overwrite an existing event.
 const results=await db.transaction([
  ['INSERT INTO ad_generator_events(id,action,content_hash,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING',[body.eventId,body.action,hash,JSON.stringify(data)]],
  ['SELECT id,content_hash,created_at FROM ad_generator_events WHERE id=$1',[body.eventId]]
 ]);
 const row=results[1][0];if(row.content_hash!==hash)fail('Este registro ya corresponde a otra acción.',409);
 return {eventId:row.id,savedAt:row.created_at};
}
async function list(db,params){
 const offset=Math.max(0,Math.min(100000,parseInt(params.get('offset'),10)||0));
 const rows=await db.query(`SELECT id,action,data,created_at FROM ad_generator_events
 WHERE ($1='' OR strpos(lower(concat_ws(' ',data->>'plate',data->>'vehicle',data->>'service')),lower($1))>0)
 AND ($2::date IS NULL OR created_at>=($2::date::timestamp AT TIME ZONE 'America/Bogota'))
 AND ($3::date IS NULL OR created_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Bogota'))
 ORDER BY created_at DESC,id LIMIT 51 OFFSET $4`,[...filters(params),offset]);
 return {records:rows.slice(0,50),hasMore:rows.length>50,offset};
}
module.exports={validate,save,list};
