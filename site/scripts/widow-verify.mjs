// 孤行修正 · 候选验证器 —— 手工拟定文案改动后，用它判定是否真的让「末行」达标
//
// 为什么需要它：中文没有词边界，text-wrap: pretty 对中文几乎无效，CSS 也没有「最后一行」
// 选择器 —— 所以「末行 ≥4 字符」这条标准**无法用 CSS 达成**，只能改文案或改列宽后实测折行。
// 本脚本就是那个实测器：在**已构建产物**（dist）上做 DOM 文本替换，逐字测量末行，
// **不需要重新构建**，因此可以在几秒内试十几个候选写法。
//
// 用法：
//   VERIFY_IN=candidates.json VERIFY_OUT=out.json node scripts/widow-verify.mjs
//   候选格式：[{ page, cssPath, oldText, newText, mode?, note? }]
//     · page      —— 例如 /docs/release/index.html（带前导斜杠）
//     · cssPath   —— 目标块的选择器路径（可用 widow-audit.mjs --json 的 cssPath 字段）
//     · oldText   —— 该块**当前**的文本（mode:'text'）或 innerHTML 片段（mode:'html'）
//     · mode      —— 默认 'text'；块内含 <code>/<strong> 等行内标记时必须用 'html'
//   判定 PASS = 桌面 1440 与手机 390 两个断点的末行可见字符数都 ≥ VERIFY_MIN（默认 4）。
//   含行内标记的块若用 text 模式，脚本会明确报 has-inline-children 而不是静默测错。
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const IN = process.env.VERIFY_IN;
const OUT = process.env.VERIFY_OUT || 'C:/Users/cgart/AppData/Local/hermes/cache/scratch/widow-verify.json';
const MIN = Number(process.env.VERIFY_MIN || '4');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
};
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const b = await readFile(join('dist', p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const MEASURE = `(selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const isVis = (ch) => ch.trim() !== '' && !/[\\u200b-\\u200f\\u2060-\\u2064\\ufeff]/.test(ch);
  const rows = []; let cur = null;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue || '';
    for (let i = 0; i < t.length; i++) {
      const r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + 1);
      const rects = r.getClientRects();
      if (!rects.length) continue;
      const rc = rects[0];
      if (!cur || Math.abs(rc.top - cur.top) > 3) { cur = { top: rc.top, chars: 0, text: '' }; rows.push(cur); }
      if (isVis(t[i])) { cur.chars += 1; cur.text += t[i]; }
    }
  }
  return { lines: rows.length, lastChars: rows.length ? rows[rows.length - 1].chars : 0, lastText: rows.length ? rows[rows.length - 1].text.slice(-16) : '' };
}`;

const cands = JSON.parse(await readFile(IN, 'utf8'));
const br = await launchBrowser();
const results = [];
try {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  for (const c of cands) {
    const url = `http://127.0.0.1:${PORT}${c.page}`;
    if (page.url() !== url) {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(150);
    }
    const grabbed = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? { html: el.innerHTML, text: el.textContent } : null;
    }, c.cssPath);
    if (!grabbed) { results.push({ ...c, status: 'dom-not-found' }); continue; }

    const measureBoth = async () => {
      const res = {};
      for (const [label, w, h] of [['desktop', 1440, 900], ['mobile', 390, 780]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(50);
        res[label] = await page.evaluate(`(${MEASURE})(${JSON.stringify(c.cssPath)})`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      return res;
    };

    const before = await measureBoth();
    // mode: 'text'（默认，块内无行内标记）| 'html'（块内含 <code>/<strong> 等，按 innerHTML 替换）
    const applied = await page.evaluate(({ s, oldText, newText, mode }) => {
      const el = document.querySelector(s);
      if (!el) return 'no-el';
      if (mode === 'html') {
        if (!el.innerHTML.includes(oldText)) return 'html-mismatch';
        el.innerHTML = el.innerHTML.replace(oldText, newText);
        return 'ok';
      }
      if (el.children.length) return 'has-inline-children（必须用 mode:"html"）';
      if (!el.textContent.includes(oldText)) return 'text-mismatch（oldText 需与块内文本完全一致）';
      el.textContent = el.textContent.replace(oldText, newText);
      return 'ok';
    }, { s: c.cssPath, oldText: c.oldText, newText: c.newText, mode: c.mode || 'text' });
    let after = null;
    if (applied === 'ok') after = await measureBoth();
    await page.evaluate(({ s, html }) => { const el = document.querySelector(s); if (el) el.innerHTML = html; }, { s: c.cssPath, html: grabbed.html });
    const ok = after && ['desktop', 'mobile'].every((k) => after[k] && after[k].lastChars >= MIN);
    results.push({
      page: c.page, cssPath: c.cssPath, note: c.note || '',
      status: applied !== 'ok' ? applied : ok ? 'PASS' : 'FAIL',
      before: { d: before.desktop && before.desktop.lastChars, m: before.mobile && before.mobile.lastChars },
      after: after ? { d: after.desktop && after.desktop.lastChars, m: after.mobile && after.mobile.lastChars } : null,
      newText: c.newText,
    });
    console.log(`${ok ? '✓' : '✗'} ${c.page} ${(c.note || c.newText).slice(0, 60)}  ${before.desktop && before.desktop.lastChars}/${before.mobile && before.mobile.lastChars} → ${after ? after.desktop.lastChars + '/' + after.mobile.lastChars : applied}`);
  }
} finally {
  await br.close();
  srv.close();
}
await writeFile(OUT, JSON.stringify(results, null, 1), 'utf8');
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\n通过 ${pass} / ${results.length}`);
