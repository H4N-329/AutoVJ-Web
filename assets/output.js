import {openChannel,buildPlayer,VIDEO_RE,renderGenerative} from './shared.js';
const $=id=>document.getElementById(id);
let player=null,ready=false,videoId='',title='',artist='',showOverlay=true,currentMode='idle',stoppedEffect=null,lastTake=null;
const channel=openChannel(handle);
function send(type,data={}){channel.send({type,...data})}
const ytPromise=buildPlayer('output-player','',{muted:true,onReady:p=>{player=p;ready=true;if(lastTake)take(lastTake)}}).catch(err=>{console.error(err);$('output-idle').querySelector('p').textContent='YouTubeの読込に失敗しました。通信とブロッカーを確認してください'});
function changeDisplay(mode){currentMode=mode;$('output-player').classList.toggle('visible',mode==='video');$('output-generative').classList.toggle('visible',mode==='generative');$('output-idle').style.display=mode==='idle'?'flex':'none';if(mode==='generative'&&!stoppedEffect)stoppedEffect=renderGenerative($('output-generative'));if(mode!=='generative'&&stoppedEffect){stoppedEffect();stoppedEffect=null}}
function take(d){lastTake=d;title=d.title||'';artist=d.artist||'';videoId=VIDEO_RE.test(d.videoId||'')?d.videoId:'';renderOverlay();if(!videoId){changeDisplay('generative');player?.pauseVideo?.();send('output-state',{videoId:'',status:'generative'});return}if(!ready)return;changeDisplay('video');try{player.loadVideoById({videoId,startSeconds:Math.max(0,Number(d.startSeconds)||0)});player.mute();send('output-state',{videoId,status:'loading'});}catch(e){send('output-error',{message:String(e)})}}
function renderOverlay(){$('output-title').textContent=title||'AutoVJ Web';$('output-artist').textContent=artist||'DJ LIVE';$('output-overlay').classList.toggle('hidden',!showOverlay)}
function handle(d){if(!d||typeof d!=='object')return;if(d.type==='take')take(d);else if(d.type==='seek'&&player&&videoId&&d.videoId===videoId){try{const sec=d.absolute!=null?Number(d.absolute):player.getCurrentTime()+Number(d.delta||0);if(Number.isFinite(sec))player.seekTo(Math.max(0,sec),true)}catch(e){console.warn(e)}}else if(d.type==='config'){showOverlay=d.overlay!==false;renderOverlay()}}
$('activate').addEventListener('click',()=>{try{player?.mute();player?.playVideo()}catch{}});
$('go-fullscreen').addEventListener('click',()=>document.documentElement.requestFullscreen?.());
setInterval(()=>{if(currentMode==='video'&&player&&ready){let time=null,state=-1;try{time=player.getCurrentTime();state=player.getPlayerState()}catch{}if(Number.isFinite(time))send('telemetry',{videoId,time,state})}else if(currentMode==='generative')send('telemetry',{videoId:'',time:null,state:-1})},500);
setInterval(()=>send('output-heartbeat',{videoId,mode:currentMode}),2500);
window.addEventListener('beforeunload',()=>send('output-closed'));
send('output-ready');
