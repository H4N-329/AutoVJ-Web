import test from 'node:test';
import assert from 'node:assert/strict';
import {splitDelimited,parsePlaylist,mergeRows,exportPlaylistCsv,videoIdOf,trackKey} from '../assets/playlist.mjs';
test('rekordbox Track Title Artist CSV',()=>{
 const r=parsePlaylist('Track Title,Artist,BPM,Key\r\n"病名は愛だった","Neru Feat. z5",161,B\r\n"からくりピエロ",40mP,115,C','rekordbox.csv');
 assert.equal(r.length,2);assert.equal(r[0].title,'病名は愛だった');assert.equal(r[1].artist,'40mP');
});
test('Japanese header with preselected YouTube URL and offset',()=>{
 const r=parsePlaylist('曲名,アーティスト,YouTube URL,OffsetSeconds\nA,B,https://youtu.be/6ObvFPLk8eI,3.5');
 assert.equal(r[0].videoId,'6ObvFPLk8eI');assert.equal(r[0].offsetSeconds,3.5);
});
test('quoted commas and newlines are parsed',()=>{
 const r=splitDelimited('title,artist\n"曲, A","artist\nname"');assert.equal(r[1][0],'曲, A');assert.equal(r[1][1],'artist\nname');
});
test('TSV parses headers and columns',()=>{
 const r=parsePlaylist('Title\tArtist\tYouTube URL\nMelt\tryo\thttps://youtu.be/6ObvFPLk8eI','playlist.tsv');assert.equal(r[0].title,'Melt');assert.equal(r[0].videoId,'6ObvFPLk8eI');
});
test('existing rows remain, normalization deduplicates',()=>{
 const r=mergeRows([{title:'ラプス',artist:'kr-KuuRa'}],[{title:'ラプス',artist:'kr KuuRa'},{title:'New',artist:'P'}]);assert.equal(r.length,2);
});
test('exported CSV reimports correct URL and offset',()=>{
 const rows=[{title:'Track, A',artist:'Neru'}];const csv=exportPlaylistCsv(rows,()=>({video_id:'6ObvFPLk8eI'}),()=>-.5);
 const imported=parsePlaylist(csv,'export.csv');assert.equal(imported[0].title,'Track, A');assert.equal(imported[0].videoId,'6ObvFPLk8eI');assert.equal(imported[0].offsetSeconds,-.5);
});
test('invalid and suspicious YouTube URL does not get parsed',()=>{
 assert.equal(videoIdOf('https://evil.example/watch?v=6ObvFPLk8eI'),'');assert.equal(videoIdOf('https://youtube.com.evil.test/watch?v=6ObvFPLk8eI'),'');assert.equal(videoIdOf('not a URL'),'');
});
test('compatible with v6 track key normalization',()=>{assert.equal(trackKey({title:'ＡＢＣ?',artist:'Neru feat. z5'}),'nerufeatz5::abc')});
test('JSON playlist import and invalids',()=>{
 const entries=parsePlaylist(JSON.stringify({playlist:[{title:'A',artist:'B',videoId:'6ObvFPLk8eI'}]}),'backup.json');assert.equal(entries[0].videoId,'6ObvFPLk8eI');
 assert.deepEqual(parsePlaylist('Title,Artist\n,\nfoo,'),[]);
});
