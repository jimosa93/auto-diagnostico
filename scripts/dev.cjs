// Local development only; matches Vercel's single API endpoint.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
try{process.loadEnvFile('.env.local');}catch{}
const handler=require('../api/history.js'),root=path.resolve('public');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm'};
http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/history')){
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4200000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  req.body=Buffer.concat(chunks).toString();res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};await handler(req,res);return;
 }
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{const data=await fs.promises.readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT)||8081,'127.0.0.1',()=>console.log('AutoDiagnóstico: http://127.0.0.1:'+(process.env.PORT||8081)));
