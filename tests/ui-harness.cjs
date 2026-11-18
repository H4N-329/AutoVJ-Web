const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');

class Element {
 constructor(tag='div',attributes={}){
  this.tagName=tag.toUpperCase();this.id=attributes.id||'';this.dataset={};this.children=[];this.listeners={};
  this.textContent='';this.value=attributes.value||'';this.checked=false;this.disabled=false;this.hidden=false;
  this.style={setProperty(name,value){this[name]=value}};
  this.classes=new Set((attributes.class||'').split(/\s+/).filter(Boolean));
  this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),
   contains:name=>this.classes.has(name),toggle:(name,force)=>{const add=force??!this.classes.has(name);add?this.classes.add(name):this.classes.delete(name);return add}};
  for(const [key,value] of Object.entries(attributes))if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
  this.paused=true;this.currentTime=0;this.readyState=1;this.loads=0;
 }
 addEventListener(name,callback){(this.listeners[name]??=[]).push(callback)}
 async trigger(name){for(const callback of this.listeners[name]||[])await callback({target:this,preventDefault(){}})}
 setAttribute(key,value){this[key]=String(value)}
 removeAttribute(key){delete this[key]}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children}
 querySelector(){return this.children[0]??(this.children[0]=new Element('p'))}
 load(){this.loads++;this.currentTime=0;this.paused=true}
 pause(){this.paused=true}
 async play(){if(this.playError)throw this.playError;this.paused=false}
 focus(){} select(){} close(){} showModal(){}
}

function storage(values={}){
 const map=new Map(Object.entries(values));
 return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}

async function createUI(entry,{saved={},api=async()=>({state:null}),localURL=async id=>'blob:'+id}={}){
 const elements=[],byId=new Map(),html=entry==='output.js'?'output.html':entry==='controller.js'?'controller.html':'index.html';
 for(const match of fs.readFileSync(path.join(root,html),'utf8').matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
  const attributes={};for(const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attributes[attr[1]]=attr[2];
  const element=new Element(match[1],attributes);elements.push(element);if(element.id)byId.set(element.id,element);
 }
 const select=selector=>elements.filter(element=>selector.split(',').some(part=>{
  const s=part.trim();
  if(s.startsWith('#'))return element.id===s.slice(1).split('.')[0]&&s.split('.').slice(1).every(c=>element.classes.has(c));
  if(s.startsWith('.'))return !s.includes('[open]')&&element.classes.has(s.slice(1));
  const data=s.match(/^\[data-([\w-]+)\]$/);return data&&Object.hasOwn(element.dataset,data[1]);
 }));
 const windowListeners={},documentListeners={},intervals=[],timeouts=new Map(),sent=[];let incoming;
 const document={hidden:false,activeElement:null,body:new Element('body'),documentElement:new Element('html'),
  getElementById:id=>byId.get(id),querySelectorAll:select,querySelector:s=>select(s)[0]||null,
  createElement:tag=>new Element(tag),addEventListener:(name,fn)=>{documentListeners[name]=fn}};
 const context=vm.createContext({console,document,URL,URLSearchParams,AbortController,Date,crypto:webcrypto,Image:Element,
  localStorage:storage(saved),sessionStorage:storage(),navigator:{},location:{origin:'https://autovj.example.test',search:''},
  setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length},clearInterval(){},
  setTimeout:(fn,ms)=>{const key={};timeouts.set(key,{fn,ms});return key},clearTimeout:key=>timeouts.delete(key),
  requestAnimationFrame(){},devicePixelRatio:1,confirm:()=>true,
  fetch:async(url,options)=>({ok:true,json:async()=>api(url,options)}),
 });
 context.window=context;context.addEventListener=(name,fn)=>{windowListeners[name]=fn};
 const shared=fs.readFileSync(path.join(root,'assets/shared.js'),'utf8').replace(/\bexport\s+/g,'');
 vm.runInContext(shared+'\nglobalThis.dependencies={STORE,PREFS,SIDES,emptyDeck,loadJSON,saveJSON,videoIdOf,fmt,keyOf,profileId,clamp,VIDEO_RE,fetchAutoVJ};',context);
 const hybrid=await import('../assets/hybrid-transition.mjs');
 const stop=await import('../assets/stop-switch.mjs');
 const dependencies={...context.dependencies,...hybrid,...stop,makeLocalURL:localURL,
  openChannel:callback=>{incoming=callback;return {send:packet=>sent.push(packet)}},
  createRemoteHost:()=>({status:()=>({enabled:false})}),initPlaylistUI:()=>({render(){}}),
  loadYT:()=>new Promise(()=>{}),renderGenerative:()=>()=>{},
  buildPlayer:async()=>({pauseVideo(){},mute(){},loadVideoById(){}}),plainYoutubeEmbed(){},youtubeError:()=>''};
 const imports=[...fs.readFileSync(path.join(root,'assets/'+entry),'utf8').matchAll(/^import\s+\{([^}]+)\}.*$/gm)].flatMap(m=>m[1].split(',').map(x=>x.trim()));
 context.injected=dependencies;
 const body=fs.readFileSync(path.join(root,'assets/'+entry),'utf8').replace(/^import .*?;\s*$/gm,'');
 // Give each script its module scope while running its normal DOM/channel entry points.
 vm.runInContext('(function(){const {'+[...new Set(imports)].join(',')+'}=injected;\n'+body+'\n})();',context);
 return {id:id=>byId.get(id),select,sent,incoming:packet=>incoming(packet),context,windowListeners,documentListeners,timeouts,
  tick:async ms=>{for(const timer of intervals)if(timer.ms===ms)await timer.fn()},
  finishTimeouts:()=>{for(const [key,timer] of [...timeouts]){timeouts.delete(key);timer.fn()}}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
module.exports={createUI,settle,Element};
