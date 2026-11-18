'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const handler=require('../api/remote.js');
const TOKEN='A_secure_access_token_0123456789';
process.env.AUTOVJ_ACCESS_TOKEN=TOKEN;
process.env.UPSTASH_REDIS_REST_URL='https://unit.test/redis';
process.env.UPSTASH_REDIS_REST_TOKEN='test-redis-token';
const oldFetch=global.fetch;
const mem=new Map();
const mockFetch=async(url,opts)=>{const cmd=JSON.parse(opts.body);const [name,key,...rest]=cmd;let result;
 if(name==='GET')result=mem.get(key)??null;
 else if(name==='MGET')result=[key,...rest].map(k=>mem.get(k)??null);
 else if(name==='SET'){mem.set(key,rest[0]);result='OK'}
 else if(name==='INCR'){const n=Number(mem.get(key)||0)+1;mem.set(key,String(n));result=n}
 else if(name==='EXPIRE'){result=1}
 else throw Error('unexpected Redis: '+name);
 return{ok:true,json:async()=>({result})};};
function res(){return{code:null,body:null,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}}}
const req=(method,mode,body,session='SHOW61',token=TOKEN,after=0)=>({method,query:{mode,session,after},headers:{'x-autovj-token':token},body});
async function run(r){const out=res();await handler(r,out);return out}
before(()=>{global.fetch=mockFetch});after(()=>{global.fetch=oldFetch});
test('strict pairing code validation',()=>{assert.equal(handler.sessionCode('ab12cd'),'AB12CD');assert.equal(handler.sessionCode('abc'),null);assert.equal(handler.sessionCode('ABC!!!'),null)});
test('invalid / missing auth does not access state',async()=>{assert.equal((await run(req('GET','status',null,'SHOW61','BAD'))).code,401);assert.equal((await run(req('GET','status',null,'a!b!c!'))).code,400)});
test('command validation prevents arbitrary remote action',()=>{assert.equal(handler.actionOf({type:'exec',shell:'rm -rf /'}),null);assert.equal(handler.actionOf({type:'seek',delta:300}),null);assert.equal(handler.actionOf({type:'take',side:'none'}),null);assert.deepEqual(handler.actionOf({type:'seek',delta:1}),{type:'seek',delta:1});assert.deepEqual(handler.actionOf({type:'take',side:'left'}),{type:'take',side:'left'})});
test('state sanitization strips arbitrary fields, keeps null telemetry',()=>{const s=handler.cleanState({decks:{left:{title:'A',artist:'B',videoId:'a1234567890',secret:'BAD',elapsed:5},right:{}},secret:'BAD',outputTime:null});assert.equal(s.decks.left.secret,undefined);assert.equal(s.secret,undefined);assert.equal(s.outputTime,null)});
test('Mac publishes state and iPad reads it with same session',async()=>{const post=await run(req('POST','state',{active:'left',decks:{left:{title:'曲名',artist:'作者',elapsed:11,videoId:'a1234567890'},right:{title:'次曲',artist:'作者'}}}));assert.equal(post.code,200);const get=await run(req('GET','status'));assert.equal(get.body.state.decks.left.title,'曲名');assert.equal(get.body.state.active,'left');assert.equal(get.body.state.decks.left.videoId,'a1234567890')});
test('command queue preserves TAKE then SEEK and allows cursor',async()=>{const hello=await run(req('GET','hello'));assert.equal(hello.body.seq,0);const a=await run(req('POST','command',{type:'take',side:'right'}));const b=await run(req('POST','command',{type:'seek',delta:5}));assert.equal(a.body.seq,1);assert.equal(b.body.seq,2);const list=await run(req('GET','commands',null,'SHOW61',TOKEN,0));assert.deepEqual(list.body.commands.map(x=>x.command.type),['take','seek']);assert.equal(list.body.seq,2);const after=await run(req('GET','commands',null,'SHOW61',TOKEN,2));assert.equal(after.body.commands.length,0)});
test('two sessions do not share commands or state',async()=>{const other=await run(req('GET','status',null,'OTHER6'));assert.equal(other.body.state,null);const otherHello=await run(req('GET','hello',null,'OTHER6'));assert.equal(otherHello.body.seq,0)});
test('unfinished command never advances cursor and can be retried',async()=>{mem.set('autovj:remote:v61:STUCK6:seq','1');const result=await run(req('GET','commands',null,'STUCK6',TOKEN,0));assert.equal(result.body.seq,0);mem.set('autovj:remote:v61:STUCK6:cmd:1',JSON.stringify({seq:1,createdAt:Date.now(),command:{type:'arm',side:'left'}}));const retry=await run(req('GET','commands',null,'STUCK6',TOKEN,0));assert.equal(retry.body.commands[0].command.type,'arm');assert.equal(retry.body.seq,1)});

test('iPadへ未取得の時刻を0秒と偽って渡さない',()=>{
 const s=handler.cleanState({decks:{left:{title:'A',artist:'B',elapsed:null},right:{}}});
 assert.equal(s.decks.left.elapsed,null);
});

test('25操作を2回のRedis問い合わせで順番に取得する',async()=>{
 const session='BATCH61',base='autovj:remote:v61:'+session+':';
 mem.set(base+'seq','25');
 for(let seq=1;seq<=25;seq++)mem.set(base+'cmd:'+seq,JSON.stringify({seq,createdAt:Date.now(),command:{type:'arm',side:seq%2?'left':'right'}}));
 const calls=[];
 global.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return mockFetch(url,options)};
 try{
  const result=await run(req('GET','commands',null,session));
  assert.equal(result.body.commands.length,25);
  assert.deepEqual(result.body.commands.map(c=>c.seq),Array.from({length:25},(_,i)=>i+1));
  assert.deepEqual(calls.map(c=>c[0]),['GET','MGET']);
 }finally{global.fetch=mockFetch}
});

test('期限切れ操作と不正カーソルを処理する',async()=>{
 const base='autovj:remote:v61:EXPIRE6:';
 mem.set(base+'seq','1');mem.set(base+'cmd:1',JSON.stringify({seq:1,createdAt:Date.now()-31000,command:{type:'take',side:'right'}}));
 const result=await run(req('GET','commands',null,'EXPIRE6',TOKEN,0));
 assert.equal(result.body.commands.length,0);assert.equal(result.body.seq,1);
 assert.equal((await run(req('GET','commands',null,'EXPIRE6',TOKEN,Infinity))).code,400);
 const reset=await run(req('GET','commands',null,'EMPTY66',TOKEN,99));
 assert.equal(reset.body.seq,0);
});

test('Redisの操作番号が戻った後も最初の新操作を取得',async()=>{
 const base='autovj:remote:v61:RESET66:';
 mem.set(base+'seq','1');mem.set(base+'cmd:1',JSON.stringify({seq:1,createdAt:Date.now(),command:{type:'take',side:'right'}}));
 const result=await run(req('GET','commands',null,'RESET66',TOKEN,99));
 assert.equal(result.body.seq,1);assert.equal(result.body.commands[0].command.side,'right');
});
