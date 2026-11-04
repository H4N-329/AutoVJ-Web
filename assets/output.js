import {openChannel,buildPlayer,VIDEO_RE,renderGenerative,plainYoutubeEmbed,youtubeError} from './shared.js';
const $=id=>document.getElementById(id);
let player=null,ready=false,videoId='',title='',artist='',showOverlay=true,currentMode='idle',stoppedEffect=null,lastTake=null,apiFailed=false,fallback=false,restarting=false;
const channel=openChannel(handle);
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
 plainYoutubeEmbed('output-player',videoId,{startSeconds:Number(lastTake?.startSeconds)||0,autoplay:false,muted:true});
 changeDisplay('video');
 setIssue('公式の通常埋め込みで再生を試行中',`${reason}。動画中央の再生ボタンを押してください。代替表示では自動同期・シークは使えません。`,'warning');
 send('output-state',{videoId,status:'fallback-no-sync'});
 send('output-error',{message:'API接続不可：通常埋め込みへ切替（同期不可）'});
}
function take(d){
 lastTake=d;title=d.title||'';artist=d.artist||'';videoId=VIDEO_RE.test(d.videoId||'')?d.videoId:'';renderOverlay();
 if(!videoId){
  changeDisplay('generative');try{player?.pauseVideo?.()}catch{}
  setIssue('');send('output-state',{videoId:'',status:'generative'});return;
 }
 if(apiFailed){displayFallback('YouTube IFrame APIが使えません');return}
 if(!ready){
  // Keep this TAKE until onReady fires. Avoid displaying a misleading success state.
  $('output-idle').querySelector('p').textContent='YouTubeプレーヤーの起動待ちです…';
  changeDisplay('idle');setIssue('プレーヤーを準備中','しばらくしても表示されない場合は通信・拡張機能を確認してください','warning');return;
 }
 fallback=false;changeDisplay('video');setIssue('');
 try{player.loadVideoById({videoId,startSeconds:Math.max(0,Number(d.startSeconds)||0)});player.mute();send('output-state',{videoId,status:'loading'})}
 catch(e){setIssue('動画の再生開始に失敗',String(e));send('output-error',{message:String(e)})}
}
async function startPlayer(){
 if(restarting)return;
 restarting=true;apiFailed=false;ready=false;fallback=false;player=null;
 if(lastTake?.videoId){setIssue('YouTubeプレーヤーを接続中','読み込み失敗時は通常の公式埋め込みへ切り替えます','warning')}
 try{
  await buildPlayer('output-player','',{
   muted:true,
   onReady:p=>{player=p;ready=true;apiFailed=false;setIssue('');if(lastTake)take(lastTake)},
   onError:e=>{
    const msg=youtubeError(e.data);setIssue(`YouTube再生エラー ${e.data}`,msg+'。動画が埋め込み可能か確認してください。');send('output-error',{message:`${e.data}: ${msg}`});
   },
   onAutoplayBlocked:()=>{setIssue('自動再生が制限されています','「再生を許可」をクリックするかYouTubeプレーヤー内の再生ボタンを押してください','warning');send('output-error',{message:'自動再生がブロックされました'})}
  });
 }catch(err){
  apiFailed=true;ready=false;
  console.error('YouTube IFrame API bootstrap',err);
  if(lastTake?.videoId)displayFallback(`${err.code||'YT_INIT_ERROR'}: ${err.message}`);
  else {
   changeDisplay('idle');$('output-idle').querySelector('p').textContent='YouTubeプレーヤーの起動に失敗しました';
   setIssue(`YouTube API読込エラー [${err.code||'YT_INIT_ERROR'}]`,err.message+'。ブラウザの拡張機能を無効にして再試行してください。');
  }
  send('output-error',{message:`[${err.code||'YT_INIT_ERROR'}] ${err.message}`});
 }finally{restarting=false}
}
function handle(d){
 if(!d||typeof d!=='object')return;
 if(d.type==='take')take(d);
 else if(d.type==='seek'&&player&&ready&&!fallback&&videoId&&d.videoId===videoId){
  try{const sec=d.absolute!=null?Number(d.absolute):player.getCurrentTime()+Number(d.delta||0);if(Number.isFinite(sec))player.seekTo(Math.max(0,sec),true)}catch(e){console.warn(e)}
 }else if(d.type==='config'){showOverlay=d.overlay!==false;renderOverlay()}
}
$('activate').addEventListener('click',()=>{try{player?.mute();player?.playVideo()}catch{};if(fallback)setIssue('通常埋め込み再生中','動画内の再生ボタンから操作してください。秒数の自動同期は利用できません。','warning')});
$('retry-youtube').addEventListener('click',()=>{if(!restarting)startPlayer()});
$('go-fullscreen').addEventListener('click',()=>document.documentElement.requestFullscreen?.());
setInterval(()=>{
 if(currentMode==='video'&&player&&ready&&!fallback){let time=null,state=-1;try{time=player.getCurrentTime();state=player.getPlayerState()}catch{}if(Number.isFinite(time))send('telemetry',{videoId,time,state})}
 else if(currentMode==='generative')send('telemetry',{videoId:'',time:null,state:-1})
},500);
setInterval(()=>send('output-heartbeat',{videoId,mode:currentMode,fallback}),2500);
window.addEventListener('beforeunload',()=>send('output-closed'));
send('output-ready');
startPlayer();
