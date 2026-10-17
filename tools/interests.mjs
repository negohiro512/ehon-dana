// すきなものさがしの索引（kw.json）をつくる（2026-10-17）
//   「シャチが好き」のように、書名に入っていなくても「出てくる本」を探せるようにする。
//   A. 国立国会図書館（NDL）：児童書（NDLC Y1…）の内容紹介・内容細目を、すきなもの辞書（interests.json）のことばで引く
//      例：description="シャチ" AND ndlc="Y1" → 『だーれのは?』（講談社）『うみのなかま』（永岡書店）など
//   B. openBD：出版社の内容紹介・目次・キーワード・Cコード（絵本／図鑑）。新しい本が中心
//   どちらも、拾ったことばが辞書の決まり（しゃちほこ・きかんしゃちゅう は外す 等）に合うときだけ数える。
//   内容紹介の文章そのものは保存しない（どの本に出てくるか・年齢の目安だけ）。
//   NDL は3秒に1回。辞書のことばごとの結果は work/ndl_cache.json に覚えておき、ことばの決まりを変えたもの・古くなったものだけ引き直す。
// 使い方：リポジトリの直下で  node tools/interests.mjs   （--only=shachi,kujira で一部だけ／--no-ndl／--no-openbd／--max-min=300 で時間の上限）
import fs from "fs";
import zlib from "zlib";
import crypto from "crypto";
import { compile, makeMatcher } from "./interests_compile.mjs";

const ARG = process.argv.slice(2), opt = k => (ARG.find(a => a.startsWith("--" + k + "=")) || "").split("=")[1];
const ONLY = opt("only") ? new Set(opt("only").split(",")) : null;
const NO_NDL = ARG.includes("--no-ndl"), NO_OBD = ARG.includes("--no-openbd");
const T_END = Date.now() + (+opt("max-min") || 300) * 60e3;
const REFRESH_DAYS = 60;
const nfkc = s => (s || "").normalize("NFKC");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "ehon-dana/0.4 (+https://negohiro512.github.io/ehon-dana/)" };
function isbn13(i) { i = (i || "").replace(/[^0-9X]/g, ""); if (i.length === 13) return i; if (i.length !== 10) return "";
  const b = "978" + i.slice(0, 9); let s = 0; for (let k = 0; k < 12; k++) s += (+b[k]) * (k % 2 ? 3 : 1); return b + ((10 - s % 10) % 10); }
// アプリ（index.html）と同じ、作品の鍵（書名｜出版社）
const nt = s => nfkc(s).split(/ : | \/ |\s=\s/)[0].replace(/[\s　・,，、。.!！?？「」『』()（）\[\]〜~ー～-]/g, "");
const np = p => nfkc(nfkc(p).split("|")[0].replace(/^株式会社\s*/, "")).replace(/^(株式会社|\(株\))|株式会社$/g, "").trim();
const toKata = s => nfkc(s).replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));

// --- 索引 ---
const raw = Buffer.from(fs.readFileSync("data.txt", "utf8").trim(), "base64");
const recs = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString("utf8"));
const N = fs.existsSync("new.json") ? JSON.parse(fs.readFileSync("new.json", "utf8")) : { records: [] };
const P = fs.existsSync("isbn_plus.json") ? JSON.parse(fs.readFileSync("isbn_plus.json", "utf8")) : {};
const BYISBN = new Map(), BYKEY = new Map();
for (const r of [...recs, ...(N.records || [])]) {
  const i = isbn13(r.i); if (i && i.startsWith("978") && !BYISBN.has(i)) BYISBN.set(i, r);
  const k = nt(r.t) + "|" + np(r.p); if (!BYKEY.has(k)) BYKEY.set(k, r);
}
for (const k in P) { const i = isbn13(P[k]); if (i && !BYISBN.has(i)) BYISBN.set(i, { t: k.split("|")[0], p: k.split("|")[1] || "", i, k: "plus" }); }
// 索引の本を指す印：ISBNがあれば9桁、なければ「書名｜出版社」
const refOf = r => { const i = isbn13(r.i); return i && i.startsWith("978") ? i.slice(3, 12) : nt(r.t) + "|" + np(r.p); };
const labOf = new Map();

