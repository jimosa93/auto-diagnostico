'use strict';
const database=require('../server/database.cjs');
const security=require('../server/security.cjs');
const reports=require('../server/reports.cjs');
const storage=require('../server/storage.cjs');
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,body)=>res.status(status).json(body);
 try{
  const url=new URL(req.url,'https://'+req.headers.host),op=url.searchParams.get('op')||'reports',method=req.method;
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');return send(405,{error:'Método no permitido.'});}
  if(method==='POST'&&!security.sameOrigin(req))return send(403,{error:'Origen no permitido.'});
  if(op==='session'&&method==='GET')return send(200,{configured:security.configured(),authenticated:security.authenticated(req)});
  if(!security.configured())return send(503,{error:'El historial todavía no está configurado. Revisa DATABASE_URL y HISTORY_PASSWORD en Vercel.'});
  let body=req.body;
  if(method==='POST'){
   if(Number(req.headers['content-length']||0)>4200000)return send(413,{error:'La solicitud es demasiado grande.'});
   try{if(typeof body==='string')body=JSON.parse(body);}catch{return send(400,{error:'Datos no válidos.'});}
   if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Datos no válidos.'});
  }
  if(op==='login'&&method==='POST'){
   const db=await database.ready();
   const address=(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
   const key=security.sha(process.env.HISTORY_PASSWORD+':'+address+':'+Math.floor(Date.now()/900000));
   const rows=await db.query(`INSERT INTO ad_login_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=ad_login_limits.attempts+1 RETURNING attempts`,[key]);
   if(rows[0].attempts>10){res.setHeader('Retry-After','900');return send(429,{error:'Demasiados intentos. Espera 15 minutos antes de volver a entrar.'});}
   if(!security.passwordMatches(body.password))return send(401,{error:'Contraseña incorrecta.'});
   await db.query('DELETE FROM ad_login_limits WHERE expires_at<now()');
   res.setHeader('Set-Cookie',security.cookie(security.token(process.env.HISTORY_PASSWORD),req));
   return send(200,{authenticated:true});
  }
  if(!security.authenticated(req))return send(401,{error:'Inicia sesión para acceder al historial.'});
  if(op==='logout'&&method==='POST'){res.setHeader('Set-Cookie',security.cookie('',req,true));return send(200,{authenticated:false});}
  const db=await database.ready();
  if(op==='reports'&&method==='GET')return send(200,await reports.list(db,url.searchParams));
  if(op==='report'&&method==='GET')return send(200,await reports.getReport(db,url.searchParams.get('id'),url.searchParams.get('version')));
  if(op==='events'&&method==='GET')return send(200,{events:await reports.events(db,url.searchParams.get('id'))});
  if(op==='save'&&method==='POST')return send(200,await reports.saveReport(db,body));
  if(op==='asset'&&method==='POST')return send(200,await reports.putAsset(db,body));
  if(op==='asset'&&method==='GET')return send(200,await storage.getAsset(db,url.searchParams.get('hash')));
  if(op==='storage'&&method==='GET')return send(200,await storage.status(db));
  if(op==='migrate-assets'&&method==='POST')return send(200,await storage.migrateNext(db));
  return send(404,{error:'Operación no encontrada.'});
 }catch(error){
  if(error.status)return send(error.status,{error:error.message});
  console.error('History operation failed:',error.code||error.name||'Unknown');
  return send(503,{error:'No se pudo completar la operación de almacenamiento. Tu formulario sigue disponible; vuelve a intentarlo.'});
 }
}
module.exports=handler;
