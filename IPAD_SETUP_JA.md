# AutoVJ v6.1 iPad 第6世代 — 現場セットアップ手順

## 機材と配線

```text
Mac (rekordboxでDJ)
  ├─ macOS ブラウザ: AutoVJ DJ LIVE （OCR監視・MV検索・同期制御）
  ├─ macOS ブラウザ: AutoVJ 出力ウィンドウ → USB-C/HDMI等 → 会場プロジェクター
  └─ Mac OCRブリッジ → HTTPS → Vercel / Upstash
                                         ↑↓
                                  iPad第6世代 Safari
                                  AutoVJ REMOTE 操作専用
```

Macの音声出力は従来どおりDJ機器へ接続。MVの音声はYouTubeプレーヤーでミュート。iPadからHDMI出力する必要はありません。

## 事前にMacで行うこと

1. GitHub/Vercelへv6.1をデプロイする。`DEPLOY_GUIDE_JA.md` の通りYouTube・Redis・アクセストークンを設定。
2. Macで `https://発行されたURL/` を開く。設定タブでアクセストークンを保存する。
3. Macで「プロジェクター出力を開く」→別ウィンドウを外部ディスプレイへ移動し、全画面表示する。
4. Macで「iPad REMOTE → iPad操作を有効化」をON。ペアリングコードとURLを確認する。
5. Macに `bridge/START_BRIDGE.command` を起動（初回にURLと同じアクセストークンを入力）。macOSの「画面収録」権限が必要。以前のMac版で調整した `~/Documents/DJ/AutoVJ_Data/deck_capture_config.json` を再利用します。
6. Mac DJ LIVE「設定」の「Macブリッジの監視を有効化」をON。左右デッキの曲名と経過時間が更新されることを確認。
7. YouTube公式MV候補の検索・選択を確認。検索はサーバー側の `YOUTUBE_API_KEY` を使用。

**MacのDJ LIVE画面と上映画面を閉じないでください。** iPadはこれらのMacページを操作します。MacのDJ LIVEタブを完全に休止すると、iPadからの指示やOCR更新が止まります。

## iPadで行うこと

1. iPad第6世代をインターネットへ接続する。Macと同じWi-Fiでなくても、両方ともVercelへHTTPS接続できれば通信可能です。
2. SafariでMacに表示されたiPad用URL（`/controller.html?session=...`）を開く。
3. Mac側に表示された接続コードと同じか確認。**アクセストークンはVercelの `AUTOVJ_ACCESS_TOKEN` と同じ値**を入力する。URLには入れない。
4. 「接続する」を押す。右上に `Mac ONLINE` が出たら成功。
5. DECK 1 / 2の曲名・MV準備状態が表示されることを確認する。
6. まず `TAKE 1` と `TAKE 2` を押し、Macのプロジェクター出力が切り替わるか確認。次に `−1秒 / ＋1秒` と「今すぐ同期」を試す。
7. 必要に応じて `ARM`、自動補正ON/OFF、MV先行量を操作する。
8. MVの頭出しができているか見る際はサムネイルを確認。実際にiPadで動画を見るときだけ「MVを確認」を開く（iPad側の動画再生はMacの上映映像と同期しません）。

## 本番前のチェックリスト

- [ ] MacのDJ LIVEが開いている
- [ ] Macの出力ウィンドウがプロジェクター側で開いている
- [ ] iPadの右上に「Mac ONLINE」
- [ ] DECK 1とDECK 2の曲名が正しい
- [ ] YouTube MVが両デッキとも準備済み
- [ ] TAKE 1/2がMac上映へ反映される
- [ ] MVの音声はミュートされている
- [ ] 自動TAKEは最初OFFで、誤動作がないことを確認した後のみON
- [ ] iPad / Mac / 会場インターネットの接続が安定している
- [ ] YouTubeの上映権利・許諾を確認済み

## よくあるトラブル

| 症状 | チェックすること |
| --- | --- |
| iPadが「接続待機中」 | Mac DJ LIVEのiPad操作がONか、同じコードか、Redis設定があるか |
| 認証エラー | Vercelの `AUTOVJ_ACCESS_TOKEN` と一致しているか、16文字以上か |
| TAKEがMacへ反映されない | MacのDJ LIVEと出力ウィンドウを両方開いているか / ポップアップブロック / Macタブが休止していないか |
| 曲名が出ない | Mac OCRブリッジ・画面収録権限・Macの設定タブの監視ONを確認 |
| サムネイルはあるがMVが出ない | YouTubeの埋め込み許可、再生許可、ブラウザの自動再生制限を確認 |
| 「Mac 待機中」 | MacのリモートがOFF、ネットワークが不通、ブラウザがバックグラウンドで停止、デプロイ更新時の一時切断 |
| 反応が遅い | Vercel/Redisへの往復時間、Mac側ブラウザの省電力制限、会場Wi-Fiの混雑を確認。ローカルでの厳密同期ではありません |

## 終了するとき

MacのDJ LIVEで「iPad操作を有効化」をOFFにする。必要ならiPadで「接続解除」。他人と共用するiPadの場合は保存したアクセストークンを消す。使用しない時間のポーリングは止めてAPI利用回数を抑える。
