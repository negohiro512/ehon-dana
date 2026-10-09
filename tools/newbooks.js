// 新刊さがし（毎週）：openBD（出版社が出している書誌データ）から、絵本だなにまだない新しい絵本を見つける。
// ブラウザでも Node でも動く（Node は tools/newbooks.mjs から呼ぶ）。
// 見つけ方：
//   1. openBD の全ISBNの一覧（coverage）から、絵本だなに本の多い出版社（ISBNのはじめ8けた）のISBNだけを取り出す
//   2. その出版社で、絵本だなにある本のいちばん大きいISBNより後ろの番号（＝あとから出た本）だけを残す
//   3. 詳しい書誌を引き、Cコードが児童の絵本（C87xx）か児童の図鑑（C86xx）で、出版日が since 以降のものを新刊とする
(function (g) {
  async function findNewBooks({ coverage, indexIsbns, prefixes, since, get }) {
    const pre = new Set(prefixes);
    const have = new Set(indexIsbns);
    const max = new Map();
    for (const i of indexIsbns) { const p = i.slice(0, 8); if (pre.has(p) && (!max.has(p) || i > max.get(p))) max.set(p, i); }
    const cand = coverage.filter(i => i.length === 13 && pre.has(i.slice(0, 8)) && !have.has(i) && max.has(i.slice(0, 8)) && i > max.get(i.slice(0, 8)));
    const out = [];
    for (let k = 0; k < cand.length; k += 1000) {
      const part = cand.slice(k, k + 1000);
      const j = await get(part);
      j.forEach((d, n) => { const r = d && toRecord(d); if (r && r.pd >= since) out.push(r); });
    }
    return { candidates: cand.length, records: out };
  }
  function toRecord(d) {
    const s = d.summary || {}, o = d.onix || {}, dd = o.DescriptiveDetail || {};
    const subj = [].concat(dd.Subject || []);
    const cc = (subj.find(x => x.SubjectSchemeIdentifier === "78") || {}).SubjectCode || "";
    if (!/^C?8[67]/.test(cc)) return null;
    const te = ((dd.TitleDetail || {}).TitleElement) || {};
    const yomi = ((te.TitleText || {}).collationkey || "").replace(/\s/g, "");
    const sub = ((te.Subtitle || {}).content) || "";
    const pd = String(s.pubdate || "").replace(/[^0-9]/g, "");
    if (pd.length < 6) return null;
    const date = pd.slice(0, 4) + "-" + pd.slice(4, 6) + "-" + (pd.slice(6, 8) || "01");
    const title = (s.title || "").trim();
    if (!title) return null;
    return { t: sub ? title + " : " + sub : title, y: yomi, c: (s.author || "").split(/\s+/)[0] || "", p: s.publisher || "", yr: date.slice(0, 4), i: s.isbn, s: s.series || "", k: "N", pd: date, cv: s.cover ? 1 : 0 };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { findNewBooks, toRecord };
  else g.findNewBooks = findNewBooks;
})(this);
