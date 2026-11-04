#!/usr/bin/env python3
"""Local timer OCR diagnostic. Never sends screenshots or credentials to the cloud."""
from __future__ import annotations
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'mac_ocr'))
from deck_capture import read_config, screenshot, roi_box, VisionOCR
from playback_detector import parse_elapsed
from track_bridge import DATA_DIR


def run():
    if sys.platform != 'darwin':
        print('この診断はMac専用です。')
        return 2
    cfg = read_config()
    ocr = VisionOCR(HERE / 'mac_ocr')
    ocr.ensure()
    shot = screenshot(cfg['display'])
    dest = DATA_DIR / 'clock_diagnostics'
    dest.mkdir(parents=True, exist_ok=True)
    crops=[]
    names=('left_elapsed','right_elapsed')
    for name in names:
        crop=shot.crop(roi_box(cfg['rois'][name], shot.size))
        crop.save(dest/(name+'.png'))
        crops.append(crop)
    print(f'画面: display={cfg["display"]} / 解像度={shot.size[0]}x{shot.size[1]}')
    print(f'タイマー画像の保存先: {dest}')
    for fast in (True,False):
        texts=ocr.recognize(crops,fast=fast)
        print('\nOCR方式:', '高速' if fast else '高精度')
        for side,raw in zip(('DECK 1','DECK 2'),texts):
            seconds=parse_elapsed(raw)
            print(f'  {side}: raw={raw!r} -> {seconds if seconds is not None else "解析失敗"}')
    print('\n解析失敗の場合: 保存された left_elapsed.png / right_elapsed.png に'
          'rekordboxの正の経過時間 (00:12.3等) が写っているか確認してください。')
    print('枠がずれているときは ~/Documents/DJ/AutoVJ_Data/deck_capture_config.json の'
          ' left_elapsed / right_elapsed を校正してください。')
    print('この診断はスクリーンショット全体を保存・送信しません。'
          '小さなタイマー部分の画像だけをMac内に保存します。')
    return 0


if __name__=='__main__':
    try:
        raise SystemExit(run())
    except Exception as exc:
        print('診断失敗:',str(exc),file=sys.stderr)
        raise SystemExit(1)
