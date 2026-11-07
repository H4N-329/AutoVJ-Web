# AutoVJ Web v6.2.1｜Macワンクリック起動

## できること

`bridge/START_AUTOVJ.command` を**1回起動**すると、次の順に自動処理します。

1. `rekordbox_bridge.py` の二重起動を確認して、動いていなければ監視を開始。
2. 普段使っているChrome（またはSafari）で、Vercel公開済みの **DJ LIVE** を開く。
3. ブラウザの別ウィンドウに **プロジェクター出力画面** を開く。
4. rekordboxを起動／前面へ移動して、画面OCRで読み取れる状態にする。

**再度起動しても**、この起動ツール自身が管理しているMac監視プログラムを二重起動しません。同じブラウザ・URLのDJ LIVEと出力ウィンドウが開いている場合は再利用を試みます。

YouTube APIキー、Redis URL、Redisトークンは、これまでどおり **Vercel環境変数** のままです。Mac起動スクリプトにはコピーしません。

## 既存v6.2への導入（推奨）

1. 既存の`bridge/START_BRIDGE.command`が起動中なら、ターミナルで **Ctrl+C** を押して停止する。
2. **Mac用起動パッチ**ZIPを解凍し、その中の `bridge/` のファイルを既存AutoVJの `bridge/` に上書きコピーする。**既存の `bridge_config.json`・`.venv`・`mac_ocr/` は消さない**。
3. Macで `bridge/START_AUTOVJ.command` を右クリック→**開く**。初回に必要ならVercel URLと連携アクセストークンを入力する。後の起動では再入力不要。
4. 初回はブラウザの「オートメーション」許可を求められる場合があるため、macOSの指示に沿って許可する。拒否した場合はDJ LIVEのみ開き、出力画面はDJ LIVEのボタンから開く。
5. **最初の1回だけ**、プロジェクター出力ウィンドウをHDMI側の外部ディスプレイへ移動し、全画面表示にする。ブラウザは終了時に窓位置を復元する場合がありますが、毎回の復元を保証できません。
6. ChromeのAutoVJ「設定」で「Macブリッジの監視を有効化」をONにして保存し、DJ LIVEの「iPad操作を有効化」をONにする。**このWeb設定は同じURL・同じブラウザプロファイルなら保存される**。
7. iPad第6世代ではSafariでAutoVJのペアリングURLを開き、必要ならホーム画面に追加。iPadの画面をMacから無断で起動することはできません。

以後は基本的に **Macで `START_AUTOVJ.command`、iPadでホーム画面のAutoVJアイコンを開いて「接続する」を押す** だけで開始できます。iPadのアクセストークンを「記憶する」にしておけば毎回の再入力は省けます（共有端末では推奨しません）。初回の画面共有権限やYouTubeの再生許可は別途操作が必要です。

### 初回のSafari・Chrome設定を変更したいとき

`bridge/CONFIGURE_AUTOVJ.command` を開くと選択できます。

- 使うブラウザ（Chrome / Safari）
- rekordboxも自動で開くか
- プロジェクター出力も自動で開くか

## 終了と接続診断

- `bridge/STOP_AUTOVJ.command`：**このランチャーが管理している監視ブリッジだけ**を停止。rekordboxやブラウザは閉じない。
- `bridge/CHECK_AUTOVJ.command`：ブリッジの稼働状態と最近のログを表示。
- ログ：`~/Library/Application Support/AutoVJ/bridge.log`
- ブリッジ接続設定：`bridge/bridge_config.json`（トークン含む・第三者に渡さない）
- ランチャー設定：`~/Library/Application Support/AutoVJ/launcher_settings.json`

Macの画面監視権限は利用するターミナル／Pythonに必要です。以前動作していたブリッジの権限は通常そのまま使えますが、実行元が変わると再許可が必要になる場合があります。

## DJ本番前のチェック

- Macのrekordboxで曲名と再生時間が正しく見えている
- DJ LIVEのDECK 1・2に曲名・時間が反映
- プロジェクター表示が**外部モニター側**にあり、YouTubeの映像が映る
- iPadの `Mac ONLINE` と、TAKE 1 / TAKE 2 の切り替えを確認
- YouTube MVはミュート、映像の自動同期を確認
- Wi-FiとMacの省電力設定を確認

## 注意点

- **Vercel再デプロイは不要**：今回の変更はMac起動操作のみ。Web版v6.2はそのまま利用します。
- Chromeの別ウィンドウ操作にはmacOSの**オートメーション許可**が必要になることがあります。AppleScriptでアプリを操作しますが、パスワードや楽曲情報はAppleScriptに渡しません。
- 毎回同じブラウザ**プロファイル**を使ってください。違うプロファイルでは、ブラウザに保存したMV事前設定や連携設定は引き継がれません。
- **iPadの画面をMac側から自動で開く機能はありません**。Safariのホーム画面ショートカットを使ってください。
- ブリッジのOCRはrekordboxの画面表示が前提です。rekordboxが別ウィンドウで隠れると読み取れません。
- Chromeの省電力／バックグラウンド抑制により遠隔操作や同期が遅れることがあります。現場で本番前に確認してください。
- `bridge_config.json`には秘密トークンが入るため、**GitHubへアップロードしない**でください（`.gitignore`で除外設定済み）。
