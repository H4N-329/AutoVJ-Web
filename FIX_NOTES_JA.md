# AutoVJ Web v6.1.1 — Mac設定タブ修正版

## 不具合の原因

v6.1の `assets/app.js` 内でコメントが同一行のJavaScriptを隠してしまい、`boot()` が実行されない構造になっていました。その結果、DJ LIVE・MV検索・設定のタブ操作が動かなくなっていました。

v6.1.1ではコメント位置を修正し、アプリ起動・画面操作・Mac監視の実行経路を復旧しました。iPadコントローラーやYouTube検索、Redis連携の仕様は変更していません。

## すでにVercelへ公開済みなら（最短の更新方法）

1. GitHubのAutoVJリポジトリを開き、`assets/app.js` を修正版へ差し替える。
2. GitHubへCommitする。VercelのGitHub連携で自動デプロイされる場合は完了を待つ。
3. 自動デプロイされない場合は、VercelのDeploymentsからProductionへ再デプロイする。
4. MacのブラウザでAutoVJを開き、`Command + Shift + R` で再読込する。
5. 上部の「設定」を押してアクセストークンを入力・保存する。
6. 「DJ LIVE」へ戻り、iPad操作を有効化する。

**既存のVercel環境変数は変えなくて構いません。** Macブラウザの保存データを消去する必要もありません。同じURL・同じブラウザプロファイルで開いてください。

新規公開の場合は `DEPLOY_GUIDE_JA.md` と `IPAD_SETUP_JA.md` を参照してください。

## 検証内容

- Node構文チェック
- API・リモート操作のテスト14件
- Chromiumで「設定を開く→値保存→MV検索→DJ LIVE」の画面遷移とJavaScript例外が出ないことを確認（YouTubeの通信は模擬）

Mac実機・YouTube・Vercel・iPadをつないだ統合試験は未実施です。
