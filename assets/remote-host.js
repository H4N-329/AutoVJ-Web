// Mac DJ LIVE cloud relay. The Mac browser remains the single playback authority.
import {fetchAutoVJ,loadJSON} from './shared.js';

const PREF='autovj-remote-v61';
const $=id=>document.getElementById(id);
function makeCode(){const a=new Uint32Array(2);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(36).toUpperCase()).join('').slice(0,8).padEnd(8,'7')}
export function createRemoteHost({getToken,getState,execute}){
 const prefs=loadJSON(PREF,{})||{};
 let code=/^[A-Z0-9]{6,12}$/.test(prefs.code||'')?prefs.code:makeCode();let enabled=!!prefs.enabled;
 let lastSeq=null,pollBusy=false,pushBusy=false,connected=false,lastError='',lastCommandAt=0,revision=0;
 const ui=()=>{const url=new URL('/controller.html',location.origin);url.searchParams.set('session',code);$('remote-session').textContent=code;$('remote-link').value=url.href;$('remote-enable').checked=enabled;$('remote-status').textContent=!enabled?'停止中':connected?'iPad操作待機中'+(lastCommandAt?' / 最終操作 '+new Date(lastCommandAt).toLocaleTimeString():''):'接続待機 '+(lastError||'');$('remote-status').classList.toggle('ready',connected);};
 const save=()=>localStorage.setItem(PREF,JSON.stringify({code,enabled}));
 async function call(mode,method='GET',payload=null){
  const token=getToken();if(!token)throw Error('設定タブでアクセストークンを保存してください');
  const url='/api/remote?session='+encodeURIComponent(code)+'&mode='+mode+(mode==='commands'?'&after='+lastSeq:'');
  return fetchAutoVJ(url,{method,headers:{'X-AutoVJ-Token':token,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined});
 }
 async function tickPoll(){
  if(!enabled||pollBusy)return;
  pollBusy=true;
  const current=revision;
  try{
   const result=await call(lastSeq===null?'hello':'commands');
   if(current!==revision)return;
   lastError='';
   if(lastSeq!==null&&result.seq<lastSeq)lastSeq=0;
   for(const item of result.commands||[]){
    if(current!==revision)return;
    if(item.seq<=lastSeq)continue;
    const age=Date.now()-Number(item.createdAt);
    if(age< -2000||age>=30000)continue;
    try{await execute(item.command);if(current===revision)lastCommandAt=Date.now()}
    catch(e){if(current===revision)lastError='操作処理: '+e.message}
   }
   if(current!==revision)return;
   lastSeq=result.seq;connected=true;
  }catch(e){if(current===revision){connected=false;lastError=e.message}}
  finally{pollBusy=false;ui()}
 }
 async function tickState(){
  if(!enabled||pushBusy||!connected)return;
  pushBusy=true;
  const current=revision;
  try{await call('state','POST',getState())}
  catch(e){if(current===revision){connected=false;lastError=e.message}}
  finally{pushBusy=false;ui()}
 }
 function reset(nextEnabled){enabled=nextEnabled;revision++;lastSeq=null;connected=false;lastError='';lastCommandAt=0;save();ui();if(enabled)tickPoll()}
 $('remote-enable').addEventListener('change',e=>reset(e.target.checked));
 $('remote-regenerate').addEventListener('click',()=>{if(!confirm('接続コードを変更しますか？ 既存のiPad接続は切れます。'))return;code=makeCode();reset(false)});
 $('remote-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('remote-link').value);$('remote-status').textContent='iPad用URLをコピーしました'}catch{$('remote-link').focus();$('remote-link').select()}});
 $('remote-open').addEventListener('click',()=>window.open($('remote-link').value,'_blank','noopener'));
 const resume=async()=>{await tickPoll();tickState()};
 window.addEventListener('online',resume);
 window.addEventListener('pageshow',resume);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume()});
 ui();setInterval(tickPoll,1200);setInterval(tickState,1600);if(enabled)resume();return{status:()=>({enabled,connected,code}),refresh:()=>{ui();tickState()}};
}
