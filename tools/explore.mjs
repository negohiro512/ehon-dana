// ためし2（10/17）：NDLの anywhere 検索をどの分類で絞るか。結果は work/explore.md（題名・件数・項目名と長さだけ）
import fs from "fs";
const out = []; const log = s => { out.push(s); console.log(s); };
const UA = { "User-Agent": "ehon-dana/0.4 (+https://negohiro512.github.io/ehon-dana/)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q1 = async (q, n = 30, show = true, fields = false) => {
  const u = "https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&version=1.2&recordSchema=dcndl&recordPacking=xml&maximumRecords=" + n + "&query=" + encodeURIComponent(q);
  const r = await fetch(u, { headers: UA }); const x = await r.text(); await sleep(3000);
  const num = (x.match(/<numberOfRecords>(\d+)/) || [])[1]; log(`\n## ${q}\n件数 ${num}${/diagnostic/.test(x) ? " 診断:" + (x.match(/<diag:message>([^<]*)/) || [])[1] : ""}`);
  if (!show) return;
  for (const rec of x.split(/<record>/).slice(1)) {
    const t = (rec.match(/<dcterms:title>([^<]*)/) || [])[1], p = (rec.match(/<dcterms:publisher>[\s\S]*?<foaf:name>([^<]*)/) || [])[1], y = (rec.match(/<dcterms:date>([^<]*)/) || [])[1];
    const cls = [...rec.matchAll(/<dcterms:subject rdf:resource="[^"]*\/(ndlc|ndc\d*)\/([^"]+)"/g)].map(m => m[1] + ":" + m[2]).join(",");
    log(`- ${t}｜${p}｜${y}｜${cls}`);
    if (fields) { const f = {}; for (const m of rec.matchAll(/<((?:dcterms|dcndl|dc):[A-Za-z]+)[^>]*>([^<]*)</g)) { f[m[1]] = (f[m[1]] || 0) + m[2].length; } log("  項目と文字数: " + JSON.stringify(f));
      const ab = [...rec.matchAll(/<dcterms:(abstract|description|tableOfContents)[^>]*>([^<]{0,40})/g)].map(m => m[1] + ":" + m[2].replace(/\s+/g, " ")).slice(0, 6); log("  " + ab.join(" ／ ")); }
  }
};
await q1('anywhere="シャチ" AND ndlc="Y1"', 60);
await q1('anywhere="シャチ" AND ndlc="Y17"', 5, true, true);
await q1('anywhere="シャチ" AND ndc="726.6"', 40);
await q1('anywhere="シャチ" AND ndc="E"', 5, false);
await q1('anywhere="シャチ" AND ndc="E" AND ndlc="Y1"', 5, false);
await q1('anywhere="シャチ" AND (ndlc="Y1" OR ndc="726.6")', 5, false);
await q1('description="シャチ" AND ndlc="Y1"', 40);
await q1('anywhere="シャチ"', 5, false);
await q1('anywhere="ねこ" AND ndlc="Y17"', 3, false);
await q1('anywhere="ダンゴムシ" AND ndlc="Y1"', 20);
await q1('title="うみのなかま" AND publisher="永岡"', 3, true, true);
await q1('title="だーれのは"', 3, true, true);
fs.mkdirSync("work", { recursive: true }); fs.writeFileSync("work/explore.md", out.join("\n"));
