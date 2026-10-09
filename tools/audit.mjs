// 毎週の点検：アプリを開いて runAudit() を回し、結果を audit/latest.json・audit/latest.md に書く。
// 書名が本とちがうISBN（データの取り違え）は cover_fix.json の bad に足す（表紙・図書館に使わなくなる）。
// 使い方：リポジトリの直下で  python3 -m http.server 8765 &  node tools/audit.mjs
import { chromium } from "playwright";
import fs from "fs";
const URL = process.env.AUDIT_URL || "http://localhost:8765/";
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.READY === true || (typeof READY !== "undefined" && READY), null, { timeout: 120000 });
const R = await p.evaluate(async () => await runAudit({ max: 30 }));
R.pageErrors = errs;
await b.close();
fs.mkdirSync("audit", { recursive: true });
fs.writeFileSync("audit/latest.json", JSON.stringify(R, null, 1));
const md = [`# 点検の結果（${R.at.slice(0, 10)}・${R.version}）`, "", `調べた本：${R.scope}冊（賞・リスト・シリーズ・特集の本）。openBDで書名を照らせた本：${R.openbdHit ?? "-"}冊`, ""];
for (const [k, n] of Object.entries(R.n)) { md.push(`## ${k}（${n}）`, ...R.ex[k].map(x => `- ${x}`), ""); }
if (errs.length) md.push("## ページのエラー", ...errs.map(x => `- ${x}`));
fs.writeFileSync("audit/latest.md", md.join("\n"));
// 自動の手直し：取り違えのISBNを bad に足す
const F = JSON.parse(fs.readFileSync("cover_fix.json", "utf8"));
const before = new Set(F.bad || []);
const add = (R.badIsbn || []).filter(i => !before.has(i));
if (add.length) { F.bad = [...before, ...add]; fs.writeFileSync("cover_fix.json", JSON.stringify(F, null, 1)); }
console.log(JSON.stringify({ version: R.version, n: R.n, addedBad: add, pageErrors: errs.length }));
if (errs.length) process.exitCode = 1;
