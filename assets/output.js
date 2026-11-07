import {makeLocalURL} from './local-media.js';
import {switchEffect,validateFade} from './hybrid-transition.mjs';
import {openChannel,buildPlayer,VIDEO_RE,renderGenerative,plainYoutubeEmbed,youtubeError,loadYT} from './shared.js';
const $=id=>document.getElementById(id);
let player=null,playerInit=null,ready=false,videoId='',localId='',title='',artist='',showOverlay=true,currentMode='idle',stoppedEffect=null,lastTake=null,apiFailed=false,fallback=false,restarting=false;
let currentLocalSide=null,fadeSeconds=0.75,takeSerial=0;
const localSlots={left:{id:'',url:'',serial:0,loading:null},right:{id:'',url:'',serial:0,loading:null}};
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
async function stageLocal(d){
 const side=d.deck;if(!['left','right'].includes(side))return;
 const slot=localSlots[side],v=$('local-'+side),id=String(d.localId||'');
 if(!id){
  if(slot.url){URL.revokeObjectURL(slot.url);slot.url='';}
  slot.id='';slot.serial++;slot.loading=null;v.pause();v.removeAttribute('src');v.load();return;
 }
 if(slot.id!==id){
  const serial=++slot.serial;slot.id=id;
  if(slot.url)URL.revokeObjectURL(slot.url);
  slot.url='';v.pause();v.removeAttribute('src');v.load();
  slot.loading=makeLocalURL(id).then(url=>{
   if(serial!==slot.serial){URL.revokeObjectURL(url);return;}
   slot.url=url;v.src=url;v.load();v.muted=true;
   send('local-ready',{deck:side,localId:id,status:'loaded'});
  }).catch(e=>{if(serial===slot.serial)send('local-ready',{deck:side,localId:id,status:'error',message:e.message})});
 }
 if(slot.loading)await slot.loading;
 if(slot.id!==id||!slot.url)return;
 const desired=Number(d.startSeconds);
 if(Number.isFinite(desired)){
  if(v.readyState>=1 && Math.abs(v.currentTime-desired)>1.5){try{v.currentTime=Math.max(0,desired)}catch{}}
  else if(v.readyState<1){
   const currentSerial=slot.serial;
   v.addEventListener('loadedmetadata',()=>{
    if(slot.serial===currentSerial&&slot.id===id){try{v.currentTime=Math.max(0,desired)}catch{}}
   },{once:true});
  }
 }
 // Local files may preplay muted while another local clip or the visible YouTube
 // player remains on-air. The output is muted; rekordbox supplies the sound.
 if(d.playing==='playing' || (currentMode==='local'&&currentLocalSide===side)){
  try{await v.play();send('local-ready',{deck:side,localId:id,status:'playing'})}
  catch(e){send('local-ready',{deck:side,localId:id,status:'blocked',message:e.message})}
 }else if(currentLocalSide!==side){v.pause()}
}
async function takeLocal(d,priorMode,serial){
 const side=d.deck;if(!['left','right'].includes(side)){setIssue('ローカル動画のDECK番号が不正です','操作画面からTAKEしてください');return}
 const fromSide=currentLocalSide;
 const fromType=priorMode==='local'?'local':priorMode==='video'?'youtube':'generative';
 await stageLocal({...d,playing:'playing'});
 if(serial!==takeSerial)return;
 if(localSlots[side].id!==d.localId || !localSlots[side].url){changeDisplay(priorMode);setIssue('ローカル動画がありません','Macの同じブラウザで「MV事前設定」から動画を再登録してください');return;}
 const v=$('local-'+side),outgoing=fromSide&&fromSide!==side?$('local-'+fromSide):null;
 currentLocalSide=side;changeDisplay('local');setIssue('');
 try{player?.pauseVideo?.()}catch{}
 const effect=switchEffect(fromType,'local');
 $('output-local-stage').style.setProperty('--local-fade-duration',`${Math.round(fadeSeconds*1000)}ms`);
 if(effect!=='crossfade'||!outgoing){for(const v2 of document.querySelectorAll('.output-local-video'))v2.classList.remove('onair');
   // Force no transition after a YouTube/generative take.
   v.style.transition='none';v.classList.add('onair');void v.offsetWidth;v.style.transition='';
 }else{
   v.classList.add('onair');outgoing.classList.remove('onair');
   setTimeout(()=>{if(currentLocalSide!==fromSide)outgoing.pause()},Math.round(fadeSeconds*1000)+100);
 }
 send('output-state',{localId,videoId:'',status:'local-playing',effect,duration:effect==='crossfade'?fadeSeconds:0});
}
function take(d){
 const serial=++takeSerial;
 const priorMode=currentMode;
 lastTake=d;title=d.title||'';artist=d.artist||'';videoId=VIDEO_RE.test(d.videoId||'')?d.videoId:'';localId=d.localId||'';renderOverlay();
 if(localId){takeLocal(d,priorMode,serial).catch(err=>send('output-error',{message:'ローカル動画TAKE: '+err.message}));return}
 currentLocalSide=null;for(const side of ['left','right']){$('local-'+side).classList.remove('onair');} 
 if(!videoId){
  localId='';changeDisplay('generative');try{player?.pauseVideo?.()}catch{}
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
  if(!lastTake?.videoId){setIssue('');return}
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
  if(lastTake)take(lastTake);
 }catch(err){
  apiFailed=true;ready=false;playerInit=null;
  console.error('YouTube IFrame API bootstrap',err);
  if(lastTake?.videoId)displayFallback(`${err.code||'YT_INIT_ERROR'}: ${err.message}`);
  else{
   changeDisplay('idle');$('output-idle').querySelector('p').textContent='YouTubeプレーヤーの起動に失敗しました';
   setIssue(`YouTube API読込エラー [${err.code||'YT_INIT_ERROR'}]`,err.message+'。ブラウザの拡張機能を無効にして再試行してください。');
  }
  send('output-error',{message:`[${err.code||'YT_INIT_ERROR'}] ${err.message}`});
 }finally{restarting=false}
}

