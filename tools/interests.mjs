// すきなものさがしの索引（kw.json）をつくる（2026-10-17）
//   「シャチが好き」のように、書名に入っていなくても「出てくる本」を探せるようにする。
//   1. 索引（data.txt・new.json・isbn_plus.json）のISBNを openBD に問い合わせ、内容紹介・目次・キーワード・Cコードを読む
//   2. すきなもの辞書（interests.json）に当たることば、カタカナのことば、出版社のキーワードを本ごとに拾う
//   3. 内容紹介に書いてある年齢（「読んであげるなら 3才から」「0・1・2歳」など）と、Cコードの形（絵本・図鑑）を拾う
//   内容紹介の文章そのものは保存しない（拾ったことばと年齢だけ）。
// 使い方：リポジトリの直下で  node tools/interests.mjs   （--limit=2000 で一部だけ・ためし）
import fs from "fs";
import zlib from "zlib";
import { compile, makeMatcher } from "./interests_compile.mjs";

const ARG = process.argv.slice(2);
const LIMIT = +((ARG.find(a => a.startsWith("--limit=")) || "").slice(8) || 0);
const nfkc = s => (s || "").normalize("NFKC");
function isbn13(i) { i = (i || "").replace(/[^0-9X]/g, ""); if (i.length === 13) return i; if (i.length !== 10) return "";
  const b = "978" + i.slice(0, 9); let s = 0; for (let k = 0; k < 12; k++) s += (+b[k]) * (k % 2 ? 3 : 1); return b + ((10 - s % 10) % 10); }

// --- 索引のISBN ---
const raw = Buffer.from(fs.readFileSync("data.txt", "utf8").trim(), "base64");
const recs = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString("utf8"));
const N = fs.existsSync("new.json") ? JSON.parse(fs.readFileSync("new.json", "utf8")) : { records: [] };
const P = fs.existsSync("isbn_plus.json") ? JSON.parse(fs.readFileSync("isbn_plus.json", "utf8")) : {};
const TITLE = new Map();
for (const r of [...recs, ...(N.records || [])]) { const i = isbn13(r.i); if (i && i.startsWith("978") && !TITLE.has(i)) TITLE.set(i, [r.t, r.p, r.k]); }
for (const k in P) { const i = isbn13(P[k]); if (i && !TITLE.has(i)) TITLE.set(i, [k.split("|")[0], k.split("|")[1] || "", "plus"]); }
let ALL = [...TITLE.keys()];
if (LIMIT) ALL = ALL.slice(0, LIMIT);
console.log("ISBN", ALL.length);

// --- openBD ---
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function openbd(part) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch("https://api.openbd.jp/v1/get", { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ehon-dana/0.4 (+https://negohiro512.github.io/ehon-dana/)" },
        body: "isbn=" + part.join(",") });
      if (r.ok) return await r.json();
      console.log("openBD", r.status);
    } catch (e) { console.log("openBD error", String(e)); }
    await sleep(3000 * (t + 1));
  }
  throw new Error("openBD に届きません");
}

// --- 拾い方 ---
const I = JSON.parse(fs.readFileSync("interests.json", "utf8"));
const CX = compile(I.concepts);
const match = makeMatcher(CX);
const KATA = /[ァ-ヴ][ァ-ヴー]+/g;
const STOP = new Set("ページ シリーズ イラスト ストーリー カラー サイズ ハードカバー ソフトカバー オールカラー テーマ タイトル メッセージ キャラクター ポイント ラスト シーン スタート ファン プレゼント ギフト ベストセラー ロングセラー ロングセラーズ リズム ユーモア ユーモラス テンポ イメージ コミカル チャレンジ ボリューム ジャンル スタイル ワクワク ドキドキ ハラハラ ニコニコ ポカポカ".split(" "));
const ageOfText = s => {
  const t = nfkc(s).replace(/[〇]/g, "0").replace(/[〜～]/g, "~");
  const N = x => +x;
  let m;
  // 福音館などの書き方：「読んであげるなら 3才から」
  if ((m = t.match(/読んであげるなら[:：\s]*(\d)\s*(?:歳|才)\s*(半)?/))) return [N(m[1]) + (m[2] ? .5 : 0), null, "r"];
  if ((m = t.match(/(?<![0-9])([0-6])\s*[~ー-]\s*([0-9])\s*(?:歳|才|さい)/))) return [N(m[1]), N(m[2]), "a"];
  if ((m = t.match(/(?<![0-9])([0-6])\s*[・,、]\s*([0-6])(?:\s*[・,、]\s*([0-6]))?\s*(?:歳|才|さい)/))) return [N(m[1]), N(m[3] || m[2]), "a"];
  if ((m = t.match(/対象年齢[:：\s]*(\d)\s*(?:歳|才)/))) return [N(m[1]), null, "a"];
  if ((m = t.match(/(?<![0-9])([0-6])\s*(?:歳|才|さい)\s*(半)?\s*(?:ごろ|頃|くらい)?\s*(?:から|以上|~)/))) return [N(m[1]) + (m[2] ? .5 : 0), null, "a"];
  if ((m = t.match(/(?<![0-9])([0-6])\s*(?:歳|才|さい)\s*(?:児|向け|むけ|の(?:お子|子|こ))/))) return [N(m[1]), N(m[1]), "a"];
  if (/(?:あかちゃん|赤ちゃん|乳児)\s*(?:から|向け|むけ|に読|とママ|と読|のための)/.test(t)) return [0, 2, "b"];
  if (/(?:小学校?|しょうがっこう)\s*(?:低学年|1・2年|1,2年|1~2年)\s*(?:から|向け|むけ)?/.test(t) && !/幼児|就学前|[3-5]\s*(?:歳|才)/.test(t)) return [6, 8, "s"];
  return null;
};
// Cコード（2桁目）：7＝絵本、6＝図鑑。1桁目：8＝児童
const formOf = c => !c ? "-" : c[1] === "7" ? "E" : c[1] === "6" ? "Z" : c[0] === "8" ? "K" : "A";

