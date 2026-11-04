#!/usr/bin/env python3
"""Interactive, local-only calibration of rekordbox OCR rectangles for AutoVJ.

Reads the same per-user deck_capture_config.json as the Mac OCR bridge.
No screenshot is transmitted or saved by this utility; only normalized ROI values
are written when the user clicks Save. Existing configuration is backed up.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import threading
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageTk
try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
except ImportError as exc:
    raise SystemExit('tkinterが見つかりません。macOS版のPython（python.org配布など）に切り替えてください。') from exc

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'mac_ocr'))
from deck_capture import (
    CONFIG, FIELDS, LABELS, VisionOCR, default_config, read_config,
    roi_box, save_config, screenshot, valid_roi,
)
from playback_detector import parse_elapsed

FIELD_COLORS = {
    'left_title': '#50b4ff', 'left_artist': '#50b4ff',
    'right_title': '#ffb750', 'right_artist': '#ffb750',
    'left_elapsed': '#43d8c1', 'right_elapsed': '#f16ac4',
}


def point_to_image(x: float, y: float, scale: float, width: int, height: int):
    """Convert canvas content coordinates to pixel coordinates, safely clamped."""
    return (min(width, max(0, round(x / scale))),
            min(height, max(0, round(y / scale))))


def drag_to_roi(start, end, size, scale):
    """Canvas drag -> normalized x,y,w,h. The caller validates before saving."""
    w, h = size
    a = point_to_image(start[0], start[1], scale, w, h)
    b = point_to_image(end[0], end[1], scale, w, h)
    x0, x1 = sorted((a[0], b[0]))
    y0, y1 = sorted((a[1], b[1]))
    return [x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h]


class Calibrator:
    def __init__(self, root: tk.Tk, initial_image: str | None = None):
        self.root = root
        self.root.title('AutoVJ — rekordbox読み取り領域の校正 (v6.1.3)')
        self.root.geometry('1320x910')
        self.root.minsize(900, 650)
        self.root.configure(bg='#10151d')
        self.cfg = read_config()
        self.rois = {key: list(self.cfg['rois'][key]) for key in FIELDS}
        self.original_rois = {key: list(self.cfg['rois'][key]) for key in FIELDS}
        self.image: Image.Image | None = None
        self.photo = None
        self.preview_photo = None
        self.scale = 1.0
        self.drag_start = None
        self.active = tk.StringVar(value='left_elapsed')
        self.display = tk.IntVar(value=self.cfg['display'])
        self.zoom = tk.StringVar(value='全体を表示')
        self.message = tk.StringVar(value='「3秒後に画面を撮影」を押したら、rekordbox画面を前面に表示してください。')
        self.ocr_result = tk.StringVar(value='OCRテスト: 未実行')
        self.ocr_busy = False
        self._init_widgets()
        self.root.protocol('WM_DELETE_WINDOW', self._close)
        if initial_image:
            self.load_image(initial_image)

    def _init_widgets(self):
        sty = ttk.Style(self.root)
        try: sty.theme_use('clam')
        except tk.TclError: pass
        sty.configure('AVJ.TFrame', background='#10151d')
        sty.configure('AVJ.TLabel', background='#10151d', foreground='#d9e8f9', font=('Helvetica', 11))
        sty.configure('Header.TLabel', background='#10151d', foreground='#8dcaff', font=('Helvetica', 17, 'bold'))
        sty.configure('AVJ.TButton', font=('Helvetica', 11), padding=(11, 7))
        sty.configure('AVJ.TCombobox', fieldbackground='#252e3b', background='#252e3b', foreground='#111111')

        main = ttk.Frame(self.root, style='AVJ.TFrame', padding=(14, 12))
        main.pack(fill='both', expand=True)
        ttk.Label(main, text='REKORDBOX / OCR 領域調整', style='Header.TLabel').pack(anchor='w')
        ttk.Label(main, text='選択した項目の位置を画面上でドラッグして指定 → OCRを確認 → 保存。Macだけで完結します。', style='AVJ.TLabel').pack(anchor='w', pady=(5, 10))

        bar = ttk.Frame(main, style='AVJ.TFrame')
        bar.pack(fill='x', pady=(0, 9))
        ttk.Label(bar, text='画面番号', style='AVJ.TLabel').pack(side='left')
        ttk.Spinbox(bar, from_=1, to=8, textvariable=self.display, width=3).pack(side='left', padx=(5, 10))
        ttk.Button(bar, text='3秒後に画面を撮影', command=self.capture, style='AVJ.TButton').pack(side='left', padx=(0, 8))
        ttk.Button(bar, text='画像を開く', command=self.open_file, style='AVJ.TButton').pack(side='left', padx=(0, 18))
        ttk.Label(bar, text='拡大率', style='AVJ.TLabel').pack(side='left')
        zbox = ttk.Combobox(bar, textvariable=self.zoom, state='readonly', width=10,
                            values=('全体を表示', '100%', '150%'))
        zbox.pack(side='left', padx=(7, 10))
        zbox.bind('<<ComboboxSelected>>', lambda _e: self.render())
        ttk.Button(bar, text='選択領域へ移動', command=self.focus_active, style='AVJ.TButton').pack(side='left')

        body = ttk.Frame(main, style='AVJ.TFrame')
        body.pack(fill='both', expand=True)
        viewer = ttk.Frame(body, style='AVJ.TFrame')
        viewer.pack(side='left', fill='both', expand=True)
        self.canvas = tk.Canvas(viewer, bg='#070b10', cursor='crosshair', highlightthickness=1,
                                highlightbackground='#394758')
        hbar = ttk.Scrollbar(viewer, orient='horizontal', command=self.canvas.xview)
        vbar = ttk.Scrollbar(viewer, orient='vertical', command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=hbar.set, yscrollcommand=vbar.set)
        self.canvas.grid(row=0, column=0, sticky='nsew')
        vbar.grid(row=0, column=1, sticky='ns')
        hbar.grid(row=1, column=0, sticky='ew')
        viewer.rowconfigure(0, weight=1)
        viewer.columnconfigure(0, weight=1)
        self.canvas.bind('<ButtonPress-1>', self._start_drag)
        self.canvas.bind('<B1-Motion>', self._move_drag)
        self.canvas.bind('<ButtonRelease-1>', self._end_drag)

        side = ttk.Frame(body, style='AVJ.TFrame', width=305)
        side.pack(side='right', fill='y', padx=(16, 0))
        side.pack_propagate(False)
        ttk.Label(side, text='1. 調整する領域を選択', style='AVJ.TLabel').pack(anchor='w', pady=(0, 8))
        for name in ('left_elapsed','right_elapsed','left_title','left_artist','right_title','right_artist'):
            rb = tk.Radiobutton(side, variable=self.active, value=name, text=LABELS[name],
                                bg='#10151d', fg=FIELD_COLORS[name], selectcolor='#263749',
                                activebackground='#10151d', activeforeground='#ffffff', anchor='w',
                                highlightthickness=0, font=('Helvetica', 11), command=self._change_active)
            rb.pack(fill='x', pady=2)
        ttk.Label(side, text='2. ドラッグして枠を指定', style='AVJ.TLabel').pack(anchor='w', pady=(15, 6))
        self.detail = tk.Label(side, text='', wraplength=290, justify='left', fg='#abbcd0',
                               bg='#10151d', font=('Helvetica', 10))
        self.detail.pack(fill='x')
        self.preview = tk.Label(side, bg='#202b3a', relief='solid', bd=1)
        self.preview.pack(fill='x', pady=(10, 5))
        ttk.Button(side, text='選択領域のOCRをテスト', command=self.test_ocr, style='AVJ.TButton').pack(fill='x', pady=(5, 6))
        tk.Label(side, textvariable=self.ocr_result, fg='#cfe4fa', bg='#10151d',
                 wraplength=290, justify='left', font=('Helvetica', 10)).pack(fill='x')
        ttk.Label(side, text='3. 設定を保存', style='AVJ.TLabel').pack(anchor='w', pady=(18, 8))
        ttk.Button(side, text='保存（バックアップ作成）', command=self.save, style='AVJ.TButton').pack(fill='x', pady=(0, 7))
        ttk.Button(side, text='この領域を初期値に戻す', command=self.reset_current, style='AVJ.TButton').pack(fill='x')
        tk.Label(side, text='保存後は START_BRIDGE.command を再起動してください。\n画面のサイズやrekordboxのレイアウトを変えた場合は再調整が必要です。',
                 bg='#10151d', fg='#91a6bd', wraplength=290, justify='left', font=('Helvetica', 10)).pack(fill='x', pady=(22, 0))

        footer = tk.Label(main, textvariable=self.message, bg='#182537', fg='#b5d8fb',
                          anchor='w', padx=12, pady=9, font=('Helvetica', 10))
        footer.pack(fill='x', pady=(10, 0))
        self.root.bind('<Configure>', self._on_resize)

    def _on_resize(self, event):
        if event.widget is self.root and self.zoom.get() == '全体を表示' and self.image:
            if hasattr(self, '_resize_job'):
                self.root.after_cancel(self._resize_job)
            self._resize_job = self.root.after(160, self.render)

    def capture(self):
        try:
            display = int(self.display.get())
        except (tk.TclError, ValueError):
            messagebox.showerror('画面番号', '画面番号には1〜8の整数を指定してください。')
            return
        if not 1 <= display <= 8:
            messagebox.showerror('画面番号', '画面番号には1〜8の整数を指定してください。')
            return
        # Hide our own window, allowing the user time to switch to rekordbox.
        # Terminal launched by the .command script may otherwise obscure the decks.
        self.root.withdraw()
        self.root.after(3500, lambda: self._capture_hidden(display))

    def _capture_hidden(self, display):
        try:
            shot = screenshot(display)
        except Exception as exc:
            self.root.deiconify()
            messagebox.showerror('画面取得に失敗', str(exc))
            return
        self.root.deiconify()
        self.root.lift()
        self.image = shot
        self.cfg['display'] = display
        self.ocr_result.set('OCRテスト: 未実行')
        self.render()
        self.message.set(f'画面 {display} を撮影しました（{shot.width} × {shot.height}）。時刻の枠をドラッグしてください。')

    def open_file(self):
        path = filedialog.askopenfilename(title='rekordbox画面の画像を選ぶ',
                   filetypes=[('画像', '*.png *.jpg *.jpeg *.webp'),('すべてのファイル','*.*')])
        if path: self.load_image(path)

    def load_image(self, path):
        try:
            with Image.open(path) as im: self.image = im.convert('RGB').copy()
        except Exception as exc:
            messagebox.showerror('画像を開けません', str(exc))
            return
        self.render()
        self.message.set('画像から読み取り枠を調整中です。実際のMac画面と画像のレイアウトが一致する場合のみ使ってください。')

    def render(self):
        if self.image is None: return
        img = self.image
        cw = max(300, self.canvas.winfo_width() - 12)
        ch = max(250, self.canvas.winfo_height() - 12)
        mode = self.zoom.get()
        self.scale = (min(cw / img.width, ch / img.height, 1.0) if mode == '全体を表示'
                      else (1.0 if mode == '100%' else 1.5))
        pw = max(1, round(img.width * self.scale))
        ph = max(1, round(img.height * self.scale))
        picture = img.resize((pw, ph), Image.Resampling.LANCZOS) if (pw, ph) != img.size else img
        self.photo = ImageTk.PhotoImage(picture, master=self.root)
        self.canvas.delete('all')
        self.canvas.create_image(0, 0, image=self.photo, anchor='nw')
        self.canvas.configure(scrollregion=(0, 0, pw, ph))
        self.draw_rois()
        self.update_preview()

    def draw_rois(self):
        self.canvas.delete('roi')
        if self.image is None:return
        for field, roi in self.rois.items():
            x, y, w, h = roi
            ox = x * self.image.width * self.scale
            oy = y * self.image.height * self.scale
            ww = w * self.image.width * self.scale
            hh = h * self.image.height * self.scale
            active = (field == self.active.get())
            color = FIELD_COLORS[field]
            self.canvas.create_rectangle(ox, oy, ox+ww, oy+hh, outline=color,
                                         width=3 if active else 1, dash=() if active else (4, 4), tags='roi')
            if active:
                label_text = LABELS[field].replace('（正の00:00.0）','')
                self.canvas.create_text(ox, max(12, oy-9), text=label_text, fill=color,
                                        anchor='sw', font=('Helvetica', 11, 'bold'), tags='roi')

    def _change_active(self):
        self.ocr_result.set('OCRテスト: 未実行')
        self.draw_rois()
        self.update_preview()
        self.focus_active()

    def focus_active(self):
        if self.image is None:return
        x,y,w,h = self.rois[self.active.get()]
        cx = (x + w/2) * self.image.width * self.scale
        cy = (y + h/2) * self.image.height * self.scale
        pw = self.image.width * self.scale
        ph = self.image.height * self.scale
        vw = self.canvas.winfo_width()
        vh = self.canvas.winfo_height()
        if pw > vw: self.canvas.xview_moveto(min(1, max(0, (cx-vw/2)/(pw-vw))))
        if ph > vh: self.canvas.yview_moveto(min(1, max(0, (cy-vh/2)/(ph-vh))))

    def _coord(self, event):
        return self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)

    def _start_drag(self, event):
        if self.image is None:return
        self.drag_start = self._coord(event)
        self.canvas.delete('drag')

    def _move_drag(self, event):
        if self.drag_start is None:return
        current = self._coord(event)
        self.canvas.delete('drag')
        self.canvas.create_rectangle(*self.drag_start, *current, outline='#ffffff',
                                     dash=(4, 3), width=2, tags='drag')

    def _end_drag(self, event):
        if self.drag_start is None or self.image is None:return
        candidate = drag_to_roi(self.drag_start, self._coord(event), self.image.size, self.scale)
        self.drag_start = None
        self.canvas.delete('drag')
        if not valid_roi(candidate):
            self.message.set('選択範囲が小さすぎるか、画面外です。もう少し大きい枠で指定してください。')
            return
        self.rois[self.active.get()] = candidate
        self.ocr_result.set('OCRテスト: 未実行')
        self.draw_rois()
        self.update_preview()
        self.message.set('領域を変更しました。OCRテストで認識を確認し、問題なければ「保存」を押してください。')

    def update_preview(self):
        if self.image is None:return
        field=self.active.get()
        crop=self.image.crop(roi_box(self.rois[field],self.image.size))
        size=(270, max(38, min(105, round(270 * crop.height/max(crop.width,1)))))
        preview=crop.resize(size, Image.Resampling.NEAREST)
        self.preview_photo=ImageTk.PhotoImage(preview,master=self.root)
        self.preview.configure(image=self.preview_photo)
        l,t,r,b=roi_box(self.rois[field],self.image.size)
        self.detail.configure(text=f'選択中: {LABELS[field]}\n画像内: x={l} y={t} 幅={r-l}px 高さ={b-t}px')

    def test_ocr(self):
        if self.image is None:
            messagebox.showinfo('先に撮影', '先に画面を撮影または画像を開いてください。')
            return
        if self.ocr_busy:return
        name=self.active.get()
        crop=self.image.crop(roi_box(self.rois[name],self.image.size))
        self.ocr_busy=True
        self.ocr_result.set('OCRテスト中…（初回はApple Visionをビルドします）')
        def task():
            try:
                reader=VisionOCR(HERE/'mac_ocr')
                raw=reader.recognize([crop], fast=False)[0]
                seconds=parse_elapsed(raw) if name.endswith('elapsed') else None
                result=f'認識文字: {raw!r}'
                if name.endswith('elapsed'):
                    result += (f'\n時刻解析: {seconds:.1f}秒' if seconds is not None
                               else '\n時刻解析: 失敗（正の経過時間が枠に入っているか確認）')
            except Exception as exc:
                result='OCRエラー: '+str(exc)[:180]
            self.root.after(0, lambda: self._finish_ocr(result))
        threading.Thread(target=task,daemon=True).start()

    def _finish_ocr(self,result):
        self.ocr_busy=False
        self.ocr_result.set(result)

    def reset_current(self):
        name=self.active.get()
        self.rois[name]=default_config()['rois'][name][:]
        self.ocr_result.set('OCRテスト: 未実行')
        self.draw_rois()
        self.update_preview()
        self.message.set('初期の読み取り範囲へ戻しました。保存するまでは設定ファイルは変更されません。')

    def save(self):
        if self.image is None:
            messagebox.showinfo('画面が未取得です', '校正前に「画面を撮影」してください。')
            return
        cfg={'display':int(self.display.get()),'rois':self.rois}
        try:
            for field in FIELDS:
                if not valid_roi(cfg['rois'][field]): raise ValueError(f'{LABELS[field]} の領域が不正です。')
            backup=None
            if CONFIG.exists():
                dest=CONFIG.with_name(f'deck_capture_config.backup-{datetime.now():%Y%m%d-%H%M%S}.json')
                # Avoid overwriting backups if Save is clicked more than once per second.
                if dest.exists(): dest=CONFIG.with_name(f'deck_capture_config.backup-{datetime.now():%Y%m%d-%H%M%S-%f}.json')
                shutil.copy2(CONFIG,dest)
                backup=str(dest)
            save_config(cfg)
            self.original_rois={key:self.rois[key][:] for key in FIELDS}
        except Exception as exc:
            messagebox.showerror('保存できません',str(exc))
            return
        self.message.set(f'保存しました: {CONFIG}（Macブリッジを再起動してください）')
        messagebox.showinfo('保存しました',f'保存先:\n{CONFIG}\n\n'
                            +(f'バックアップ:\n{backup}\n\n' if backup else '')
                            +'次に START_BRIDGE.command を停止・再起動してください。')

    def _close(self):
        if any(self.rois[k] != self.original_rois[k] for k in FIELDS):
            if not messagebox.askyesno('未保存の変更', '保存していない変更があります。保存せず終了しますか？'):
                return
        self.root.destroy()


def main():
    parser=argparse.ArgumentParser(description='AutoVJ rekordbox OCR calibration')
    parser.add_argument('--image',type=str,help='画面画像を指定して校正（テスト用途）')
    args=parser.parse_args()
    root=tk.Tk()
    Calibrator(root,args.image)
    root.mainloop()


if __name__=='__main__':
    main()