// --- 拾い方 ---
const I = JSON.parse(fs.readFileSync("interests.json", "utf8"));
const CX = compile(I.concepts);
const CXBY = new Map(CX.map(c => [c.id, c]));
const matchAll = makeMatcher(CX);
const match1 = c => makeMatcher([c]);
const ageOfText = s => {
  const t = nfkc(s).replace(/[〇]/g, "0").replace(/[〜～]/g, "~");
  let m;
  if ((m = t.match(/読んであげるなら[:：\s]*(\d)\s*(?:歳|才)\s*(半)?/))) return [+m[1] + (m[2] ? .5 : 0), null];
  if ((m = t.match(/(?<![0-9])([0-6])\s*[~ー-]\s*([0-9])\s*(?:歳|才|さい)/))) return [+m[1], +m[2]];
  if ((m = t.match(/(?<![0-9])([0-6])\s*[・,、]\s*([0-6])(?:\s*[・,、]\s*([0-6]))?\s*(?:歳|才|さい)/))) return [+m[1], +(m[3] || m[2])];
  if ((m = t.match(/対象年齢[:：\s]*(\d)\s*(?:歳|才)/))) return [+m[1], null];
  if ((m = t.match(/(?<![0-9])([0-6])\s*(?:歳|才|さい)\s*(半)?\s*(?:ごろ|頃|くらい)?\s*(?:から|以上|~)/))) return [+m[1] + (m[2] ? .5 : 0), null];
  if ((m = t.match(/(?<![0-9])([0-6])\s*(?:歳|才|さい)\s*(?:児|向け|むけ|の(?:お子|子|こ))/))) return [+m[1], +m[1]];
  if (/(?:あかちゃん|赤ちゃん|乳児)\s*(?:から|向け|むけ|に読|とママ|と読|のための)/.test(t)) return [0, 2];
  return null;
};
const AGE = {}, FORM = {};
const setAge = (ref, a) => { if (a && !AGE[ref]) AGE[ref] = a; };

