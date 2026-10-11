// 孤行修正 · 候选验证器 —— 手工拟定文案改动后，用它判定是否真的让「末行」达标
//
// 为什么需要它：中文没有词边界，text-wrap: pretty 对中文几乎无效，CSS 也没有「最后一行」
// 选择器 —— 所以「末行 ≥4 字符」这条标准**无法用 CSS 达成**，只能改文案或改列宽后实测折行。
// 本脚本就是那个实测器：在**已构建产物**（dist）上做 DOM 文本替换，测量末行，
// **不需要重新构建**，因此可以在几秒内试十几个候选写法。
//
// 测量法与 widow-audit.mjs 完全一致（重要）：
//   整段取一次行盒 → 按 3px 容差把 rect 的 top 聚类成「行」→ 二分定位末行起点。
//   不要用「逐字 rect 按 top 归并」的写法：行内 <code>/<strong> 的 rect top 会偏移 1–2px，
//   会把一行切成多行，造出**假孤行**（实测：逐字法 vs 高度÷行高判据，7 处全判错）。
//
// 用法：
//   VERIFY_IN=candidates.json VERIFY_OUT=out.json node scripts/widow-verify.mjs
//   候选格式：[{ page, cssPath, oldText, newText, mode?, note? }]
//     · page      —— 例如 /docs/release/index.html（带前导斜杠）
//     · cssPath   —— 目标块选择器路径（widow-audit.mjs --json 的 cssPath 字段）
//     · oldText   —— 该块**当前**的文本（mode:'text'）或 innerHTML 片段（mode:'html'）
//     · mode      —— 默认 'text'；块内含 <code>/<strong> 等行内标记时必须用 'html'
//   判定 PASS = 桌面 1440 与手机 390 两个断点的末行可见字符数都 ≥ VERIFY_MIN（默认 4）。
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const IN = process.env.VERIFY_IN;
const OUT = process.env.VERIFY_OUT || 'widow-verify-out.json';
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

// 与 widow-audit.mjs 同款的末行测量
const MEASURE = `(selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const isVisible = (ch) => ch.trim() !== '' && !/[\\u200b-\\u200f\\u2060-\\u2064\\ufeff]/.test(ch);
  const chars = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue || '';
    for (let i = 0; i < t.length; i++) if (isVisible(t[i])) chars.push({ node: n, i, ch: t[i] });
  }
  if (!chars.length) return { lineCount: 0, lastChars: 0, lastText: '' };
  const range = document.createRange();
  const rectsFrom = (idx) => {
    range.setStart(chars[idx].node, chars[idx].i);
    const last = chars[chars.length - 1];
    range.setEnd(last.node, last.i + 1);
    return [...range.getClientRects()];
  };
  const all = rectsFrom(0);
  const sorted = all.map((r) => r.top).sort((a, b) => a - b);
  const clusters = [];
  for (const t of sorted) {
    const c = clusters[clusters.length - 1];
    if (c && t - c.max <= 3) c.max = Math.max(c.max, t); else clusters.push({ min: t, max: t });
  }
  if (clusters.length <= 1) return { lineCount: 1, lastChars: chars.length, lastText: chars.map((c) => c.ch).join('').slice(-16) };
  const lastTop = clusters[clusters.length - 1].min;
  let lo = 0, hi = chars.length - 1, start = chars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const rs = rectsFrom(mid);
    const minTop = rs.length ? Math.min(...rs.map((r) => r.top)) : Infinity;
    if (minTop >= lastTop - 1) { start = mid; hi = mid - 1; } else lo = mid + 1;
  }
  const tail = chars.slice(start);
  return { lineCount: clusters.length, lastChars: tail.length, lastText: tail.map((c) => c.ch).join('').slice(-16) };
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
    if (!grabbed) { results.push({ ...c, status: 'dom-not-found' }); console.log(`✗ 找不到元素 ${c.page} ${c.cssPath}`); continue; }

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
    console.log(`${ok ? '✓' : '✗'} ${c.page} ${(c.note || c.newText).slice(0, 56)}  ${before.desktop && before.desktop.lastChars}/${before.mobile && before.mobile.lastChars} → ${after ? after.desktop.lastChars + '/' + after.mobile.lastChars : applied}`);
  }
} finally {
  await br.close();
  srv.close();
}
await writeFile(OUT, JSON.stringify(results, null, 1), 'utf8');
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\n通过 ${pass} / ${results.length}（判定：末行 ≥${MIN} 字符，桌面 1440 + 手机 390 两端都算）`);
