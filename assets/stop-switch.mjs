/**
 * Stop-confirmed deck handover. It does not play any hidden YouTube video.
 * Call update() only when fresh Mac OCR snapshots arrive, not on a UI render timer.
 */
export function createStopSwitch({requiredReads=2,maxAgeMs=8000}={}) {
  const clocks={left:{stamp:0,track:'',state:'unknown',reads:0},right:{stamp:0,track:'',state:'unknown',reads:0}};
  let activeDeck=null;
  const other=side=>side==='left'?'right':'left';
  function reset(active=null) {
    activeDeck=active;
    for(const side of ['left','right']) clocks[side]={stamp:0,track:'',state:'unknown',reads:0};
  }
  function update(decks,active,now=Date.now()) {
    if(active!==activeDeck)reset(active);
    for(const side of ['left','right']) {
      const d=decks?.[side]||{};
      const o=clocks[side];
      const stamp=Number(d.observedAt)||0;
      const valid=stamp>0 && stamp<=now+2000 && now-stamp<=maxAgeMs && ['playing','paused'].includes(d.playing) && d.title && d.artist;
      const track=String(d.artist||'')+'\u241F'+String(d.title||'');
      if(!valid) {o.reads=0;o.state='unknown';continue;}
      if(o.stamp===stamp)continue; // don't count one OCR snapshot multiple times
      const isSame=o.track===track&&o.state===d.playing;
      o.reads=isSame?Math.min(requiredReads,o.reads+1):1;
      o.track=track;o.state=d.playing;o.stamp=stamp;
    }
    if(!activeDeck)return {take:null,status:'最初の曲を手動TAKEしてください'};
    const target=other(activeDeck),old=clocks[activeDeck],next=clocks[target],candidate=decks[target];
    const oldFresh=old.stamp>0 && now-old.stamp<=maxAgeMs;
    const nextFresh=next.stamp>0 && now-next.stamp<=maxAgeMs;
    if(!oldFresh||!nextFresh||old.state==='unknown'||next.state==='unknown')return {take:null,status:'rekordboxの再生状態を確認中'};
    if(old.state==='playing' && next.state==='playing')return {take:null,status:'MIX中：現在のMVを保持（次曲は待機）'};
    if(old.state==='paused' && next.state==='playing') {
      if(!candidate?.videoId&&!candidate?.localId)return {take:null,status:'次のデッキのMVが未設定：手動TAKE待ち'};
      if(old.reads>=requiredReads&&next.reads>=requiredReads)return {take:target,status:'停止確定：次のMVへ切替'};
      return {take:null,status:'停止を連続確認中（誤切替防止）'};
    }
    return {take:null,status:'現在のMVを保持：切替条件待ち'};
  }
  return {reset,update};
}
