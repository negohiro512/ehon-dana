# 絵本だな 公開版（GitHub Pages に置く中身）

- index.html … アプリ本体（モック v3.7＋楽天の表紙。claude.ai のモックと同じファイル）
- lists.json・series.json … 賞・図書館のリスト、シリーズ
- data.txt … 索引（約13万件、gzipをbase64にしたもの）
- config.example.js … 見本。**Hiro が** コピーして `config.js` にし、楽天のアプリIDとアクセスキーを書く（Q004 A）
- config.js が無い・空のときは、表紙なし（色の帯）で動く

表紙のルール
- 本の詳細画面を開いた1冊だけ取りに行く（楽天の回数制限は利用者全員の合計のため）
- 1.1秒に1回まで。URLはこの端末のこのタブの間だけ覚える（共有の保存はしない）
- 画面に「表紙：楽天ブックス」「Supported by Rakuten Developers」を出す
