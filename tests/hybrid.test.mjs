import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceOf,switchEffect,mayPreplay,validateFade} from '../assets/hybrid-transition.mjs';
import {createStopSwitch} from '../assets/stop-switch.mjs';
const t=()=>Date.now();
test('YouTube/local/generative are distinct and local always takes priority',()=>{
 assert.deepEqual(sourceOf({videoId:'aaaaaaaaaaa'}),{type:'youtube',id:'aaaaaaaaaaa'});
 assert.deepEqual(sourceOf({localId:'local-1234567890',videoId:'aaaaaaaaaaa'}),{type:'local',id:'local-1234567890'});
 assert.equal(sourceOf({}).type,'generative');
});
test('Only local to local permits crossfade, not YouTube overlay',()=>{
 for(const from of ['youtube','generative','local'])for(const to of ['youtube','generative','local'])assert.equal(switchEffect(from,to),from==='local'&&to==='local'?'crossfade':'cut');
});
test('local hidden preplay requires a separate deck, fresh clock and playing',()=>{
 const now=t();const base={side:'right',active:'left',localId:'local-1234567890',playing:'playing',observedAt:now,now};
 assert.equal(mayPreplay(base),true);
 assert.equal(mayPreplay({...base,localId:''}),false);
 assert.equal(mayPreplay({...base,side:'left'}),false);
 assert.equal(mayPreplay({...base,playing:'paused'}),false);
 assert.equal(mayPreplay({...base,observedAt:now-20000}),false);
});
test('fader duration is limited to 0.5-1s',()=>{
 assert.equal(validateFade(0.5),0.5);assert.equal(validateFade(1),1);assert.equal(validateFade(0.75),0.75);assert.equal(validateFade(3),0.75);assert.equal(validateFade('NaN'),0.75);
});
test('stop confirm permits assigned local video after distinct fresh paused snapshots',()=>{
 const engine=createStopSwitch({requiredReads:2,maxAgeMs:9000});
 const now=t();let clock=now;
 const decks={left:{title:'A',artist:'P',playing:'playing',observedAt:now,videoId:'a'.repeat(11)},right:{title:'B',artist:'P',playing:'playing',observedAt:now,localId:'local-1234567890'}};
 engine.reset('left');engine.update(decks,'left',now);
 clock+=1000;decks.left.observedAt=clock;decks.right.observedAt=clock;
 assert.equal(engine.update(decks,'left',clock).take,null);
 clock+=1000;decks.left.playing='paused';decks.left.observedAt=clock;decks.right.observedAt=clock;
 assert.equal(engine.update(decks,'left',clock).take,null);
 clock+=1000;decks.left.observedAt=clock;decks.right.observedAt=clock;
 assert.equal(engine.update(decks,'left',clock).take,'right');
});
