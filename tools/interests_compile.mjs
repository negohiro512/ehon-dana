// すきなもの辞書（interests.json）を正規表現にする（2026-10-17）
// アプリ（index.html）はこの結果を kw.json の cx から読むので、書名と内容紹介で同じ決まりが使われる
const KATA = /^[ァ-ヴー・]+$/, HIRA = /^[ぁ-ゖー]+$/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
// ひらがなの前後：ほかのひらがなにつながっていないこと（助詞・「さん」「くん」「ちゃん」「たち」は可）
const H_BEFORE = "(?:(?<![ぁ-ゖ])|(?<=[のとがはもをにへやで]))";
const H_AFTER = "(?=$|[^ぁ-ゖ]|[のとがはもをにへやでさくちたよねだぁぃぅぇぉ])";

export function formRx(f, pre) {
  if (f.startsWith("/")) return [f.replace(/^\/|\/$/g, "")];
  if (KATA.test(f)) return [(pre ? "" : "(?<![ァ-ヴー])") + esc(f) + "(?![ァ-ヴー])"];
  if (HIRA.test(f)) return [(pre ? "" : H_BEFORE) + esc(f) + H_AFTER];
  return [esc(f)];
}

export function compile(concepts) {
  return concepts.map(c => {
    const parts = [];
    for (const f of c.w) {
      parts.push(...formRx(f, c.pre));
      if (KATA.test(f) && !c.nohira) parts.push(...formRx(hira(f), c.pre));
    }
    return { id: c.id, name: c.name, up: c.up || [], rx: parts.join("|"), nx: (c.ng || []).join("|"),
      // 検索のことばと見くらべる書き方（カタカナにそろえる）
      words: [c.name, ...c.w.filter(f => !f.startsWith("/"))] };
  });
}

// 1つのテキストに何回出てくるか（まちがえやすいことばは先に消す）
export function makeMatcher(cx) {
  const L = cx.map(c => ({ c, rx: new RegExp(c.rx, "g"), nx: c.nx ? new RegExp(c.nx, "g") : null }));
  return text => {
    const out = new Map(); if (!text) return out;
    for (const { c, rx, nx } of L) {
      const t = nx ? text.replace(nx, "＿") : text;
      const m = t.match(rx); if (m) out.set(c.id, m.length);
    }
    return out;
  };
}
