'use strict';
const {sha}=require('./security.cjs');
const {id,fail}=require('./reports.cjs');
const KEY=/^[a-f0-9]{64}$/;
function identity(body){
 if(!KEY.test(body.writeKey||''))fail('No se pudo autorizar el guardado. Recarga el formulario y vuelve a intentarlo.',403);
 return [id(body.reportId),sha(body.writeKey)];
}
async function grant(db,body,authenticated){
 const [report,key]=identity(body),legacyVersion=body.baseVersion?id(body.baseVersion):null;
 // A new browser can create its own report. Only a signed-in history reader can
 // grant another browser access, except for the first claim of a legacy draft
 // using its already-private current version identifier.
 const rows=await db.query(`WITH created AS (
  INSERT INTO ad_reports(id) VALUES($1) ON CONFLICT(id) DO NOTHING RETURNING id
 ), granted AS (
  INSERT INTO ad_report_writers(report_id,key_hash)
  SELECT id,$2 FROM created UNION SELECT id,$2 FROM ad_reports WHERE id=$1 AND ($3::boolean OR
   (current_version=$4::uuid AND NOT EXISTS(SELECT 1 FROM ad_report_writers WHERE report_id=$1)))
  ON CONFLICT DO NOTHING RETURNING report_id
 ) SELECT report_id FROM granted UNION SELECT report_id FROM ad_report_writers WHERE report_id=$1 AND key_hash=$2`,[report,key,authenticated,legacyVersion]);
 if(!rows.length)fail('Este navegador no tiene permiso para modificar ese informe. Puedes guardar como informe nuevo o abrirlo desde el historial.',409);
 return {allowed:true};
}
async function requireWrite(db,body){
 const [report,key]=identity(body);
 const rows=await db.query('SELECT report_id FROM ad_report_writers WHERE report_id=$1 AND key_hash=$2',[report,key]);
 if(!rows.length)fail('No se pudo autorizar el guardado de este informe.',403);
}
async function limit(db,req,op,bytes=0){
 const address=(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
 const key=sha(process.env.HISTORY_PASSWORD+':write:'+address+':'+op+':'+Math.floor(Date.now()/3600000));
 const [row]=await db.query(`INSERT INTO ad_write_limits(key,attempts,bytes,expires_at) VALUES($1,1,$2,now()+interval '1 hour')
 ON CONFLICT(key) DO UPDATE SET attempts=ad_write_limits.attempts+1,bytes=ad_write_limits.bytes+EXCLUDED.bytes RETURNING attempts,bytes`,[key,bytes]);
 if(row.attempts>(op==='asset'?1000:240)||Number(row.bytes)>280000000)fail('Se alcanzó el límite temporal de guardado. Conserva tu borrador y vuelve a intentarlo en una hora.',429);
 await db.query('DELETE FROM ad_write_limits WHERE expires_at<now()');
}
module.exports={grant,requireWrite,limit};
