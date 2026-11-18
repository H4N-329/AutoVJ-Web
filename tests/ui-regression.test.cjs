const test=require('node:test');
const assert=require('node:assert/strict');
const {createUI,settle}=require('./ui-harness.cjs');

function take(deck,localId,title=localId){return {type:'take',deck,localId,title,artist:'unit-test',startSeconds:12}}
function deck(deck,localId,options={}){return {type:'deck-state',deck,localId,playing:'playing',observedAt:Date.now(),startSeconds:12,...options}}

test('上映中のデッキに次曲をロードしてもTAKEまで現在映像を保持',async()=>{
 const ui=await createUI('output.js');
 ui.incoming(take('left','local-first-00001'));await settle();
 const video=ui.id('local-left'),loads=video.loads;
 ui.incoming(deck('left','local-next-000002'));await settle();
 assert.equal(video.loads,loads);assert.equal(video.src,'blob:local-first-00001');assert.equal(video.paused,false);
 ui.incoming(take('left','local-next-000002'));await settle();
 assert.equal(video.src,'blob:local-next-000002');
});

test('ローカルクロスフェードで旧動画を保持し、新動画を上に重ねる',async()=>{
 const ui=await createUI('output.js');
 ui.incoming(take('left','local-first-00001'));await settle();
 ui.incoming(deck('right','local-second-0002'));await settle();
 assert.equal(ui.id('local-right').paused,false);
 ui.incoming({type:'config',localFade:.6});ui.incoming(take('right','local-second-0002'));await settle();
 assert.equal(ui.id('local-left').classList.contains('onair'),true);
 assert.equal(ui.id('local-right').classList.contains('fade-in'),true);
 assert.equal(ui.sent.filter(x=>x.type==='output-state').at(-1).duration,.6);
 ui.finishTimeouts();
 assert.equal(ui.id('local-left').classList.contains('onair'),false);
 assert.equal(ui.id('local-left').paused,true);
});

test('TAKE連打時に先に開始した遅い読込で映像を戻さない',async()=>{
 let resolveFirst;
 const ui=await createUI('output.js',{localURL:id=>id==='local-slow-000001'?new Promise(resolve=>{resolveFirst=resolve}):Promise.resolve('blob:'+id)});
 ui.incoming(take('left','local-slow-000001'));
 ui.incoming(take('right','local-current-002'));await settle();
 resolveFirst('blob:local-slow-000001');await settle();
 assert.equal(ui.id('output-title').textContent,'local-current-002');
 assert.equal(ui.id('local-left').paused,true);
});

test('動画読込失敗時は上映中の動画と曲名を維持',async()=>{
 const ui=await createUI('output.js',{localURL:async id=>{if(id==='local-missing-001')throw Error('missing file');return 'blob:'+id}});
 ui.incoming(take('left','local-current-001'));await settle();
 ui.incoming(take('right','local-missing-001'));await settle();
 assert.equal(ui.id('output-title').textContent,'local-current-001');
 assert.equal(ui.id('local-left').paused,false);
 assert.equal(ui.id('output-diagnostic').hidden,false);
});

test('古いOCRではローカル待機デッキを先行再生しない',async()=>{
 const ui=await createUI('output.js');
 ui.incoming(deck('right','local-preplay-001',{observedAt:Date.now()-20000}));await settle();
 assert.equal(ui.id('local-right').paused,true);
 ui.incoming(deck('right','local-preplay-001'));await settle();
 assert.equal(ui.id('local-right').paused,false);
});

test('iPadは切断中の操作を止め、オンラインイベントで状態を再取得',async()=>{
 let available=true;
 const ui=await createUI('controller.js',{api:async url=>String(url).includes('mode=hello')?{seq:0}:{state:available?{updatedAt:Date.now(),decks:{},outputTime:null}:null}});
 ui.id('session').value='UNIT61';ui.id('token').value='unit-test-access-token';await ui.id('connect').trigger('click');
 const takeButton=ui.select('[data-take]')[0];
 assert.equal(takeButton.disabled,false);assert.equal(ui.id('connection').textContent,'Mac ONLINE');
 available=false;await ui.tick(1600);
 assert.equal(takeButton.disabled,true);
 available=true;await ui.windowListeners.online();
 assert.equal(takeButton.disabled,false);
});

test('iPadから切断した後に到着した応答ではONLINEへ戻らない',async()=>{
 let delayed=false,resolvePoll;
 const ui=await createUI('controller.js',{api:async url=>{
  if(String(url).includes('mode=hello'))return {seq:0};
  if(delayed)return new Promise(resolve=>{resolvePoll=resolve});
  return {state:{updatedAt:Date.now(),decks:{}}};
 }});
 ui.id('session').value='UNIT61';ui.id('token').value='unit-test-access-token';await ui.id('connect').trigger('click');
 delayed=true;const pending=ui.tick(1600);await settle();
 await ui.id('disconnect').trigger('click');resolvePoll({state:{updatedAt:Date.now(),decks:{}}});await pending;
 assert.equal(ui.id('connection').textContent,'未接続');assert.equal(ui.select('[data-take]')[0].disabled,true);
});

test('DJ LIVEはDECK 2の時刻未取得を独立表示し復帰を反映',async()=>{
 let right=null;
 const ui=await createUI('app.js',{saved:{'autovj-web-v6-settings':JSON.stringify({bridge:true,accessToken:'unit-test-token',autoSearch:false})},
 api:async()=>({state:{updatedAt:Date.now(),decks:{
  left:{title:'left',artist:'test',elapsed:12,clockObservedAt:Date.now(),playing:'playing'},
  right:{title:'right',artist:'test',elapsed:right,clockObservedAt:right===null?0:Date.now(),playing:'playing'}}}})});
 await settle();assert.equal(ui.id('elapsed-right').textContent,'--:--');assert.ok(ui.id('bridge-detail').textContent.includes('DECK 2'));
 right=35;await ui.tick(2200);await settle();assert.equal(ui.id('elapsed-right').textContent,'00:35');
});

test('DJ LIVEは時刻未取得時の即時同期で先頭へ戻さない',async()=>{
 const localId='local-unit-000001';
 const ui=await createUI('app.js',{saved:{
  'autovj-web-v6-settings':JSON.stringify({bridge:true,accessToken:'unit-test-token',autoSearch:false}),
  'autovj-web-v6-state':JSON.stringify({mappings:{'test::song':{local_id:localId}},offsets:{}})},
 api:async()=>({state:{updatedAt:Date.now(),decks:{left:{title:'song',artist:'test',elapsed:null,clockObservedAt:0,playing:'unknown'},right:{}}}})});
 await settle();await ui.select('[data-take]')[0].trigger('click');await settle();
 ui.incoming({type:'telemetry',localId,time:42,ts:Date.now()});await ui.id('sync-now').trigger('click');
 assert.equal(ui.sent.filter(x=>x.type==='seek').length,0);
});
