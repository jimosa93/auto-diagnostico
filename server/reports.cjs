'use strict';
const {randomUUID}=require('node:crypto');
const {sha}=require('./security.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const ACTIONS=['save','download','preview'];
function fail(message,status=400){throw Object.assign(Error(message),{status});}
function id(value){if(typeof value!=='string'||!UUID.test(value))fail('Identificador no válido.');return value;}
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
const textFields=['company','phones','email','social','plate','brand','line','year','color','mileage','fuel','vehicleType','service','date','location','result','bodyScore','bodyState','chassisScore','chassisState','priority','tireNotes','additionalNotes','leaks','concept','idNotes','perito','signDate','continuation'];
function validateData(raw){
 if(!raw||raw.version!==2||typeof raw!=='object')fail('El informe no es compatible.');
 const result={version:2};const assets=new Set();
 function text(value,max=20000){if(typeof value!=='string'||value.length>max)fail('Un campo del informe no es válido o es demasiado largo.');return value;}
 function image(value){if(value==='')return '';if(!value||Object.keys(value).length!==1||!HASH.test(value.asset))fail('Referencia de imagen no válida.');assets.add(value.asset);return {asset:value.asset};}
 const longFields=new Set(['tireNotes','additionalNotes','leaks','concept','idNotes','continuation']);
 for(const key of textFields)result[key]=text(raw[key]??'',key==='priority'?630450:longFields.has(key)?20000:1000);
 if(!result.plate.trim()||result.plate.length>20)fail('Escribe una placa de hasta 20 caracteres antes de guardar.');
 for(const key of ['logo','signature'])result[key]=image(raw[key]||'');
 for(const key of ['body','chassis','leakRows']){if(!Array.isArray(raw[key])||raw[key].length>150)fail('Demasiados hallazgos.');result[key]=raw[key].map(r=>({element:text(r.element,200),finding:text(r.finding,4000)}));}
 if(!Array.isArray(raw.tires)||raw.tires.length!==4)fail('Se requieren cuatro valores de llantas.');result.tires=raw.tires.map(v=>text(v,8));
 if(!Array.isArray(raw.photos)||raw.photos.length>200)fail('Se admiten hasta 200 fotografías por informe.');
 result.photos=raw.photos.map(p=>({image:image(p.image||''),caption:text(p.caption,200),...(p.legacyLabel?{legacyLabel:text(p.legacyLabel,200)}:{})}));
 if(Buffer.byteLength(JSON.stringify(result))>3500000)fail('El texto del informe supera el límite de 3,5 MB.',413);
 return {data:result,assets:[...assets]};
}
const {putAsset}=require('./storage.cjs');
async function saveReport(db,body){
 const report=id(body.reportId),event=id(body.eventId),base=body.baseVersion===null?null:id(body.baseVersion);
 if(!ACTIONS.includes(body.action))fail('Acción no válida.');
 const {data,assets}=validateData(body.data),hash=sha(stable(data)),version=randomUUID();
 if(assets.length){const found=await db.query('SELECT hash FROM ad_assets WHERE hash = ANY($1::text[])',[assets]);if(found.length!==assets.length)fail('Faltan imágenes por guardar. Vuelve a intentarlo.');}
 // Serialize each report, check the parent version and commit the snapshot + event together.
 const results=await db.transaction([
  ['SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[report]],
  ['INSERT INTO ad_reports(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[report]],
  [`WITH previous AS (SELECT e.*,v.content_hash FROM ad_events e JOIN ad_versions v ON v.id=e.version_id WHERE e.id=$2::uuid),
   allowed AS (SELECT id FROM ad_reports WHERE id=$1::uuid AND current_version IS NOT DISTINCT FROM $3::uuid AND NOT EXISTS(SELECT 1 FROM previous)),
   saved AS (INSERT INTO ad_versions(id,report_id,content_hash,data) SELECT $4::uuid,id,$5,$6::jsonb FROM allowed ON CONFLICT(report_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id,report_id),
   recorded AS (INSERT INTO ad_events(id,report_id,version_id,action) SELECT $2::uuid,report_id,id,$7 FROM saved RETURNING *),
   updated AS (UPDATE ad_reports SET current_version=saved.id,updated_at=now() FROM saved WHERE ad_reports.id=saved.report_id RETURNING ad_reports.id)
   SELECT version_id,created_at FROM recorded UNION ALL SELECT version_id,created_at FROM previous WHERE report_id=$1::uuid AND action=$7 AND content_hash=$5`,[report,event,base,version,hash,JSON.stringify(data),body.action]]
 ]);
 const row=results[2][0];if(!row)fail('Este informe cambió en otro equipo. Abre la versión más reciente desde el historial o guarda tu trabajo como un informe nuevo.',409);
 return {reportId:report,versionId:row.version_id,eventId:event,savedAt:row.created_at};
}
function filters(params){
 const query=String(params.get('q')||'').trim().slice(0,100),from=params.get('from')||'',to=params.get('to')||'';
 for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))fail('Fecha no válida.');
 if(from&&to&&from>to)fail('La fecha inicial debe ser anterior a la final.');
 return [query,from||null,to||null];
}
async function list(db,params){
 const offset=Math.max(0,Math.min(100000,parseInt(params.get('offset'),10)||0));
 const rows=await db.query(`SELECT r.id,r.current_version,r.created_at,r.updated_at,v.data->>'plate' AS plate,v.data->>'service' AS service,v.data->>'brand' AS brand,v.data->>'line' AS line,v.data->>'year' AS year,v.data->>'mileage' AS mileage,v.data->>'result' AS result,v.data->>'perito' AS perito,
 (SELECT count(*)::int FROM ad_events WHERE report_id=r.id) AS event_count
 FROM ad_reports r JOIN ad_versions v ON v.id=r.current_version
 WHERE ($1='' OR strpos(lower(concat_ws(' ',v.data->>'plate',v.data->>'service',v.data->>'brand',v.data->>'line')),lower($1))>0)
 AND ($2::date IS NULL OR r.updated_at >= ($2::date::timestamp AT TIME ZONE 'America/Bogota'))
 AND ($3::date IS NULL OR r.updated_at < (($3::date+1)::timestamp AT TIME ZONE 'America/Bogota'))
 ORDER BY r.updated_at DESC,r.id LIMIT 51 OFFSET $4`,[...filters(params),offset]);
 return {reports:rows.slice(0,50),hasMore:rows.length>50,offset};
}
async function getReport(db,report,version){
 id(report);if(version)id(version);
 const rows=await db.query(`SELECT r.id,r.current_version,v.id AS version_id,v.data,v.created_at FROM ad_reports r JOIN ad_versions v ON v.report_id=r.id AND v.id=COALESCE($2::uuid,r.current_version) WHERE r.id=$1`,[report,version||null]);
 if(!rows.length)fail('No se encontró el informe.',404);return rows[0];
}
async function events(db,report){id(report);return db.query('SELECT id,version_id,action,created_at FROM ad_events WHERE report_id=$1 ORDER BY created_at DESC,id DESC LIMIT 500',[report]);}
module.exports={id,fail,stable,validateData,putAsset,saveReport,list,getReport,events};
