#!/usr/bin/env python3
"""Manual and one-click macOS launchers for AutoVJ Web.

This program does not change the web app, store tokens in URLs, or collect
screenshots/audio. Browser windows use the user's normal browser profile.
"""
from __future__ import annotations
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time

from bridge_http import normalize_url, request

BRIDGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BRIDGE_DIR.parent
CONFIG = BRIDGE_DIR / 'bridge_config.json'
STATE_DIR = Path.home() / 'Library' / 'Application Support' / 'AutoVJ'
SETTINGS = STATE_DIR / 'launcher_settings.json'
PIDFILE = STATE_DIR / 'bridge_pid.json'
LOGFILE = STATE_DIR / 'bridge.log'
DEFAULTS = {'browser':'Google Chrome', 'launch_rekordbox':True, 'open_output':True}

CHROME_SCRIPT = r'''on run argv
  set homeURL to item 1 of argv
  set outputURL to item 2 of argv
  set shouldOutput to (item 3 of argv is "true")
  tell application "Google Chrome"
    activate
    set liveFound to false
    set outputFound to false
    repeat with w in windows
      repeat with t in tabs of w
        try
          set currentURL to URL of t as text
          if currentURL is homeURL then set liveFound to true
          if currentURL is outputURL then set outputFound to true
        end try
      end repeat
    end repeat
    if not liveFound then
      set liveWin to make new window
      set URL of active tab of liveWin to homeURL
    end if
    if shouldOutput and not outputFound then
      set outWin to make new window
      set URL of active tab of outWin to outputURL
    end if
  end tell
end run'''

SAFARI_SCRIPT = r'''on run argv
  set homeURL to item 1 of argv
  set outputURL to item 2 of argv
  set shouldOutput to (item 3 of argv is "true")
  tell application "Safari"
    activate
    set liveFound to false
    set outputFound to false
    repeat with d in documents
      try
        set currentURL to URL of d as text
        if currentURL is homeURL then set liveFound to true
        if currentURL is outputURL then set outputFound to true
      end try
    end repeat
    if not liveFound then make new document with properties {URL:homeURL}
    if shouldOutput and not outputFound then make new document with properties {URL:outputURL}
  end tell
end run'''


def read_json(path, default):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else default.copy()
    except (OSError, ValueError):
        return default.copy()


def private_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as file:
        temp = Path(file.name)
        try:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.close()
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)


def load_bridge_config(*, prompt=False, edit=False):
    c = read_json(CONFIG,{})
    url = c.get('url') if isinstance(c.get('url'), str) else ''
    token = c['token'].strip() if isinstance(c.get('token'), str) else ''
    if prompt and (edit or not url):
        suffix = '［Enterで保存済みURLを使用］' if url else ''
        url = input(f'AutoVJのVercel本番URL{suffix}: ').strip() or url
    if not url or (not token and not prompt):
        raise ValueError('CONFIGURE_AUTOVJ.command でVercelの本番URLと連携トークンを設定してください。')
    url = normalize_url(url)
    if prompt and (edit or not token):
        suffix = '［Enterで保存済みの値を使用］' if token else ''
        token = getpass.getpass(f'AUTOVJ_ACCESS_TOKEN{suffix}: ').strip() or token
    if not re.fullmatch(r'[ -~]{16,}', token):
        raise ValueError('連携トークンには16文字以上の半角英数字・半角記号を使用してください。CONFIGURE_AUTOVJ.command で変更できます。')
    updated = {**c, 'url': url, 'token': token}
    if prompt:
        if updated != c:
            private_write(CONFIG, updated)
        elif CONFIG.stat().st_mode & 0o077:
            CONFIG.chmod(0o600)
    return updated


def check_connection():
    c = load_bridge_config()
    request(c['url'], c['token'])
    print('HTTP 200 / AutoVJ認証とUpstash Redisの読み取りを確認しました。')
    print('書き込みは START_BRIDGE.command の「接続成功 / OCR状態の書き込みを確認」で確認できます。')


def ask_bool(text, default):
    mark='Y/n' if default else 'y/N'
    result=input(f'{text} [{mark}]: ').strip().lower()
    return default if not result else result in ('y','yes','はい','1')


