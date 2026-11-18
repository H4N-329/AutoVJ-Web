# AutoVJ Web v6.4.1 変更・検証結果

検証日 2026-11-18。添付v6.4とGitHub main ac405c88bcd21689efc8af8926cdea44bcd683a1 を照合し、同じアプリソースを基準に修正。

## 変更内容

- Macで保存済みURLとトークンを再入力できるようにし、接続診断を追加。
- AutoVJの認証拒否、Vercel側の応答、Redis設定不足を区別。リダイレクト先へのトークン転送を防止。
- DECK 2を含む未取得時刻を独立表示。校正枠内の画像を使い、OCR補正を失敗時に実施。
- 曲名OCRと時刻OCRの競合で、別曲や順序の古い時刻を採用するケースを抑制。
- 上映中デッキへの次曲ロード、動画ファイル欠落、TAKE連打時のローカル出力を修正。
- ローカル同士のフェード中は旧映像を保持し、新映像の透過率を変更。
- iPad通信にタイムアウト、切断時の操作無効化、復帰時の再取得を追加。
- リモート操作をMGETで取得。25操作を取得する場合のRedis問い合わせを26回から2回へ削減するケースを検証。
- bridge_config.jsonとPythonキャッシュをGitの追跡対象から除外し、公開されていたトークンを更新。

## 開発環境で確認済み

JavaScript 51件、Python 22件が合格。JavaScript/Pythonの構文検査、.commandのbash構文検査、git diff --checkも合格。

UI回帰テストはHTMLと実際のスクリプトを読み、DOM・動画・通信を模擬してイベント経由で検証。実動画のデコードとCSSフェードの見た目は実機確認項目。

主なケースはDECK 2の時刻未取得からの復帰、未取得時刻での即時同期、次曲ロード時の上映維持、動画欠落、TAKE連打、古いOCRでの裏再生抑止、iPad切断と再接続、古い応答の排除、認証拒否、HTTPリダイレクト、Redisの操作順序と一時的な欠番・番号リセット。

実行コマンドは node --test tests/*.test.* と python3 -m unittest discover -s tests -p 'test_*.py'。

旧 tests/browser_*.py は今回の51件に含めていない。ブラウザの起動制限と検証用ブラウザの依存ライブラリ不足により、今回のChromiumでの統合テストは未完了。

## 利用者の実機で確認する項目

- MacのApple Vision、画面収録権限、rekordboxのDECK 2校正と再生状態検出。
- Mac Chromeで実動画2本を使うHYBRID、実際の同期遅延とデコード負荷。
- YouTube実サービスでの検索、埋め込み再生、シークとMV別編集の補正。
- iPad第6世代Safari、スリープ復帰、現場Wi-Fi、プロジェクター出力の同時運用。

## 本番で確認済み

本番URL https://autovj-web.vercel.app に、修正コミット 63ca64d7dd05543dffed1a0cbcdef7e8e22429ac を反映して確認。

- VercelのProductionデプロイはREADY。
- 公開したapp.js、output.js、controller.jsは、検証済みソースとSHA-256が一致。
- 新トークンでMac Bridge APIへ接続し、Redisの読み取りが成功。
- トークンなし、誤トークン、公開されていた旧トークンはいずれも401で拒否。
- /bridge/bridge_config.json は404。
- 独立した検証セッションでUpstashへの状態保存・参照と、ARM→SEEKの操作順序が成功。
- YouTube本番APIでMV候補検索が成功。
- クラウドChromeでDJ LIVE、MV事前設定、MV検索・管理、設定の4タブを表示。
- 当該デプロイを対象に、確認時点の直近10分のerror/fatalログは検出されなかった。

AutoVJが使用する共有データ基盤はUpstash Redis。現行ソースとVercel環境変数にSupabaseの利用箇所は確認されなかった。

Mac、iPad、実動画とプロジェクターを組み合わせる実機検証は、上記「利用者の実機で確認する項目」を参照。
