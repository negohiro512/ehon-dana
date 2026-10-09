// 毎週の新刊さがし（10/10 つくり直し）
//   1. 楽天ブックスの「絵本」「しかけ絵本」ジャンルを発売日の新しい順に引き、「新しく出る本のISBN」だけを手元（メモリ）で使う
//   2. 書名・作者・出版社・発売日などは openBD（出版社が出している書誌。本の紹介に無料で使える）から取り、new.json に保存する
//      openBD に無い本は載せない
// 楽天ウェブサービス規約 第10条1項(9)「不特定または多数の人と共有できる場所に、ウェブサービスで得た情報を保管しない」ため、
// 楽天から得た書名・日付などは保存しない（公開リポジトリに置かない）。
// あわせて isbn_plus.json（昔の本の今の版のISBN）も、openBD で書名が合うものだけ残す。
// 楽天のIDは GitHub の Secrets（RAKUTEN_APP_ID・RAKUTEN_ACCESS_KEY）から読む。ここには書かない。
// 楽天の新しいAPIは、登録したWebサイトからの呼び出ししか受けないので、Origin・Referer にそのサイトを入れる（RAKUTEN_SITE）。
// 使い方：リポジトリの直下で  node tools/newbooks.mjs   （ためし：--dry で書きこまない／--mock=ファイル で楽天・openBD を呼ばない）
import fs from "fs";
import zlib from "zlib";

const ARG = process.argv.slice(2);
const DRY = ARG.includes("--dry");
const MOCK = (ARG.find(a => a.startsWith("--mock=")) || "").slice(7);
const APP = process.env.RAKUTEN_APP_ID || "", KEY = process.env.RAKUTEN_ACCESS_KEY || "";
const SITE = (process.env.RAKUTEN_SITE || "https://negohiro512.github.io").replace(/\/$/, "");
const NO_RK = !MOCK && (!APP || !KEY);
if (NO_RK) console.log("RAKUTEN_APP_ID・RAKUTEN_ACCESS_KEY が Secrets にないので、新刊さがしは休み、いまある本の openBD での確かめだけします");

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
const MOCKD = MOCK ? JSON.parse(fs.readFileSync(MOCK, "utf8")) : null;

