const fs=require('node:fs');
fs.rmSync('public',{recursive:true,force:true});fs.mkdirSync('public');
for(const entry of ['index.html','generador','assets','historial'])fs.cpSync(entry,'public/'+entry,{recursive:true});
console.log('Static application built in public/. Server functions remain outside the public directory.');