// --- 集める ---
const ISB = [], FORM = [], AGE = [], TAG = new Map(), KW = new Map(), STAT = { desc: 0, form: {}, age: {}, tt: {}, scheme: {}, aud: {}, pubDesc: {}, pubAll: {} };
const add = (M, k, i) => { let l = M.get(k); if (!l) M.set(k, l = []); if (l[l.length - 1] !== i) l.push(i); };
for (let k = 0; k < ALL.length; k += 1000) {
  const part = ALL.slice(k, k + 1000);
  const res = await openbd(part);
  res.forEach((d, j) => {
    const isbn = part[j], [t0, p0, k0] = TITLE.get(isbn);
    const pub = nfkc(p0).replace(/株式会社/g, "").trim();
    STAT.pubAll[pub] = (STAT.pubAll[pub] || 0) + 1;
    if (!d || !d.onix) return;
    const on = d.onix, dd = on.DescriptiveDetail || {};
    const subj = dd.Subject || [];
    for (const s of subj) STAT.scheme[s.SubjectSchemeIdentifier] = (STAT.scheme[s.SubjectSchemeIdentifier] || 0) + 1;
    for (const a of dd.Audience || []) { const key = a.AudienceCodeType + ":" + a.AudienceCodeValue; STAT.aud[key] = (STAT.aud[key] || 0) + 1; }
    if (dd.AudienceRange) STAT.aud.range = (STAT.aud.range || 0) + 1;
    const cc = (subj.find(s => s.SubjectSchemeIdentifier === "78") || {}).SubjectCode || "";
    const keys = subj.filter(s => s.SubjectSchemeIdentifier === "20").map(s => s.SubjectHeadingText || "").join(" ");
    const tcs = ((on.CollateralDetail || {}).TextContent || []);
    for (const tc of tcs) STAT.tt[tc.TextType] = (STAT.tt[tc.TextType] || 0) + 1;
    const hm = d.hanmoto || {};
    const desc = nfkc([...tcs.map(x => x.Text || ""), hm.kaisetsu105w || "", hm.maegakinado || ""].join("\n").replace(/<[^>]+>/g, " "));
    const short = nfkc([...tcs.filter(x => x.TextType === "02").map(x => x.Text || ""), hm.kaisetsu105w || ""].join("\n"));
    const sub = nfkc([(d.summary || {}).title, ((dd.TitleDetail || {}).TitleElement || {}).Subtitle?.content].filter(Boolean).join(" "));
    const form = formOf(cc), age = ageOfText(desc);
    if (!desc.trim() && form === "-" && !keys) return;
    const i = ISB.length;
    ISB.push(isbn.slice(3, 12)); FORM.push(form);
    STAT.form[form] = (STAT.form[form] || 0) + 1;
    if (age) { AGE.push([i, age[0], age[1]]); STAT.age[age[2]] = (STAT.age[age[2]] || 0) + 1; }
    if (desc.trim()) { STAT.desc++; STAT.pubDesc[pub] = (STAT.pubDesc[pub] || 0) + 1; }
    // すきなもの：書名・副題・キーワード・短い紹介に出てくる（つよい）／長い紹介・目次に出てくる（よわい）
    const strong = match([sub, keys, short].join("\n")), all = match(desc);
    for (const [id, n] of all) { if (strong.has(id) || n >= 2) add(TAG, id + "+", i); else add(TAG, id, i); }
    for (const [id] of strong) if (!all.has(id)) add(TAG, id + "+", i);
    // カタカナのことば（ダンゴムシ・ジンベエザメなど、辞書にないものも探せるように）と、出版社のキーワード
    const words = new Set((desc.match(KATA) || []).filter(w => w.length >= 2 && !STOP.has(w)));
    for (const w of keys.split(/[\s,、;；/／・]+/)) if (w.length >= 2 && w.length <= 12) words.add(w);
    for (const w of words) add(KW, w, i);
  });
  process.stdout.write(`\r${Math.min(k + 1000, ALL.length)}/${ALL.length}`);
  await sleep(600);
}
console.log();

