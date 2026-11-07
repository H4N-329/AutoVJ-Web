"""Offline Chromium regression test, no YouTube/network access.
The stub accurately emulates the IFrame API replacing its target element.
"""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
FAKE_YT = r'''(() => {
  function replace(target, cfg) {
    const node = typeof target === 'string' ? document.getElementById(target):target;
    const iframe=document.createElement('iframe');
    iframe.setAttribute('data-fake-yt', '1');
    iframe.id = node.id;
    node.replaceWith(iframe);
    const p={
      _id: cfg.videoId || '', _time:0, _state:-1, _mute:false,
      mute(){this._mute=true}, pauseVideo(){this._state=2},
      playVideo(){this._state=1; cfg.events?.onStateChange?.({data:1,target:p})},
      loadVideoById(v){this._id=typeof v==='string'?v:v.videoId;this._time=typeof v==='string'?0:v.startSeconds||0;this._state=1;cfg.events?.onStateChange?.({data:1,target:p})},
      cueVideoById(v){this._id=typeof v==='string'?v:v.videoId;this._state=5;cfg.events?.onStateChange?.({data:5,target:p})},
      seekTo(s){this._time=s}, getCurrentTime(){return this._time},getPlayerState(){return this._state},
    };
    (window.__ytPlayers ||= []).push(p);
    setTimeout(()=>cfg.events?.onReady?.({target:p}), window.__ytDelay||75);
    return p;
  };
  window.YT={Player:replace};
})();'''

def script(page, name):
    html=(ROOT/name).read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
    html=re.sub(r'<script\b[^>]*/>', '', html, flags=re.S)
    html=html.replace('<link rel="stylesheet" href="/assets/styles.css">','<style>'+(ROOT/'assets/styles.css').read_text()+'</style>')
    page.set_content(html,wait_until='domcontentloaded')

def bundled(entry):
    shared=re.sub(r'\bexport\s+', '', (ROOT/'assets/shared.js').read_text())
    app=(ROOT/('assets/'+entry)).read_text()
    app=re.sub(r'^import .*?;\s*$', '', app, flags=re.M)
    if entry=='app.js':
        remote='function createRemoteHost(){ return {status(){return {enabled:false}}}; }\n'
    else: remote=''
    return shared+'\n'+remote+'\n'+app

def run():
    # v6.1.6 creates players only after selecting a valid video ID.
    from browser_playback_v616_smoke import run as playback_run
    playback_run()

if __name__=='__main__':run()
