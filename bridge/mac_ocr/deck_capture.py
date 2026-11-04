"""Local-only macOS screen capture + Apple Vision OCR of deck track labels/timers."""
from __future__ import annotations
import json
import re
import shutil
import subprocess
import sys
import threading
import tempfile
from pathlib import Path
from PIL import Image
from track_bridge import DATA_DIR, track_key

CONFIG = DATA_DIR / 'deck_capture_config.json'  # same file as v5; safe migration
FIELDS = ('left_title', 'left_artist', 'right_title', 'right_artist', 'left_elapsed', 'right_elapsed')
LABELS = {'left_title':'デッキ1 曲名','left_artist':'デッキ1 アーティスト',
          'right_title':'デッキ2 曲名','right_artist':'デッキ2 アーティスト',
          'left_elapsed':'デッキ1 経過時間（正の00:00.0）',
          'right_elapsed':'デッキ2 経過時間（正の00:00.0）'}
# Based on user screenshot of 2048x1131 rekordbox PERFORMANCE two-deck layout.
# x,y,w,h are fractions; can be calibrated for another display/layout.
DEFAULT_ROIS = {
    'left_title':[0.026,0.139,0.300,0.023],
    'left_artist':[0.026,0.161,0.045,0.020],
    'right_title':[0.548,0.139,0.305,0.023],
    'right_artist':[0.548,0.161,0.047,0.020],
    'left_elapsed':[0.3833,0.1547,0.0254,0.0221],
    'right_elapsed':[0.9058,0.1547,0.0254,0.0221],
}


def default_config():
    return {'display':1,'rois':{k:v[:] for k,v in DEFAULT_ROIS.items()}}


def valid_roi(roi):
    if not isinstance(roi,(list,tuple)) or len(roi)!=4:return False
    try:x,y,w,h=(float(v) for v in roi)
    except (ValueError,TypeError):return False
    return 0 <= x <= 1 and 0 <= y <= 1 and 0.003 < w <= 1-x and 0.003 < h <= 1-y


def read_config():
    cfg=default_config()
    try:
        raw=json.loads(CONFIG.read_text(encoding='utf-8'))
        disp=int(raw.get('display',1))
        if 1 <= disp <= 8:cfg['display']=disp
        for k,v in raw.get('rois',{}).items():
            if k in FIELDS and valid_roi(v):cfg['rois'][k]=list(v)
    except (ValueError,TypeError,OSError,AttributeError):pass
    return cfg


def save_config(cfg):
    DATA_DIR.mkdir(parents=True,exist_ok=True)
    data=default_config();data['display']=int(cfg['display'])
    for k in FIELDS:
        if not valid_roi(cfg['rois'][k]):raise ValueError(f'Invalid ROI: {k}')
        data['rois'][k]=[round(float(v),6) for v in cfg['rois'][k]]
    tmp=CONFIG.with_suffix('.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    tmp.replace(CONFIG)


def roi_box(roi,size):
    if not valid_roi(roi):raise ValueError('invalid region')
    width,height=size;x,y,w,h=roi
    l=max(0,min(width-1,round(x*width)));t=max(0,min(height-1,round(y*height)))
    r=min(width,max(l+1,round((x+w)*width)))
    b=min(height,max(t+1,round((y+h)*height)))
    return l,t,r,b


def screenshot(display=1):
    if sys.platform!='darwin':raise RuntimeError('画面取得はmacOS専用です')
    with tempfile.TemporaryDirectory(prefix='autovj-screen-') as d:
        path=Path(d)/'capture.png'
        cmd=['/usr/sbin/screencapture','-x','-D',str(int(display)),str(path)]
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=15)
        if p.returncode!=0 or not path.exists():
            raise RuntimeError('画面を取得できません: '+(p.stderr or '画面収録の権限を確認してください')[:160])
        with Image.open(path) as im:return im.convert('RGB').copy()


