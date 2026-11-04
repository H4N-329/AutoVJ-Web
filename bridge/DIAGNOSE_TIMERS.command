#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "先に START_BRIDGE.command を起動し、Python環境を準備してください。"
  read -r -p "Enterで閉じる" || true
  exit 1
fi
.venv/bin/python diagnose_timers.py
read -r -p "Enterで閉じる" || true
