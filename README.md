> **v6.1.1修正:** Mac側の「設定」「MV検索」タブが反応しない問題を修正しました。すでに公開済みの場合は `FIX_NOTES_JA.md` に従い、`assets/app.js` だけを更新できます。

# AutoVJ Web v6.1.1 — MacでDJ / iPadでVJ操作

v6.0をベースに、**Mac側のDJ LIVEと出力ウィンドウをそのまま利用し、iPadからTAKEや映像補正を遠隔操作**する機能を追加しました。

**A方式（推奨）:** Macでrekordbox + MacのブラウザでAutoVJ DJ LIVE + Macの外部ディスプレイにYouTube MVを上映。iPad第6世代のSafariから専用コントローラーを開き、Wi-Fiまたはモバイル通信でMacを操作します。

**映像ファイルやYouTube動画をiPadへ転送しません。** iPadのサムネイル・独立したMV確認プレーヤーはMacの上映映像とフレーム同期しません。上映する動画はMac上で再生されます。

## 主な機能

| 項目 | 内容 |
| --- | --- |
| v6.0のDJ LIVE / MV検索 / YouTube選択 | 継続対応 |
| 左右のサブプレビュー / TAKE / ARM | 継続対応 |
| 映像±1秒・±5秒 / 曲ごとのオフセット / MV+0.5秒先行 | 継続対応 |
| デッキ情報のOCR監視 | Macブリッジ＋画面収録許可が必要 |
| MVの自動同期 | Macの経過時間とYouTubeの出力時刻に基づく推定補正 |
| iPadリモートコントローラー | **追加** `controller.html` |
| ペアリングコード / 接続状態 | **追加** Mac DJ LIVEから発行 |
| iPadからTAKE・ARM・映像補正・MV候補操作 | **追加** |
| Mac出力状態・曲名・映像サムネイルをiPadに表示 | **追加** |
| オフライン誤操作抑制 | **追加** Macが応答していないとき操作ボタンを無効化 |

**デッキの経過時間や映像再生時刻が届かなければ同期しません。** rekordboxの非公開APIを使用せず、OCRによる推定です。DJ音源とMVの編集が異なる曲、ループ・スクラッチ、動画のネットワークバッファリングではズレが残ります。

## ファイル構成

- `index.html`：Mac用DJ LIVE（v6.0機能継承）＋iPadペアリング
- `output.html`：Macの外部ディスプレイ向け上映ページ
- `controller.html`：iPad第6世代向けタッチコントローラー
- `assets/`：UI・YouTubeプレーヤー・iPad制御・Macのリモート接続処理
- `api/youtube-search.js`：YouTube Data APIプロキシ
- `api/bridge.js`：Mac OCRブリッジの情報取得
- `api/remote.js`：iPad↔Macのセッション状態と操作キュー
- `bridge/`：Macでrekordbox画面をOCRする補助プログラム
- `tests/`：API/ペアリング/操作のテスト
- `DEPLOY_GUIDE_JA.md`, `IPAD_SETUP_JA.md`：デプロイとiPad設定

## 最短セットアップ

1. このフォルダの**中身**をGitHubリポジトリ直下へアップロード。
2. VercelでFramework Preset `Other` としてデプロイ。
3. VercelのEnvironment Variablesに `YOUTUBE_API_KEY`, `AUTOVJ_ACCESS_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` を設定してRedeploy。**iPadリモートにはRedisが必須**です。
4. MacのSafari/Chromeで `https://YOUR-APP.vercel.app/` を開く。「設定」→アクセストークンを入力し保存。**Macでプロジェクター出力ウィンドウを開く。**
5. MacのDJ LIVEで「iPad操作を有効化」をONにして接続コードとiPad用URLを確認。
6. iPadのSafariで表示された `https://YOUR-APP.vercel.app/controller.html?session=XXXXXXXX` を開く（URLに秘密のトークンは付けません）。同じアクセストークンをiPadで入力して接続。
7. iPadでデッキ情報・Mac出力状態が表示されれば、手動TAKEを試す。
8. rekordboxを自動追従させる場合はMacで `bridge/START_BRIDGE.command` を起動し、Mac側の「Macブリッジの監視を有効化」をONにする。

詳細は `IPAD_SETUP_JA.md` と `DEPLOY_GUIDE_JA.md` に記載。

## 重要な設計仕様

- **Macが再生・同期の主体。** MacのDJ LIVEページがクラウドから指示を取り、Mac同一ブラウザの`output.html`へBroadcastChannelで送る構成です。MacのDJ LIVE・出力ページを両方開き続けてください。
- **iPadは操作専用。** iPadからYouTubeを直接上映しません。古いiPad向けに通常はサムネイルのみ表示。MV確認を押した場合だけ独立した公式埋め込みプレーヤーが開きます。
- **通信方法:** Vercel Functions＋Upstash Redis REST。接続状態の有効期限は約14秒、操作は最大30秒程度の鮮度で処理され、古い操作を再接続時に一斉実行しない設計です。実際の遅延は回線次第です。
- **セキュリティ:** `AUTOVJ_ACCESS_TOKEN`が必要。iPadの接続コード**だけでは接続できません**。トークンはURLに載せず、iPadではセッション中のみ保持が初期設定（保存は明示した場合のみ）。HTTPSで利用してください。
- **Macがオフラインの場合:** iPadから操作できないようにし、復帰後に古いTAKEを再実行しないようにしています。MacがオフラインでもMacの出力は既に再生中なら継続し得ますが、回線状況次第です。
- **費用:** 通信はAPIポーリング方式なのでVercel FunctionsとUpstashの実行回数を消費します。イベントの前後にはMac側の「iPad操作を有効化」をOFFにして無駄な通信を止めてください。
- **混雑した会場Wi-Fi:** 通信遅延でTAKEが数秒遅れる場合があります。iPadのボタン操作と音が鳴る瞬間の厳密な同期は保証しません。重要な場面はMacの手動操作でも対応できるようにしてください。
- **iPad第6世代:** HDMIの独立した拡張表示には依存しません。iPadからの映像出力は本モードでは使用しません。

## データ移行とデータ保持

v6.0の `localStorage` に保存した設定・曲とMVの紐づけ・オフセットは、キーを変更していないため、**同じURL・同じMacブラウザプロファイルを使う場合**は基本的に保持されます。VercelでURLが変わった場合、設定タブのバックアップ機能やv5.9 JSONファイルからの再取り込みが必要です。iPad側には紐付けをコピーせず、Macから現在の情報だけを表示します。

`AUTOVJ_ACCESS_TOKEN` はGitHubに載せないでください。`.env.example` の値は実際のキーではありません。

## 動作テスト

```bash
node --test tests/*.test.cjs
node --check api/remote.js
node --check assets/controller.js
node --check assets/remote-host.js
python3 -m compileall -q bridge
```

UIのみ確認する場合は `python3 -m http.server 8000` で表示できます。ただし、**リモート連携とYouTube検索はVercelのAPIおよび環境変数を設定しないと動きません。** 本番のrekordbox/Mac/iPad/HDMI/YouTube再生を使った統合試験は未実施です。

**YouTube利用上の注意:** 本アプリは公式IFrame APIを使用し、YouTube動画を保存・ダウンロードしません。埋め込み・自動再生が禁止された動画は再生できません。イベント会場での上映には、YouTubeの利用規約と必要な権利・利用許諾を別途確認してください。
