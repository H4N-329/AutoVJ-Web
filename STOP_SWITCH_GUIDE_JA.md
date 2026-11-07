# AutoVJ Web v6.3 — 停止確定モード（YouTube準拠版）

## できること

- DECK 1のMVを本番出力中、DECK 2のMVをYouTube IFrame APIで頭出し（未再生）
- DJが2曲をMIXしている間は、映像出力をDECK 1のまま保持
- DECK 1の再生停止、DECK 2の継続再生が **2回連続する異なるOCRスナップショット**で確認されると、DECK 2をTAKE
- DECK 2の現在経過時間 + 共通先行0.5秒 + 曲別オフセットに合わせてYouTube MVを再生開始
- 次のMVが未設定、読み取り時刻が古い、状態が不明の場合は自動切替を保留
- 手動TAKE、MV事前設定、iPadからのTAKE/ARM、検索、映像位置補正など従来の機能は継続

## 重要：YouTubeの制約

YouTube公式要件では、見えていないプレーヤーの自動再生、同じページ内の複数YouTubeプレーヤーの同時自動再生、YouTubeの映像を覆う処理には制限があります。

そのため、**非表示のYouTube映像をMIX中に先行再生し、2つのYouTube映像をクロスフェードする機能は搭載していません**。

- 次MVは `cueVideoById` により再生待機し、実際の切替時に再生
- よってYouTubeの読み込み待ちが発生することがあります
- UIで見せる「頭出し済み」はバッファ完了を意味しません
- 映像同士の真のフェードイン／アウトは、自分で使用許諾を確保したローカルMP4/MOV、またはアプリ生成映像用の別設計で実装可能です

公式参照：
https://developers.google.com/youtube/terms/required-minimum-functionality
https://developers.google.com/youtube/iframe_api_reference

## 更新手順（GitHub + Vercel）

1. 現在のAutoVJの設定（MV事前設定など）を必要に応じてバックアップする
2. `AutoVJ_Web_v6.3_StopSwitch_Patch.zip` を解凍し、GitHubの同名ファイルを置換する
3. `assets/stop-switch.mjs` は**新規ファイル**として忘れず追加する
4. Commit後、VercelのProductionデプロイがReadyになることを確認
5. MacのDJ LIVEとプロジェクター出力を開き直し、キャッシュを強制再読み込み
6. Macブリッジを起動して、2デッキの再生中／停止中が正しく検出できるか確認

APIキー・Upstash環境変数・Mac OCRブリッジは変更不要です。

## 使い方

1. MV事前設定タブで、左右デッキで使う曲のMVを保存する
2. DJ LIVEの自動映像切替で「停止確定」を選ぶ
3. 最初の曲は手動TAKEして出力を開始（開演時の誤起動防止）
4. 次のデッキに楽曲をロード。サブプレビューが「頭出し済み」か確認する
5. 次デッキの再生を始め、両デッキでMIXする間は現在のMVを継続
6. 元のデッキを停止すると、2回連続の新しいOCR判定が取れた時点で次MVへ自動TAKE
7. 必要ならiPad側から手動TAKEや±1秒／±5秒補正を使う

## 再生遅延・注意点

- Macブリッジが約2.2秒周期でWeb側へ反映する構成なので、「停止確定」には少なくとも複数回の認識が必要です。即時切替は保証されません。
- 画面OCRはCUEでの再生とマスター出力中の再生を区別できません。実際の音声がどちらから出ているかは推定に留まります。
- 非停止の状態（片方のフェーダーを下げただけ）では切り替えません。
- 両方停止、両方再生状態不明、次MV未設定の場合は映像を保持します。
- 本番で速い切替が必要ならiPadの手動TAKEを併用してください。
- YouTube動画のイベント会場での上映は、利用規約と権利許諾も確認してください。

## 動作検証

node --test tests/*.mjs tests/*.cjs

Windows/Linux上のNode.jsによる状態判定、既存APIのテストを実施。Macのrekordbox画面、YouTubeのライブ再生、iPadと現地通信の統合動作は未検証です。