// ことばの絞りこみ：たくさんの本に出てくることば（「ストーリー」級）は外す
const MAXDF = Math.max(800, Math.round(ISB.length * 0.03));
const kw = {};
for (const [w, l] of [...KW].sort((a, b) => a[0].localeCompare(b[0]))) if (l.length <= MAXDF) kw[w] = l;
// 辞書のタグ：つよい（+）とよわいを分けて持つ
const tag = {};
for (const c of CX) { const s = TAG.get(c.id + "+") || [], w = TAG.get(c.id) || []; if (s.length || w.length) tag[c.id] = [s, w]; }
const out = { _説明: "すきなものさがしの索引。openBD の内容紹介・目次・キーワードから拾ったことばだけを持つ（文章は持たない）。isbn は ISBN13 の4〜12桁目（9桁）を順につないだもの", date: new Date().toISOString().slice(0, 10), src: "openBD",
  n: ISB.length, isbn: ISB.join(""), form: FORM.join(""), age: AGE, tag, kw, cx: CX };
const js = JSON.stringify(out);
fs.writeFileSync("kw.json", js);
console.log("kw.json", (js.length / 1e6).toFixed(2) + "MB", "gzip", (zlib.gzipSync(js).length / 1e6).toFixed(2) + "MB");

// --- 報告（題名と数だけ。内容紹介は書かない） ---
fs.mkdirSync("work", { recursive: true });
const top = (o, n = 25) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
const T9 = new Map([...TITLE].map(([k, v]) => [k.slice(3, 12), v]));
const lab = i => { const v = T9.get(ISB[i]) || ["?", "?"]; const a = AGE.find(x => x[0] === i); return `${v[0]}｜${v[1]}｜${FORM[i]}${a ? "｜" + a[1] + "〜" + (a[2] ?? "") : ""}`; };
let md = `# すきなものさがし 索引の報告（${out.date}）\n\n`;
md += `- 問い合わせたISBN ${ALL.length.toLocaleString()} → openBD にあった本 ${ISB.length.toLocaleString()}（内容紹介あり ${STAT.desc.toLocaleString()}）\n`;
md += `- 形（Cコード）：${JSON.stringify(STAT.form)}\n- 年齢を拾えた本：${AGE.length.toLocaleString()} ${JSON.stringify(STAT.age)}\n`;
md += `- TextType：${JSON.stringify(STAT.tt)}\n- Subject の種類：${JSON.stringify(STAT.scheme)}\n- Audience：${JSON.stringify(top(STAT.aud, 15))}\n`;
md += `- カタカナ・キーワード ${Object.keys(kw).length.toLocaleString()}語（${MAXDF}冊より多い語は外す）\n- kw.json ${(js.length / 1e6).toFixed(2)}MB（gzip ${(zlib.gzipSync(js).length / 1e6).toFixed(2)}MB）\n\n`;
md += `## 出版社ごとの内容紹介のある割合（索引の本が多い順）\n\n| 出版社 | 索引のISBN | 内容紹介あり |\n|---|---:|---:|\n`;
for (const [p, n] of top(STAT.pubAll, 30)) md += `| ${p} | ${n} | ${STAT.pubDesc[p] || 0}（${Math.round(100 * (STAT.pubDesc[p] || 0) / n)}%） |\n`;
md += `\n## 辞書のことばごとの冊数（つよい／よわい）\n\n`;
md += CX.map(c => `${c.name} ${(tag[c.id] || [[], []])[0].length}/${(tag[c.id] || [[], []])[1].length}`).join("・") + "\n";
for (const id of ["shachi", "kujira", "same", "kaeru", "kuma"]) {
  const [s, w] = tag[id] || [[], []];
  md += `\n### ${id}\n\nつよい（${s.length}）\n\n` + s.slice(0, 60).map(i => "- " + lab(i)).join("\n") + `\n\nよわい（${w.length}）\n\n` + w.slice(0, 40).map(i => "- " + lab(i)).join("\n") + "\n";
}
for (const w of ["シャチ", "オルカ", "ダンゴムシ", "ジンベエザメ"]) md += `\n### カタカナ「${w}」 ${(kw[w] || []).length}冊\n\n` + (kw[w] || []).slice(0, 30).map(i => "- " + lab(i)).join("\n") + "\n";
fs.writeFileSync("work/interests_report.md", md);
console.log("work/interests_report.md");
