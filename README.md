# かんたん家計簿

スマホでもPCでも使える、初心者向けのシンプルな家計簿アプリです。
入力したデータはすべて **この端末（ブラウザ）の中だけ** に保存され、外部のサーバーには一切送信されません。

## できること

- 支出・収入の記録（日付・金額・カテゴリ・メモ）
- 大分類＋小分類の2階層カテゴリ（自由に追加・編集・削除OK）
- 家賃やサブスクなどの「定期取引」を登録すると毎月自動で記録
- カテゴリ別の月間予算を設定し、使いすぎたらお知らせ
- 円グラフ・月次推移・前月/前年同月比較・収支バランスの分析画面
- ライト／ダーク／自動のテーマ切り替え
- JSON形式でのバックアップ（エクスポート／インポート）、CSVでの書き出し
- スマホの「ホーム画面に追加」でアプリのように使えるPWA対応

## スマホで使えるようにする（GitHub Pages・無料）

ここが一番大事なステップです。以下の手順で、誰でも無料でこのアプリを公開してスマホからアクセスできます。

### 1. GitHubアカウントを作る（すでに持っていればスキップ）

https://github.com/ にアクセスし、無料アカウントを作成します。

### 2. 新しいリポジトリを作る

1. 右上の「＋」→「New repository」をクリック
2. Repository name に `kakeibo-app` などお好きな名前を入力
3. 「Public」を選択（Privateだと後述のPagesが無料枠では使えない場合があります）
4. 「Create repository」をクリック（README等は追加しなくてOK）

### 3. ファイルをアップロードする（gitコマンド不要）

1. 作成したリポジトリのページで「uploading an existing file」というリンクをクリック
2. パソコンの `kakeibo-app` フォルダの中身（`index.html`, `styles.css`, `app.js`, `db.js`, `manifest.json`, `sw.js`, `icons` フォルダなど）を、**フォルダの中身だけ** ドラッグ＆ドロップでアップロード領域に入れる
   - `tools` フォルダ（アイコン生成・ローカル確認用のスクリプト）はアップロード不要です
3. 一番下の「Commit changes」をクリック

> gitに慣れている方は、このフォルダで `git remote add origin <あなたのリポジトリURL>` → `git push -u origin master` でもOKです（ローカルに一度 `git init` 済みの状態にしてあります）。

### 4. GitHub Pagesを有効にする

1. リポジトリの「Settings」タブを開く
2. 左メニューの「Pages」をクリック
3. 「Build and deployment」の「Source」で **Deploy from a branch** を選択
4. Branch を `main`（または `master`）、フォルダを `/ (root)` にして「Save」
5. 1〜2分待つと、ページ上部に公開URL（`https://あなたのユーザー名.github.io/kakeibo-app/` のような形）が表示されます

### 5. スマホでアクセス＆ホーム画面に追加

1. スマホのブラウザ（Android:Chrome / iPhone:Safari）で、上記のURLを開く
2. **Android(Chrome)**: 右上の「⋮」メニュー →「ホーム画面に追加」または「アプリをインストール」
3. **iPhone(Safari)**: 下の共有ボタン（□に↑）→「ホーム画面に追加」

これで、ホーム画面にアプリのアイコンが追加され、アプリのように起動できるようになります。

## データのバックアップ・引っ越し

- データはこの端末のブラウザ内だけに保存されています（サーバーには保存されません）。
- 機種変更やブラウザのデータ削除に備えて、**「設定 → データ管理 → JSONをエクスポート」** を定期的に行い、Googleドライブなど好きな場所に保存しておくことをおすすめします。
- 新しい端末では、同じURLを開いて「設定 → データ管理 → JSONを読み込む」から先ほどのファイルを選べば復元できます。

## アプリを修正・アップデートしたいとき

- ファイルを直接編集し、同じ手順でGitHubに再アップロード（上書き）すればOKです。
- 見た目やロジックを更新したときは、`sw.js` の1行目付近にある `CACHE_VERSION` の数字を1つ上げてください。これを忘れると、スマホ側に古いキャッシュが残って更新が反映されないことがあります。

## ローカルで動作確認したい場合（開発者向け・任意）

Node.jsやPythonが無い環境でも確認できるよう、PowerShellだけで動く簡易サーバーを同梱しています。

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8787
```

その後ブラウザで `http://localhost:8787` を開いてください。

アイコン画像を作り直したい場合は以下を実行してください（`icons` フォルダに再生成されます）。

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\generate-icons.ps1
```

## 技術構成（参考）

- ビルド不要のシングルページ構成：`index.html` + `styles.css` + `db.js` + `app.js`
- React 18 / Babel Standalone をCDNから読み込み、ブラウザ内でJSXを変換
- データ保存は `IndexedDB`（`db.js` がラッパー層）
- オフライン表示用に `sw.js`（Service Worker）でアプリ本体をキャッシュ