def clean_ocr(raw):
    s=re.sub(r'\s+',' ',str(raw or '')).strip(' |\t:、·')
    if s in ('1','2','00:00','0','—','-'):return ''
    return s[:180]


class VisionOCR:
    def __init__(self,package_dir):
        self.source=Path(package_dir)/'native_vision_ocr.swift'
        self.binary=Path(package_dir)/'.native'/'autovj_vision_ocr'
        self.compile_lock=threading.Lock()
    def ensure(self):
        with self.compile_lock:
            self._ensure_locked()

    def _ensure_locked(self):
        if sys.platform!='darwin':raise RuntimeError('Apple VisionはmacOS専用です')
        if self.binary.exists() and self.binary.stat().st_mtime>=self.source.stat().st_mtime:return
        if shutil.which('xcrun') is None:raise RuntimeError('xcrunが見つかりません。xcode-select --install が必要です')
        self.binary.parent.mkdir(parents=True,exist_ok=True)
        proc=subprocess.run(['xcrun','swiftc','-O',str(self.source),'-o',str(self.binary)],capture_output=True,text=True,timeout=150)
        if proc.returncode:raise RuntimeError('Apple Visionのビルドに失敗: '+(proc.stderr or '')[-550:])
    def recognize(self,pieces, *, fast=False):
        self.ensure()
        with tempfile.TemporaryDirectory(prefix='autovj-ocr-') as d:
            paths=[]
            for i,item in enumerate(pieces):
                im=item.convert('RGB')
                if im.height<64:
                    factor=max(2,min(4,round(90/max(1,im.height))))
                    im=im.resize((im.width*factor,im.height*factor),Image.Resampling.LANCZOS)
                path=Path(d)/f'{i}.png';im.save(path);paths.append(str(path))
            proc=subprocess.run([str(self.binary),*(['--fast'] if fast else []),*paths],capture_output=True,text=True,timeout=30)
            if proc.returncode:raise RuntimeError('Vision OCR エラー: '+proc.stderr[:300])
            data=json.loads(proc.stdout)
            if not isinstance(data,list) or len(data)!=len(paths):raise ValueError('Vision OCRの応答形式が不正')
            return [clean_ocr(v.get('text','')) for v in data]


def capture_and_read(ocr,cfg):
    image=screenshot(cfg['display'])
    recognized=ocr.recognize([image.crop(roi_box(cfg['rois'][name],image.size)) for name in FIELDS])
    tracks={}
    for side,index in (('left',0),('right',2)):
        title=clean_ocr(recognized[index]);artist=clean_ocr(recognized[index+1])
        tracks[side]={'artist':artist,'title':title} if title and artist else None
    return tracks,{'left':recognized[4],'right':recognized[5]}


class DeckStabilizer:
    """Require two same readings before track is considered loaded."""
    def __init__(self,required=2):
        self.required=required
        self.raw={s:None for s in ('left','right')}
        self.count={s:0 for s in ('left','right')}
        self.tracks={s:None for s in ('left','right')}
    def update(self,tracks):
        changed=[]
        for side in ('left','right'):
            track=tracks.get(side)
            key=track_key(track) if track and track.get('artist') and track.get('title') else None
            if key==self.raw[side]:self.count[side]+=1
            else:self.raw[side]=key;self.count[side]=1
            if key and self.count[side]>=self.required and (not self.tracks[side] or track_key(self.tracks[side])!=key):
                self.tracks[side]=track
                changed.append((side,track))
        return changed


def capture_elapsed_fast(ocr, cfg):
    """Dedicated timer-only, speed-first OCR. One capture, two short timer ROIs."""
    shot = screenshot(cfg['display'])
    crops = [shot.crop(roi_box(cfg['rois'][name], shot.size))
             for name in ('left_elapsed', 'right_elapsed')]
    values = ocr.recognize(crops, fast=True)
    return {'left': values[0], 'right': values[1]}
