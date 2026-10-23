const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {ensureSchema}=require('../server/database.cjs');
const A=require('../server/storage.cjs'),R=require('../server/reports.cjs'),{sha}=require('../server/security.cjs');
const {randomUUID}=require('node:crypto');
const jpeg='data:image/jpeg;base64,'+fs.readFileSync('tests/fixtures/photo.jpg').toString('base64');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO1sAAAAASUVORK5CYII=';
let pg,db;
before(async()=>{
 pg=new PGlite();await pg.waitReady;
 db={query:async(text,params)=>(await pg.query(text,params)).rows,transaction:statements=>pg.transaction(async tx=>{const out=[];for(const [text,params] of statements)out.push((await tx.query(text,params)).rows);return out;})};
 // Exercise an upgrade from the previously deployed schema, including real data.
 await db.query('CREATE TABLE ad_assets(hash text PRIMARY KEY,data text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(length(data)<=4000000))');
 await db.query('INSERT INTO ad_assets(hash,data) VALUES($1,$2)',[sha(jpeg),jpeg]);
 await ensureSchema(db);await ensureSchema(db);
});
after(async()=>{await pg?.close();});
function fakeStore(){const objects=new Map(),puts=[];return {objects,puts,async put(key,bytes,mime){puts.push(key);objects.set(key,{bytes:Buffer.from(bytes),mime});},async get(key){if(!objects.has(key))throw Error('Object missing');return objects.get(key).bytes;}};}
async function clear(){await db.query('DELETE FROM ad_events');await db.query('DELETE FROM ad_versions');await db.query('DELETE FROM ad_reports');await db.query('DELETE FROM ad_assets');}
test('schema upgrade keeps existing images readable and migrates without changing report versions',async()=>{
 const hash=sha(jpeg),store=fakeStore();assert.equal((await A.getAsset(db,hash,null)).data,jpeg);
 const context={};const script=[...fs.readFileSync('index.html','utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('root.Peritaje='));new Function('window',script)(context);
 const data=context.Peritaje.example();data.photos=[{image:{asset:hash},caption:'Original'}];data.signature={asset:hash};data.logo={asset:hash};
 const saved=await R.saveReport(db,{reportId:randomUUID(),eventId:randomUUID(),baseVersion:null,action:'save',data});
 const first=await A.migrateNext(db,store);assert.equal(first.pending,0);assert.equal(first.r2Count,1);assert.equal(first.r2Bytes,Buffer.from(jpeg.split(',')[1],'base64').length);assert.equal(first.neonBase64Bytes,0);
 const row=(await db.query('SELECT * FROM ad_assets WHERE hash=$1',[hash]))[0];assert.equal(row.data,null);assert.match(row.object_key,/\.jpg$/);assert.equal(row.mime_type,'image/jpeg');
 assert.equal((await A.getAsset(db,hash,store)).data,jpeg);
 assert.deepEqual((await R.getReport(db,saved.reportId)).data,data);assert.equal((await R.events(db,saved.reportId)).length,1);
 assert.equal((await A.migrateNext(db,store)).migrated,false);assert.equal(store.puts.length,1);
});
test('new optimized images are binary objects, deduplicated across uploads and recover exact data URLs',async()=>{
 await clear();const store=fakeStore(),hash=sha(png);
 await A.putAsset(db,{hash,data:png},store);await A.putAsset(db,{hash,data:png},store);
 assert.equal(store.puts.length,1);assert.equal(store.objects.size,1);
 const object=[...store.objects.values()][0];assert.equal(object.mime,'image/png');assert.equal(object.bytes.readUInt32BE(0),0x89504e47);
 assert.equal((await db.query('SELECT data FROM ad_assets'))[0].data,null);assert.equal((await A.getAsset(db,hash,store)).data,png);
});
test('R2 upload failure or verification mismatch never clears the Neon original',async()=>{
 await clear();const hash=sha(jpeg);await A.putAsset(db,{hash,data:jpeg},null);
 for(const store of [{async put(){throw Error('Unavailable');}}, {async put(){},async get(){return Buffer.from('corrupted');}}]){
  await assert.rejects(A.migrateNext(db,store));assert.equal((await A.getAsset(db,hash,null)).data,jpeg);assert.equal((await A.status(db)).pending,1);
 }
 const store=fakeStore();await A.migrateNext(db,store);assert.equal((await A.getAsset(db,hash,store)).data,jpeg);
});
test('failed metadata update leaves legacy images intact and migration can resume safely',async()=>{
 await clear();const hash=sha(png),store=fakeStore();await A.putAsset(db,{hash,data:png},null);
 const failing={query:(sql,args)=>sql.startsWith('UPDATE ad_assets')?Promise.reject(Error('Database unavailable')):db.query(sql,args)};
 await assert.rejects(A.migrateNext(failing,store));assert.equal((await A.getAsset(db,hash,null)).data,png);
 assert.equal((await A.migrateNext(db,store)).pending,0);assert.equal(store.objects.size,1);assert.equal((await A.getAsset(db,hash,store)).data,png);
});
test('new images are not registered if R2 fails; modified or missing stored images fail visibly',async()=>{
 await clear();const hash=sha(jpeg),store=fakeStore();
 await assert.rejects(A.putAsset(db,{hash,data:jpeg},{async put(){throw Error('Unavailable');}}));assert.equal((await A.status(db)).total,0);
 await A.putAsset(db,{hash,data:jpeg},store);
 await assert.rejects(A.getAsset(db,hash,null),/configuración/);
 store.objects.set(store.puts[0],{bytes:Buffer.from('changed')});await assert.rejects(A.getAsset(db,hash,store),/no coincide/);
 store.objects.clear();await assert.rejects(A.getAsset(db,hash,store),/missing/);
});
test('mixed legacy/R2 storage reads both and repeated uploads migrate older assets',async()=>{
 await clear();const store=fakeStore();await A.putAsset(db,{hash:sha(jpeg),data:jpeg},null);await A.putAsset(db,{hash:sha(png),data:png},store);
 assert.equal((await A.status(db)).pending,1);assert.equal((await A.getAsset(db,sha(jpeg),store)).data,jpeg);assert.equal((await A.getAsset(db,sha(png),store)).data,png);
 await A.putAsset(db,{hash:sha(jpeg),data:jpeg},store);assert.equal((await A.status(db)).pending,0);
});
test('R2 configuration rejects endpoints in the account field and invalid images never reach storage',async()=>{
 const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET_NAME:'test',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test'};
 assert.equal(A.configuration({}),'neon');assert.equal(A.configuration(env),'r2');assert.equal(A.configuration({...env,R2_ACCOUNT_ID:'https://example.com'}),'incomplete');assert.equal(A.configuration({...env,R2_SECRET_ACCESS_KEY:''}),'incomplete');assert.equal(A.configuration({...env,R2_REGION:'wrong'}),'incomplete');
 assert.throws(()=>A.createStore({...env,R2_ACCOUNT_ID:'https://example.com'}),/identificador/);
 const store=fakeStore();await assert.rejects(A.putAsset(db,{hash:'a'.repeat(64),data:png},store),/Imagen no válida/);assert.equal(store.puts.length,0);
});