function handle(d){
 if(!d||typeof d!=='object')return;
 if(d.type==='take')take(d);
 else if(d.type==='deck-state'){const side=d.deck;if(['left','right'].includes(side)){deckStates[side]=d;stageLocal(d).catch(console.warn)}}
 else if(d.type==='seek'&&d.localId&&currentMode==='local'&&d.localId===localId){const v=$('local-'+currentLocalSide);const sec=d.absolute!=null?Number(d.absolute):v.currentTime+Number(d.delta||0);if(Number.isFinite(sec))try{v.currentTime=Math.max(0,sec)}catch{}}
 else if(d.type==='seek'&&player&&ready&&!fallback&&videoId&&d.videoId===videoId){
  try{const sec=d.absolute!=null?Number(d.absolute):player.getCurrentTime()+Number(d.delta||0);if(Number.isFinite(sec))player.seekTo(Math.max(0,sec),true)}catch(e){console.warn(e)}
 }else if(d.type==='config'){showOverlay=d.overlay!==false;fadeSeconds=validateFade(d.localFade||0.75);renderOverlay()}
}
$('activate').addEventListener('click',()=>{try{player?.mute();player?.playVideo()}catch{};if(fallback)setIssue('通常埋め込み再生中','動画内の再生ボタンから操作してください。秒数の自動同期は利用できません。','warning')});
$('retry-youtube').addEventListener('click',()=>{if(!restarting)startPlayer()});
$('go-fullscreen').addEventListener('click',()=>document.documentElement.requestFullscreen?.());
setInterval(()=>{
 if(currentMode==='local'&&currentLocalSide){const v=$('local-'+currentLocalSide);if(Number.isFinite(v.currentTime))send('telemetry',{videoId:'',localId,time:v.currentTime,state:v.paused?2:1});}
 else if(currentMode==='video'&&player&&ready&&!fallback){let time=null,state=-1;try{time=player.getCurrentTime();state=player.getPlayerState()}catch{}if(Number.isFinite(time))send('telemetry',{videoId,time,state})}
 else if(currentMode==='generative')send('telemetry',{videoId:'',time:null,state:-1})
},500);
setInterval(()=>send('output-heartbeat',{videoId,localId,mode:currentMode,fallback}),2500);
window.addEventListener('beforeunload',()=>send('output-closed'));
send('output-ready');
// YouTube is lazy-loaded on the first YouTube TAKE; local files work offline.
