#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null; then
  echo "Python 3.10以上が必要です"; read -r -p "Enterで閉じる"; exit 1
fi
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python rekordbox_bridge.py
read -r -p "Enterで閉じる" || true
