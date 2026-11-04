import {createRemoteHost} from './remote-host.js';
import {CHANNEL,STORE,PREFS,SIDES,emptyDeck,loadJSON,saveJSON,videoIdOf,fmt,keyOf,profileId,clamp,buildPlayer,openChannel,renderGenerative,plainYoutubeEmbed,youtubeError} from './shared.js';
const $=id=>document.getElementById(id);
const DEFAULTS={lead:.5,tolerance:.8,overlay:true,autoSearch:true,autoAdopt:false,accessToken:'',bridge:false,autoSync:true,mode:'off'};
let settings={...DEFAULTS,...loadJSON(PREFS,{})};let persisted=loadJSON(STORE,{});
let decks={left:emptyDeck(),right:emptyDeck()};let mappings=persisted.mappings||{},offsets=persisted.offsets||{};
let selected='left',active=null,armed=null,outputLast=0,outputFallback=false,telemetry=null,lastSync=0,initialAligned=false,searches=0,searchBusy={},bridgeLast=0,modeBlockUntil=0;
let preview=null,cues={left:null,right:null},stopGen=null,seen={left:'',right:''},playObserver={left:null,right:null};let lastManualAt=0;
let previewLoad='loading',previewError='',previewActiveId='',cueErrors={left:'',right:''},youtubeApiFailed=false;
const channel=openChannel(onChannel);
const toast=s=>{$('toast').textContent=s};
const persist=()=>saveJSON(STORE,{mappings,offsets});
function trackOf(side){return decks[side]}
function deckName(side){return side==='left'?'DECK 1':'DECK 2'}
function clipTitle(s,n=52){return s?.length>n?s.slice(0,n)+'…':s||'—'}
function timeNow(d){if(!Number.isFinite(d.elapsed))return NaN;const raw=d.elapsed;const freshness=Date.now()-d.observedAt;if(d.playing==='playing'&&d.observedAt>0&&freshness>=0&&freshness<8000)return raw+Math.min(6,freshness/1000);return raw}
function render(){for(const side of SIDES){const d=decks[side];$('title-'+side).textContent=d.title||'曲名未設定';$('artist-'+side).textContent=d.artist||'アーティスト —';$('elapsed-'+side).textContent=d.title?fmt(timeNow(d)):'--:--';$('state-'+side).textContent=d.playing==='playing'?'再生中':d.playing==='paused'?'停止中':'状態不明';$('mv-'+side).textContent=d.videoId?'MV 準備済み'+(d.videoTitle?' / '+clipTitle(d.videoTitle,24):''):(d.videoStatus||'MV 未設定');$('cue-label-'+side).textContent=cueErrors[side]|| (d.videoId?(cues[side]?'頭出し済み（再生は未確認）':'頭出し準備中'):'MV未選択');$('deck-'+side).classList.toggle('onair',active===side);$('deck-'+side).classList.toggle('armed',armed===side)}$('arm-pill').textContent=armed?'ARM '+deckName(armed):'ARMなし';$('bridge-status').textContent=settings.bridge?(Date.now()-bridgeLast<10000?'rekordbox連携中':'Mac連携待機中'):'手動モード';$('bridge-dot').classList.toggle('ok',settings.bridge&&Date.now()-bridgeLast<10000);$('bridge-dot').classList.toggle('error',settings.bridge&&Date.now()-bridgeLast>=10000);$('preview-chip').textContent=active?(decks[active].videoId?'YouTube MV':'自動生成'):'映像なし';if(active){$('now-title').textContent=decks[active].title||'タイトル不明';$('now-artist').textContent=decks[active].artist||''}$('output-status').textContent=Date.now()-outputLast<6500?'出力ウィンドウ接続中':'出力ウィンドウ未接続';$('mode-explain').textContent={off:'手動TAKEのみ',safe:'片側再生中のみ切替',mix:'ミックス中も指定条件で切替'}[settings.mode];$('auto-sync').checked=!!settings.autoSync;$('lead-value').textContent=(settings.lead>=0?'+':'')+settings.lead.toFixed(1)+'秒';for(const btn of document.querySelectorAll('[data-mode]'))btn.classList.toggle('active',btn.dataset.mode===settings.mode);renderSync();previewMessage()}
function previewMessage(){
 const el=$('preview-diagnostic');if(!el)return;
 if(!active){el.textContent='プレビュー待機中：MVを選択し、DECK 1か2のTAKEを押してください。';return}
 const d=decks[active];
 if(!d.videoId){
   el.textContent='DECK '+(active==='left'?'1':'2')+'：MV未選択。映像生成を表示しています。MV検索・管理から候補を採用してください。';
 }else if(previewError){el.textContent='YouTubeプレビュー：'+previewError+'（ほかの公式MV候補を試してください）';}
 else if(previewLoad==='fallback'){el.textContent='公式の通常埋め込みで表示中（API未接続）。プレビュー内の再生ボタンを押してください。秒数同期は利用できません。';}
 else if(!preview){el.textContent='YouTubeプレーヤーを準備中。TAKEした曲は準備完了後に再生します。';}
 else if(previewLoad==='playing'){el.textContent='MVプレビュー再生中（ミュート）。上映映像は別ウィンドウです。';}
 else if(previewLoad==='blocked'){el.textContent='ブラウザが自動再生をブロックしました。MVプレーヤーの再生ボタンを押してください。';}
 else {el.textContent='MVプレビュー読み込み中。再生が始まらない場合はYouTube側の埋め込み制限も確認してください。';}
}
function renderSync(){if(!active){$('dj-time').textContent='--:--';$('mv-time').textContent='--:--';$('drift-value').textContent='未計測';return}const d=decks[active],expected=targetTime(d);$('dj-time').textContent=d.title?fmt(timeNow(d)):'--:--';const live=telemetry&&telemetry.videoId===d.videoId&&Date.now()-telemetry.ts<3000;$('mv-time').textContent=live?fmt(telemetry.time):'--:--';$('drift-value').textContent=live&&Number.isFinite(d.elapsed)?`${(expected-telemetry.time)>=0?'+':''}${(expected-telemetry.time).toFixed(1)}秒`:'未計測';if(!Number.isFinite(d.elapsed)||!d.observedAt)$('sync-status').textContent='rekordbox経過時間のOCR待機中：Macでタイマー診断を実行';else if(outputFallback)$('sync-status').textContent='YouTube通常埋め込み中：API未接続のため自動同期は利用できません';else if(!live)$('sync-status').textContent='映像出力の再生時刻を待機中';else if(d.playing==='unknown')$('sync-status').textContent='デッキ再生状態が不明：自動同期は保留';else $('sync-status').textContent=settings.autoSync?'同期中 / 基準 '+deckName(active):'自動同期 OFF'}
function targetTime(d){const elapsed=timeNow(d);return Math.max(0,(Number.isFinite(elapsed)?elapsed:0)+settings.lead+(Number(offsets[profileId(d)])||0))}
function sendConfig(){channel.send({type:'config',overlay:settings.overlay})}
function saveSettings(){saveJSON(PREFS,settings);$('lead-value').textContent=(settings.lead>=0?'+':'')+settings.lead.toFixed(1)+'秒';sendConfig()}
async function initPlayers(){
 try{
  preview=await buildPlayer('main-player','',{
    muted:true,
    onStateChange:e=>{
      const n=e.data;previewLoad=n===1?'playing':n===3?'buffering':n===2?'paused':n===5?'cued':'loading';previewMessage();
    },
    onError:e=>{
      const code=Number(e.data);
      previewError=youtubeError(code)+'（エラー '+code+'）';
      previewMessage();
    },
    onAutoplayBlocked:()=>{previewLoad='blocked';previewMessage()}
  });
  // A TAKE may happen while YouTube's script is still loading.
  // Replay it now that the player is ready rather than leaving the area blank.
  if(active)showPreview(decks[active]);
  previewMessage();
 }catch(err){
  youtubeApiFailed=true;
  previewError='プレーヤー初期化失敗 ['+(err.code||'YT_INIT_ERROR')+']: '+err.message;
  if(active&&decks[active].videoId)showPreview(decks[active]);
  previewMessage();
  toast('YouTubeプレーヤーを読み込めません: '+err.message);
 }
 // Cue previews are independent: an error in one must not block the other.
 await Promise.all(SIDES.map(async side=>{
  try{
   cues[side]=await buildPlayer('cue-'+side,'',{
    muted:true,
    onError:e=>{cueErrors[side]='YouTubeエラー '+e.data;render()},
    onAutoplayBlocked:()=>{cueErrors[side]='再生制限';render()}
   });
   if(decks[side].videoId)cues[side].cueVideoById(decks[side].videoId);
  }catch(err){cueErrors[side]='APIに接続できません（通常埋め込み）';if(decks[side].videoId)plainYoutubeEmbed('cue-'+side,decks[side].videoId,{autoplay:false});console.warn('Cue player '+side,err)}
  render();
 }));
} 
function showPreview(d){
 const hasVideo=!!d.videoId;
 $('main-player').classList.toggle('visible',hasVideo);
 $('main-generative').classList.toggle('visible',!hasVideo);
 $('player-empty').style.display='none';
 if(!hasVideo){
  previewActiveId='';previewError='';previewLoad='idle';
  try{preview?.pauseVideo?.()}catch{}
  if(!stopGen)stopGen=renderGenerative($('main-generative'));
  previewMessage();return;
 }
 if(stopGen){stopGen();stopGen=null}
 previewActiveId=d.videoId;previewError='';previewLoad='loading';
 if(youtubeApiFailed&&!preview){plainYoutubeEmbed('main-player',d.videoId,{startSeconds:targetTime(d),autoplay:false});previewLoad='fallback';previewMessage();return}
 try{if(preview){preview.loadVideoById({videoId:d.videoId,startSeconds:targetTime(d)});preview.mute()}}
 catch(e){previewError=String(e);console.warn(e)}
 previewMessage();
}
function take(side,why='手動'){const d=decks[side];if(!d.title){toast(deckName(side)+' の曲名がありません。「MV検索・管理」で登録してください。');return}active=side;armed=null;initialAligned=false;telemetry=null;lastSync=Date.now();modeBlockUntil=Date.now()+12000;showPreview(d);channel.send({type:'take',deck:side,title:d.title,artist:d.artist,videoId:d.videoId,startSeconds:targetTime(d)});sendConfig();toast(`${deckName(side)} TAKE (${why}) / ${d.artist} - ${d.title}`);render()}
function onChannel(d){if(!d)return;if(d.type==='output-ready'){outputLast=Date.now();sendConfig();if(active){const x=decks[active];channel.send({type:'take',deck:active,title:x.title,artist:x.artist,videoId:x.videoId,startSeconds:targetTime(x)})}}else if(d.type==='output-heartbeat'||d.type==='output-state'){outputLast=Date.now();if(d.type==='output-state')outputFallback=d.status==='fallback-no-sync'}else if(d.type==='output-closed'){outputLast=0}else if(d.type==='telemetry'){outputLast=Date.now();telemetry={...d,ts:Date.now()}}else if(d.type==='output-error'){toast('プロジェクター出力: '+d.message);const s=$('output-status');s.textContent='YouTubeエラー: '+d.message;s.title=d.message}}
function seek(delta){if(!active)return toast('先にTAKEしてください');const d=decks[active];if(!d.videoId)return toast('自動生成映像には再生位置がありません');channel.send({type:'seek',videoId:d.videoId,delta:Number(delta)});try{preview?.seekTo(Math.max(0,preview.getCurrentTime()+Number(delta)),true)}catch{};toast('MVを'+(delta>0?'+'+delta:delta)+'秒補正')}
function sync(force=false){if(!active)return;const d=decks[active];if(!d.videoId||!d.title)return;const clockFresh=Number.isFinite(d.elapsed)&&d.observedAt>0&&Date.now()-d.observedAt<8000;if(outputFallback)return;if(!force&&(!settings.autoSync||d.playing!=='playing'||!clockFresh))return;const valid=telemetry&&telemetry.videoId===d.videoId&&Date.now()-telemetry.ts<3000;if(!valid)return;if(!force&&Date.now()-lastSync<3500)return;const drift=targetTime(d)-telemetry.time;const threshold=settings.tolerance;if(!force&&Math.abs(drift)<threshold)return;const max=initialAligned?5:300;if(!force&&Math.abs(drift)>max){$('sync-status').textContent=`補正を保留（ズレ ${drift.toFixed(1)}秒）`;return}const target=targetTime(d);channel.send({type:'seek',videoId:d.videoId,absolute:target});try{preview?.seekTo(target,true)}catch{};lastSync=Date.now();initialAligned=true;toast(`TIMELINE SYNC: 映像を ${fmt(target)} に合わせました`)}
function applyTrack(side,title,artist,{elapsed=0,playing='unknown',observedAt=Date.now(),videoId}={}){if(!title.trim()||!artist.trim())return;const prev=decks[side];const changed=keyOf(prev)!==keyOf({title,artist});const next={...prev,title:title.trim().slice(0,180),artist:artist.trim().slice(0,180),elapsed,playing,observedAt};if(changed){next.videoId='';next.videoTitle='';next.videoStatus='MV未検索';const remembered=mappings[keyOf(next)];if(remembered?.video_id){next.videoId=remembered.video_id;next.videoStatus='記憶済み';next.videoTitle=remembered.title||''}seen[side]=keyOf(next)}if(videoId)next.videoId=videoId;decks[side]=next;if(changed||videoId)cue(side);render();if(changed&&settings.autoSearch&&!next.videoId)searchTrack(side,true)}
function cue(side){const d=decks[side];if(d.videoId){try{if(cues[side])cues[side].cueVideoById(d.videoId);else if(youtubeApiFailed)plainYoutubeEmbed('cue-'+side,d.videoId,{autoplay:false})}catch{}}}
function openSearch(side){selected=side;switchTab('search');if(!decks[side].videoId)toast(deckName(side)+' のMV候補を選択してください。')}
function chooseVideo(side,id,meta={}){if(!id)return;const d=decks[side];if(!d.title||!d.artist)return toast('デッキに楽曲情報を入力してください');d.videoId=id;d.videoTitle=meta.title||'';d.videoStatus='準備済み';mappings[keyOf(d)]={video_id:id,choice:meta.choice||'manual',title:d.videoTitle};persist();cue(side);if(active===side){showPreview(d);channel.send({type:'take',deck:side,title:d.title,artist:d.artist,videoId:d.videoId,startSeconds:targetTime(d)});sendConfig()}render();toast(`${deckName(side)} にMVを保存しました。${active===side?'プレビューと出力を更新しました。':'TAKEで出力できます。'}`)}
async function searchTrack(side,automatic=false){const d=decks[side];if(!d.title||!d.artist)return;if(searchBusy[side])return;if(automatic&&searches>=12){d.videoStatus='検索上限に到達';render();return}if(!automatic){selected=side;$('search-deck').value=side;$('search-title').value=d.title;$('search-artist').value=d.artist}d.videoStatus='検索中…';render();searchBusy[side]=true;searches++;try{const r=await fetch('/api/youtube-search',{method:'POST',headers:{'Content-Type':'application/json','X-AutoVJ-Token':settings.accessToken||''},body:JSON.stringify({title:d.title,artist:d.artist})});const data=await r.json();if(!r.ok)throw Error(data.error||'検索失敗');if(keyOf(d)!==keyOf(decks[side]))return;d.videoStatus=`MV候補 ${data.items.length}件`;if(settings.autoAdopt&&data.items[0]&&data.items[0].score>=100&&!d.videoId)chooseVideo(side,data.items[0].id,{...data.items[0],choice:'auto'});if(!automatic||document.querySelector('#tab-search.active'))showResults(data.items,side);if(automatic&&data.items.length&&!d.videoId){d.videoStatus='候補あり（「MV検索・管理」で選択）';resultsPerDeck[side]=data.items}}catch(err){d.videoStatus='検索エラー';if(!automatic)showResults([],side,err.message);else toast(`MV自動検索: ${err.message}`)}finally{searchBusy[side]=false;render()}}
const resultsPerDeck={left:[],right:[]};function showResults(items,side,error=''){resultsPerDeck[side]=items;$('search-count').textContent=items.length+'件';const list=$('results');list.replaceChildren();if(error||items.length===0){const p=document.createElement('p');p.className='muted';p.textContent=error||'候補がありません。YouTube URLの手動指定もできます。';list.append(p);return}for(const item of items){const card=document.createElement('div');card.className='result';const img=document.createElement('img');img.src=`https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;img.alt='動画サムネイル';img.loading='lazy';const mid=document.createElement('div');const name=document.createElement('div');name.className='result-name';name.textContent=item.title;const ch=document.createElement('div');ch.className='result-channel';ch.textContent=item.channel;const score=document.createElement('div');score.className='score';score.textContent='関連度 '+item.score+'（公式認定ではありません）';mid.append(name,ch,score);const btn=document.createElement('button');btn.className='btn blue';btn.textContent='このMVを採用';btn.addEventListener('click',()=>chooseVideo(side,item.id,item));card.append(img,mid,btn);list.append(card)}}
function switchTab(tab){for(const t of document.querySelectorAll('.tab'))t.classList.toggle('active',t.dataset.tab===tab);for(const p of document.querySelectorAll('.tab-page'))p.classList.toggle('active',p.id==='tab-'+tab);if(tab==='search'){const d=decks[selected];$('search-deck').value=selected;$('search-title').value=d.title;$('search-artist').value=d.artist;showResults(resultsPerDeck[selected]||[],selected)}}
async function pollBridge(force=false){if(!settings.bridge||!settings.accessToken)return;
 // Keep OCR bridge polling even when the Mac output window is fullscreen.
 try{const response=await fetch('/api/bridge',{headers:{'X-AutoVJ-Token':settings.accessToken},cache:'no-store'});const j=await response.json();if(!response.ok)throw Error(j.error||'接続失敗');if(!j.state){$('bridge-detail').textContent='Macからの更新待ち';return}bridgeLast=Date.now();$('bridge-detail').textContent='Macから受信 '+new Date(j.state.updatedAt).toLocaleTimeString();for(const side of SIDES){const remote=j.state.decks?.[side];if(!remote)continue;const d=decks[side];const valid=typeof remote.title==='string'&&typeof remote.artist==='string'&&remote.title.trim()&&remote.artist.trim();if(!valid)continue;const fresh=typeof remote.elapsed==='number'&&Number.isFinite(remote.elapsed)?remote.elapsed:null;const sourceTime=Number(remote.clockObservedAt)||0;const observedAt=sourceTime>0&&sourceTime<=Date.now()+2000?sourceTime:0;if(keyOf(d)!==keyOf(remote))applyTrack(side,remote.title,remote.artist,{elapsed:fresh,playing:remote.playing||'unknown',observedAt});else{d.elapsed=fresh;d.playing=remote.playing||'unknown';d.observedAt=observedAt;} } const clockOk=SIDES.some(side=>Number(j.state.decks?.[side]?.clockObservedAt)>0&&Date.now()-Number(j.state.decks[side].clockObservedAt)<12000); if(!clockOk)$('bridge-detail').textContent+=' / 時刻OCR未取得：MacのDIAGNOSE_TIMERS.commandを実行';render()}catch(err){if(force)toast('Mac連携: '+err.message);$('bridge-detail').textContent=err.message}}
function autoTake(){if(settings.mode==='off'||Date.now()<modeBlockUntil||!settings.bridge)return;const a=decks.left,b=decks.right;if(settings.mode==='safe'){if(a.playing==='playing'&&b.playing==='paused'&&active!=='left'&&a.title)take('left','安全モード');else if(b.playing==='playing'&&a.playing==='paused'&&active!=='right'&&b.title)take('right','安全モード')}else if(settings.mode==='mix'&&armed){const d=decks[armed],prev=playObserver[armed];if(prev==='paused'&&d.playing==='playing')take(armed,'ARM / 再生検知')}for(const side of SIDES)playObserver[side]=decks[side].playing}
async function fileImport(input,kind){const file=input.files?.[0];if(!file)return;try{if(file.size>700000)throw Error('700KBを超えるファイルは読み込めません');const data=JSON.parse(await file.text());if(!data||typeof data!=='object'||Array.isArray(data))throw Error('JSONオブジェクトではありません');let count=0;for(const [k,v] of Object.entries(data)){if(k.length>500)continue;if(kind==='cache'&&v&&typeof v.video_id==='string'&&videoIdOf(v.video_id)){mappings[k]={video_id:v.video_id,choice:v.choice||'manual'};count++}if(kind==='offset'&&typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=600){offsets[k]=v;count++}}persist();toast(`${file.name}: ${count}件取り込みました`)}catch(err){toast('取込失敗: '+err.message)}input.value=''}
function wiring(){document.querySelectorAll('.tab').forEach(x=>x.addEventListener('click',()=>switchTab(x.dataset.tab)));$('open-output').addEventListener('click',()=>{const win=window.open('/output.html','AutoVJOutput','width=1280,height=720');if(!win)toast('ポップアップがブロックされました。AutoVJのポップアップを許可してください')});$('fullscreen-output').addEventListener('click',()=>window.open('/output.html','AutoVJOutput'));document.querySelectorAll('[data-take]').forEach(b=>b.addEventListener('click',()=>take(b.dataset.take)));document.querySelectorAll('[data-arm]').forEach(b=>b.addEventListener('click',()=>{armed=b.dataset.arm;toast(deckName(armed)+' ARM 待機');render()}));document.querySelectorAll('[data-choose]').forEach(b=>b.addEventListener('click',()=>openSearch(b.dataset.choose)));document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{settings.mode=b.dataset.mode;saveSettings();render()}));document.querySelectorAll('[data-seek]').forEach(b=>b.addEventListener('click',()=>seek(Number(b.dataset.seek))));$('sync-now').addEventListener('click',()=>sync(true));$('auto-sync').addEventListener('change',e=>{settings.autoSync=e.target.checked;saveSettings()});document.querySelectorAll('[data-offset]').forEach(btn=>btn.addEventListener('click',()=>{if(!active)return toast('先にTAKEしてください');const d=decks[active],id=profileId(d);offsets[id]=clamp((offsets[id]||0)+Number(btn.dataset.offset),-600,600);persist();toast('曲別オフセット '+offsets[id].toFixed(1)+'秒を保存');sync(true)}));$('reset-manual-offset').addEventListener('click',()=>{if(active){delete offsets[profileId(decks[active])];persist();toast('この曲の補正オフセットをリセットしました')}});$('search-deck').addEventListener('change',e=>{selected=e.target.value;const d=decks[selected];$('search-title').value=d.title;$('search-artist').value=d.artist;showResults(resultsPerDeck[selected]||[],selected)});$('apply-track').addEventListener('click',()=>applyTrack(selected,$('search-title').value,$('search-artist').value));$('search-button').addEventListener('click',()=>{applyTrack(selected,$('search-title').value,$('search-artist').value);searchTrack(selected)});$('apply-manual-video').addEventListener('click',()=>{const id=videoIdOf($('manual-url').value);if(!id)return toast('有効なYouTube URL / 動画IDを入力してください');chooseVideo(selected,id,{title:'URL指定MV'})});$('setting-lead').value=settings.lead;$('setting-tolerance').value=settings.tolerance;$('setting-overlay').checked=settings.overlay;$('setting-autosearch').checked=settings.autoSearch;$('setting-autoadopt').checked=settings.autoAdopt;$('setting-bridge').checked=settings.bridge;$('setting-token').value=settings.accessToken;$('auto-sync').checked=settings.autoSync;$('save-settings').addEventListener('click',()=>{settings.lead=clamp($('setting-lead').value,-5,5);settings.tolerance=clamp($('setting-tolerance').value,.2,5);settings.overlay=$('setting-overlay').checked;settings.autoSearch=$('setting-autosearch').checked;settings.autoAdopt=$('setting-autoadopt').checked;settings.bridge=$('setting-bridge').checked;settings.accessToken=$('setting-token').value.trim();saveSettings();toast('設定を保存しました');render();if(settings.bridge)pollBridge(true)});$('test-bridge').addEventListener('click',()=>{settings.accessToken=$('setting-token').value.trim();settings.bridge=true;$('setting-bridge').checked=true;saveSettings();pollBridge(true)});$('apply-manual-clock').addEventListener('click',()=>{for(const side of SIDES){const d=decks[side];d.elapsed=clamp($('manual-'+side+'-clock').value,0,40000);d.playing=$('manual-'+side+'-play').checked?'playing':'paused';d.observedAt=Date.now()}lastManualAt=Date.now();render();toast('模擬再生状態を反映しました')});$('import-cache').addEventListener('change',e=>fileImport(e.target,'cache'));$('import-offsets').addEventListener('change',e=>fileImport(e.target,'offset'));$('export-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({settings:{...settings,accessToken:''},mappings,offsets},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='autovj-web-backup.json';a.click();URL.revokeObjectURL(a.href)});$('clear-data').addEventListener('click',()=>{if(!confirm('MVの保存履歴とオフセットを全削除しますか？'))return;mappings={};offsets={};persist();toast('保存履歴を削除しました')});window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='1'){e.preventDefault();take('left')}else if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='2'){e.preventDefault();take('right')}})}

// The Mac owns the actual YouTube player(s) and all sync decisions.
const remoteHost=createRemoteHost({
 getToken:()=>settings.accessToken,
 getState:()=>({
  decks:Object.fromEntries(SIDES.map(side=>{const d=decks[side];return [side,{title:d.title,artist:d.artist,elapsed:timeNow(d),playing:d.playing,videoId:d.videoId,videoStatus:d.videoStatus,videoTitle:d.videoTitle,candidates:resultsPerDeck[side]||[]}]})),
  active,armed,mode:settings.mode,autoSync:settings.autoSync,lead:settings.lead,
  outputConnected:Date.now()-outputLast<6500,bridgeConnected:settings.bridge&&Date.now()-bridgeLast<10000,
  outputTime:telemetry&&Date.now()-telemetry.ts<3500?telemetry.time:null,
 }),
 execute:async command=>{
  const {type,side}=command;
  if(type==='take')take(side,'iPad');
  else if(type==='arm'){armed=side;render();toast(deckName(side)+' をiPadからARM')}
  else if(type==='clearArm'){armed=null;render()}
  else if(type==='mode'){settings.mode=command.mode;saveSettings();render()}
  else if(type==='autoSync'){settings.autoSync=command.enabled;saveSettings();render()}
  else if(type==='seek')seek(command.delta);
  else if(type==='sync')sync(true);
  else if(type==='lead'){settings.lead=command.value;$('setting-lead').value=settings.lead;saveSettings();render()}
  else if(type==='offset'&&active){const id=profileId(decks[active]);offsets[id]=clamp((offsets[id]||0)+command.delta,-600,600);persist();sync(true);render()}
  else if(type==='refresh')await searchTrack(side,false);
  else if(type==='search'){if(command.title&&command.artist){applyTrack(side,command.title,command.artist);await searchTrack(side,false)}}
  else if(type==='choose'){const option=(resultsPerDeck[side]||[]).find(x=>x.id===command.videoId);if(option)chooseVideo(side,option.id,option);else toast('候補が変わりました。MVを再検索してください。')}
 },
});
async function boot(){wiring();initPlayers();render();setInterval(()=>{render();sync(false);autoTake()},450);setInterval(()=>pollBridge(),2200);toast('Web UI 起動完了。初回はMV検索から曲・動画を登録してください。')}
boot();
