export const CHANNEL='autovj-web-v6';
export const STORE='autovj-web-v6-state';
export const PREFS='autovj-web-v6-settings';
export const SIDES=['left','right'];
export const VIDEO_RE=/^[\w-]{11}$/;
export const emptyDeck=()=>({title:'',artist:'',elapsed:0,playing:'unknown',videoId:'',videoTitle:'',videoStatus:'未設定',observedAt:0});
export const loadJSON=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
export const saveJSON=(key,val)=>{try{localStorage.setItem(key,JSON.stringify(val))}catch(e){console.warn('保存できません',e)}};
export function videoIdOf(input){try{const s=String(input||'').trim();if(VIDEO_RE.test(s))return s;const url=new URL(s);const domain=url.hostname.toLowerCase().replace(/^www\./,'');let id='';if(domain==='youtu.be')id=url.pathname.split('/')[1];else if(domain==='youtube.com'||domain==='m.youtube.com'||domain==='youtube-nocookie.com'){id=url.searchParams.get('v')||'';if(!id)id=url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1]||'';}return VIDEO_RE.test(id)?id:''}catch{return ''}}
export const fmt=(n)=>Number.isFinite(n)&&n>=0?`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`:'--:--';
export const keyOf=(t)=>[t?.artist,t?.title].map(v=>String(v||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'')).join('::');
export const profileId=(deck)=>`${keyOf(deck)}|${deck.videoId}`;
export const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||0));
// IFrame API bootstrap with explicit failures, retry and a second readiness signal.
// Some browser extensions block iframe_api; no YouTube API key is involved here.
export function youtubeError(code){
 const n=Number(code);
 return ({2:'動画IDが無効です',5:'HTML5プレーヤーで再生できません',100:'動画が削除・非公開の可能性があります',101:'投稿者が埋め込み再生を許可していません',150:'投稿者が埋め込み再生を許可していません',153:'YouTubeが埋め込み元を確認できません（Referer/ブラウザの制限）'})[n]||('YouTubeエラー '+code);
}
export function loadYT(){
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(window.__ytPromise)return window.__ytPromise;
 let created=null;
 const promise=new Promise((resolve,reject)=>{
  let finished=false;
  const done=(ok,detail)=>{
   if(finished)return;
   finished=true;
   clearInterval(poll);clearTimeout(timer);
   if(ok)resolve(detail);else reject(detail);
  };
  const check=()=>{if(window.YT?.Player)done(true,window.YT)};
  const poll=setInterval(check,200);
  const timer=setTimeout(()=>done(false,Object.assign(Error('YouTube IFrame APIの応答が12秒以内にありません（通信・拡張機能・ネットワーク制限を確認）'),{code:'YT_API_TIMEOUT'})),12000);
  // If another script already initialized the API, the poll above will detect it.
  const previous=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{
   try{if(typeof previous==='function')previous()}catch(err){console.warn('other YouTube callback',err)}
   check();
  };
  created=document.createElement('script');created.src='https://www.youtube.com/iframe_api';created.async=true;
  created.onerror=()=>done(false,Object.assign(Error('YouTube IFrame APIのスクリプトがネットワークまたは拡張機能によりブロックされました'),{code:'YT_SCRIPT_ERROR'}));
  document.head.append(created);
  check();
 });
 window.__ytPromise=promise.catch(err=>{
  // Do not permanently cache rejection: a retry may work after browser settings change.
  window.__ytPromise=null;
  created?.remove();
  throw err;
 });
 return window.__ytPromise;
}
// Official YouTube iframe is a *fallback only*. It has no reliable seek/clock telemetry.
// Do not claim sync or pre-buffer completion while it is active.
export function plainYoutubeEmbed(host,videoId,{startSeconds=0,autoplay=false,muted=true}={}){
 const root=document.getElementById(host);
 if(!root||!VIDEO_RE.test(String(videoId||'')))return null;
 const f=document.createElement('iframe');
 const p=new URLSearchParams({playsinline:'1',controls:'1',rel:'0',origin:location.origin,autoplay:autoplay?'1':'0',mute:muted?'1':'0'});
 const start=Math.max(0,Math.floor(Number(startSeconds)||0));if(start)p.set('start',String(start));
 f.src=`https://www.youtube.com/embed/${videoId}?${p.toString()}`;
 f.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
 f.setAttribute('allowfullscreen','');
 f.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 f.title='YouTube公式埋め込み（API未接続・同期不可）';
 f.style.width='100%';f.style.height='100%';f.style.border='0';
 root.replaceChildren(f);
 return f;
}
// Keep the visible layout host in the DOM. The YouTube API REPLACES its target
// with an iframe; passing the layout host directly destroys its CSS classes.
export function buildPlayer(host, videoId='', {muted=true,onReady,onStateChange,onError,onAutoplayBlocked}={}) {
  const root=document.getElementById(host);
  if(!root)return Promise.reject(Error('プレーヤー領域が見つかりません: '+host));
  const target=document.createElement('div');
  target.id=host+'-yt-target';
  target.style.width='100%';
  target.style.height='100%';
  root.replaceChildren(target);
  return loadYT().then(YT=>new Promise((resolve,reject)=>{
    let instance=null,settled=false;
    const timer=setTimeout(()=>{
      if(settled)return;
      settled=true;
      try{instance?.destroy?.()}catch{}
      reject(Object.assign(Error('YouTubeのiframeが準備完了を通知しません（ブラウザのコンテンツ制限・ネットワークを確認）'),{code:'YT_PLAYER_READY_TIMEOUT'}));
    },12000);
    try {
      instance=new YT.Player(target,{
        videoId:VIDEO_RE.test(videoId)?videoId:undefined,
        width:'100%',height:'100%',
        playerVars:{playsinline:1,rel:0,controls:1,origin:location.origin},
        events:{
          onReady:event=>{
            if(settled)return;
            settled=true;clearTimeout(timer);
            try {if(muted)event.target.mute();onReady?.(event.target)} catch(err){console.warn(err)}
            resolve(event.target);
          },
          onStateChange:event=>onStateChange?.(event),
          onError:event=>onError?.(event),
          onAutoplayBlocked:event=>onAutoplayBlocked?.(event)
        }
      });
    }catch(err){clearTimeout(timer);settled=true;reject(err)}
  }));
}
export function openChannel(onMessage){const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(CHANNEL):null;if(channel)channel.onmessage=e=>onMessage(e.data);else window.addEventListener('storage',e=>{if(e.key===CHANNEL&&e.newValue){try{onMessage(JSON.parse(e.newValue))}catch{}}});return{send(data){const payload={...data,ts:Date.now()};if(channel)channel.postMessage(payload);else localStorage.setItem(CHANNEL,JSON.stringify(payload))},close(){channel?.close()}}}
export function renderGenerative(canvas){const ctx=canvas.getContext('2d');let running=true;let time=0;function draw(){if(!running)return;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=w*dpr;canvas.height=h*dpr}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#050a13';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);const sz=Math.min(w,h);for(let n=18;n>=1;n--){const r=sz*(.035+n/38)+Math.sin(time*.003+n)*6;ctx.strokeStyle=`hsla(${202+n*9+time*.018},90%,${25+n}%,.65)`;ctx.lineWidth=2;ctx.beginPath();for(let k=0;k<=6;k++){const a=k*Math.PI/3+time*.00016*(n%2?1:-1);const x=Math.cos(a)*r,y=Math.sin(a)*r;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}ctx.restore();time+=16;requestAnimationFrame(draw)}requestAnimationFrame(draw);return()=>{running=false}}
