#!/bin/bash
cd "$(dirname "$0")" || exit 1
/usr/bin/env python3 autovj_launcher.py start
result=$?
if [ "$result" -ne 0 ]; then
  echo "起動時に問題が発生しました。上記の内容をご確認ください。"
fi
printf '\nこのターミナルは閉じても監視ブリッジは動作を続けます。\n'
read -r -p 'Enterでウィンドウを閉じる: ' || true
exit "$result"
