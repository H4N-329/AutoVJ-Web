'use strict';
const crypto=require('node:crypto');
const KEY='autovj:bridge:current';
function auth(req){const expected=process.env.AUTOVJ_ACCESS_TOKEN;if(!expected)return false;const token=String(req.headers['x-autovj-token']||'');return !!token&&Buffer.byteLength(token)===Buffer.byteLength(expected)&&crypto.timingSafeEqual(Buffer.from(token),Buffer.from(expected))}
function output(res,status,data){res.setHeader('Cache-Control','no-store');return res.status(status).json(data)}
async function redis(args){const endpoint=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!endpoint||!token)throw new Error('UPSTASH_REDIS_NOT_CONFIGURED');const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('REDIS_HTTP_'+r.status);const out=await r.json();if(out.error)throw new Error('REDIS_ERROR');return out.result}
function validate(body){
 if(!body||typeof body!=='object'||!body.decks||typeof body.decks!=='object')return null;
 const now=Date.now(),decks={};
 for(const side of ['left','right']){
  const d=body.decks[side]||{};
  const title=String(d.title||'').slice(0,180),artist=String(d.artist||'').slice(0,180);
  const exists=d.elapsed!==null&&d.elapsed!==undefined&&d.elapsed!=='';
  const n=exists?Number(d.elapsed):NaN;
  const elapsed=Number.isFinite(n)?Math.max(0,Math.min(36000,n)):null;
  const reported=Number(d.clockObservedAt);
  // Old clients may not send this field: allow elapsed display but not fake freshness.
  const clockObservedAt=elapsed!==null&&Number.isFinite(reported)&&reported>0&&reported<=now+2000&&reported>=now-60000?Math.round(reported):0;
  const clockSource=['fast','accurate-fallback','full-accurate'].includes(d.clockSource)?d.clockSource:'';
  decks[side]={title,artist,elapsed,clockObservedAt,clockSource,
   playing:['playing','paused','unknown'].includes(d.playing)?d.playing:'unknown'};
 }
 return{decks,updatedAt:now};
}
module.exports=async(req,res)=>{if(!auth(req))return output(res,401,{error:'アクセストークンを確認してください'});try{if(req.method==='GET'){const raw=await redis(['GET',KEY]);let state=null;try{if(raw)state=JSON.parse(raw)}catch{};return output(res,200,{state})}if(req.method==='POST'){if(Number(req.headers['content-length']||0)>8000)return output(res,413,{error:'データが大きすぎます'});const body=typeof req.body==='string'?JSON.parse(req.body):req.body;const state=validate(body);if(!state)return output(res,400,{error:'デッキデータの形式が不正です'});await redis(['SET',KEY,JSON.stringify(state),'EX','20']);return output(res,200,{ok:true,updatedAt:state.updatedAt})}return output(res,405,{error:'GETまたはPOSTを使用してください'})}catch(e){return output(res,503,{error:e.message==='UPSTASH_REDIS_NOT_CONFIGURED'?'VercelのRedis環境変数を設定してください':'ブリッジの保存先に接続できません'})}}
module.exports.validate=validate;
