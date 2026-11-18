#!/bin/bash
cd "$(dirname "$0")" || exit 1
python=python3
if [ -x .venv/bin/python ]; then python=.venv/bin/python; fi
status=0
"$python" autovj_launcher.py check-connection || status=$?
read -r -p "Enterで閉じる" || true
exit "$status"
