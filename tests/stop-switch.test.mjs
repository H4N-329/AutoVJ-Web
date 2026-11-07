import test from 'node:test';
import assert from 'node:assert/strict';
import {createStopSwitch} from '../assets/stop-switch.mjs';
const left={title:'A',artist:'P',videoId:'aaaaaaaaaaa',playing:'playing',observedAt:1000};
const right={title:'B',artist:'Q',videoId:'bbbbbbbbbbb',playing:'paused',observedAt:1000};
test('MIX中は現在の映像を維持し、停止が連続確認されてからTAKE',()=>{
 const s=createStopSwitch({requiredReads:2});
 s.reset('left');
 assert.equal(s.update({left,right},'left',1100).take,null);
 let l={...left,observedAt:2000},r={...right,playing:'playing',observedAt:2000};
 assert.equal(s.update({left:l,right:r},'left',2200).take,null);
 l={...l,observedAt:3000};r={...r,observedAt:3000};
 assert.match(s.update({left:l,right:r},'left',3200).status,/MIX中/);
 l={...l,playing:'paused',observedAt:4000};r={...r,observedAt:4000};
 assert.equal(s.update({left:l,right:r},'left',4100).take,null);
 l={...l,observedAt:5000};r={...r,observedAt:5000};
 assert.equal(s.update({left:l,right:r},'left',5200).take,'right');
});
test('同じスクリーンショットの繰り返しで二重カウントしない',()=>{
 const s=createStopSwitch();s.reset('left');
 const l={...left,playing:'paused'},r={...right,playing:'playing'};
 assert.equal(s.update({left:l,right:r},'left',1100).take,null);
 assert.equal(s.update({left:l,right:r},'left',1200).take,null);
});
test('MV未設定・古いOCR・再生状態不明では切り替えない',()=>{
 const s=createStopSwitch();s.reset('left');
 let l={...left,playing:'paused'},r={...right,playing:'playing',videoId:''};
 s.update({left:l,right:r},'left',1100);
 l={...l,observedAt:2000};r={...r,observedAt:2000};
 assert.equal(s.update({left:l,right:r},'left',2100).take,null);
 r={...r,videoId:'bbbbbbbbbbb',observedAt:3000};l={...l,playing:'unknown',observedAt:3000};
 assert.equal(s.update({left:l,right:r},'left',3100).take,null);
 assert.equal(s.update({left:l,right:r},'left',15000).take,null);
});
test('active未指定なら本番映像の自動TAKEはしない',()=>{
 const s=createStopSwitch();
 assert.equal(s.update({left:{...left,playing:'paused'},right:{...right,playing:'playing'}},null,1100).take,null);
});
test('旧デッキ停止でも次のデッキ停止中は保持',()=>{
 const s=createStopSwitch();s.reset('left');
 const l={...left,playing:'paused'};
 assert.equal(s.update({left:l,right},'left',1100).take,null);
});
