# AutoVJ Web v6.4.1 更新と手動起動

2026-11-18。添付v6.4とGitHub mainの ac405c88bcd21689efc8af8926cdea44bcd683a1 を基準に修正。

## 更新

既存のMac用AutoVJフォルダへ、更新用ZIPの中身を同じ階層で上書きします。新しく準備する場合は全体版ZIPを展開します。

Macの bridge/bridge_config.json は利用者ごとの設定です。配布ZIPには含めていません。校正データは ~/Documents/DJ/AutoVJ_Data/deck_capture_config.json に保存されます。MV紐付けとローカル動画は、登録に使用したMac Chromeのサイトデータとプロフィールを使って読み込みます。

本番URLは https://autovj-web.vercel.app です。GitHubで公開されていた旧トークンを更新したため、VercelのProduction環境変数 AUTOVJ_ACCESS_TOKEN の現在値を次の3か所に設定してください。

- Macの CONFIGURE_AUTOVJ.command
- Mac ChromeのAutoVJ「設定」→連携アクセストークン
- iPad Safariの接続画面→アクセストークン

Vercelの環境変数画面は https://vercel.com/h4n-329/autovj-web/settings/environment-variables です。現在のトークンは、プロジェクト権限を持つ利用者が表示できる暗号化変数として保管しています。値はチャットやGitHubに貼り付けないでください。

## Macで個別起動

1. 起動中の監視ターミナルでControl+Cを押します。一括起動ツールで動かした監視は STOP_AUTOVJ.command から停止できます。
2. ZIPを既存AutoVJフォルダへ適用します。
3. bridge/CONFIGURE_AUTOVJ.command を開きます。URLに https://autovj-web.vercel.app を入力し、更新後のトークンを入力します。トークンの入力文字は画面に表示されません。
4. bridge/CHECK_BRIDGE_CONNECTION.command を実行し、「HTTP 200」を確認します。これは認証とRedisの読み取りを確認します。
5. rekordboxを起動して校正済みの2デッキ画面を前面に表示します。
6. bridge/START_BRIDGE.command を開いてターミナルを残します。準備済みのPython環境を再利用し、必要な場合にライブラリをインストールします。
7. 「接続成功 / OCR状態の書き込みを確認」が出ることを確認します。
8. Mac Chromeで本番URLを開き、設定で更新後のトークンを保存してMacブリッジ監視を有効にします。DJ LIVEで両デッキの曲名と経過時間を確認します。
9. 「プロジェクター出力を開く」から出力ウィンドウを開き、外部画面へ移動します。
10. 「iPad操作を有効化」をONにします。表示された接続URLをiPad Safariで開き、トークンを入力して「Mac ONLINE」を確認します。
11. 最初の曲を手動TAKEし、MVの位置合わせを確認します。

.commandを開けない場合はFinderの右クリック→開くを試します。実行権限がない場合は、ターミナルでAutoVJフォルダへ移動して chmod +x bridge/*.command を実行します。

任意の一括起動は START_AUTOVJ.command です。手動起動の終了は監視ターミナルのControl+Cです。

## 認証と通信の診断

| 診断表示 | 確認する項目 |
|---|---|
| AutoVJ認証エラー / HTTP 401 | Mac、Web、iPadとProductionトークンの一致 |
| Deployment Protection、JSON応答なし、302/403 | 本番URL、Vercelの保護対象 |
| HTTP 503 / トークン未設定 | Production環境変数と再デプロイ |
| HTTP 503 / Redis | UpstashのREST URLと書き込み可能なRESTトークン |
| HTTP 200 / Mac更新待ち | START_BRIDGE.command のログ、画面収録権限 |
| DECK 2の時刻OCR待ち | DECK 2の経過時間表示と校正枠 |

今後Vercel側の環境変数を変更した場合は、Productionへ再デプロイしてMacとiPadの設定も合わせます。

## DECK 2の時刻OCR

1. rekordboxの時間表示を正の経過時間にします。例は 00:12.3 です。
2. DIAGNOSE_TIMERS.command を開き、表示された案内に従ってrekordboxを前面に戻します。
3. ~/Documents/DJ/AutoVJ_Data/clock_diagnostics/right_elapsed.png を確認します。数字、コロン、小数点を枠内に収めます。
4. 枠がずれている場合は CALIBRATE_REKORDBOX.command でDECK 2経過時間を選び、ドラッグで調整してOCRテストを実行します。
5. 保存後にブリッジを再起動します。通常OCRと高精度OCRで読めない場合は、同じ校正枠内の画像をコントラスト補正して再試行します。

## 実機で確認する操作

| 操作 | 確認する結果 |
|---|---|
| 許諾済み動画を左右に登録 | 同じMac Chromeの出力画面で両方を読み込める |
| HYBRIDを選びDECK 1を手動TAKE | DECK 1が上映される |
| DECK 2も再生 | DECK 1の上映を保持し、DECK 2のローカル動画を裏再生 |
| DECK 1を停止 | 新鮮なOCRを2回確認した後、初期0.75秒でDECK 2へ移る |
| 左右を逆に切り替える | 同じ条件で切り替わる |
| 上映中のDECKに次曲をロード | 次のTAKEまで上映中のローカル動画を保持 |
| iPadをスリープから復帰 | Macの状態を再取得して操作可能になる |
| Wi-Fiを切断して復帰 | 待機表示と操作無効化の後に復帰する |

開発環境の検証結果は TEST_RESULTS_JA.md を参照してください。
