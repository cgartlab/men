// 遮挡 / 越界审计 —— 找出「元素互相压住」「超出视口」「被固定页头盖住」的问题
//
// 为什么需要它：页面标题被固定页头压住这类问题，CSS 里看不出来（页头是 fixed、正文偏移写死），
// 只有把渲染后的几何盒两两求交才能发现。本次就是它抓到「窄屏页头 105px vs 正文 top 32px →
// h1 被盖 60%」的。
//
// 判定与排除：
//   · 只比对「带文字或可交互」的元素；跳过祖先-后代关系；跳过两个行内元素（同一行内不可能互遮）
//   · 排除 <details> 关闭时的内容（Chrome 下仍有布局盒但不绘制 → 假阳性）
//   · 排除背景装饰层（.bg-layer，z-index 低于页头）
//   · 越界检查跳过可横滑容器内的元素（宽表格 / 拓扑图是设计上的横向滚动）
//
// 用法：node scripts/overlap-audit.mjs
//   · 排除 <details> 关闭时的内容（Chrome 下仍有布局盒但不绘制 → 会造出假阳性）
//   · 排除祖先-后代关系；只看「带文字或可交互」的元素
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const DETECT = String.raw`(() => {
  const vw = window.innerWidth;
  const label = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter((c) => c && !c.startsWith('astro-')).slice(0, 2).join('.');
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = own.replace(/\s+/g, ' ').trim().slice(0, 22);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (own ? ' 「' + own + '」' : '');
  };
  const hasText = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true; return false; };
  const inClosedDetails = (el) => { let n = el; while (n && n !== document.body) { if (n.tagName === 'DETAILS' && !n.open) return true; n = n.parentElement; } return false; };
  const scrollableAncestor = (el) => { let p = el.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (['auto', 'scroll', 'hidden'].includes(s.overflowX)) return true; p = p.parentElement; } return false; };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    if (inClosedDetails(el)) return false;
    const b = el.getBoundingClientRect();
    return b.width > 4 && b.height > 4;
  };
  const out = { pairs: [], overflow: [], fixedOver: [] };
  const all = [...document.querySelectorAll('body *')].filter(visible);
  const rects = new Map();
  for (const el of all) rects.set(el, el.getBoundingClientRect());

  for (const el of all) {
    const b = rects.get(el);
    if (getComputedStyle(el).position === 'fixed') continue;
    if ((b.left < -1 || b.right > vw + 1) && !scrollableAncestor(el)) out.overflow.push({ d: label(el), left: Math.round(b.left), right: Math.round(b.right) });
  }

  const isInline = (el) => getComputedStyle(el).display.startsWith('inline');
  const interesting = all.filter((el) => hasText(el) || /^(A|BUTTON|INPUT|SUMMARY)$/.test(el.tagName));
  for (let i = 0; i < interesting.length; i++) {
    for (let j = i + 1; j < interesting.length; j++) {
      const a = interesting[i], b = interesting[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (isInline(a) && isInline(b)) continue;   // 同行内元素不可能互相遮挡
      const ra = rects.get(a), rb = rects.get(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox <= 2 || oy <= 2) continue;
      const small = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (small <= 0) continue;
      const ratio = (ox * oy) / small;
      if (ratio > 0.35) out.pairs.push({ a: label(a), b: label(b), ratio: +ratio.toFixed(2),
        A: [Math.round(ra.left), Math.round(ra.top), Math.round(ra.width), Math.round(ra.height)],
        B: [Math.round(rb.left), Math.round(rb.top), Math.round(rb.width), Math.round(rb.height)] });
    }
  }

  const fixeds = all.filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position))
    .filter((el) => !el.className || !String(el.className).includes('bg-layer'));
  for (const f of fixeds) {
    const rf = rects.get(f);
    for (const t of interesting) {
      if (f.contains(t) || t.contains(f) || fixeds.includes(t)) continue;
      if (isInline(f) && isInline(t)) continue;
      const rt = rects.get(t);
      const ox = Math.min(rf.right, rt.right) - Math.max(rf.left, rt.left);
      const oy = Math.min(rf.bottom, rt.bottom) - Math.max(rf.top, rt.top);
      if (ox <= 2 || oy <= 2) continue;
      const small = Math.min(rf.width * rf.height, rt.width * rt.height);
      if (small > 0 && (ox * oy) / small > 0.3) out.fixedOver.push({ fixed: label(f), covered: label(t), ratio: +((ox * oy) / small).toFixed(2) });
    }
  }
  out.header = (() => { const h = document.querySelector('.site-header'); if (!h) return null; const b = h.getBoundingClientRect(); return { h: Math.round(b.height), bottom: Math.round(b.bottom) }; })();
  out.firstContent = (() => { const m = document.querySelector('main > *'); if (!m) return null; const b = m.getBoundingClientRect(); return { d: label(m), top: Math.round(b.top) }; })();
  return out;
})()`;

const br = await launchBrowser();
try {
  for (const [label, w, h] of [['1440', 1440, 900], ['390', 390, 844], ['360', 360, 800]]) {
    const ctx = await br.newContext({ viewport: { width: w, height: h } });
    for (const pg of ['index.html', 'roles/index.html', 'mechanisms/index.html', 'docs/quickstart/index.html']) {
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(250);
      const r = await page.evaluate(DETECT);
      const tag = `${label}px ${pg}`;
      const problems = r.overflow.length + r.pairs.length + r.fixedOver.length;
      if (!problems) { console.log(`✓ [${tag}] 无遮挡/越界 · 页头高 ${r.header.h}px，正文首元素 top=${r.firstContent.top}px`); }
      else {
        console.log(`\n⚠ [${tag}] 页头高 ${r.header.h}px · 正文首元素「${r.firstContent.d}」top=${r.firstContent.top}px`);
        for (const x of r.overflow.slice(0, 5)) console.log(`    [越界] ${x.d} left=${x.left} right=${x.right}`);
        for (const x of r.fixedOver.slice(0, 5)) console.log(`    [页头压住] ${x.fixed} → ${x.covered}（${(x.ratio * 100) | 0}%）`);
        for (const x of r.pairs.sort((p, q) => q.ratio - p.ratio).slice(0, 6)) console.log(`    [互相压住] ${x.a} ↔ ${x.b}（${(x.ratio * 100) | 0}%）A=${x.A} B=${x.B}`);
      }
      await page.close();
    }
    await ctx.close();
  }
} finally { await br.close(); srv.close(); }
