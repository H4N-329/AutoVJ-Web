# AutoVJ Web v6.1.2 — rekordbox経過時間 修正手順

## 対象

v6.1.1で左右の曲名・アーティストは表示されるが、再生経過時間が更新されない場合。

原因の候補は、経過時間ROIのずれ、Apple Vision高速OCRの失敗、Mac側の送信値が未取得のままになっていること、Web側の時刻を通信時刻で代用していることです。原因は環境によって異なります。修正版では、OCRフォールバック・通信時刻の分離・診断機能を追加しました。

## 1. GitHub / Vercel（Web側）

1. 今のGitHubリポジトリをバックアップまたは最新のコミットを控える。
2. v6.1.2 ZIPを解凍し、**中身**をGitHubリポジトリのルートにアップロードして更新する。
3. `index.html`、`api/bridge.js`、`api/remote.js`、`assets/app.js`、`assets/controller.js` 等が更新されていることを確認する。
4. GitHubへCommit。Vercel Deploymentsが **Ready** になるまで確認する。
5. MacのブラウザでAutoVJを開き、`Command + Shift + R` でハードリロードする。画面左上が `v6.1.2 · Clock Fix` になればWeb側が更新済み。

**以前設定したVercelの環境変数はそのままで構いません。** YouTube APIキー、Redis接続先、アクセストークンを作り直す必要はありません。

## 2. Macブリッジの差し替え（必須）

Macで動いている古い `START_BRIDGE.command` を `Ctrl+C` で停止します。Web側だけ更新してもOCRの修正は適用されません。

### 方法A（推奨）

1. v6.1.2の `bridge/` フォルダをMacにコピーする。
2. 旧 `bridge/bridge_config.json` がある場合、**Mac上だけで**新 `bridge/` へコピーする（VercelのURLと接続トークンが入っています）。
3. 新 `bridge/START_BRIDGE.command` を起動。必要なPythonライブラリをインストールします。
4. Mac側でrekordboxを2デッキ表示にして、再生経過時間が表示されている状態にする。

※ `bridge_config.json`、`.venv/`、`.native/` をGitHubにアップロードしないでください。`.gitignore` に除外設定があります。

### 方法B（手動差し替え）

旧 `bridge/` をそのまま使いたい場合、次の2ファイルだけv6.1.2のものに差し替えればOCR修正が有効です。

- `bridge/rekordbox_bridge.py`
- `bridge/mac_ocr/deck_capture.py`

診断も使えるように `bridge/diagnose_timers.py` と `bridge/DIAGNOSE_TIMERS.command` も追加してください。Web側のファイル更新は方法Aと同様に必要です。

## 3. 時刻が更新されているか確認

Macの `START_BRIDGE.command` のターミナルに、以下のように表示されれば正常です（値は例）。

```text
rekordbox監視開始。
送信: left: DECO*27 - モニタリング 32.4s (fast) / playing |
      right: ほかの曲 - アーティスト 0.0s (accurate-fallback) / paused
```

* `fast`：高速OCRで読取成功
* `accurate-fallback`：高速OCRの失敗後、高精度OCRで成功
* `full-accurate`：曲名OCRと同時に読み取った経過時間を再利用
* `--:-- (OCR待機)`：まだ正しい時刻として解析できない

次にMacのWebアプリの「設定」→「Macブリッジの監視を有効化」をONにし、DJ LIVEのDECK 1 / 2で経過時間が更新されるか確認してください。iPadは同じ接続コードで再接続すれば新しい状態を表示します。

## 4. まだ動かない場合：タイマー診断

1. Mac上の `bridge/DIAGNOSE_TIMERS.command` を実行する。
2. ターミナルに `DECK 1: raw='...' -> 〇秒`、`DECK 2...` が表示される。
3. タイマー部分の画像が次のフォルダに作られます：

   `~/Documents/DJ/AutoVJ_Data/clock_diagnostics/`

   - `left_elapsed.png`
   - `right_elapsed.png`

4. 画像の中に **正の経過時間**（例 `00:32.4`）が表示されているか確認。

### 診断結果の見方

| 結果 | 対応 |
|---|---|
| 画像に曲の経過時間が見える、高速OCRだけ失敗 | 高精度の結果が成功していればそのまま利用可能 |
| 画像に波形や残り時間（`-03:40.0`）が写っている | タイマーの読み取り位置がずれているのでROIを再校正 |
| 画像が真っ黒、rekordbox以外が映る | Macの画面収録権限、対象ディスプレイ番号、rekordbox画面を確認 |
| 高精度OCRでも読み取りに失敗 | 表示倍率、文字サイズ、ROI幅・高さを見直す |

再校正が必要な場合、Mac版v5.9で読み取り位置の設定を行ったときの
`~/Documents/DJ/AutoVJ_Data/deck_capture_config.json` が利用されています。`left_elapsed` と `right_elapsed` は画面全体を1.0とした `[x,y,width,height]` です。**バックアップを取ってから変更**してください。画像が必要ならこの2枚のタイマー切り抜きだけ送ってもらえば、より具体的に範囲を調整できます。

## 5. 自動同期の安全設定

正確な時刻が取得できない場合、v6.1.2は `--:--` と表示し、自動同期を保留します。誤って動画を0秒に巻き戻すことを防ぐためです。最初は自動TAKEをOFFにして、デッキの時刻が安定して更新されたことを確認してから有効にしてください。

なお、こちらではMac実機のApple Vision / rekordbox / Vercelとの統合テストは行えていません。今回の検証は模擬OCR、API、ブラウザの時刻更新テストです。
