/** Pure functions shared by controller, renderer and regression tests. */
export function sourceOf(deck){
 if(deck?.localId)return {type:'local',id:deck.localId};
 if(deck?.videoId)return {type:'youtube',id:deck.videoId};
 return {type:'generative',id:''};
}
export function switchEffect(from,to){return from==='local'&&to==='local'?'crossfade':'cut'}
export function mayPreplay({side,active,localId,playing,observedAt,now=Date.now(),maxAgeMs=9000}){
 return !!localId && side!==active && playing==='playing' && observedAt>0 && now-observedAt>=0 && now-observedAt<=maxAgeMs;
}
export function validateFade(seconds){const n=Number(seconds);return Number.isFinite(n)&&n>=0.5&&n<=1?Math.round(n*100)/100:0.75}