// ========== A. NDL ==========
const CACHE_F = "work/ndl_cache.json";
const CACHE = fs.existsSync(CACHE_F) ? JSON.parse(fs.readFileSync(CACHE_F, "utf8")) : {};
const hash = c => crypto.createHash("md5").update("p2/" + c.rx + "/" + c.nx + "/" + c.words.join(",")).digest("hex").slice(0, 10);
// NDL の「description」で引くことば：カタカナにそろえて重ならないように（NDLはひらがな・カタカナを同じに扱う）
const ndlForms = c => [...new Set(c.words.filter(w => !w.startsWith("/") && [...w].length >= 1).map(w => toKata(w)))].filter(w => w.length >= 2 || /[一-龯]/.test(w));
const xmlText = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const ADMIN = /^(type :|表現種別|機器種別|キャリア種別|所蔵場所|配架場所|資料種別|基底材|\d+$|.{0,4}刊の再刊$)/;
async function sru(q, start, n) {
  const u = "https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&version=1.2&recordSchema=dcndl&recordPacking=xml&maximumRecords=" + n + "&startRecord=" + start + "&query=" + encodeURIComponent(q);
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(u, { headers: UA }); const x = await r.text(); await sleep(3000);
      if (r.status === 429 || r.status >= 500) { console.log("NDL", r.status); await sleep(30000 * (t + 1)); continue; }
      return x;
    } catch (e) { console.log("NDL error", String(e)); await sleep(10000 * (t + 1)); }
  }
  return "";
}
function parseRec(x) {
  const g = re => [...x.matchAll(re)].map(m => xmlText(m[1]).trim());
  const isbns = g(/<dcterms:identifier rdf:datatype="[^"]*ISBN">([^<]+)</g).map(isbn13).filter(Boolean);
  const title = g(/<dcterms:title>([^<]*)</g)[0] || "";
  const pub = g(/<dcterms:publisher>[\s\S]*?<foaf:name>([^<]*)</g)[0] || "";
  const head = [title, ...g(/<dcndl:alternative>[\s\S]*?<rdf:value>([^<]*)</g), ...g(/<dcndl:seriesTitle>[\s\S]*?<rdf:value>([^<]*)</g), ...g(/<rdfs:label>([^<]*)</g)].join("\n");
  const ab = g(/<dcterms:abstract[^>]*>([^<]*)</g).join("\n");
  // 読み（dcndl:transcription）は外す：「シャチョウ」のように読みが似ているだけの本が混じるため。ほかの文字は全部見る（内容細目・注記など）
  const body = xmlText(x.replace(/<dcndl:transcription[^>]*>[^<]*<\/dcndl:transcription>/g, " ").replace(/<[^>]+>/g, "\n")).split("\n").map(s => s.trim()).filter(s => s && !ADMIN.test(s)).join("\n");
  return { isbns, title, pub, head: nfkc(head), body: nfkc(body), ab: nfkc(ab) };
}
// NDLの1件 → 索引の本（ISBN → 書名＋出版社）
function toIndex(r) {
  for (const i of r.isbns) { const x = BYISBN.get(i); if (x) return x; }
  return BYKEY.get(nt(r.title) + "|" + np(r.pub)) || null;
}
async function ndlConcept(c) {
  const h = hash(c), old = CACHE[c.id];
  if (old && old.h === h && (Date.now() - Date.parse(old.d)) < REFRESH_DAYS * 864e5) return old;
  const m1 = match1(c), hits = new Map(); let n = 0, cut = 0, miss = 0, unv = 0;
  for (const f of ndlForms(c)) {
    if (Date.now() > T_END) return null;
    for (let start = 1; start <= 500; start += 500) {
      const x = await sru(`description="${f}" AND ndlc="Y1"`, start, 500);
      const num = +((x.match(/<numberOfRecords>(\d+)/) || [])[1] || 0);
      for (const part of x.split(/<record>/).slice(1)) {
        n++; const r = parseRec(part);
        const inHead = m1(r.head).get(c.id) || 0, inBody = m1(r.body).get(c.id) || 0;
        const ix = toIndex(r); if (!ix) { miss++; continue; }    // 索引にない本（研究報告・洋書など）
        // 書誌の文字にことばが見つからない本：NDL の内容紹介（書誌の外）に当たっている。カタカナ・漢字3文字以上で引いたときだけ、よわいとして入れる
        if (!inHead && !inBody) { if ([...f].length >= 3 && !/^[ぁ-ゖー]+$/.test(f) && !(c.nx && new RegExp(c.nx).test(r.head + r.body))) { unv++; const ref = refOf(ix); labOf.set(ref, (ix.t || "") + "｜" + (ix.p || "")); if (!hits.has(ref)) hits.set(ref, 1); } continue; }
        const ref = refOf(ix); labOf.set(ref, (ix.t || "") + "｜" + (ix.p || ""));
        const st = inHead ? 3 : (inBody >= 2 || (m1(r.ab).get(c.id) || 0)) ? 2 : 1;
        hits.set(ref, Math.max(hits.get(ref) || 0, st));
        const a = ageOfText(r.body); if (a) setAge(ref, a);
      }
      if (num > 500) cut++;
      break;
    }
  }
  const res = { h, unv, d: new Date().toISOString().slice(0, 10), n, cut, miss, hits: [...hits].sort((a, b) => b[1] - a[1]), age: Object.fromEntries([...hits.keys()].filter(r => AGE[r]).map(r => [r, AGE[r]])) };
  CACHE[c.id] = res;
  fs.mkdirSync("work", { recursive: true }); fs.writeFileSync(CACHE_F, JSON.stringify(CACHE));
  return res;
}
const NDL = {};
if (!NO_NDL) {
  for (const c of CX) {
    if (ONLY && !ONLY.has(c.id)) { if (CACHE[c.id]) NDL[c.id] = CACHE[c.id]; continue; }
    const r = await ndlConcept(c);
    if (!r) { console.log("時間切れ。つづきは次の回に"); if (CACHE[c.id]) NDL[c.id] = CACHE[c.id]; continue; }
    NDL[c.id] = r; for (const [ref, a] of Object.entries(r.age || {})) setAge(ref, a);
    console.log(c.id, r.hits.length, r.cut ? "（500件で切れた）" : "");
  }
} else for (const id in CACHE) NDL[id] = CACHE[id];

