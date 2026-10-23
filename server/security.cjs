'use strict';
const crypto=require('node:crypto');
const COOKIE='ad_history';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
function configured(env=process.env){return !!env.DATABASE_URL&&typeof env.HISTORY_PASSWORD==='string'&&env.HISTORY_PASSWORD.length>=16;}
function sign(value,secret){return crypto.createHmac('sha256',secret).update('autodiagnostico-session:'+value).digest('base64url');}
function token(secret,now=Date.now()){const payload=Buffer.from(JSON.stringify({exp:now+12*60*60*1000,nonce:crypto.randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+sign(payload,secret);}
function authenticated(req,env=process.env,now=Date.now()){
 if(!configured(env))return false;
 const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!value||value.length>1000)return false;
 const [payload,signature,...rest]=value.split('.');
 if(rest.length||!signature||!same(signature,sign(payload,env.HISTORY_PASSWORD)))return false;
 try{const data=JSON.parse(Buffer.from(payload,'base64url'));return Number.isFinite(data.exp)&&data.exp>now&&data.exp<=now+12*60*60*1000;}catch{return false;}
}
function cookie(value,req,clear=false){return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:43200}${req.headers.host?.startsWith('127.0.0.1:')||req.headers.host?.startsWith('localhost:')?'':'; Secure'}`;}
function sameOrigin(req){try{return new URL(req.headers.origin).host===req.headers.host&&['https:','http:'].includes(new URL(req.headers.origin).protocol);}catch{return false;}}
function passwordMatches(password,env=process.env){return typeof password==='string'&&password.length<=512&&same(sha(password),sha(env.HISTORY_PASSWORD||''));}
module.exports={sha,configured,token,authenticated,cookie,sameOrigin,passwordMatches};
