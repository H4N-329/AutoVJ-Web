const test=require('node:test');
const assert=require('node:assert/strict');
const yt=require('../api/youtube-search');
const bridge=require('../api/bridge');
function res(){return{code:0,headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(v){this.body=v;return this}}}
const env={...process.env};
test.after(()=>{process.env=env});
test('公式MVらしい候補をカバーより優先する',()=>{
 const track={artist:'DECO*27',title:'モニタリング'};
 const good=yt.score(track,{title:'DECO*27 - モニタリング (Official MV)',channel:'DECO*27'});
 const cover=yt.score(track,{title:'モニタリング 歌ってみた cover',channel:'cover channel'});
 assert.ok(good>cover);
});
test('API認証が誤トークンを拒否',async()=>{
 process.env.AUTOVJ_ACCESS_TOKEN='abcdefghijklmnop1234567890abcdefghijklmnop';
 const r=res();await yt({method:'POST',headers:{'x-autovj-token':'wrong'},body:{title:'X',artist:'Y'}},r);
 assert.equal(r.code,401);
});
test('検索のYouTubeレスポンスを検査して返す',async()=>{
 process.env.AUTOVJ_ACCESS_TOKEN='abcdefghijklmnop1234567890abcdefghijklmnop';
 process.env.YOUTUBE_API_KEY='test-key';
 const orig=global.fetch;global.fetch=async(url)=>{assert.ok(String(url).includes('videoEmbeddable=true'));return{ok:true,async json(){return{items:[{id:{videoId:'6ObvFPLk8eI'},snippet:{title:'r-906 official MV',channelTitle:'r-906'}}]}}}};
 try{const r=res();await yt({method:'POST',headers:{'x-autovj-token':process.env.AUTOVJ_ACCESS_TOKEN},body:{title:'曲',artist:'r-906'}},r);assert.equal(r.code,200);assert.equal(r.body.items.length,1);assert.equal(r.body.items[0].id,'6ObvFPLk8eI')}finally{global.fetch=orig}
});
test('不正なJSONを400として返す',async()=>{
 const r=res();await yt({method:'POST',headers:{'x-autovj-token':process.env.AUTOVJ_ACCESS_TOKEN},body:'broken json'},r);assert.equal(r.code,400)
});
test('ブリッジの状態を安全なフィールドに制限する',()=>{
 const x=bridge.validate({decks:{left:{title:'A',artist:'B',elapsed:12.3,playing:'playing',secret:'NO'},right:{title:'X',elapsed:-2000,playing:'hacked'}}});
 assert.ok(x);assert.equal(x.decks.left.elapsed,12.3);assert.equal(x.decks.right.elapsed,0);assert.equal(x.decks.right.playing,'unknown');assert.equal(x.decks.left.secret,undefined)
});
test('Redisへ投稿し取得できる',async()=>{
 process.env.UPSTASH_REDIS_REST_URL='https://redis.example.test';process.env.UPSTASH_REDIS_REST_TOKEN='redis-secret';
 let data=null;const orig=global.fetch;
 global.fetch=async(url,opts)=>{assert.equal(url,'https://redis.example.test');const a=JSON.parse(opts.body);if(a[0]==='SET'){data=a[2];assert.equal(a[3],'EX');return{ok:true,json:async()=>({result:'OK'})}}if(a[0]==='GET')return{ok:true,json:async()=>({result:data})};throw Error('invalid')};
 try{
  const token=process.env.AUTOVJ_ACCESS_TOKEN;
  const post=res();await bridge({method:'POST',headers:{'x-autovj-token':token},body:{decks:{left:{title:'song',artist:'artist',elapsed:77,playing:'playing'},right:{}}}},post);assert.equal(post.code,200);
  const get=res();await bridge({method:'GET',headers:{'x-autovj-token':token}},get);assert.equal(get.code,200);assert.equal(get.body.state.decks.left.title,'song');
 }finally{global.fetch=orig}
});
