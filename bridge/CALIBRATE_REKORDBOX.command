#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null; then
  echo "Python 3 が必要です。"
  read -r -p "Enterで閉じる" || true
  exit 1
fi
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'from PIL import Image; import tkinter' >/dev/null 2>&1; then
  echo "校正に必要なPillowを確認・インストールします（tkinterはMacのPythonに必要です）。"
  .venv/bin/python -m pip install -r requirements.txt || true
fi
if ! .venv/bin/python -c 'from PIL import Image; import tkinter' >/dev/null 2>&1; then
  echo "tkinter/Pillowが使えません。macOS版PythonとPillowのインストールを確認してください。"
  read -r -p "Enterで閉じる" || true
  exit 1
fi
.venv/bin/python calibrate_regions.py || {
  echo "校正画面を開けませんでした。エラーの内容を確認してください。"
  read -r -p "Enterで閉じる" || true
  exit 1
}
