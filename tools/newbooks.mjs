// 毎週の新刊さがし：楽天ブックスの「絵本」「しかけ絵本」ジャンルを発売日の新しい順に引き、new.json に足す。
// 楽天のIDは GitHub の Secrets（RAKUTEN_APP_ID・RAKUTEN_ACCESS_KEY）から読む。ここには書かない。
// 楽天の新しいAPIは、登録したWebサイトからの呼び出ししか受けないので、Origin・Referer にそのサイトを入れる（RAKUTEN_SITE）。
// 保存するのは書名・読み・作者・出版社・ISBN・叢書・発売日だけ（楽天のURL・表紙は保存しない）。
// 使い方：リポジトリの直下で  node tools/newbooks.mjs        （ためし：--dry で new.json を書かない／--mock=ファイル で楽天を呼ばない）
import fs from "fs";
import zlib from "zlib";

const ARG = process.argv.slice(2);
const DRY = ARG.includes("--dry");
const MOCK = (ARG.find(a => a.startsWith("--mock=")) || "").slice(7);
const APP = process.env.RAKUTEN_APP_ID || "", KEY = process.env.RAKUTEN_ACCESS_KEY || "";
const SITE = (process.env.RAKUTEN_SITE || "https://negohiro512.github.io").replace(/\/$/, "");
if (!MOCK && (!APP || !KEY)) { console.log("RAKUTEN_APP_ID・RAKUTEN_ACCESS_KEY が Secrets にないので、新刊さがしは休みます"); process.exit(0); }

const GENRES = ["001003003", "001003005"]; // 絵本・しかけ絵本
const BACK_DAYS = 45, AHEAD_DAYS = 100, MAX_PAGES = 40;
// 自費出版・共同出版の版元（図書館にはまず入らない）。10/10 初回の自動取得で見つかったものを足した
const NG_PUB = /文芸社|新風舎|幻冬舎メディアコンサルティング|幻冬舎ルネッサンス|日本文学館|みらいパブリッシング|東京図書出版|リフレ出版|パレード|丸善プラネット|三宝出版|風詠社|ブイツーソリューション|日本橋出版|22世紀アート|銀河書籍|つむぎ書房|日本障害者リハビリテーション協会|ふきのとう文庫|石田製本/;
// 絵本でないもの（シール・ドリル・パズル・おもちゃつき・料理本など）
const NG_T = /シール|ドリル|ギフト|BOX|ボックス|セット|特典|限定|ミニ|大型絵本|全\d+巻|カレンダー|ぬりえ|塗り絵|パズル|\d+ピース|ステッカー|グッズ|ポスター|マグネット|くみたて|組み立て|クラフト|ゲーム|クッキー|レシピ|料理|手帳|ノート|POD/;

// アプリと同じキャラクターの判定（index.html の CHAR をそのまま使う）
const html = fs.readFileSync("index.html", "utf8");
const m = html.match(/^const CHAR=(\/.*\/[a-z]*);$/m);
const CHAR = m ? new Function("return " + m[1])() : /アンパンマン|ディズニー|ポケモン/;
const nfkc = s => (s || "").normalize("NFKC");
const isChar = r => CHAR.test(nfkc([r.t, r.s, r.c].join(" "))) && !/汽車のえほん/.test(nfkc(r.s));

function isbn13(i) { i = (i || "").replace(/[^0-9X]/g, ""); if (i.length === 13) return i; if (i.length !== 10) return "";
  const b = "978" + i.slice(0, 9); let s = 0; for (let k = 0; k < 12; k++) s += (+b[k]) * (k % 2 ? 3 : 1); return b + ((10 - s % 10) % 10); }

// 索引（data.txt）にあるISBN
const raw = Buffer.from(fs.readFileSync("data.txt", "utf8").trim(), "base64");
const recs = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString("utf8"));
const INDEX = new Set(recs.map(r => isbn13(r.i)).filter(Boolean));

const N = fs.existsSync("new.json") ? JSON.parse(fs.readFileSync("new.json", "utf8")) : { records: [], dates: {} };
N.records = N.records || []; N.dates = N.dates || {};
const HAVE = new Set(N.records.map(r => isbn13(r.i)));

