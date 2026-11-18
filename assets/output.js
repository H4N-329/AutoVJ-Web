import {makeLocalURL} from './local-media.js';
import {mayPreplay,switchEffect,validateFade} from './hybrid-transition.mjs';
import {openChannel,buildPlayer,VIDEO_RE,renderGenerative,plainYoutubeEmbed,youtubeError,loadYT} from './shared.js';
const $=id=>document.getElementById(id);
let player=null,playerInit=null,ready=false,videoId='',localId='',title='',artist='',showOverlay=true,currentMode='idle',stoppedEffect=null,lastTake=null,apiFailed=false,fallback=false,restarting=false;
let currentLocalSide=null,pendingLocalSide=null,fadingFrom=null,fadeTimer=0,fadeSeconds=0.75,takeSerial=0;
const localSlots={left:{id:'',url:'',serial:0,request:0,loading:null},right:{id:'',url:'',serial:0,request:0,loading:null}};
const deckStates={left:null,right:null};
const channel=openChannel(handle);
for(const side of ['left','right'])$('local-'+side).addEventListener('error',()=>{const id=localSlots[side].id;if(id)send('local-ready',{deck:side,localId:id,status:'error',message:'動画をデコードできません。Chromeで再生可能なH.264 MP4またはWebMを指定してください。'})});
function send(type,data={}){channel.send({type,...data})}
function setIssue(heading='',detail='',kind='error'){
 const panel=$('output-diagnostic');
 panel.hidden=!heading;document.body.classList.toggle('has-output-diagnostic',!!heading);
 $('output-issue-title').textContent=heading;
 $('output-issue-detail').textContent=detail;
 panel.dataset.kind=kind;
 $('output-yt-link').hidden=!VIDEO_RE.test(videoId);
 $('output-yt-link').href=VIDEO_RE.test(videoId)?`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`:'https://www.youtube.com/';
}
function changeDisplay(mode){
 currentMode=mode;
 $('output-local-stage').classList.toggle('visible',mode==='local');
 $('output-player').classList.toggle('visible',mode==='video');
 $('output-generative').classList.toggle('visible',mode==='generative');
 $('output-idle').style.display=mode==='idle'?'flex':'none';
 if(mode==='generative'&&!stoppedEffect)stoppedEffect=renderGenerative($('output-generative'));
 if(mode!=='generative'&&stoppedEffect){stoppedEffect();stoppedEffect=null}
}
function renderOverlay(){
 $('output-title').textContent=title||'AutoVJ Web';
 $('output-artist').textContent=artist||'DJ LIVE';
 $('output-overlay').classList.toggle('hidden',!showOverlay);
}
function displayFallback(reason){
 if(!VIDEO_RE.test(videoId))return;
 fallback=true;ready=false;player=null;
 plainYoutubeEmbed('output-player',videoId,{startSeconds:Number(lastTake?.startSeconds)||0,autoplay:true,muted:true});
 changeDisplay('video');
 setIssue('公式の通常埋め込みで再生を試行中',`${reason}。ミュートで自動再生を試しています。始まらない場合は動画中央の赤い再生ボタンを押してください。代替表示では自動同期・シークは使えません。`,'warning');
 send('output-state',{videoId,status:'fallback-no-sync'});
 send('output-error',{message:'API接続不可：通常埋め込みへ切替（同期不可）'});
}
async function stageLocal(d,{play=false,retry=false}={}){
 const side=d.deck;if(!['left','right'].includes(side))return;
 const slot=localSlots[side],v=$('local-'+side),id=String(d.localId||'');
 const request=++slot.request;
 if(!id){
  if(!slot.id)return false;
  if(slot.url){URL.revokeObjectURL(slot.url);slot.url='';}
  slot.id='';slot.serial++;slot.loading=null;v.pause();v.removeAttribute('src');v.load();return false;
 }
 if(slot.id!==id||(retry&&!slot.url&&!slot.loading)){
  const serial=++slot.serial;slot.id=id;
  if(slot.url)URL.revokeObjectURL(slot.url);
  slot.url='';v.pause();v.removeAttribute('src');v.load();
  slot.loading=makeLocalURL(id).then(url=>{
   if(serial!==slot.serial){URL.revokeObjectURL(url);return;}
   slot.url=url;v.src=url;v.load();v.muted=true;
   send('local-ready',{deck:side,localId:id,status:'loaded'});
  }).catch(e=>{if(serial===slot.serial)send('local-ready',{deck:side,localId:id,status:'error',message:e.message})})
   .finally(()=>{if(serial===slot.serial)slot.loading=null});
 }
 if(slot.loading)await slot.loading;
 if(request!==slot.request||slot.id!==id||!slot.url)return false;
 const desired=Number(d.startSeconds);
 if(Number.isFinite(desired)&&(v.readyState<1||Math.abs(v.currentTime-desired)>1.5)){
  try{v.currentTime=Math.max(0,desired)}catch{}
 }
 if(!play){
  if(!v.paused){
   v.pause();
   send('local-ready',{deck:side,localId:id,status:'loaded'});
  }
  return true;
 }
 try{
  await v.play();
  if(request!==slot.request)return false;
  send('local-ready',{deck:side,localId:id,status:'playing'});
  return true;
 }catch(e){
  if(request===slot.request)send('local-ready',{deck:side,localId:id,status:e.name==='NotAllowedError'?'blocked':'error',message:e.message});
  return false;
 }
}

