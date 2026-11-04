# AutoVJ Web v6.1 — GitHub/Vercelへの公開

## A. Vercelへデプロイ

1. `AutoVJ_Web_v6.1` フォルダの**中身**をGitHubの新しいリポジトリのルート直下にアップロード。`index.html`、`controller.html`、`output.html`、`api/`、`assets/`、`bridge/`、`vercel.json` が直下に見えること。
2. [Vercel](https://vercel.com/new) でGitHubリポジトリをImport。Framework Presetは `Other`。Build Commandは空欄でよい（静的ページ＋Node API Function）。
3. Vercelのプロジェクト `Settings → Environment Variables` で以下を設定する。

| 名前 | 入力値 |
| --- | --- |
| `YOUTUBE_API_KEY` | YouTube Data API v3のキー（検索が不要なら省略可） |
| `AUTOVJ_ACCESS_TOKEN` | **16文字以上**、推奨32文字以上のランダムな秘密文字列 |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis RESTのURL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis RESTのトークン |

4. RedisはVercel MarketplaceのUpstash等から作成できる。既存v6.0で設定済みなら流用可能。
5. 設定後にRedeployし、Vercelの `https://...vercel.app` URLを取得する。
6. Macでサイトを開き、設定タブに `AUTOVJ_ACCESS_TOKEN` と同じ値を保存する。
7. 設定タブでMacブリッジ監視をONにしたい場合は `bridge/START_BRIDGE.command` を起動して接続する。
8. MacのDJ LIVE画面にある「iPad操作を有効化」をONにする。
9. iPad SafariでMacに表示された `controller.html?session=...` のURLを開き、同じアクセストークンで接続する。

## B. 重要な区別

- **既存の `api/bridge`** はMacのrekordbox OCRデータを共有します。
- **新しい `api/remote`** はMacとiPad間の操作指示・現在状態を共有します。
- **Macの `output.html`** は今まで通りMacの同一ブラウザ内でのみDJ LIVEから直接制御されます。iPadは `output.html` を直接操作せず、MacのDJ LIVEを経由します。
- iPadにYouTube APIキーを設定する必要はありません。APIキーやRedisトークンをGitHubへ置かないでください。

## C. リリース時・現場での運用

- API実行とRedis操作には利用量に応じた料金・無料枠の制約があります。通信回数は常時ポーリングで増えます。使用後はリモートをOFFにすること。
- 初回はYouTube URL指定で動作確認し、検索APIはその後で確認する。
- iPad用URLのペアリングコードは公開されても認証にはアクセストークンが別途必要ですが、URLとトークンの両方を他人へ知らせないこと。
- アクセストークンを漏らした場合、Vercelの環境変数を変更し、Mac・iPadの設定も更新する。
- モバイルSafariの自動再生制限があるためiPadでの独立MV確認はタップ開始にしている。上映そのものはMacのブラウザで行う。
- アプリが公開URL上で動作しても、本番会場での同期精度とネットワーク安定性は別途確認が必要。

## D. ローカル・自動テスト

```
node --test tests/*.test.cjs
node --check assets/app.js
node --check assets/controller.js
node --check assets/remote-host.js
node --check api/remote.js
```

ローカルで `python3 -m http.server` を立てた場合、画面表示はできますがAPI関数とRedisが動作しないため、iPadリモート接続はできません。Vercelでデプロイしてテストしてください。
