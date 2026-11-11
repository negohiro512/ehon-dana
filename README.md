# 絵本だな

0〜5歳の絵本を、図書館でさがすためのサイト（GitHub Pages で公開）。サーバはなく、このリポジトリのファイルだけで動く。

## 中身
- index.html … アプリ本体（版は画面のいちばん下に出る）
- data.txt … 索引（約10万作品。国立国会図書館の書誌。gzip を base64 にしたもの）
- lists.json … 賞・図書館の選書リスト（あわせて104本）／series.json … シリーズ／series_age.json … 出版社がシリーズに決めている対象年齢（出典URLつき）
- themes.json … 季節・特集の本だな（16本）／categories.json … すきなものからさがす（書名のことば）
- interests.json … すきなもの辞書（120語）／kw.json … 辞書のことばが「出てくる本」の索引（文章は持たず、本の印と年齢の目安だけ）
- new.json … 今月の新作（書誌は openBD）／isbn_plus.json … ISBNのない昔の本の、今の版のISBN（openBD で書名が合うものだけ）
- instock.json … キャラクターもののうち、いま書店で買える本（openBD に載っている本）
- cover_fix.json … 表紙の手直し（bad は毎週の点検が自動で足す）
- config.js … 楽天のアプリID・公開用アクセスキー・アフィリエイトID。**運営者が自分で書く**（見本は config.example.js）。無い・空のときは、表紙なし（色の帯）で動く
- tools/ … 自動実行の中身／work/ … 国立国会図書館に引いた結果の控え（60日で引き直す）と、ことばごとの冊数の報告／audit/ … 点検の結果

## 毎週月曜の朝に自動で動くもの（GitHub Actions・日本時間）
| 時刻 | 名前 | すること |
|---|---|---|
| 5:43 | weekly-newbooks | 楽天ブックスで新刊のISBNを見つけ、openBD の書誌で new.json をつくりなおす（Secrets：RAKUTEN_APP_ID・RAKUTEN_ACCESS_KEY） |
| 5:58 | interests-index | kw.json を国立国会図書館の内容紹介と openBD からつくりなおす（長いと3時間ほど。辞書を変えたときにも動く） |
| 6:13 | weekly-audit | 点検。書名が本とちがうISBNを cover_fix.json の bad に足し、結果を audit/latest.md に書く |

## 決まり
- 楽天から得たもの（書名・日付・URL・表紙）は、このリポジトリに保存しない（楽天ウェブサービス規約 第10条1項(9)）。保存してよい書誌の出どころは、国立国会図書館と openBD
- 楽天の表紙は、本のページを開いた1冊と、Google ブックスに表紙のない本だけ。1.1秒に1回まで。URLはこのタブの間だけ覚える
- 画面に「Supported by Rakuten Developers」「Powered by Google」とカーリルへのリンクを出す。アフィリエイトのリンクには「広告」と書く
- 収入の方法は楽天アフィリエイトだけ（同規約 第10条1項(4)(5)）。アプリの中に広告や、ほかのアフィリエイトを置かない
- 認証情報（Secrets）と config.js の値は運営者だけが扱う
- コメント・コミットに、運営者の名前を書かない