const jst = new Date(Date.now() + 9 * 3600e3), day = d => d.toISOString().slice(0, 10);
const TODAY = day(jst), FROM = day(new Date(jst - BACK_DAYS * 864e5)), TO = day(new Date(+jst + AHEAD_DAYS * 864e5));
// 「2026年10月09日」だけを日付にする（「10月下旬」「10月頃」は、日が決まってから拾う）
const salesDay = s => { const x = (s || "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); return x ? `${x[1]}-${x[2].padStart(2, "0")}-${x[3].padStart(2, "0")}` : ""; };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function page(genre, n) {
  if (MOCK) return (MOCKD[genre] || [])[n - 1] || { Items: [] };
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

// openBD：ISBNのリストから書誌をまとめて引く（1回に1000件まで）
async function openbd(isbns) {
  const out = new Map();
  for (let k = 0; k < isbns.length; k += 1000) {
    const part = isbns.slice(k, k + 1000);
    let j;
    if (MOCK) j = part.map(i => (MOCKD.openbd || {})[i] || null);
    else {
      const r = await fetch("https://api.openbd.jp/v1/get", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "isbn=" + part.join(",") });
      if (!r.ok) throw new Error("openBD " + r.status);
      j = await r.json();
    }
    part.forEach((i, n) => { if (j[n]) out.set(i, j[n]); });
  }
  return out;
}
const pdOf = s => { const d = String(s || "").replace(/[^0-9]/g, ""); return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : ""; };
// openBD の書誌から、絵本だなの形の記録をつくる（発売日が日まで決まっていないものは、決まってから）
function fromOpenbd(d) {
  const s = d.summary || {}, o = d.onix || {}, dd = o.DescriptiveDetail || {}, te = ((dd.TitleDetail || {}).TitleElement) || {};
  const pubs = [].concat((o.PublishingDetail || {}).PublishingDate || []);
  const pd = pdOf(s.pubdate) || pdOf((pubs.find(x => x.PublishingDateRole === "01") || pubs[0] || {}).Date);
  const title = (s.title || (te.TitleText || {}).content || "").trim();
  if (!pd || !title || !s.isbn) return null;
  const sub = ((te.Subtitle || {}).content || "").trim();
  const c0 = [].concat(dd.Contributor || [])[0];
  const who = ((c0 && (c0.PersonName || {}).content) || (s.author || "").split(/[／/]/)[0] || "").trim();
  return { t: (sub && !title.includes(sub) ? title + " " + sub : title).normalize("NFC"), y: ((te.TitleText || {}).collationkey || "").replace(/\s/g, "").normalize("NFC"),
    c: who.normalize("NFC"), p: (s.publisher || "").normalize("NFC").replace(/^株式会社\s*/, ""), yr: pd.slice(0, 4), i: isbn13(s.isbn), s: (s.series || "").normalize("NFC"), k: "N", pd };
}

// 1. 楽天で「新しく出る本のISBN」を集める（楽天の書名・日付は保存しない）
const FOUND = new Set();
let seen = 0;
if (!NO_RK) for (const g of GENRES) {
  for (let n = 1; n <= MAX_PAGES; n++) {
    const j = await page(g, n), items = (j.Items || []).map(x => x.Item || x);
    if (!items.length) break;
    let older = 0;
    for (const it of items) {
      seen++;
      const pd = salesDay(it.salesDate), i = isbn13(it.isbn);
      if (pd && pd < FROM) { older++; continue; }
      if (!pd || pd > TO || !i || !i.startsWith("978")) continue;
      FOUND.add(i);
    }
    if (older === items.length) break; // このページはもう古い本だけ
  }
}

// 2. いまある本＋新しく見つけた本を、openBD で引きなおす（前の記録も、毎回 openBD の書誌で置きかえる）
const before = new Set(N.records.map(r => isbn13(r.i)));
const want = [...new Set([...before, ...Object.keys(N.dates), ...FOUND])].filter(Boolean);
const OB = await openbd(want);
const records = [], dates = {}, out = [];
let missing = 0;
for (const i of want) {
  const d = OB.get(i), r = d && fromOpenbd(d);
  if (!r) { missing++; continue; }
  if (NG_PUB.test(r.p) || NG_T.test(nfkc(r.t))) continue;
  if (INDEX.has(i)) { dates[i] = r.pd; continue; }
  if (isChar(r)) r.ch = 1;
  records.push(r);
  if (!before.has(i)) out.push(r);
}
records.sort((a, b) => a.i.localeCompare(b.i));
// openBD がうまく返さなかったとき（通信の不調など）に、前の記録を消してしまわないように
const keptBefore = records.filter(r => before.has(r.i)).length + Object.keys(dates).filter(i => before.has(i)).length;
if (!MOCK && before.size > 20 && keptBefore < before.size * 0.3) throw new Error(`openBD で前の本が ${keptBefore}/${before.size} しか見つからない。書きこまずに止めます`);
// 発売日だけの控えは半年で消す（本そのもの＝records は残す）
const CUT = day(new Date(jst - 183 * 864e5));
for (const [i, d] of Object.entries(dates)) if (d < CUT) delete dates[i];

// 3. isbn_plus.json：openBD に載っていて、書名が合うISBNだけ残す
const nt = t => nfkc(t).replace(/[\s　・、。!！?？「」『』()（）\-ー〜~:：]/g, "").toLowerCase();
let plusKept = 0, plusDropped = 0;
const PLUS = fs.existsSync("isbn_plus.json") ? JSON.parse(fs.readFileSync("isbn_plus.json", "utf8")) : {};
const PB = await openbd([...new Set(Object.values(PLUS).map(isbn13).filter(Boolean))]);
const PLUS2 = {};
for (const [k, v] of Object.entries(PLUS)) {
  const d = PB.get(isbn13(v)), t = nt(k.split("|")[0]), ot = d ? nt((d.summary || {}).title) : "";
  if (ot && t && (ot.includes(t) || t.includes(ot))) { PLUS2[k] = v; plusKept++; } else plusDropped++;
}

if (!MOCK && plusKept < Object.keys(PLUS).length * 0.3) throw new Error(`isbn_plus で openBD に合うのが ${plusKept}/${Object.keys(PLUS).length} しかない。書きこまずに止めます`);
const NJ = { _説明: "今月の新作のための新刊。楽天ブックスの「絵本」「しかけ絵本」ジャンルで新しく出る本を見つけ、書誌は openBD から取ったもの（毎週月曜に自動で更新）。records＝索引にない本、dates＝索引にある本の発売日", at: TODAY, records, dates };
if (!DRY) {
  fs.writeFileSync("new.json", JSON.stringify(NJ));
  fs.writeFileSync("isbn_plus.json", JSON.stringify(PLUS2, null, 1));
}
console.log(JSON.stringify({ today: TODAY, range: [FROM, TO], rakutenSeen: seen, found: FOUND.size, asked: want.length, notInOpenbd: missing,
  records: records.length, dates: Object.keys(dates).length, added: out.length, isbnPlus: { kept: plusKept, dropped: plusDropped },
  sample: out.slice(0, 8).map(r => `${r.pd} ${r.t}｜${r.p}${r.ch ? "（キャラクター）" : ""}`) }, null, 1));
