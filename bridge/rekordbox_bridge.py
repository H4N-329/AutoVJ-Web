#!/usr/bin/env python3
"""AutoVJ Web / macOS local OCR -> your own Vercel app.

Only sends deck metadata (title, artist, elapsed, inferred playback state),
never screenshot/audio or YouTube API keys. No third-party/unofficial rekordbox API.
The existing v5.9 deck ROI calibration is reused.
"""
from __future__ import annotations
import json
import os
import sys
import threading
import time
import urllib.request
import urllib.error
from pathlib import Path
from getpass import getpass

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'mac_ocr'))
from deck_capture import VisionOCR, capture_and_read, capture_elapsed_fast, read_config, DeckStabilizer
from playback_detector import PlaybackDetector, parse_elapsed
from track_bridge import track_key
from tls_config import verified_ssl_context

CONFIG = ROOT/'bridge_config.json'


def options():
    saved={}
    try: saved=json.loads(CONFIG.read_text('utf8'))
    except (OSError, ValueError): pass
    if not saved.get('url'):
        print('AutoVJ WebのVercel URLを入力してください (例: https://autovj-xxx.vercel.app)')
        saved['url']=input('URL: ').strip()
    if not saved.get('token'):
        saved['token']=getpass('Vercel AUTOVJ_ACCESS_TOKEN: ').strip()
    url=saved['url'].rstrip('/')
    if not url.startswith('https://') and not url.startswith('http://localhost:'):
        raise ValueError('URLはHTTPSで指定してください')
    if not saved['token'] or len(saved['token']) < 16:
        raise ValueError('トークンが短すぎます（16文字以上）')
    CONFIG.write_text(json.dumps(saved,ensure_ascii=False,indent=2),'utf8')
    try: os.chmod(CONFIG,0o600)
    except OSError: pass
    return saved


def send(url,token,decks):
    data=json.dumps({'decks':decks}).encode('utf8')
    req=urllib.request.Request(url.rstrip('/')+'/api/bridge',data=data,method='POST',headers={
        'Content-Type':'application/json','X-AutoVJ-Token':token,'User-Agent':'AutoVJ-Web-MacBridge/6.0'
    })
    with urllib.request.urlopen(req,timeout=12,context=verified_ssl_context()) as response:
        response.read()


def run():
    if sys.platform!='darwin':
        raise RuntimeError('このブリッジはmacOSでのみ実行できます')
    cfg=options()
    roi=read_config()
    reader=VisionOCR(ROOT/'mac_ocr')
    reader.ensure()
    tracks=DeckStabilizer(required=2)
    motion=PlaybackDetector(advance_samples=2,pause_samples=2)
    lock=threading.RLock()
    state={s:{'title':'','artist':'','elapsed':0,'playing':'unknown'} for s in ('left','right')}
    stopped=threading.Event()
    def full():
        while not stopped.is_set():
            try:
                observed,elapsed=capture_and_read(reader,roi)
                with lock:
                    tracks.update(observed)
                    for side in ('left','right'):
                        track=tracks.tracks[side]
                        if track:
                            ident=track_key(track)
                            if (state[side]['title'],state[side]['artist'])!=(track['title'],track['artist']):
                                state[side].update({'title':track['title'],'artist':track['artist'],'elapsed':0,'playing':'unknown'})
                                motion.observe(side,ident,'',time.monotonic(),confirmed=False)
            except Exception as exc:
                print('曲名OCRの問題:',str(exc)[:160],flush=True)
            stopped.wait(2)
    def fast():
        while not stopped.is_set():
            try:
                times=capture_elapsed_fast(reader,roi)
                with lock:
                    for side in ('left','right'):
                        track=tracks.tracks[side]
                        elapsed=parse_elapsed(times[side])
                        if not track or elapsed is None:continue
                        ident=track_key(track)
                        motion.observe(side,ident,times[side],time.monotonic(),confirmed=True)
                        state[side]['elapsed']=elapsed
                        raw=motion.status(side,time.monotonic())
                        state[side]['playing']='playing' if raw=='再生中' else 'paused' if raw=='停止' else 'unknown'
            except Exception as exc:
                print('タイマーOCRの問題:',str(exc)[:160],flush=True)
            stopped.wait(1.1)
    threads=[threading.Thread(target=full,daemon=True),threading.Thread(target=fast,daemon=True)]
    for t in threads:t.start()
    print('rekordbox監視開始。終了するには Ctrl+C を押してください。')
    print('rekordboxの画面は表示したままにしてください。v5.9のOCR校正を使います。')
    last=''
    try:
        while not stopped.is_set():
            with lock: snapshot=json.loads(json.dumps(state,ensure_ascii=False))
            try:
                send(cfg['url'],cfg['token'],snapshot)
                brief=' | '.join(f'{k}: {v["artist"]} - {v["title"]} {v["elapsed"]:.1f}s / {v["playing"]}' for k,v in snapshot.items())
                if brief!=last:print('送信:',brief,flush=True);last=brief
            except urllib.error.HTTPError as exc:
                print(f'サーバーエラー: HTTP {exc.code} / Vercel設定とアクセストークンを確認',flush=True)
            except Exception as exc:
                print('通信失敗:',str(exc)[:160],flush=True)
            stopped.wait(2.0)
    except KeyboardInterrupt:
        print('停止しました')
    finally:stopped.set()

if __name__=='__main__':
    try:run()
    except Exception as error:
        print('起動エラー:',error,file=sys.stderr)
        sys.exit(1)
