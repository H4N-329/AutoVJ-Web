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
export function loadYT(){if(window.YT?.Player)return Promise.resolve(window.YT);if(window.__ytPromise)return window.__ytPromise;window.__ytPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.onerror=()=>reject(Error('YouTubeプレーヤーの読込に失敗'));window.onYouTubeIframeAPIReady=()=>resolve(window.YT);document.head.append(s)});return window.__ytPromise}
export function buildPlayer(host, videoId='', {muted=true,onReady,onStateChange}={}) {
  return loadYT().then(YT => new Promise(resolve => {
    const player = new YT.Player(host, {
      videoId: VIDEO_RE.test(videoId) ? videoId : undefined,
      width: '100%', height: '100%',
      playerVars: {playsinline:1, rel:0, controls:1, origin:location.origin},
      events: {
        onReady: event => {
          if (muted) event.target.mute();
          onReady?.(event.target);
          resolve(event.target);
        },
        onStateChange: event => onStateChange?.(event)
      }
    });
    void player;
  }));
}
export function openChannel(onMessage){const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(CHANNEL):null;if(channel)channel.onmessage=e=>onMessage(e.data);else window.addEventListener('storage',e=>{if(e.key===CHANNEL&&e.newValue){try{onMessage(JSON.parse(e.newValue))}catch{}}});return{send(data){const payload={...data,ts:Date.now()};if(channel)channel.postMessage(payload);else localStorage.setItem(CHANNEL,JSON.stringify(payload))},close(){channel?.close()}}}
export function renderGenerative(canvas){const ctx=canvas.getContext('2d');let running=true;let time=0;function draw(){if(!running)return;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=w*dpr;canvas.height=h*dpr}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#050a13';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);const sz=Math.min(w,h);for(let n=18;n>=1;n--){const r=sz*(.035+n/38)+Math.sin(time*.003+n)*6;ctx.strokeStyle=`hsla(${202+n*9+time*.018},90%,${25+n}%,.65)`;ctx.lineWidth=2;ctx.beginPath();for(let k=0;k<=6;k++){const a=k*Math.PI/3+time*.00016*(n%2?1:-1);const x=Math.cos(a)*r,y=Math.sin(a)*r;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}ctx.restore();time+=16;requestAnimationFrame(draw)}requestAnimationFrame(draw);return()=>{running=false}}
