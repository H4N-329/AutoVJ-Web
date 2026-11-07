/** v6.4: Local, licensed video blobs only. Nothing is sent to Vercel/Redis. */
const DB_NAME='autovj-local-videos-v1';
const STORE='media';
let dbPromise=null;
function database(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!('indexedDB' in window))return reject(Error('このブラウザはIndexedDBに対応していません'));
  const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error||Error('動画ライブラリを開けません'));
 });
 return dbPromise.catch(e=>{dbPromise=null;throw e});
}
function transact(mode,fn){return database().then(db=>new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);
 let request;try{request=fn(store)}catch(e){reject(e);return}
 tx.oncomplete=()=>resolve(request?.result);
 tx.onerror=()=>reject(tx.error||Error('ブラウザへの動画保存に失敗しました（空き容量を確認）'));
 tx.onabort=()=>reject(tx.error||Error('保存が中断されました'));
}));}
const VIDEO_EXT=/\.(mp4|webm|m4v|mov)$/i;
export function validLocalFile(file){return file && (String(file.type||'').startsWith('video/') || VIDEO_EXT.test(String(file.name||'')));}
export async function putLocalVideo(file){
 if(!validLocalFile(file))throw Error('動画ファイル（MP4/WebM/MOV）を選んでください');
 if(!file.size)throw Error('空の動画は保存できません');
 if(file.size>750*1024*1024)throw Error('1ファイル750MB以内にしてください。長尺動画は圧縮を推奨します');
 const id='local-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));
 await transact('readwrite',store=>store.put({id,name:file.name,size:file.size,type:file.type||'video/mp4',blob:file,createdAt:Date.now()}));
 try{await navigator.storage?.persist?.()}catch{}
 return {id,name:file.name,size:file.size,type:file.type};
}
export async function getLocalVideo(id){
 if(!/^local-[\w-]{10,}$/.test(String(id||'')))return null;
 return (await transact('readonly',store=>store.get(id)))||null;
}
export async function makeLocalURL(id){const entry=await getLocalVideo(id);if(!entry?.blob)throw Error('このMacブラウザに動画ファイルがありません。MV事前設定から再登録してください');return URL.createObjectURL(entry.blob);}
export async function removeLocalVideo(id){await transact('readwrite',store=>store.delete(id));}