const jst = new Date(Date.now() + 9 * 3600e3), day = d => d.toISOString().slice(0, 10);
const TODAY = day(jst), FROM = day(new Date(jst - BACK_DAYS * 864e5)), TO = day(new Date(+jst + AHEAD_DAYS * 864e5));
// 「2026年10月09日」だけを日付にする（「10月下旬」「10月頃」は、日が決まってから拾う）
const salesDay = s => { const x = (s || "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); return x ? `${x[1]}-${x[2].padStart(2, "0")}-${x[3].padStart(2, "0")}` : ""; };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function page(genre, n) {
  if (MOCK) { const M = JSON.parse(fs.readFileSync(MOCK, "utf8")); return (M[genre] || [])[n - 1] || { Items: [] }; }
  const u = "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404?" + new URLSearchParams({
    applicationId: APP, accessKey: KEY, format: "json", formatVersion: "2", booksGenreId: genre, sort: "-releaseDate", hits: "30", page: String(n), outOfStockFlag: "1" });
  for (let t = 0; t < 4; t++) {
    await sleep(t ? 3000 * t : 1200); // 1秒に1回まで
    const r = await fetch(u, { headers: { Origin: SITE, Referer: SITE + "/ehon-dana/" } });
    if (r.status === 429) continue;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`楽天 ${r.status}: ${j.error || ""} ${j.error_description || j.errors?.errorMessage || ""}`);
    return j;
  }
  throw new Error("楽天の回数制限が続いた");
}

let seen = 0, added = 0, dated = 0;
const out = [];
for (const g of GENRES) {
  for (let n = 1; n <= MAX_PAGES; n++) {
    const j = await page(g, n), items = (j.Items || []).map(x => x.Item || x);
    if (!items.length) break;
    let older = 0;
    for (const it of items) {
      seen++;
      const pd = salesDay(it.salesDate), i = isbn13(it.isbn);
      if (pd && pd < FROM) { older++; continue; }
      if (!pd || pd > TO || !i || !i.startsWith("978")) continue;
      const r = { t: [it.title, it.subTitle].filter(Boolean).join(" ").normalize("NFC").trim(), y: (it.titleKana || "").normalize("NFC"),
        c: (it.author || "").split("/")[0].normalize("NFC").trim(), p: (it.publisherName || "").normalize("NFC").replace(/^株式会社\s*/, ""),
        yr: pd.slice(0, 4), i, s: (it.seriesName || "").normalize("NFC"), k: "N", pd };
      if (NG_PUB.test(r.p) || NG_T.test(nfkc(r.t))) continue;
      if (INDEX.has(i)) { if (N.dates[i] !== pd) { N.dates[i] = pd; dated++; } continue; }
      if (HAVE.has(i)) { const o = N.records.find(x => isbn13(x.i) === i); if (o && o.pd !== pd) { o.pd = pd; o.yr = pd.slice(0, 4); } continue; }
      if (isChar(r)) r.ch = 1;
      HAVE.add(i); N.records.push(r); out.push(r); added++;
    }
    if (older === items.length) break; // このページはもう古い本だけ
  }
}
// 前に足した本も、いまの決まりで外れるものは外す（決まりを足したとき用）
N.records = N.records.filter(r => !NG_PUB.test(r.p) && !NG_T.test(nfkc(r.t)));
for (const r of N.records) { if (isChar(r)) r.ch = 1; else delete r.ch; }
// 発売日だけの控えは半年で消す（本そのもの＝records は残す）
const CUT = day(new Date(jst - 183 * 864e5));
for (const [i, d] of Object.entries(N.dates)) if (d < CUT) delete N.dates[i];
N.at = TODAY;
N._説明 = "今月の新作のための新刊。楽天ブックスの「絵本」「しかけ絵本」ジャンルを発売日順に引いたもの（毎週月曜に自動で追加）。records＝索引にない本、dates＝索引にある本の発売日";
const sorted = { _説明: N._説明, at: N.at, records: N.records, dates: N.dates };
if (!DRY) fs.writeFileSync("new.json", JSON.stringify(sorted));
console.log(JSON.stringify({ today: TODAY, range: [FROM, TO], seen, added, dated, records: N.records.length, dates: Object.keys(N.dates).length,
  sample: out.slice(0, 8).map(r => `${r.pd} ${r.t}｜${r.p}${r.ch ? "（キャラクター）" : ""}`) }, null, 1));
