/** CSV/TSV and JSON import for rekordbox preparation. Pure functions, unit-testable. */
const ID=/^[\w-]{11}$/;
export function trackKey(t){return [t?.artist,t?.title].map(v=>String(v||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'')).join('::')}
export function videoIdOf(value){
 const s=String(value||'').trim();if(ID.test(s))return s;
 try{const u=new URL(s);const host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(host==='youtu.be')return ID.test(u.pathname.split('/')[1])?u.pathname.split('/')[1]:'';
  if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)){
    const v=u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1]||'';
    return ID.test(v)?v:'';
  }
 }catch{}
 return '';
}
export function splitDelimited(text, delimiter=','){
 const rows=[];let row=[],cell='',quoted=false;const input=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(c==='"'){
   if(quoted&&input[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell.trim()===''){quoted=true;cell=''}else if(quoted){quoted=false}else{cell+='"'}
  }else if(c===delimiter&&!quoted){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(quoted)throw Error('CSVの引用符が閉じられていません');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/[\s_\-\/\[\]()（）]/g,'');
const HEADERS={
 title:['tracktitle','title','trackname','song','songtitle','曲名','トラックタイトル','タイトル','楽曲名','楽曲タイトル','name'],
 artist:['artist','artistname','performer','アーティスト','アーティスト名','ボカロp','ボカロｐ','作曲者','歌手'],
 url:['youtubeurl','youtube','url','mvurl','video','videoid','動画url','mv','映像url','youtubeリンク'],
 offset:['offset','offsetseconds','mvoffset','introoffset','開始オフセット','補正秒数','オフセット秒']
};
function columnOf(headers,key){const alts=HEADERS[key];return headers.findIndex(h=>alts.includes(norm(h)))}
function convert(rows){
 if(!rows.length)return [];
 const head=rows[0].map(norm);const titleIndex=columnOf(head,'title');const artistIndex=columnOf(head,'artist');
 const hasHeader=titleIndex>=0&&artistIndex>=0;
 let title=hasHeader?titleIndex:0,artist=hasHeader?artistIndex:1;
 let url=hasHeader?columnOf(head,'url'):2,offset=hasHeader?columnOf(head,'offset'):3;
 // Headerless two-column CSV is fine; ignore other unnamed fields.
 const data=hasHeader?rows.slice(1):rows;
 const out=[];
 for(const cells of data){
  const t=String(cells[title]||'').trim().slice(0,200),a=String(cells[artist]||'').trim().slice(0,200);
  if(!t||!a||t.startsWith('#'))continue;
  const v=url>=0?videoIdOf(cells[url]):'';
  const raw=offset>=0?String(cells[offset]||'').trim():'';
  const o=raw!==''&&Number.isFinite(Number(raw))&&Math.abs(Number(raw))<=600?Number(raw):null;
  out.push({title:t,artist:a,videoId:v,offsetSeconds:o});
  if(out.length>=3000)break;
 }
 return out;
}
export function parsePlaylist(text,filename='playlist.csv'){
 if(String(filename).toLowerCase().endsWith('.json')){
  const data=JSON.parse(text);
  // Either an exported playlist array, or AutoVJ backup with playlist and mappings.
  const list=Array.isArray(data)?data:Array.isArray(data?.playlist)?data.playlist:[];
  if(!Array.isArray(list))throw Error('JSONに楽曲配列がありません');
  const converted=list.map(x=>({title:String(x.title||'').trim().slice(0,200),artist:String(x.artist||'').trim().slice(0,200),videoId:videoIdOf(x.videoId||x.video_id||data?.mappings?.[trackKey(x)]?.video_id),offsetSeconds:x.offsetSeconds??null})).filter(x=>x.title&&x.artist);
  return converted.slice(0,3000);
 }
 const first=String(text||'').split(/\r?\n/,1)[0]||'';
 const delim=String(filename).toLowerCase().endsWith('.tsv')||((first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length)?'\t':',';
 return convert(splitDelimited(text,delim));
}
export function mergeRows(existing,incoming){
 const map=new Map(existing.filter(x=>x?.title&&x?.artist).map(x=>[trackKey(x),{title:x.title,artist:x.artist}]));
 for(const t of incoming){if(!t?.title||!t?.artist)continue;const key=trackKey(t);if(!map.has(key))map.set(key,{title:t.title.slice(0,200),artist:t.artist.slice(0,200)});}
 return [...map.values()].slice(0,3000);
}
function cell(s){const t=String(s??'');return /[,\r\n"]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t}
export function exportPlaylistCsv(rows,getMapping,getOffset){
 const lines=[['Track Title','Artist','YouTube URL','OffsetSeconds']];
 for(const row of rows){const m=getMapping(row)||{};const id=videoIdOf(m.video_id);lines.push([row.title,row.artist,id?'https://www.youtube.com/watch?v='+id:'',id?String(getOffset(row,id)||0):''])}
 return '\uFEFF'+lines.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
