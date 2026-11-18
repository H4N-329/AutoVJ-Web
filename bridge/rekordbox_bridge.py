#!/usr/bin/env python3
"""AutoVJ Web / macOS local OCR -> your own Vercel app.

Only sends deck metadata (title, artist, elapsed, inferred playback state),
never screenshot/audio or YouTube API keys. No third-party/unofficial rekordbox API.
The existing v5.9 deck ROI calibration is reused.
"""
from __future__ import annotations
import fcntl
import sys
import threading
import time
from pathlib import Path

from autovj_launcher import STATE_DIR, load_bridge_config
from bridge_http import BridgeRequestError, request

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'mac_ocr'))
from deck_capture import VisionOCR, capture_and_read, capture_elapsed_fast, read_config, DeckStabilizer
from playback_detector import PlaybackDetector, parse_elapsed
from track_bridge import track_key

SIDES = ('left', 'right')


def run():
    if sys.platform!='darwin':
        raise RuntimeError('このブリッジはmacOSでのみ実行できます')
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with (STATE_DIR/'bridge.lock').open('a') as lockfile:
        try:
            fcntl.flock(lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('監視ブリッジは起動済みです。先に起動したターミナルで Ctrl+C、または STOP_AUTOVJ.command で停止できます。') from None
        cfg = load_bridge_config(prompt=sys.stdin.isatty())
        try:
            request(cfg['url'], cfg['token'])
        except BridgeRequestError as exc:
            if not exc.retryable:
                raise
            print(f'接続確認: {exc} / 監視開始後も再接続を試します。', flush=True)
        monitor(cfg)


def monitor(cfg):
    roi=read_config()
    reader=VisionOCR(ROOT/'mac_ocr')
    reader.ensure()
    tracks=DeckStabilizer(required=2)
    motion=PlaybackDetector(advance_samples=2,pause_samples=2)
    lock=threading.RLock()
    state={s:{'title':'','artist':'','elapsed':None,'playing':'unknown',
              'clockObservedAt':0,'clockSource':''} for s in SIDES}
    track_since = dict.fromkeys(SIDES, 0.0)
    last_clock = dict.fromkeys(SIDES, 0.0)
    stopped=threading.Event()
    def accept_clock(side, raw, observed_ms, observed_mono, source):
        """Accept only parsed, in-order OCR samples for the currently known track.

        Must be called under lock. Never fabricate a fresh timestamp when OCR fails.
        """
        track = tracks.tracks[side]
        seconds = parse_elapsed(raw)
        if not track or seconds is None or observed_mono < track_since[side] or observed_mono - last_clock[side] < 0.4:
            return False
        ident = track_key(track)
        if tracks.raw[side] is not None and tracks.raw[side] != ident:
            return False
        motion.observe(side, ident, raw, observed_mono, confirmed=True)
        last_clock[side] = observed_mono
        state[side]['elapsed'] = seconds
        state[side]['clockObservedAt'] = observed_ms
        state[side]['clockSource'] = source
        raw_state = motion.status(side, time.monotonic())
        state[side]['playing'] = ('playing' if raw_state == '再生中' else
                                 'paused' if raw_state == '停止' else 'unknown')
        return True

    last_warning = dict.fromkeys(SIDES, -12.0)
    def report_missing(side, raw):
        # Give actionable feedback without logging one warning for every frame.
        now = time.monotonic()
        if now-last_warning[side] < 12:
            return
        last_warning[side] = now
        deck = 'DECK 1' if side == 'left' else 'DECK 2'
        print(f'[時刻OCR] {deck} は未取得（認識文字={str(raw)[:48]!r}）。'
              'DIAGNOSE_TIMERS.command で経過時間の読取枠を確認してください。', flush=True)

    def full():
        while not stopped.is_set():
            observed_ms = int(time.time()*1000)
            observed_mono = time.monotonic()
            try:
                observed, elapsed = capture_and_read(reader,roi)
                with lock:
                    tracks.update(observed)
                    for side in SIDES:
                        track=tracks.tracks[side]
                        if not track:continue
                        if (state[side]['title'],state[side]['artist'])!=(track['title'],track['artist']):
                            state[side].update({'title':track['title'],'artist':track['artist'],
                                                'elapsed':None,'playing':'unknown',
                                                'clockObservedAt':0,'clockSource':''})
                            track_since[side] = observed_mono
                            last_clock[side] = 0.0
                            motion.observe(side,track_key(track),'',time.monotonic(),confirmed=False)
                        # Reuse accurate timer OCR already read alongside the titles.
                        if observed.get(side):
                            accept_clock(side, elapsed.get(side,''),observed_ms,observed_mono,'full-accurate')
            except Exception as exc:
                print('曲名OCRの問題:',str(exc)[:160],flush=True)
            stopped.wait(2)

    def fast():
        while not stopped.is_set():
            observed_ms=int(time.time()*1000)
            observed_mono=time.monotonic()
            try:
                # Fast Vision OCR falls back to accurate mode for a failed timer.
                values,sources=capture_elapsed_fast(reader,roi,return_sources=True)
                with lock:
                    for side in SIDES:
                        raw = values.get(side, '')
                        if parse_elapsed(raw) is not None:
                            accept_clock(side, raw, observed_ms, observed_mono, sources[side])
                        elif time.monotonic() - last_clock[side] > 8:
                            report_missing(side, raw)
            except Exception as exc:
                print('タイマーOCRの問題:',str(exc)[:160],flush=True)
            stopped.wait(0.65)
    threads=[threading.Thread(target=full,daemon=True),threading.Thread(target=fast,daemon=True)]
    for t in threads:t.start()
    print('rekordbox監視開始。終了するには Ctrl+C を押してください。')
    print('rekordboxの画面は表示したままにしてください。v5.9のOCR校正を使います。')
    print('経過時間が止まる場合は DIAGNOSE_TIMERS.command で読み取り領域を確認してください。')
    last=''
    last_error = None
    written = False
    try:
        while not stopped.is_set():
            with lock:
                now = time.monotonic()
                snapshot = {side: {**state[side]} for side in SIDES}
                for side in SIDES:
                    if now - last_clock[side] > 8:
                        snapshot[side]['playing'] = 'unknown'
            try:
                request(cfg['url'], cfg['token'], decks=snapshot)
                if not written or last_error is not None:
                    print('接続成功 / OCR状態の書き込みを確認', flush=True)
                written = True
                last_error = None
                brief=' | '.join(f'{k}: {v["artist"]} - {v["title"]} '
                                 f'{v["elapsed"]:.1f}s ({v["clockSource"]}) / {v["playing"]}'
                                 if v['elapsed'] is not None else
                                 f'{k}: {v["artist"]} - {v["title"]} --:-- (OCR待機)'
                                 for k,v in snapshot.items())
                if brief!=last:print('送信:',brief,flush=True);last=brief
            except BridgeRequestError as exc:
                if str(exc) != last_error:
                    last_error = str(exc)
                    print(f'送信エラー: {last_error}', flush=True)
            stopped.wait(2.0)
    except KeyboardInterrupt:
        print('停止しました')
    finally:stopped.set()

if __name__=='__main__':
    try:run()
    except Exception as error:
        print('起動エラー:',error,file=sys.stderr)
        sys.exit(1)
