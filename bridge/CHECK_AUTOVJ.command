#!/bin/bash
cd "$(dirname "$0")" || exit 1
/usr/bin/env python3 autovj_launcher.py status
read -r -p 'Enterでウィンドウを閉じる: ' || true
