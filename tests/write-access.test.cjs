const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {randomUUID,webcrypto}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const database=require('../server/database.cjs'),writes=require('../server/write-access.cjs'),R=require('../server/reports.cjs'),S=require('../server/security.cjs');
let pg,db,P;
before(async()=>{
 pg=new PGlite();await pg.waitReady;
 db={query:async(text,params)=>(await pg.query(text,params)).rows,transaction:statements=>pg.transaction(async tx=>{const out=[];for(const [text,params] of statements)out.push((await tx.query(text,params)).rows);return out;})};
 await database.ensureSchema(db);database.ready=async()=>db;
 const context={};new Function('window',[...fs.readFileSync('index.html','utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('root.Peritaje=')))(context);P=context.Peritaje;
 process.env.DATABASE_URL='postgresql://test-only';process.env.HISTORY_PASSWORD='test-only-long-password';
});
after(async()=>{await pg.close();});
const api=require('../api/history.js');
async function call(op,body,authenticated=false,method='POST'){
 const req={method,url:'/api/history?op='+op,headers:{host:'example.com',origin:'https://example.com',...(authenticated?{cookie:'ad_history='+S.token(process.env.HISTORY_PASSWORD)}:{})},body};
 const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};await api(req,res);return res;
}
test('anonymous save, download and preview persist with images while all history reads stay private',async()=>{
 const ref={reportId:randomUUID(),writeKey:'a'.repeat(64)};
 assert.equal((await call('write-access',ref)).code,200);
 const image='data:image/jpeg;base64,'+fs.readFileSync('tests/fixtures/photo.jpg').toString('base64'),hash=S.sha(image);
 assert.equal((await call('asset',{...ref,hash,data:image})).code,200);
 const data=P.example();data.logo={asset:hash};data.photos=[{image:{asset:hash},caption:'Evidence'}];
 let version=null;
 for(const action of ['save','download','preview']){const result=await call('save',{...ref,eventId:randomUUID(),baseVersion:version,action,data});assert.equal(result.code,200,JSON.stringify(result.body));version=result.body.versionId;}
 assert.equal((await R.events(db,ref.reportId)).length,3);
 for(const op of ['reports','report&id='+ref.reportId,'events&id='+ref.reportId,'asset&hash='+hash,'storage'])assert.equal((await call(op,undefined,false,'GET')).code,401);
 assert.equal((await call('reports',undefined,true,'GET')).body.reports.some(r=>r.id===ref.reportId),true);
});
test('anonymous browsers cannot acquire access to or alter another report, even knowing its current version',async()=>{
 const ref={reportId:randomUUID(),writeKey:'b'.repeat(64)};await writes.grant(db,ref,false);
 const result=await R.saveReport(db,{...ref,eventId:randomUUID(),baseVersion:null,action:'save',data:P.example()});
 const attacker={...ref,writeKey:'c'.repeat(64),baseVersion:result.versionId};
 assert.equal((await call('write-access',attacker)).code,409);
 assert.equal((await call('save',{...attacker,eventId:randomUUID(),action:'save',data:P.example()})).code,403);
 assert.equal((await call('asset',{...attacker,hash:'d'.repeat(64),data:'no'})).code,403);
 assert.equal((await R.events(db,ref.reportId)).length,1);
 assert.equal((await call('write-access',attacker,true)).code,200);
 // The second authorized browser can keep writing after signing out.
 assert.equal((await call('save',{...attacker,eventId:randomUUID(),action:'save',data:P.example()})).code,200);
 await writes.requireWrite(db,ref);
});
test('a legacy local draft claims write access with its private current version only once',async()=>{
 const reportId=randomUUID(),saved=await R.saveReport(db,{reportId,eventId:randomUUID(),baseVersion:null,action:'save',data:P.example()});
 const ref={reportId,writeKey:'d'.repeat(64)};
 await assert.rejects(writes.grant(db,ref,false),e=>e.status===409);
 await writes.grant(db,{...ref,baseVersion:saved.versionId},false);
 await writes.requireWrite(db,ref);
 await assert.rejects(writes.grant(db,{...ref,writeKey:'e'.repeat(64),baseVersion:saved.versionId},false),e=>e.status===409);
});
test('public writes are limited without enabling private reads',async()=>{
 const req={headers:{'x-forwarded-for':'rate-test'}};
 await assert.rejects(writes.limit(db,req,'asset',280000001),e=>e.status===429);
});
test('browser saves never request a login, persist their write key and reuse event IDs on retry',async()=>{
 const requests=[],context={window:{},crypto:webcrypto,Uint8Array,TextEncoder,structuredClone,URLSearchParams,AbortSignal,location:{protocol:'https:'},document:{createElement(){throw Error('Password dialog must never open while saving');}}};
 let failSave=true;
 context.fetch=async(url,options)=>{const op=new URL(url,'https://example.com').searchParams.get('op'),body=JSON.parse(options.body||'{}');requests.push({op,body});
  assert(!['session','login'].includes(op));
  if(op==='save'&&failSave){failSave=false;return {ok:false,status:503,json:async()=>({error:'Temporary error'})};}
  return {ok:true,json:async()=>op==='save'?{versionId:randomUUID()}:{allowed:true}};
 };
 vm.runInNewContext(fs.readFileSync('assets/history-client.js','utf8'),context);
 const ref={id:randomUUID(),version:null},data=P.example();
 await assert.rejects(context.window.ReportHistory.save(data,ref,'download'),/Temporary error/);
 const pending=ref.pending.eventId,key=ref.writeKey;assert.match(key,/^[a-f0-9]{64}$/);
 await context.window.ReportHistory.save(data,ref,'download');
 const saves=requests.filter(r=>r.op==='save');assert.equal(saves[1].body.eventId,pending);assert.equal(ref.writeKey,key);
 await context.window.ReportHistory.save(data,ref,'preview');assert.equal(ref.writeKey,key);
 assert(requests.filter(r=>r.op==='save').every(r=>r.body.writeKey===key));
});
test('real browser client and API record both PDF actions without a login, including image upload',async()=>{
 const context={window:{},crypto:webcrypto,Uint8Array,TextEncoder,structuredClone,URLSearchParams,AbortSignal,location:{protocol:'https:'},document:{createElement(){throw Error('Unexpected login dialog');}}};
 const calls=[];
 context.fetch=async(url,options)=>{
  const op=new URL(url,'https://example.com').searchParams.get('op');calls.push(op);
  const result=await call(op,JSON.parse(options.body||'{}'),false,options.method);
  return {ok:result.code===200,status:result.code,json:async()=>result.body};
 };
 vm.runInNewContext(fs.readFileSync('assets/history-client.js','utf8'),context);
 const ref={id:randomUUID(),version:null},data=P.example();data.photos=[{image:'data:image/jpeg;base64,'+fs.readFileSync('tests/fixtures/photo.jpg').toString('base64'),caption:'Client API round-trip'}];
 await context.window.ReportHistory.save(data,ref,'download');await context.window.ReportHistory.save(data,ref,'preview');
 const events=await R.events(db,ref.id);assert.deepEqual(new Set(events.map(e=>e.action)),new Set(['download','preview']));
 assert.equal(events[0].version_id,events[1].version_id);assert(calls.includes('asset'));assert(!calls.includes('login'));assert(!calls.includes('session'));
 assert.equal((await R.getReport(db,ref.id)).data.photos[0].caption,'Client API round-trip');
});