def configure():
    c = load_bridge_config(prompt=True, edit=True)
    settings = {**DEFAULTS, **read_json(SETTINGS,{})}
    print('\n起動設定（あとから CONFIGURE_AUTOVJ.command で変更できます）')
    current=settings.get('browser','Google Chrome')
    print(f'ブラウザの選択: 1 Google Chrome / 2 Safari（現在: {current}）')
    sel=input('選択 [Enterで現状のまま / 1 / 2]: ').strip()
    if sel in ('1','2'):
        settings['browser']='Google Chrome' if sel=='1' else 'Safari'
    settings['launch_rekordbox']=ask_bool('rekordboxを開き、最後に前面へ戻す',bool(settings['launch_rekordbox']))
    settings['open_output']=ask_bool('プロジェクター出力画面も開く',bool(settings['open_output']))
    private_write(SETTINGS,settings)
    print('保存しました。秘密トークンは bridge_config.json のみに保管します。')
    return c,settings


def ensure_venv():
    req=BRIDGE_DIR/'requirements.txt'
    venv=BRIDGE_DIR/'.venv'
    py=venv/'bin'/'python'
    if not py.is_file():
        print('Python仮想環境を準備しています（初回のみ）...',flush=True)
        subprocess.run([sys.executable,'-m','venv',str(venv)],check=True)
    expected=hashlib.sha256(req.read_bytes()).hexdigest()
    marker=venv/'.autovj_requirements.sha256'
    okay=subprocess.run([str(py),'-c','import PIL, certifi'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
    # Existing working v6.2 environments should not waste time reinstalling pip packages.
    # If a known requirements revision changes, reinstall to reconcile it.
    mismatch = marker.is_file() and marker.read_text().strip()!=expected
    if not okay or mismatch:
        print('必要なPythonライブラリを確認・インストールしています...',flush=True)
        subprocess.run([str(py),'-m','pip','install','-r',str(req)],check=True,cwd=str(BRIDGE_DIR))
    if not marker.is_file() or mismatch:
        marker.write_text(expected,encoding='utf-8')
    return py


def is_our_process(pid):
    if not isinstance(pid,int) or pid <= 1:
        return False
    try:
        p=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True,timeout=3)
        command=p.stdout.strip()
    except (subprocess.SubprocessError,OSError):
        return False
    # Only manage an exact interpreter process started with this bridge file.
    return p.returncode==0 and str(BRIDGE_DIR/'rekordbox_bridge.py') in command


def existing_bridge():
    stored=read_json(PIDFILE,{})
    pid=stored.get('pid')
    return pid if is_our_process(pid) else None


def other_bridge_process():
    # Don't run two OCR processes concurrently; do not try to control an external one.
    try:
        res=subprocess.run(['ps','-axo','pid=,command='],capture_output=True,text=True,timeout=4,check=True)
        for line in res.stdout.splitlines():
            match=re.match(r'^\s*(\d+)\s+(.*)$',line)
            if match and 'rekordbox_bridge.py' in match.group(2) and int(match.group(1))!=os.getpid():
                if '.py ' in match.group(2) or match.group(2).endswith('rekordbox_bridge.py'):
                    return int(match.group(1))
    except (subprocess.SubprocessError,OSError):
        pass
    return None


def launch_bridge():
    pid=existing_bridge()
    if pid:
        print(f'✓ 監視ブリッジは起動済み（PID {pid}）。二重起動しません。')
        return pid
    external=other_bridge_process()
    if external:
        print(f'! 別の監視ブリッジ（PID {external}）が動作しているため追加起動しません。')
        return None
    py=ensure_venv()
    STATE_DIR.mkdir(parents=True,exist_ok=True)
    with LOGFILE.open('a',encoding='utf-8') as log:
        log.write('\n=== AutoVJ launcher started '+time.strftime('%Y-%m-%d %H:%M:%S')+' ===\n')
        log.flush()
        p=subprocess.Popen([str(py),str(BRIDGE_DIR/'rekordbox_bridge.py')],cwd=str(BRIDGE_DIR),
                           stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,
                           start_new_session=True,close_fds=True)
    private_write(PIDFILE,{'pid':p.pid,'script':str(BRIDGE_DIR/'rekordbox_bridge.py')})
    time.sleep(.35)
    if p.poll() is not None:
        print('! ブリッジが起動直後に停止しました。ログを確認してください:',LOGFILE)
        return None
    print(f'✓ 監視ブリッジを起動（PID {p.pid}）')
    return p.pid


def open_web(url, settings):
    browser=settings['browser']
    home=url+'/'
    output=url+'/output.html'
    which='true' if settings['open_output'] else 'false'
    script=CHROME_SCRIPT if browser=='Google Chrome' else SAFARI_SCRIPT
    cmd=['/usr/bin/osascript','-e',script,home,output,which]
    try:
        subprocess.run(cmd,check=True,capture_output=True,text=True,timeout=25)
        print('✓ '+browser+'でDJ LIVE'+('とプロジェクター出力' if settings['open_output'] else '')+'を開きました。')
        return True
    except (subprocess.SubprocessError,OSError) as err:
        print('! ブラウザ自動操作に失敗しました。macOSの「オートメーション」の許可を確認してください。',flush=True)
        if isinstance(err,subprocess.CalledProcessError):
            print('  '+(err.stderr or '').strip()[-400:])
        # GUI automation failure must never block the rest of startup.
        try:
            subprocess.run(['/usr/bin/open','-a',browser,home],check=True,timeout=12)
            if settings['open_output']:
                print('  出力画面はDJ LIVEの「プロジェクター出力を開く」から開いてください。')
            return False
        except (subprocess.SubprocessError,OSError):
            print('ブラウザを開けませんでした。手動でURLを開いてください:',home)
            return False


def front_rekordbox():
    try:
        subprocess.run(['/usr/bin/open','-a','rekordbox'],check=True,capture_output=True,text=True,timeout=15)
        print('✓ rekordboxを開き、画面監視のため前面に表示しました。')
    except (subprocess.SubprocessError,OSError):
        print('! rekordboxを開けません。インストール先やアプリ名を確認してください。')


def start():
    if sys.platform!='darwin':
        raise RuntimeError('この起動ツールはmacOS専用です。')
    c = load_bridge_config(prompt=True)
    s = {**DEFAULTS, **read_json(SETTINGS,{})}
    if not SETTINGS.is_file():
        private_write(SETTINGS,s)
    print('AutoVJ One Click — 起動中\n')
    launch_bridge()
    open_web(c['url'],s)
    if s['launch_rekordbox']:
        front_rekordbox()
    print('\n起動操作は完了しました。実際の接続状態はDJ LIVE画面で確認してください。')
    print('初回は「設定」でMacブリッジ監視をON、iPad操作をONにしてください（以後はブラウザに保存）。')
    print('プロジェクターへ出力画面を移動する操作は、ディスプレイ配置により手動確認が必要です。')
    print('監視ログ:',LOGFILE)


def start_bridge():
    if sys.platform != 'darwin':
        raise RuntimeError('この起動ツールはmacOS専用です。')
    if existing_bridge() or other_bridge_process():
        raise RuntimeError('監視ブリッジは起動済みです。既存のターミナルでCtrl+C、またはSTOP_AUTOVJ.commandで停止してください。')
    py = ensure_venv()
    os.execv(py, [str(py), str(BRIDGE_DIR/'rekordbox_bridge.py')])


def stop():
    pid=existing_bridge()
    if not pid:
        print('この起動ツールで起動した監視ブリッジは見つかりません。')
        return
    os.kill(pid,signal.SIGTERM)
    try: PIDFILE.unlink()
    except OSError: pass
    print(f'監視ブリッジ（PID {pid}）を停止しました。rekordbox・ブラウザは閉じません。')


def status():
    pid=existing_bridge()
    print('ブリッジ:',f'起動中 (PID {pid})' if pid else '未起動 / このツールの管理外')
    print('ログ:',LOGFILE)
    if LOGFILE.is_file():
        print('最近のログ（トークンは表示しません）:')
        for line in LOGFILE.read_text(encoding='utf-8',errors='replace').splitlines()[-8:]:
            print(' ',line[:220])


def main(argv=None):
    ap=argparse.ArgumentParser(description='AutoVJ Mac one-click startup')
    actions = {'start': start, 'configure': configure, 'stop': stop, 'status': status,
               'start-bridge': start_bridge, 'check-connection': check_connection}
    ap.add_argument('action', nargs='?', choices=actions, default='start')
    args=ap.parse_args(argv)
    try:
        actions[args.action]()
        return 0
    except (ValueError,RuntimeError,subprocess.CalledProcessError,EOFError,PermissionError) as e:
        print('起動操作エラー:',e,file=sys.stderr)
        return 1

if __name__=='__main__':
    sys.exit(main())
