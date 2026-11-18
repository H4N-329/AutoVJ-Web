// Lightweight touch controller for iPad 6th gen. Never downloads or transfers video bytes.
import {fetchAutoVJ,loadJSON} from './shared.js';

const $=id=>document.getElementById(id);
const SIDES=['left','right'];
const SESSION_KEY='autovj-ipad-v61';
const TOKEN_KEY='autovj-ipad-v61-token';
const VIDEO=/^[\w-]{11}$/;
let connected=false,code='',token='',state=null,pollBusy=false,commandBusy=false,revision=0;
const saved=loadJSON(SESSION_KEY,{});
function storedToken(storage){try{return window[storage].getItem(TOKEN_KEY)||''}catch{return ''}}
const remembered=storedToken('localStorage');
const fromQuery=new URLSearchParams(location.search).get('session');
$('session').value=String(fromQuery||saved.code||'').toUpperCase();
$('token').value=storedToken('sessionStorage')||remembered;
$('remember').checked=Boolean(remembered);
function show(msg){$('result').textContent=msg;$('pair-status').textContent=msg}
function connStatus(healthy=false){
 const indicator=$('connection');
 indicator.textContent=!connected?'未接続':healthy?'Mac ONLINE':'Mac 待機中';
 indicator.className='status '+(connected&&healthy?'connected':'disconnected');
 $('live').classList.toggle('hidden',!connected);$('pair-panel').classList.toggle('hidden',connected);
 for(const button of document.querySelectorAll('[data-take], [data-arm], [data-seek], [data-offset], #sync-now, #auto-sync, #mode, #lead, #clear-arm, #search'))button.disabled=!healthy;
}
function unavailable(message){state=null;connStatus();$('last-seen').textContent=message}
function fmt(n){const t=Number(n);if(!Number.isFinite(t))return'--:--';return `${String(Math.floor(Math.max(0,t)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`}
function api(mode,method='GET',data){
 return fetchAutoVJ(`/api/remote?mode=${mode}&session=${encodeURIComponent(code)}`,{method,
  headers:{'X-AutoVJ-Token':token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
}
async function connect(){
 const c=$('session').value.trim().toUpperCase();
 if(!/^[A-Z0-9]{6,12}$/.test(c))return show('接続コードは英数字6〜12文字です');
 const t=$('token').value.trim();
 if(!t)return show('アクセストークンが必要です');
 code=c;token=t;revision++;
 show('接続確認中…');$('connect').disabled=true;
 try{
  await api('hello');connected=true;connStatus();
  try{
   sessionStorage.setItem(TOKEN_KEY,token);
   localStorage.setItem(SESSION_KEY,JSON.stringify({code}));
   if($('remember').checked)localStorage.setItem(TOKEN_KEY,token);
   else localStorage.removeItem(TOKEN_KEY);
  }catch{}
  show('ペアリング成功。MacのDJ LIVEを開いたままにしてください。');await poll();
 }catch(e){connected=false;connStatus();show(e.message)}
 finally{$('connect').disabled=false}
}
function isOnline(s){const age=Date.now()-Number(s?.updatedAt);return age>=-2000&&age<12000}
async function command(cmd){
 if(!connected)return show('Macに接続してください');
 if(!isOnline(state))return show('Macがオフラインです。DJ LIVEの接続状態を確認してください。');
 if(commandBusy)return;
 commandBusy=true;
 const current=revision;
 show('操作を送信中…');
 try{const r=await api('command','POST',cmd);if(current===revision)show(`送信完了 #${r.seq} / Macへの反映を確認してください。`)}
 catch(e){if(current===revision)show('送信結果を確認できません。Macの画面を確認してください。 '+e.message)}
 finally{commandBusy=false}
}
function setPicture(img,placeholder,videoId){const id=videoId||'';if(img.dataset.videoId===id)return;img.dataset.videoId=id;if(VIDEO.test(id)){img.src=`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;img.style.display='block';placeholder.style.display='none'}else{img.removeAttribute('src');img.style.display='none';placeholder.style.display='flex'}}
function render(s){
 state=s;connStatus(true);
 $('last-seen').textContent='Mac更新 '+new Date(s.updatedAt).toLocaleTimeString();
 for(const side of SIDES){
  const d=s.decks?.[side]||{};
  $(side+'-title').textContent=d.title||'曲名未設定';
  $(side+'-artist').textContent=d.artist||'—';
  $(side+'-clock').textContent=d.elapsed==null?'--:--':fmt(d.elapsed);
  $(side+'-playing').textContent={playing:'再生中',paused:'停止中',unknown:'状態不明'}[d.playing]||'状態不明';
  $(side+'-mv').textContent=d.localId?'ローカル映像あり':d.videoId?'MVあり':d.videoStatus||'MV未設定';
  setPicture($(side+'-thumb'),$(side+'-placeholder'),d.videoId);
  $(side+'-card').classList.toggle('onair',s.active===side);
  $(side+'-card').classList.toggle('armed',s.armed===side);
 }
 const on=s.decks?.[s.active]||{},videoId=on.videoId||'';
 $('live-name').textContent=s.active?'LIVE '+(s.active==='left'?'DECK 1':'DECK 2'):'出力待機中';
 $('output-state').textContent=s.outputConnected?'Macの上映画面に接続中':'Mac出力ウィンドウ未接続';
 $('onair-title').textContent=on.title||'未出力';
 $('onair-artist').textContent=on.artist||'—';
 $('dj-clock').textContent='DJ '+(s.active&&on.elapsed!=null?fmt(on.elapsed):'--:--');
 $('mv-clock').textContent='MV '+(s.outputTime==null?'--:--':fmt(s.outputTime));
 const cover=$('onair-cover'),source=on.localId||videoId;
 if(cover.dataset.id!==source){
  cover.dataset.id=source;cover.replaceChildren();
  if(VIDEO.test(videoId)){
   const img=new Image();img.src=`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
   img.alt='現在のMVサムネイル';cover.append(img);
  }else cover.textContent=on.localId?'LOCAL VIDEO':'NO VIDEO';
 }
 $('mode').value=s.mode||'off';$('lead').value=String(s.lead??.5);
 $('auto-sync').textContent=s.autoSync?'ON':'OFF';
 $('auto-sync').setAttribute('aria-pressed',String(!!s.autoSync));
}
async function poll(){
 if(!connected||pollBusy)return;
 pollBusy=true;
 const current=revision;
 try{
  const {state:latest}=await api('status');
  if(current!==revision)return;
  if(isOnline(latest)){
   render(latest);
   if(document.querySelector('.media-search[open]'))renderCandidates();
  }else unavailable('Macからの更新待ち。DJ LIVEでiPad操作を有効にしてください。');
 }catch(e){if(current===revision)unavailable('接続エラー: '+e.message)}
 finally{pollBusy=false;if(connected&&current!==revision)poll()}
}
function openPreview(side){const d=state?.decks?.[side];if(d?.localId)return show('ローカル映像はMacの出力画面で再生します。動画はiPadへ転送されません。');if(!d?.videoId)return show('このデッキのMVはまだ準備できていません');$('preview-title').textContent=(side==='left'?'DECK 1':'DECK 2')+' / '+d.title;const frame=$('preview-frame');frame.replaceChildren();const iframe=document.createElement('iframe');iframe.title='公式YouTube MVプレビュー';iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.src=`https://www.youtube-nocookie.com/embed/${d.videoId}?playsinline=1&mute=1&autoplay=0`;frame.append(iframe);$('preview-dialog').showModal()}
function searchCurrent(){const side=$('search-side').value;const d=state?.decks?.[side]||{};$('search-title').value=d.title||'';$('search-artist').value=d.artist||'';renderCandidates()}
function renderCandidates(){const side=$('search-side').value;const items=state?.decks?.[side]?.candidates||[];const box=$('candidates');const signature=side+'::'+items.map(x=>x.id).join(',');if(box.dataset.signature===signature)return;box.dataset.signature=signature;box.replaceChildren();if(!items.length){const p=document.createElement('p');p.className='hint';p.textContent='候補はまだありません。検索後、Mac側で結果が更新されます。';box.append(p);return}for(const c of items){if(!VIDEO.test(c.id))continue;const row=document.createElement('div');row.className='candidate';const img=new Image();img.src=`https://i.ytimg.com/vi/${c.id}/mqdefault.jpg`;img.alt='MV候補サムネイル';const meta=document.createElement('div');const title=document.createElement('b');title.textContent=c.title;const channel=document.createElement('small');channel.textContent=c.channel;meta.append(title,channel);const btn=document.createElement('button');btn.className='btn primary';btn.textContent='採用';btn.addEventListener('click',()=>command({type:'choose',side,videoId:c.id}));row.append(img,meta,btn);box.append(row)}}
$('connect').addEventListener('click',connect);
$('disconnect').addEventListener('click',()=>{connected=false;revision++;unavailable('');show('接続を解除しました')});
document.querySelectorAll('[data-take]').forEach(b=>b.addEventListener('click',()=>command({type:'take',side:b.dataset.take})));
document.querySelectorAll('[data-arm]').forEach(b=>b.addEventListener('click',()=>command({type:'arm',side:b.dataset.arm})));
document.querySelectorAll('[data-seek]').forEach(b=>b.addEventListener('click',()=>command({type:'seek',delta:Number(b.dataset.seek)})));
document.querySelectorAll('[data-offset]').forEach(b=>b.addEventListener('click',()=>command({type:'offset',delta:Number(b.dataset.offset)})));
document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>openPreview(b.dataset.preview)));
$('sync-now').addEventListener('click',()=>command({type:'sync'}));$('clear-arm').addEventListener('click',()=>command({type:'clearArm'}));
$('auto-sync').addEventListener('click',()=>command({type:'autoSync',enabled:!state?.autoSync}));
$('mode').addEventListener('change',()=>command({type:'mode',mode:$('mode').value}));$('lead').addEventListener('change',()=>command({type:'lead',value:Number($('lead').value)}));
$('search-side').addEventListener('change',searchCurrent);$('search').addEventListener('click',()=>command({type:'search',side:$('search-side').value,title:$('search-title').value,artist:$('search-artist').value}));
$('preview-close').addEventListener('click',()=>{$('preview-dialog').close();$('preview-frame').replaceChildren()});$('preview-dialog').addEventListener('close',()=>$('preview-frame').replaceChildren());
window.addEventListener('online',poll);
window.addEventListener('offline',()=>{if(connected){revision++;unavailable('ネットワークの復帰を待っています')}});
window.addEventListener('pageshow',poll);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
setInterval(poll,1600);
connStatus();
