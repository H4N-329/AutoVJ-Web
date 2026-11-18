#!/usr/bin/env python3
"""Local timer OCR diagnostic. Never sends screenshots or credentials to the cloud."""
from __future__ import annotations
import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'mac_ocr'))
from deck_capture import read_config, read_timers, screenshot, timer_crops, VisionOCR
from playback_detector import is_remaining_time, parse_elapsed
from track_bridge import DATA_DIR


def run(argv=None):
    parser = argparse.ArgumentParser(description='AutoVJのDECK 1/2 経過時間OCR診断')
    parser.add_argument('--samples', type=int, choices=range(1, 11), default=3, help='撮影回数（初期値3回）')
    args = parser.parse_args(argv)
    if sys.platform != 'darwin':
        print('この診断はMac専用です。')
        return 2
    cfg = read_config()
    ocr = VisionOCR(HERE / 'mac_ocr')
    ocr.ensure()
    dest = DATA_DIR / 'clock_diagnostics'
    dest.mkdir(parents=True, exist_ok=True)
    print(f'タイマー画像の保存先: {dest}')
    print('rekordboxを前面に表示してください。3秒後に読み取りを始めます。', flush=True)
    time.sleep(3)
    for index in range(args.samples):
        shot = screenshot(cfg['display'])
        crops = timer_crops(shot, cfg)
        values, sources = read_timers(ocr, crops)
        print(f'\nサンプル {index + 1}/{args.samples} / 画面 {cfg["display"]} / {shot.width}x{shot.height}', flush=True)
        for side, deck in (('left', 'DECK 1'), ('right', 'DECK 2')):
            crops[side].save(dest / f'{side}_elapsed.png')
            raw = values[side]
            seconds = parse_elapsed(raw)
            result = f'{seconds:.2f}秒 ({sources[side]})' if seconds is not None else '未取得'
            if is_remaining_time(raw):
                result = '残り時間を検出。rekordboxの表示を経過時間へ切り替えてください。'
            print(f'  {deck}: {raw!r} → {result}', flush=True)
        if index + 1 < args.samples:
            time.sleep(1)
    print('\n解析失敗の場合: 保存された left_elapsed.png / right_elapsed.png に'
          'rekordboxの正の経過時間 (00:12.3等) が写っているか確認してください。')
    print('枠がずれているときは CALIBRATE_REKORDBOX.command で該当デッキの経過時間の枠を調整してください。')
    print('この診断はスクリーンショット全体を保存・送信しません。'
          '小さなタイマー部分の画像だけをMac内に保存します。')
    return 0


if __name__=='__main__':
    try:
        raise SystemExit(run())
    except Exception as exc:
        print('診断失敗:',str(exc),file=sys.stderr)
        raise SystemExit(1)
