// Mac DJ LIVE cloud relay. The Mac browser remains the single playback authority.
const PREF='autovj-remote-v61';
const $=id=>document.getElementById(id);
function makeCode(){const a=new Uint32Array(2);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(36).toUpperCase()).join('').slice(0,8).padEnd(8,'7')}
export function createRemoteHost({getToken,getState,execute}){
 let prefs={};try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}')}catch{}
 let code=/^[A-Z0-9]{6,12}$/.test(prefs.code||'')?prefs.code:makeCode();let enabled=!!prefs.enabled;
 let lastSeq=null,pollBusy=false,pushBusy=false,connected=false,lastError='',lastCommandAt=0;
 const ui=()=>{const url=new URL('/controller.html',location.origin);url.searchParams.set('session',code);$('remote-session').textContent=code;$('remote-link').value=url.href;$('remote-enable').checked=enabled;$('remote-status').textContent=!enabled?'停止中':connected?'iPad操作待機中'+(lastCommandAt?' / 最終操作 '+new Date(lastCommandAt).toLocaleTimeString():''):'接続待機 '+(lastError||'');$('remote-status').classList.toggle('ready',connected);};
 const save=()=>localStorage.setItem(PREF,JSON.stringify({code,enabled}));
 async function call(mode,method='GET',payload=null){const token=getToken();if(!token)throw Error('設定タブでアクセストークンを保存してください');const url='/api/remote?session='+encodeURIComponent(code)+'&mode='+mode+(mode==='commands'?'&after='+lastSeq:'');const r=await fetch(url,{method,headers:{'X-AutoVJ-Token':token,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'通信失敗');return j}
 async function tickPoll(){if(!enabled||pollBusy)return;pollBusy=true;try{if(lastSeq===null){lastSeq=(await call('hello')).seq;connected=true;lastError='';return}
 const j=await call('commands');for(const item of j.commands||[]){if(item.seq<=lastSeq)continue;try{await execute(item.command);lastCommandAt=Date.now()}catch(e){lastError='操作処理: '+e.message}};lastSeq=j.seq;connected=true;lastError='';
 }catch(e){connected=false;lastError=e.message}finally{pollBusy=false;ui()}}
 async function tickState(){if(!enabled||pushBusy||!connected)return;pushBusy=true;try{await call('state','POST',getState())}catch(e){connected=false;lastError=e.message}finally{pushBusy=false;ui()}}
 $('remote-enable').addEventListener('change',e=>{enabled=e.target.checked;lastSeq=null;connected=false;lastError='';save();ui();if(enabled)tickPoll()});
 $('remote-regenerate').addEventListener('click',()=>{if(!confirm('接続コードを変更しますか？ 既存のiPad接続は切れます。'))return;code=makeCode();enabled=false;lastSeq=null;connected=false;save();ui()});
 $('remote-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('remote-link').value);$('remote-status').textContent='iPad用URLをコピーしました'}catch{$('remote-link').focus();$('remote-link').select()}});
 $('remote-open').addEventListener('click',()=>window.open($('remote-link').value,'_blank','noopener'));
 ui();setInterval(tickPoll,1200);setInterval(tickState,1600);if(enabled)tickPoll();return{status:()=>({enabled,connected,code}),refresh:()=>{ui();tickState()}};
}