// ========== B. openBD ==========
const OBD = new Map(); const KW = new Map(); const STAT = { obd: 0, desc: 0 };
const KATA = /[ァ-ヴ][ァ-ヴー]+/g;
const STOP = new Set("ページ シリーズ イラスト ストーリー カラー サイズ ハードカバー ソフトカバー オールカラー テーマ タイトル メッセージ キャラクター ポイント ラスト シーン スタート ファン プレゼント ギフト ベストセラー ロングセラー リズム ユーモア ユーモラス テンポ イメージ コミカル チャレンジ ボリューム ジャンル スタイル ワクワク ドキドキ ハラハラ ニコニコ".split(" "));
const formOf = c => !c ? "" : c[1] === "7" ? "E" : c[1] === "6" ? "Z" : c[0] === "8" ? "K" : "A";
if (!NO_OBD) {
  const ALL = [...BYISBN.keys()];
  for (let k = 0; k < ALL.length; k += 1000) {
    const part = ALL.slice(k, k + 1000); let res = null;
    for (let t = 0; t < 5 && !res; t++) { try { const r = await fetch("https://api.openbd.jp/v1/get", { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "isbn=" + part.join(",") }); if (r.ok) res = await r.json(); } catch (e) {} if (!res) await sleep(3000 * (t + 1)); }
    (res || []).forEach((d, j) => {
      if (!d || !d.onix) return; STAT.obd++;
      const ix = BYISBN.get(part[j]), ref = refOf(ix);
      const on = d.onix, dd = on.DescriptiveDetail || {}, subj = dd.Subject || [];
      const cc = (subj.find(s => s.SubjectSchemeIdentifier === "78") || {}).SubjectCode || "";
      const keys = subj.filter(s => s.SubjectSchemeIdentifier === "20").map(s => s.SubjectHeadingText || "").join(" ");
      const tcs = (on.CollateralDetail || {}).TextContent || [], hm = d.hanmoto || {};
      const desc = nfkc([...tcs.map(x => x.Text || ""), hm.kaisetsu105w || "", hm.maegakinado || ""].join("\n").replace(/<[^>]+>/g, " "));
      const short = nfkc([...tcs.filter(x => x.TextType === "02").map(x => x.Text || ""), hm.kaisetsu105w || ""].join("\n"));
      const f = formOf(cc); if (f) FORM[ref] = f;
      setAge(ref, ageOfText(desc));
      if (desc.trim()) STAT.desc++;
      labOf.set(ref, (ix.t || "") + "｜" + (ix.p || ""));
      OBD.set(ref, { strong: matchAll([keys, short].join("\n")), all: matchAll(desc) });
      const words = new Set((desc.match(KATA) || []).filter(w => w.length >= 2 && !STOP.has(w)));
      for (const w of keys.split(/[\s,、;；/／・]+/)) if (w.length >= 2 && w.length <= 12) words.add(w);
      for (const w of words) { let l = KW.get(w); if (!l) KW.set(w, l = []); l.push(ref); }
    });
    process.stdout.write(`\ropenBD ${Math.min(k + 1000, ALL.length)}/${ALL.length}`);
    await sleep(600);
  }
  console.log();
}

