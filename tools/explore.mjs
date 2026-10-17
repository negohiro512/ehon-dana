// ためし（10/17）：内容で探せる外部データを調べる。結果は work/explore.md（題名・件数・項目名だけ。紹介文は書かない）
import fs from "fs";
const out = [];
const log = s => { out.push(s); console.log(s); };
const UA = { "User-Agent": "ehon-dana/0.4 (+https://negohiro512.github.io/ehon-dana/)", "Origin": "https://negohiro512.github.io" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) { const r = await fetch(u, { headers: UA }); return { st: r.status, cors: r.headers.get("access-control-allow-origin"), txt: await r.text() }; }
// NDL SRU
for (const q of ['anywhere="シャチ" AND ndc="E"', 'anywhere="シャチ" AND ndlc="Y17"', 'subject="シャチ"', 'anywhere="しゃち" AND ndc="E"', 'anywhere="クジラ" AND ndc="E"', 'title="まいごのオルカ"', 'title="ねないこだれだ"']) {
  const u = "https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&version=1.2&recordSchema=dcndl&recordPacking=xml&maximumRecords=30&query=" + encodeURIComponent(q);
  try { const r = await get(u); const n = (r.txt.match(/<numberOfRecords>(\d+)/) || [])[1];
    log(`\n## NDL ${q}\nstatus ${r.st} cors ${r.cors} 件数 ${n}`);
    const recs = r.txt.split(/<record>/).slice(1);
    for (const x of recs) { const t = (x.match(/<dcterms:title>([^<]*)/) || [])[1], p = (x.match(/<dcterms:publisher>[\s\S]*?<foaf:name>([^<]*)/) || [])[1], y = (x.match(/<dcterms:date>([^<]*)/) || [])[1];
      const tags = [...new Set((x.match(/<(dcterms|dcndl|dc):[A-Za-z]+/g) || []))].join(" ");
      const ab = (x.match(/<dcterms:(abstract|description|tableOfContents)[^>]*>/g) || []).length;
      log(`- ${t}｜${p}｜${y}｜abstract系 ${ab}`); if (q.startsWith("title")) log("  項目: " + tags); }
  } catch (e) { log("NDL error " + e); }
  await sleep(3000);
}
// Google Books
for (const q of ["シャチ", "シャチ 絵本", "しゃち えほん", "オルカ 絵本", "intitle:まいごのオルカ"]) {
  const u = "https://www.googleapis.com/books/v1/volumes?maxResults=40&langRestrict=ja&printType=books&q=" + encodeURIComponent(q);
  try { const r = await get(u); const j = JSON.parse(r.txt);
    log(`\n## Google Books ${q}\nstatus ${r.st} cors ${r.cors} 件数 ${j.totalItems}`);
    for (const it of j.items || []) { const v = it.volumeInfo || {}; const is = (v.industryIdentifiers || []).map(x => x.identifier).join(",");
      log(`- ${v.title}｜${v.publisher || ""}｜${v.publishedDate || ""}｜${is}｜説明 ${(v.description || "").length}字｜${(v.categories || []).join("/")}`); }
  } catch (e) { log("GB error " + e); }
  await sleep(1500);
}
// Google Books ISBNごとの説明の有無（索引の有名どころ20冊）
let hit = 0;
for (const i of ["9784834000825", "9784834014655", "9784834008975", "9784834001853", "9784031310208", "9784494005833", "9784593504466", "9784061322981", "9784772100465", "9784591079423"]) {
  const r = await get("https://www.googleapis.com/books/v1/volumes?q=isbn:" + i); const j = JSON.parse(r.txt); const v = ((j.items || [])[0] || {}).volumeInfo || {};
  log(`- isbn ${i} ${v.title || "なし"} 説明 ${(v.description || "").length}字`); if (v.description) hit++; await sleep(800); }
log("GB 説明あり " + hit + "/10");
fs.mkdirSync("work", { recursive: true }); fs.writeFileSync("work/explore.md", out.join("\n"));
