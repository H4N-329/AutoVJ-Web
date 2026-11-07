# AutoVJ Web v6.4 — HYBRID Local / YouTube Switch

rekordboxの曲名・経過時間のOCR監視、YouTube公式MV検索・再生、iPad第6世代からの遠隔操作、曲別MV事前設定に加えて、**許諾済みローカル動画の裏再生と0.5〜1秒のクロスフェード**を追加したバージョンです。

- **YouTube MV**: 現在出力を維持し、旧DECKの停止確定後に再生位置を合わせて切り替え。YouTubeプレーヤーの非表示再生・重ね合わせは行いません。
- **ローカル動画（MP4/WebM/MOV）**: Mac ChromeのIndexedDBに保存。ロード時に準備し、MIX中の次デッキ再生に追従。ローカル→ローカルのTAKEでは0.5〜1秒のクロスフェード。
- **iPad第6世代**: 操作端末。ローカル映像データの転送は不要。
- **ファイル保存**: 動画はMacブラウザ内のみ。Vercel・Redisにはアップロードしません。
- **互換性**: v6.3以前のYouTube MV紐付け、Macブリッジ、OneClick Launcherと同じ保存キー・起動構成を維持。

導入手順は **`HYBRID_MODE_GUIDE_JA.md`** を参照してください。

重要: プロジェクター出力側のローカル動画ファイルを読み取るため、DJ LIVEも出力画面も、ファイル登録に使用したMacのChrome（同じプロフィールと同じVercel URL）で開いてください。ブラウザのサイトデータ削除でローカル動画の保存も消える場合があります。別のMacへ移動する場合は動画ファイルを再登録してください。

**動作確認**：Node.jsでの新旧ロジック/APIユニットテスト合格。Mac実機・Chromeでの実動画クロスフェード、およびrekordbox/YouTube/iPadの統合テストは未検証です。