function stageStandby(side){
 const d=deckStates[side];
 if(!d||[currentLocalSide,pendingLocalSide,fadingFrom].includes(side))return;
 const play=mayPreplay({side,active:currentLocalSide,localId:d.localId,playing:d.playing,observedAt:d.observedAt,maxAgeMs:8000});
 stageLocal(d,{play}).catch(console.warn);
}

function finishFade(keepPlayingSide=null){
 clearTimeout(fadeTimer);
 if(!fadingFrom)return;
 const outgoing=$('local-'+fadingFrom);
 outgoing.classList.remove('onair');
 if(fadingFrom!==keepPlayingSide)outgoing.pause();
 $('local-'+currentLocalSide).classList.remove('fade-in');
 fadingFrom=null;
}

function stopYouTube(){
 try{player?.pauseVideo?.()}catch{}
 if(fallback){$('output-player').replaceChildren();fallback=false}
}

function showTrack(d){
 title=d.title||'';artist=d.artist||'';
 videoId=VIDEO_RE.test(d.videoId||'')?d.videoId:'';
 localId=d.localId||'';renderOverlay();
}

async function takeLocal(d,serial){
 const side=d.deck;if(!['left','right'].includes(side)){setIssue('ローカル動画のDECK番号が不正です','操作画面からTAKEしてください');return}
 pendingLocalSide=side;
 const playable=await stageLocal(d,{play:true,retry:true});
 if(serial!==takeSerial)return;
 pendingLocalSide=null;
 if(!playable){
  const detail=localSlots[side].url?'再生を許可してから再試行するか、Mac Chromeで再生できる動画を登録してください。'
   :'Macの同じブラウザで「MV事前設定」から動画を再登録してください。';
  setIssue('ローカル動画を出力できません',detail);
  send('output-error',{message:detail});
  return;
 }
 const fromSide=currentLocalSide;
 const effect=fromSide!==side?switchEffect(currentMode,'local'):'cut';
 finishFade(side);
 const v=$('local-'+side),outgoing=fromSide&&fromSide!==side?$('local-'+fromSide):null;
 currentLocalSide=side;showTrack(d);changeDisplay('local');setIssue('');stopYouTube();
 $('output-local-stage').style.setProperty('--local-fade-duration',`${Math.round(fadeSeconds*1000)}ms`);
 if(effect==='crossfade'&&outgoing){
  fadingFrom=fromSide;
  v.classList.remove('onair');
  v.classList.add('fade-in');
  void v.offsetWidth;
  v.classList.add('onair');
  fadeTimer=setTimeout(()=>{finishFade(pendingLocalSide);stageStandby(fromSide)},Math.round(fadeSeconds*1000)+70);
 }else{
  if(outgoing){outgoing.classList.remove('onair');outgoing.pause()}
  v.classList.add('onair');
 }
 send('output-state',{localId,videoId:'',status:'local-playing',effect,duration:effect==='crossfade'?fadeSeconds:0});
}
function take(d){
 const serial=++takeSerial;
 const previousPending=pendingLocalSide;
 pendingLocalSide=null;
 if(previousPending){
  localSlots[previousPending].request++;
  if(previousPending!==currentLocalSide)$('local-'+previousPending).pause();
 }
 lastTake=d;
 if(d.localId){
  takeLocal(d,serial).catch(err=>{
   if(serial!==takeSerial)return;
   pendingLocalSide=null;
   send('output-error',{message:'ローカル動画TAKE: '+err.message});
  });
  if(previousPending&&previousPending!==d.deck)stageStandby(previousPending);
  return;
 }
 finishFade();showTrack(d);currentLocalSide=null;
 for(const side of ['left','right']){
  const v=$('local-'+side);
  v.classList.remove('onair','fade-in');v.pause();stageStandby(side);
 }
 if(!videoId){
  stopYouTube();changeDisplay('generative');
  setIssue('');send('output-state',{videoId:'',status:'generative'});return;
 }
 if(apiFailed){displayFallback('YouTube IFrame APIが使えません');return}
 if(!ready){
  // Keep this TAKE until onReady fires. Avoid displaying a misleading success state.
  if(!restarting&&!playerInit)startPlayer();
  $('output-idle').querySelector('p').textContent='YouTubeプレーヤーの起動待ちです…';
  changeDisplay('idle');setIssue('プレーヤーを準備中','しばらくしても表示されない場合は通信・拡張機能を確認してください','warning');return;
 }
 fallback=false;changeDisplay('video');setIssue('');
 try{player.loadVideoById({videoId,startSeconds:Math.max(0,Number(d.startSeconds)||0)});player.mute();send('output-state',{videoId,status:'loading'})}
 catch(e){setIssue('動画の再生開始に失敗',String(e));send('output-error',{message:String(e)})}
}
async function startPlayer(){
 if(restarting||playerInit)return;
 restarting=true;apiFailed=false;fallback=false;ready=false;
 try{
  await loadYT();
  if(!lastTake?.videoId||lastTake.localId)return;
  try{player?.destroy?.()}catch{}
  player=null;
  const target=lastTake.videoId;
  setIssue('YouTubeプレーヤーを接続中','映像を準備しています。準備でき次第、最新のTAKEを適用します。','warning');
  playerInit=buildPlayer('output-player',target,{
    muted:true,
    onError:e=>{const msg=youtubeError(e.data);setIssue('YouTube再生エラー '+e.data,msg);send('output-error',{message:e.data+': '+msg})},
    onAutoplayBlocked:()=>{setIssue('自動再生が制限されています','プレーヤー内の再生ボタンをクリックしてください。','warning');send('output-error',{message:'自動再生がブロックされました'})}
  });
  const p=await playerInit;
  player=p;ready=true;playerInit=null;apiFailed=false;setIssue('');
  if(lastTake?.videoId&&!lastTake.localId)take(lastTake);
 }catch(err){
  apiFailed=true;ready=false;playerInit=null;
  console.error('YouTube IFrame API bootstrap',err);
  if(lastTake?.videoId&&!lastTake.localId)displayFallback(`${err.code||'YT_INIT_ERROR'}: ${err.message}`);
  else if(currentMode==='idle'&&!lastTake?.localId){
   changeDisplay('idle');$('output-idle').querySelector('p').textContent='YouTubeプレーヤーの起動に失敗しました';
   setIssue(`YouTube API読込エラー [${err.code||'YT_INIT_ERROR'}]`,err.message+'。ブラウザの拡張機能を無効にして再試行してください。');
  }
  send('output-error',{message:`[${err.code||'YT_INIT_ERROR'}] ${err.message}`});
 }finally{restarting=false}
}

