import {trackKey,videoIdOf,parsePlaylist,mergeRows,exportPlaylistCsv} from './playlist.mjs';
const $=id=>document.getElementById(id),LIST_KEY='autovj-web-v6-playlist',SIZE=75;
const load=()=>{try{const v=JSON.parse(localStorage.getItem(LIST_KEY));return Array.isArray(v)?mergeRows([],v):[]}catch{return []}};
const store=rows=>{try{localStorage.setItem(LIST_KEY,JSON.stringify(rows))}catch{throw Error('保存できません。ブラウザの空き容量を確認してください')}};
const thumb=id=>`https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const download=(content,name,type)=>{const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)};
function message(s){$('prep-message').textContent=s}
async function decodeFile(file){
 if(file.size>2*1024*1024)throw Error('2MB以下のCSV/JSONを選んでください');
 const bytes=await file.arrayBuffer();
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch{return new TextDecoder('shift_jis',{fatal:true}).decode(bytes)}
}
export function initPlaylistUI({getMapping,getOffset,assign,unassign,saveOffset,getToken,toast}){
 let rows=load(),chosen=null,offsetPage=0,results=[],busy=false;
 const lookup=()=>rows.find(t=>trackKey(t)===chosen)||null;
 function filtered(){const text=$('prep-filter').value.normalize('NFKC').toLowerCase().trim(),state=$('prep-state').value;return rows.filter(t=>{
  const has=!!videoIdOf(getMapping(t)?.video_id);
  return (!text||(t.title+' '+t.artist).normalize('NFKC').toLowerCase().includes(text))&&(state==='all'||(state==='set'&&has)||(state==='unset'&&!has));
 })}
 function renderList(){
  const f=filtered();const lastPage=Math.max(0,Math.ceil(f.length/SIZE)-1);offsetPage=Math.min(lastPage,offsetPage);
  $('prep-total').textContent=rows.length;$('prep-ready').textContent=rows.filter(t=>videoIdOf(getMapping(t)?.video_id)).length;$('prep-empty').textContent=rows.length-Number($('prep-ready').textContent);
  $('prep-count').textContent=f.length+'曲';$('prep-page').textContent=f.length?`${offsetPage*SIZE+1}–${Math.min((offsetPage+1)*SIZE,f.length)} / ${f.length}`:'0件';$('prep-prev').disabled=offsetPage===0;$('prep-next').disabled=offsetPage>=lastPage;
  const host=$('prep-list');host.replaceChildren();if(!f.length){const p=document.createElement('p');p.className='muted';p.style.padding='14px';p.textContent=rows.length?'該当する楽曲がありません。':'CSVを読み込むか「＋ 曲を追加」から登録してください。';host.append(p);return}
  for(const [i,t] of f.slice(offsetPage*SIZE,(offsetPage+1)*SIZE).entries()){
   const selected=trackKey(t)===chosen;const id=videoIdOf(getMapping(t)?.video_id);
   const b=document.createElement('button');b.type='button';b.className='prep-item'+(selected?' selected':'');b.setAttribute('role','option');b.setAttribute('aria-selected',String(selected));
   const number=document.createElement('span');number.className='prep-number';number.textContent=String(offsetPage*SIZE+i+1).padStart(2,'0');
   const text=document.createElement('div');text.style.minWidth='0';const song=document.createElement('div');song.className='prep-name';song.textContent=t.title;const artist=document.createElement('div');artist.className='prep-artist';artist.textContent=t.artist;text.append(song,artist);
   const status=document.createElement('span');status.className='prep-mark'+(id?' ready':'');status.textContent=id?'✓ MV設定済':'未設定';b.append(number,text,status);
   b.addEventListener('click',()=>{chosen=trackKey(t);results=[];render()});host.append(b);
  }
 }
 function renderDetail(){
  const track=lookup();$('prep-empty-detail').hidden=!!track;$('prep-editor').hidden=!track;
  if(!track)return;
  $('prep-selected-title').textContent=track.title;$('prep-selected-artist').textContent=track.artist;
  const old=getMapping(track)||{},id=videoIdOf(old.video_id);
  const host=$('prep-current-mv');host.replaceChildren();
  if(id){const img=new Image();img.src=thumb(id);img.alt='選択したMVのサムネイル';const body=document.createElement('div');const title=document.createElement('strong');title.textContent=old.title||'保存済みMV';const link=document.createElement('a');link.href=`https://www.youtube.com/watch?v=${id}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent='YouTubeで内容を確認';body.append(title,document.createElement('br'),link);host.append(img,body)}
  else host.textContent='MV未設定です。候補検索またはURL指定で登録できます。';
  $('prep-offset').value=id?String(getOffset(track,id)||0):'0';$('prep-save-offset').disabled=!id;
  renderResults();
 }
 function renderResults(){const host=$('prep-results');host.replaceChildren();if(busy){const p=document.createElement('p');p.className='muted';p.textContent='YouTubeで候補を検索中…';host.append(p);return}if(!results.length){const p=document.createElement('p');p.className='muted small';p.textContent='候補を探す場合は「YouTubeでMV候補を検索」を押してください。';host.append(p);return}
  for(const item of results){const id=videoIdOf(item.id);if(!id)continue;
   const row=document.createElement('div');row.className='prep-candidate';const img=new Image();img.src=thumb(id);img.alt='動画サムネイル';img.loading='lazy';const desc=document.createElement('div');const title=document.createElement('strong');title.textContent=item.title||'動画';const channel=document.createElement('small');channel.textContent=(item.channel||'チャンネル不明')+' / 関連度 '+(item.score??'—');const actions=document.createElement('div');actions.className='row-gap';const select=document.createElement('button');select.className='btn blue';select.textContent='このMVに決定';select.addEventListener('click',()=>saveVideo(id,item));const link=document.createElement('a');link.href='https://www.youtube.com/watch?v='+id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='YouTubeで確認';actions.append(select,link);desc.append(title,channel,actions);row.append(img,desc);host.append(row)}
 }
 function render(){renderList();renderDetail()}
 function saveVideo(id,metadata={}){const t=lookup();if(!t)return;assign(t,id,{...metadata,title:metadata.title||'事前設定MV'});message(`${t.artist} - ${t.title} にMVを保存しました。rekordboxでロードした際、自動採用されます。`);toast('MV事前設定を保存しました');render()}
 async function importData(file){
  const text=await decodeFile(file);const fresh=parsePlaylist(text,file.name);if(!fresh.length)throw Error('読み込める曲がありません。CSVの「Track Title」「Artist」列を確認してください');
  const merged=mergeRows(rows,fresh);store(merged);rows=merged;
  let linked=0;for(const t of fresh){if(!t.videoId)continue;const existing=getMapping(t);if(existing?.video_id!==t.videoId){assign(t,t.videoId,{title:'CSVから事前設定'});linked++}if(t.offsetSeconds!==null)saveOffset(t,t.videoId,t.offsetSeconds)}
  if(!chosen||!lookup())chosen=trackKey(fresh[0]);
  message(`${file.name}: ${fresh.length}曲を読み込みました。リストは計${rows.length}曲、MVを${linked}件設定しました。`);
  render();
 }
 async function search(){const t=lookup();if(!t||busy)return;const key=trackKey(t),token=getToken();if(!token){message('設定タブで連携アクセストークンを保存してください。URLを直接指定する方法も使えます。');return}
  busy=true;results=[];renderDetail();
  try{const r=await fetch('/api/youtube-search',{method:'POST',headers:{'Content-Type':'application/json','X-AutoVJ-Token':token},body:JSON.stringify({title:t.title,artist:t.artist})});const payload=await r.json();if(!r.ok)throw Error(payload.error||'検索に失敗しました');if(chosen===key){results=Array.isArray(payload.items)?payload.items:[];message(results.length?`${t.title}：候補${results.length}件。動画を確認して「このMVに決定」を押してください。`:'候補が見つかりません。別の検索語かURL指定をお試しください。')}}catch(e){if(chosen===key)message('MV検索エラー: '+e.message)}finally{busy=false;renderDetail()}
 }
 $('prep-import').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await importData(file)}catch(err){message('取込失敗: '+err.message)}e.target.value=''});
 $('prep-add').addEventListener('click',()=>{const title=prompt('曲名を入力してください');if(title===null)return;const artist=prompt('アーティスト名を入力してください');if(artist===null)return;const fresh={title:title.trim().slice(0,200),artist:artist.trim().slice(0,200)};if(!fresh.title||!fresh.artist){message('曲名とアーティスト名が必要です');return}const merged=mergeRows(rows,[fresh]);store(merged);rows=merged;chosen=trackKey(fresh);$('prep-filter').value='';$('prep-state').value='all';offsetPage=0;render()});
 $('prep-clear').addEventListener('click',()=>{if(!confirm('楽曲リストを消去しますか？保存済みMVの対応表は消去されません。'))return;rows=[];store(rows);chosen=null;render();message('セットリストを消去しました。MVの対応履歴は残っています。')});
 $('prep-export').addEventListener('click',()=>{if(!rows.length){message('書き出す曲がありません');return}download(exportPlaylistCsv(rows,getMapping,getOffset),'autovj-mv-prepared.csv','text/csv;charset=utf-8');message('CSVをダウンロードしました。別のブラウザでも取り込めます。')});
 $('prep-filter').addEventListener('input',()=>{offsetPage=0;renderList()});$('prep-state').addEventListener('change',()=>{offsetPage=0;renderList()});$('prep-prev').addEventListener('click',()=>{offsetPage=Math.max(0,offsetPage-1);renderList()});$('prep-next').addEventListener('click',()=>{offsetPage++;renderList()});
 $('prep-find').addEventListener('click',search);
 $('prep-assign-url').addEventListener('click',()=>{const id=videoIdOf($('prep-url').value);if(!id){message('有効なYouTube動画URLまたは11文字の動画IDを入力してください');return}saveVideo(id,{title:'URL指定MV'})});
 $('prep-remove-mv').addEventListener('click',()=>{const t=lookup();if(!t)return;if(!getMapping(t)?.video_id)return;unassign(t);message(t.title+'の保存済みMV対応を解除しました（再生中の映像は変更しません）。');render()});
 $('prep-save-offset').addEventListener('click',()=>{const t=lookup();if(!t)return;const id=videoIdOf(getMapping(t)?.video_id);if(!id)return message('先にMVを設定してください');const v=Number($('prep-offset').value);if(!Number.isFinite(v)||Math.abs(v)>600)return message('オフセットは-600〜600秒で入力してください');saveOffset(t,id,v);message(`曲別オフセット ${v}秒を保存しました`)});
 if(rows.length)chosen=trackKey(rows[0]);render();
 return{render};
}
