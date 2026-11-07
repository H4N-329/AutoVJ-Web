#!/usr/bin/env python3
"""One-click macOS launcher for AutoVJ Web v6.2.x.

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
import time
from urllib.parse import urlsplit

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
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def normalize_url(raw):
    url = raw.strip().rstrip('/')
    parsed = urlsplit(url)
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost','127.0.0.1')):
        raise ValueError('https:// で始まる公開URL（またはローカルテスト用http://localhost）を指定してください。')
    if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
        raise ValueError('URLは AutoVJ Web のトップページのURLだけを指定してください。')
    if any(ch in url for ch in ('\n','\r','\x00')):
        raise ValueError('URLに不正な文字が含まれています。')
    return url


def load_setup(interactive=True):
    settings = {**DEFAULTS, **read_json(SETTINGS,{})}
    c = read_json(CONFIG,{})
    if c.get('url'):
        c['url'] = normalize_url(c['url'])
    if interactive and not c.get('url'):
        print('初回設定：Vercelに公開したAutoVJのURLを入力してください。')
        c['url'] = normalize_url(input('URL: '))
    if interactive and not c.get('token'):
        c['token'] = getpass.getpass('AUTOVJ_ACCESS_TOKEN（入力は画面に表示されません）: ').strip()
    if interactive and (not c.get('token') or len(c['token']) < 16):
        raise ValueError('連携アクセストークンは16文字以上が必要です。')
    if interactive:
        private_write(CONFIG,c)
    return c, settings


def ask_bool(text, default):
    mark='Y/n' if default else 'y/N'
    result=input(f'{text} [{mark}]: ').strip().lower()
    return default if not result else result in ('y','yes','はい','1')


def configure():
    c, settings = load_setup(True)
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
    c,s=load_setup(True)
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
    ap.add_argument('action',nargs='?',choices=('start','configure','stop','status'),default='start')
    args=ap.parse_args(argv)
    try:
        {'start':start,'configure':configure,'stop':stop,'status':status}[args.action]()
        return 0
    except (ValueError,RuntimeError,subprocess.CalledProcessError,EOFError,PermissionError) as e:
        print('起動操作エラー:',e,file=sys.stderr)
        return 1

if __name__=='__main__':
    sys.exit(main())