function handle(d){
 if(!d||typeof d!=='object')return;
 if(d.type==='take')take(d);
 else if(d.type==='deck-state'){const side=d.deck;if(['left','right'].includes(side)){deckStates[side]=d;stageStandby(side)}}
 else if(d.type==='seek'&&d.localId&&currentMode==='local'&&d.localId===localId){const v=$('local-'+currentLocalSide);const sec=d.absolute!=null?Number(d.absolute):v.currentTime+Number(d.delta||0);if(Number.isFinite(sec))try{v.currentTime=Math.max(0,sec)}catch{}}
 else if(d.type==='seek'&&player&&ready&&!fallback&&videoId&&d.videoId===videoId){
  try{const sec=d.absolute!=null?Number(d.absolute):player.getCurrentTime()+Number(d.delta||0);if(Number.isFinite(sec))player.seekTo(Math.max(0,sec),true)}catch(e){console.warn(e)}
 }else if(d.type==='config'){showOverlay=d.overlay!==false;fadeSeconds=validateFade(d.localFade||0.75);renderOverlay()}
}
$('activate').addEventListener('click',()=>{
 if(lastTake?.localId&&localSlots[lastTake.deck]?.url){
  const retry=lastTake;
  $('local-'+retry.deck).play().then(()=>{if(lastTake===retry)take(retry)}).catch(()=>{});
  return;
 }
 try{player?.mute();player?.playVideo()}catch{}
 if(fallback)setIssue('通常埋め込み再生中','動画内の再生ボタンから操作してください。秒数の自動同期は利用できません。','warning');
});
$('retry-youtube').addEventListener('click',()=>{if(!restarting)startPlayer()});
$('go-fullscreen').addEventListener('click',()=>document.documentElement.requestFullscreen?.());
setInterval(()=>{
 if(currentMode==='local'&&currentLocalSide){const v=$('local-'+currentLocalSide);if(Number.isFinite(v.currentTime))send('telemetry',{videoId:'',localId,time:v.currentTime,state:v.paused?2:1});}
 else if(currentMode==='video'&&player&&ready&&!fallback){let time=null,state=-1;try{time=player.getCurrentTime();state=player.getPlayerState()}catch{}if(Number.isFinite(time))send('telemetry',{videoId,time,state})}
 else if(currentMode==='generative')send('telemetry',{videoId:'',time:null,state:-1})
},500);
setInterval(()=>{
 send('output-heartbeat',{videoId,localId,mode:currentMode,fallback});
 for(const side of ['left','right']){
  const d=deckStates[side];
  if(d?.playing==='playing'&&Date.now()-d.observedAt>=8000){d.playing='unknown';stageStandby(side)}
 }
},2500);
window.addEventListener('beforeunload',()=>send('output-closed'));
send('output-ready');
// YouTube is lazy-loaded on the first YouTube TAKE; local files work offline.
