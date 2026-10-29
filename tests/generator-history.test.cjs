const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{randomUUID,webcrypto}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const database=require('../server/database.cjs'),G=require('../server/generator-records.cjs'),S=require('../server/security.cjs'),E=require('../generador/photo-engine.js');
let pg,db;
before(async()=>{
 pg=new PGlite();await pg.waitReady;
 db={query:async(text,params)=>(await pg.query(text,params)).rows,transaction:statements=>pg.transaction(async tx=>{const rows=[];for(const [text,params] of statements)rows.push((await tx.query(text,params)).rows);return rows;})};
 await database.ensureSchema(db);database.ready=async()=>db;
 process.env.DATABASE_URL='postgresql://test-only';process.env.HISTORY_PASSWORD='test-only-long-password';
});
after(async()=>pg.close());
const api=require('../api/history.js');
async function call(op,body,{auth=false,method='POST',origin='https://example.com'}={}){
 const req={method,url:'/api/history?op='+op,headers:{host:'example.com',origin,...(auth?{cookie:'ad_history='+S.token(process.env.HISTORY_PASSWORD)}:{})},body};
 const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};await api(req,res);return res;
}
function payload(){return {eventId:randomUUID(),action:'export',data:{plate:'GEN123',vehicle:'Vehículo de prueba',service:'AD-TEST',date:'2026-10-29',package:'Completo',company:'AutoDiagnóstico',photoCount:3,profile:'balanced',layout:'classified',columns:4}};}
test('anonymous generator events persist separately; private list requires authentication and assets remain untouched',async()=>{
 const before=await db.query('SELECT count(*)::int AS n FROM ad_assets');
 for(const action of ['save','export']){const body=payload();body.action=action;const response=await call('generator-save',body);assert.equal(response.code,200,JSON.stringify(response.body));}
 assert.equal((await call('generator-records',null,{method:'GET'})).code,401);
 const response=await call('generator-records&q=AD-TEST',null,{method:'GET',auth:true});assert.equal(response.code,200);assert.equal(response.body.records.length,2);assert.equal(response.body.records[0].data.photoCount,3);
 assert.deepEqual(await db.query('SELECT count(*)::int AS n FROM ad_assets'),before);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM ad_reports'))[0].n,0);
 assert.equal((await call('generator-save',payload(),{origin:'https://other.example'})).code,403);
});
test('each action appends, retries are idempotent, and existing entries cannot be changed',async()=>{
 const body=payload();const first=await G.save(db,body);assert.deepEqual(await G.save(db,body),first);
 const altered=structuredClone(body);altered.data.plate='NEW123';await assert.rejects(G.save(db,altered),e=>e.status===409);
 assert.equal((await db.query('SELECT data FROM ad_generator_events WHERE id=$1',[body.eventId]))[0].data.plate,'GEN123');
 assert.notEqual((await G.save(db,{...body,eventId:randomUUID()})).eventId,first.eventId);
});
test('rejects photos and arbitrary fields, invalid counts, dates and excessive metadata',async()=>{
 for(const change of [b=>b.photos=['base64'],b=>b.data.photos=['base64'],b=>b.data.logo='base64',b=>b.data.photoCount=201,b=>b.data.photoCount=-1,b=>b.data.photoCount=1.5,b=>b.data.plate='',b=>b.data.vehicle='x'.repeat(96),b=>b.data.date='2026-02-30',b=>b.action='delete']){
  const body=payload();change(body);assert.equal((await call('generator-save',body)).code,400);
 }
 const zero=payload();zero.action='save';zero.data.photoCount=0;assert.equal((await call('generator-save',zero)).code,200);
});
test('generator search, Colombia date filters and pagination',async()=>{
 const statements=[];for(let i=0;i<52;i++){const b=payload();b.data.plate='PAGE01';statements.push(['INSERT INTO ad_generator_events(id,action,content_hash,data,created_at) VALUES($1,$2,$3,$4::jsonb,$5)',[b.eventId,b.action,'fixture',JSON.stringify(b.data),i===51?'2026-10-30T04:59:00Z':'2026-10-29T04:59:00Z']]);}await db.transaction(statements);
 const first=await G.list(db,new URLSearchParams({q:'page01',from:'2026-10-28',to:'2026-10-28'}));assert.equal(first.records.length,50);assert.equal(first.hasMore,true);
 const next=await G.list(db,new URLSearchParams({q:'PAGE01',from:'2026-10-28',to:'2026-10-28',offset:50}));assert.equal(next.records.length,1);assert.equal(next.hasMore,false);
 const other=await G.list(db,new URLSearchParams({q:'PAGE01',from:'2026-10-29',to:'2026-10-29'}));assert.equal(other.records.length,1);
 await assert.rejects(G.list(db,new URLSearchParams({from:'2026-10-30',to:'2026-10-01'})),e=>e.status===400);
});
function client(request,storage={getItem:()=>null,setItem(){}}){
 const root={crypto:webcrypto,fetch:request,sessionStorage:storage};vm.runInNewContext(fs.readFileSync('generador/history.js','utf8'),{window:root,AbortSignal});return root.GeneratorHistory;
}
test('real recorder/API stores only metadata, never requests login or uploads, and snapshots queued actions',async()=>{
 const calls=[],states=[];const c=client(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});const r=await call('generator-save',JSON.parse(options.body));return {ok:r.code===200,json:async()=>r.body};});
 const recorder=c.createRecorder({onChange:s=>states.push(s)}),state=E.blank();state.plate='CLI123';state.logo='DO NOT SEND';state.photos=[{blob:'DO NOT SEND',caption:'DO NOT SEND',thumb:'DO NOT SEND'}];
 await recorder.record(state,'save');state.plate='CLI456';await recorder.record(state,'export');
 assert.equal(calls.length,2);assert(calls.every(c=>c.url==='/api/history?op=generator-save'));assert(!JSON.stringify(calls).includes('DO NOT SEND'));
 assert.equal(states.at(-1).pending,0);assert.equal(states.at(-1).last.plate,'CLI456');assert.equal(calls[0].body.data.photoCount,1);assert.notEqual(calls[0].body.eventId,calls[1].body.eventId);
});
test('lost responses retry after reload with same IDs and preserve snapshots of multiple failed actions',async()=>{
 let stored='',drop=true;const storage={getItem:()=>stored,setItem:(k,v)=>{stored=v;}},ids=[],states=[];
 const request=async(url,options)=>{const body=JSON.parse(options.body);ids.push(body.eventId);const r=await call('generator-save',body);if(drop)throw Error('Lost response');return {ok:r.code===200,json:async()=>r.body};};
 const state=E.blank();state.plate='QUE123';let recorder=client(request,storage).createRecorder({onChange:s=>states.push(s)});
 await recorder.record(state,'export');state.plate='QUE456';state.photos=[{},{}];await recorder.record(state,'save');assert.equal(states.at(-1).pending,2);
 drop=false;recorder=client(request,storage).createRecorder({onChange:s=>states.push(s)});await recorder.retry();assert.equal(states.at(-1).pending,0);
 const rows=await G.list(db,new URLSearchParams({q:'QUE'}));assert.equal(rows.records.length,2);assert.equal(rows.records.find(r=>r.data.plate==='QUE123').data.photoCount,0);assert.equal(rows.records.find(r=>r.data.plate==='QUE456').data.photoCount,2);assert.equal(ids[0],ids[1]);assert.equal(ids[0],ids[2]);
});
test('storage unavailable does not prevent recording',async()=>{
 const root={crypto:webcrypto,fetch:async()=>({ok:true,json:async()=>({savedAt:'now'})})};Object.defineProperty(root,'sessionStorage',{get(){throw Error('Denied');}});
 vm.runInNewContext(fs.readFileSync('generador/history.js','utf8'),{window:root,AbortSignal});let status;const recorder=root.GeneratorHistory.createRecorder({onChange:s=>status=s});const state=E.blank();state.plate='MEM123';await recorder.record(state,'save');assert.equal(status.pending,0);
});
