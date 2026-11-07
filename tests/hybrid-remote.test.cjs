const {test}=require('node:test');
const assert=require('node:assert/strict');
const {actionOf,cleanState}=require('../api/remote.js');
test('iPad can select HYBRID mode without exposing local video bytes',()=>{
 assert.deepEqual(actionOf({type:'mode',mode:'hybrid'}),{type:'mode',mode:'hybrid'});
 const state=cleanState({mode:'hybrid',decks:{left:{title:'曲A',artist:'DJ',localId:'local-1234567890',localName:'licensed.webm',playing:'playing'},right:{}}});
 assert.equal(state.mode,'hybrid');assert.equal(state.decks.left.localId,'local-1234567890');assert.equal(state.decks.left.localName,'licensed.webm');assert.equal('blob' in state.decks.left,false);
});
