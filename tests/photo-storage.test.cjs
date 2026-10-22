const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const S=require('../generador/photo-storage.js');
const E=require('../generador/photo-engine.js');

test('pending and blocked opens fail safely and close connections arriving late',async()=>{
 for(const blocked of [false,true]){
  let closed=0;const request={result:{close(){closed++;}}};
  const pending=S.connect({open:()=>request},10);
  if(blocked)request.onblocked();
  await assert.rejects(pending,/almacenamiento/);
  request.onsuccess();assert.equal(closed,1);
 }
});
test('a stalled storage transaction is aborted instead of keeping the UI busy indefinitely',async()=>{
 let aborted=0,closed=0;
 const tx={abort(){aborted++;this.onabort();},objectStore(){return {get:()=>({})};}};
 const db={transaction:()=>tx,close(){closed++;}};
 await assert.rejects(S.load(db,E.validateMetadata,10),/tiempo/);
 assert.equal(aborted,1);assert.equal(closed,1);
});
test('restoration reads photos in order in one transaction and reports missing originals',async()=>{
 const draft=E.blank();draft.plate='TEST01';draft.photos=[{id:'1',name:'one.jpg',category:'general'},{id:'2',name:'missing.jpg',category:'general'},{id:'3',name:'three.jpg',category:'general'}];
 const originals={'1':{blob:new Blob(['one'])},'3':{blob:new Blob(['three'])}};
 let transactions=0,pending=0;
 const tx={objectStore(name){return {get(key){pending++;const request={};queueMicrotask(()=>{request.result=name==='session'?draft:originals[key];request.onsuccess();if(!--pending)tx.oncomplete();});return request;}};}};
 const result=await S.load({transaction(){transactions++;return tx;},close(){}},E.validateMetadata,50);
 assert.equal(transactions,1);assert.equal(result.snapshot.plate,'TEST01');
 assert.deepEqual(result.snapshot.photos.map(p=>p.id),['1','3']);assert.deepEqual(result.missing,['missing.jpg']);
 assert.equal(result.snapshot.photos[0].blob,originals['1'].blob);
});
function app(storage,fetch){
 const nodes=new Map(),events={};
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',inert:false,hidden:true,dataset:{},setAttribute(){},addEventListener(){},classList:{add(){},remove(){}},textContent:''});return nodes.get(selector);};
 const context=vm.createContext({window:{PhotoEngine:E,PhotoStorage:storage,addEventListener(name,fn){events[name]=fn;}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},fetch,AbortController,FileReader:class{readAsDataURL(){this.result='data:image/png;base64,AA==';this.onload();}},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,20)),clearTimeout,URL,console});
 const ready=vm.runInContext(fs.readFileSync(require.resolve('../generador/photos.js'),'utf8'),context);
 return {nodes,node,context,ready,events};
}
const logo=async()=>({ok:true,blob:async()=>new Blob(['logo'])});
test('failed restoration unlocks editing, leaves navigation active and never overwrites the old draft',async()=>{
 let writes=0,closed=0;
 const a=app({connect:async()=>({close(){closed++;}}),load:async()=>{throw Error('stalled');},run:async()=>{writes++;}},logo);
 assert.equal(a.node('main').inert,false);
 assert.equal(a.node('.layout').inert,true);
 await a.ready;
 assert.equal(a.node('.layout').inert,false);assert.equal(a.node('.top-actions').inert,false);
 await vm.runInContext('save()',a.context);
 assert.equal(writes,0);assert.equal(closed,1);
 assert.match(a.node('#notice').innerHTML,/no se reemplazará/);
});
test('a stalled logo does not freeze a successfully restored draft',async()=>{
 const snapshot=E.blank();snapshot.plate='TEST02';snapshot.logo='data:image/png;base64,AQ==';
 const a=app({connect:async()=>({close(){}}),load:async()=>({snapshot,missing:[]})},()=>new Promise(()=>{}));
 await a.ready;
 assert.equal(a.node('.layout').inert,false);
 assert.equal(vm.runInContext('state.plate',a.context),'TEST02');
 assert.equal(a.node('#brand-logo').src,snapshot.logo);
});
test('leaving while restoration is pending cannot save an empty draft over stored data',async()=>{
 let complete,writes=0;
 const a=app({connect:async()=>({close(){}}),load:()=>new Promise(resolve=>{complete=resolve;}),run:async()=>{writes++;}},logo);
 await Promise.resolve();await Promise.resolve();
 await vm.runInContext('save()',a.context);assert.equal(writes,0);
 complete({snapshot:null,missing:[]});await a.ready;
 await vm.runInContext('save()',a.context);assert.equal(writes,1);
});

test('navigation closes storage and a cached page reconnects without replacing current edits',async()=>{
 let connections=0,closed=0,loads=0,writes=0;
 const a=app({connect:async()=>{connections++;return {close(){closed++;}};},load:async()=>{loads++;return {snapshot:null,missing:[]};},run:async()=>{writes++;}},logo);
 await a.ready;vm.runInContext("state.plate='KEEP01'",a.context);
 a.events.pagehide();assert.equal(closed,1);
 const resumed=a.events.pageshow({persisted:true});assert.equal(a.node('.layout').inert,true);
 await resumed;
 assert.equal(connections,2);assert.equal(loads,1);assert.equal(writes,2);
 assert.equal(vm.runInContext('state.plate',a.context),'KEEP01');assert.equal(a.node('.layout').inert,false);
});
