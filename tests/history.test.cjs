const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {ensureSchema}=require('../server/database.cjs');
const R=require('../server/reports.cjs'),S=require('../server/security.cjs');
let pg,db,P;
before(async()=>{
 pg=new PGlite();await pg.waitReady;
 db={query:async(text,params)=>(await pg.query(text,params)).rows,transaction:statements=>pg.transaction(async tx=>{const out=[];for(const [text,params] of statements)out.push((await tx.query(text,params)).rows);return out;})};
 await ensureSchema(db);
 const html=fs.readFileSync('index.html','utf8'),context={};new Function('window',[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('root.Peritaje=')))(context);P=context.Peritaje;
});
after(async()=>{await pg?.close();});
function payload(){const data=P.example();data.plate='TEST01';return {reportId:randomUUID(),baseVersion:null,eventId:randomUUID(),action:'save',data};}
test('full reports round-trip with immutable versions, images, signature and deduplicated retry events',async()=>{
 const p=payload(),image='data:image/jpeg;base64,'+fs.readFileSync('tests/fixtures/photo.jpg').toString('base64'),hash=S.sha(image);
 await R.putAsset(db,{hash,data:image});p.data.photos=[{image:{asset:hash},caption:'Evidencia'}];p.data.signature={asset:hash};p.data.logo={asset:hash};p.data.tireNotes='Revisar llantas';p.data.additionalNotes='Observación adicional';
 const first=await R.saveReport(db,p),retry=await R.saveReport(db,p);assert.equal(first.versionId,retry.versionId);
 const second=await R.saveReport(db,{...p,baseVersion:first.versionId,eventId:randomUUID(),action:'preview'});assert.equal(first.versionId,second.versionId);
 const changed=structuredClone(p);changed.baseVersion=first.versionId;changed.eventId=randomUUID();changed.action='download';changed.data.concept='Concepto actualizado';
 const third=await R.saveReport(db,changed);assert.notEqual(third.versionId,first.versionId);
 assert.deepEqual((await R.getReport(db,p.reportId,first.versionId)).data,p.data);
 assert.deepEqual((await R.getReport(db,p.reportId)).data,changed.data);
 const events=await R.events(db,p.reportId);assert.equal(events.length,3);assert.deepEqual(new Set(events.map(e=>e.action)),new Set(['save','download','preview']));
 assert.equal((await db.query('SELECT data FROM ad_assets WHERE hash=$1',[hash]))[0].data,image);
});
test('stale writes fail instead of overwriting edits from another device',async()=>{
 const p=payload(),first=await R.saveReport(db,p);
 const next=await R.saveReport(db,{...p,eventId:randomUUID(),baseVersion:first.versionId,data:{...p.data,concept:'New'}});
 await assert.rejects(R.saveReport(db,{...p,eventId:randomUUID(),baseVersion:first.versionId,data:{...p.data,concept:'Stale'}}),error=>error.status===409);
 assert.equal((await R.getReport(db,p.reportId)).version_id,next.versionId);
 assert.equal((await R.events(db,p.reportId)).length,2);
});
test('missing assets and invalid values do not create a report or event',async()=>{
 const p=payload();p.data.photos=[{image:{asset:'a'.repeat(64)},caption:'Missing'}];
 await assert.rejects(R.saveReport(db,p),/Faltan imágenes/);
 await assert.rejects(R.getReport(db,p.reportId),error=>error.status===404);
 await assert.rejects(R.putAsset(db,{hash:'a'.repeat(64),data:'data:image/jpeg;base64,AAAA'}),/Imagen no válida/);
 assert.throws(()=>R.validateData({...P.blank(),plate:''}),/placa/);
 assert.throws(()=>R.validateData({...P.example(),signature:'https://example.com/image'}),/Referencia/);
});
test('search and dates use parameterized queries and return metadata only',async()=>{
 const p=payload();p.data.plate="Q'1234";await R.saveReport(db,p);
 const list=await R.list(db,new URLSearchParams({q:"Q'1234"}));assert.equal(list.reports.length,1);assert.equal(list.reports[0].id,p.reportId);assert(!('data' in list.reports[0]));
 assert.equal((await R.list(db,new URLSearchParams({q:"' OR 1=1 --"}))).reports.length,0);
 assert.equal((await R.list(db,new URLSearchParams({from:'2099-01-01'}))).reports.length,0);
});
test('event IDs cannot be reused to change another report or action',async()=>{
 const p=payload(),first=await R.saveReport(db,p);
 await assert.rejects(R.saveReport(db,{...p,baseVersion:first.versionId,action:'preview'}),error=>error.status===409);
 assert.equal((await R.events(db,p.reportId)).length,1);
});
test('authentication expires, detects tampering and fails closed without server secrets',()=>{
 const env={DATABASE_URL:'postgresql://test',HISTORY_PASSWORD:'a-long-test-password'},now=Date.now();
 const value=S.token(env.HISTORY_PASSWORD,now),req={headers:{cookie:'ad_history='+value,host:'example.com',origin:'https://example.com'}};
 assert(S.authenticated(req,env,now+1));assert(!S.authenticated(req,env,now+43200001));
 assert(!S.authenticated({headers:{cookie:'ad_history='+value+'x'}},env,now));assert(!S.authenticated(req,{},now));
 assert(S.passwordMatches(env.HISTORY_PASSWORD,env));assert(!S.passwordMatches('wrong',env));
 assert(S.sameOrigin(req));assert(!S.sameOrigin({headers:{host:'example.com',origin:'https://evil.example'}}));assert(!S.sameOrigin({headers:{host:'example.com'}}));
 assert.match(S.cookie(value,req),/HttpOnly; SameSite=Strict; Max-Age=43200; Secure/);
});
test('API never exposes reports without a session and rejects cross-origin writes',async()=>{
 const api=require('../api/history.js'),old={DATABASE_URL:process.env.DATABASE_URL,HISTORY_PASSWORD:process.env.HISTORY_PASSWORD};
 process.env.DATABASE_URL='postgresql://unused';process.env.HISTORY_PASSWORD='a-long-test-password';
 const call=async(req)=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.value=v;}};await api(req,res);return res;};
 try{
  for(const op of ['storage','asset','migrate-assets']){
   const result=await call({method:op==='migrate-assets'?'POST':'GET',url:'/api/history?op='+op,headers:{host:'example.com',origin:'https://example.com'},body:{}});assert.equal(result.code,401);
  }
  const denied=await call({method:'GET',url:'/api/history?op=reports',headers:{host:'example.com'}});assert.equal(denied.code,401);assert.equal(denied.headers['Cache-Control'],'no-store');
  const csrf=await call({method:'POST',url:'/api/history?op=save',headers:{host:'example.com',origin:'https://evil.example'},body:{}});assert.equal(csrf.code,403);
  delete process.env.HISTORY_PASSWORD;const unconfigured=await call({method:'GET',url:'/api/history?op=session',headers:{host:'example.com'}});assert.deepEqual(unconfigured.value,{configured:false,authenticated:false});
 }finally{for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