// ========== まとめる ==========
// tag[概念] = [[つよい印...],[よわい印...]]  つよい＝書名・キーワード・要約に出る／2回以上出る
const tag = {}, ST = {};
for (const c of CX) {
  const m = new Map();
  for (const [ref, st] of (NDL[c.id] || {}).hits || []) m.set(ref, Math.max(m.get(ref) || 0, st));
  for (const [ref, o] of OBD) { const n = o.all.get(c.id) || 0, s = o.strong.get(c.id) || 0; if (n || s) m.set(ref, Math.max(m.get(ref) || 0, s ? 3 : n >= 2 ? 2 : 1)); }
  const s = [...m].filter(([, v]) => v >= 2).map(([r]) => r), w = [...m].filter(([, v]) => v < 2).map(([r]) => r);
  if (s.length || w.length) tag[c.id] = [s, w];
  ST[c.id] = [s.length, w.length, (NDL[c.id] || {}).cut || 0];
}
const MAXDF = 800, kw = {};
for (const [w, l] of [...KW].sort((a, b) => a[0].localeCompare(b[0]))) if (l.length <= MAXDF) kw[w] = l;
const out = { _説明: "すきなものさがしの索引（2026-10-17）。国立国会図書館の児童書の内容紹介と、openBD の内容紹介・目次・キーワードから、辞書のことばが出てくる本を集めたもの（文章は持たない）。印は ISBN13 の4〜12桁目（9桁）か「書名｜出版社」",
  date: new Date().toISOString().slice(0, 10), src: "NDL・openBD", tag, age: AGE, form: FORM, kw, cx: CX };
const js = JSON.stringify(out);
fs.writeFileSync("kw.json", js);
console.log("kw.json", (js.length / 1e6).toFixed(2) + "MB", "gzip", (zlib.gzipSync(js).length / 1e6).toFixed(2) + "MB");

// --- 報告（題名と数だけ） ---
const lab = r => (labOf.get(r) || r) + (FORM[r] ? "｜" + FORM[r] : "") + (AGE[r] ? "｜" + AGE[r][0] + "〜" + (AGE[r][1] ?? "") : "");
let md = `# すきなものさがし 索引の報告（${out.date}）\n\n- NDL：辞書 ${Object.keys(NDL).length}/${CX.length} 語を引いた\n- openBD：${STAT.obd.toLocaleString()}冊（内容紹介あり ${STAT.desc.toLocaleString()}）\n- 年齢の目安を拾えた本 ${Object.keys(AGE).length.toLocaleString()}／形（Cコード）${Object.keys(FORM).length.toLocaleString()}\n- カタカナ・キーワード ${Object.keys(kw).length.toLocaleString()}語\n- kw.json ${(js.length / 1e6).toFixed(2)}MB（gzip ${(zlib.gzipSync(js).length / 1e6).toFixed(2)}MB）\n\n`;
md += `## ことばごとの冊数（つよい／よわい、NDLで500件を超えて切れたことば）\n\n` + CX.map(c => `${c.name} ${ST[c.id][0]}/${ST[c.id][1]}${ST[c.id][2] ? "✂" : ""}`).join("・") + "\n";
for (const id of ["shachi", "kujira", "dangomushi", "kaeru", "shinkansen"]) { const [s, w] = tag[id] || [[], []];
  md += `\n### ${(CXBY.get(id) || {}).name}\n\nつよい（${s.length}）\n\n` + s.slice(0, 50).map(r => "- " + lab(r)).join("\n") + `\n\nよわい（${w.length}）\n\n` + w.slice(0, 30).map(r => "- " + lab(r)).join("\n") + "\n"; }
fs.mkdirSync("work", { recursive: true }); fs.writeFileSync("work/interests_report.md", md);
