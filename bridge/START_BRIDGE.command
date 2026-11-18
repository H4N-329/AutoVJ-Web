#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null; then
  echo "Python 3.10以上が必要です"; read -r -p "Enterで閉じる"; exit 1
fi
status=0
python3 autovj_launcher.py start-bridge || status=$?
read -r -p "Enterで閉じる" || true
exit "$status"
