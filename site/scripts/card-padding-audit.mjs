// 卡片内边距审计 v2 —— 量「边框 ↔ 子元素墨迹」的视觉间距
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
const port = srv.address().port;

const INK = String.raw`(() => {
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; };
  const inClosedDetails = (el) => { let n = el; while (n && n !== document.body) { if (n.tagName === 'DETAILS' && !n.open) return true; n = n.parentElement; } return false; };
  const vis = (el) => visible(el) && !inClosedDetails(el);
  const painted = (cs) => (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
  const LEAF = new Set(['svg','img','video','input','button','select','hr','iframe']);
  const ink = (el) => {
    if (!vis(el)) return null;
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    if (tag === 'br' || tag === '#text') return null;
    const b0 = el.getBoundingClientRect();
    if (LEAF.has(tag) || painted(cs)) return b0.width > 0.5 && b0.height > 0.5 ? { l: b0.left, t: b0.top, r: b0.right, b: b0.bottom } : null;
    let acc = null;
    for (const n of el.childNodes) {
      let b = null;
      if (n.nodeType === 3) {
        if (!n.nodeValue.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5);
        if (!rects.length) continue;
        b = { l: Math.min(...rects.map((r) => r.left)), t: Math.min(...rects.map((r) => r.top)), r: Math.max(...rects.map((r) => r.right)), b: Math.max(...rects.map((r) => r.bottom)) };
        const fs = parseFloat(cs.fontSize) || 16, lh = parseFloat(cs.lineHeight);
        if (!Number.isNaN(lh) && lh > fs) { const lead = (lh - fs) / 2; b.t += lead; b.b -= lead; }
      } else if (n.nodeType === 1) b = ink(n);
      if (b) acc = acc ? { l: Math.min(acc.l, b.l), t: Math.min(acc.t, b.t), r: Math.max(acc.r, b.r), b: Math.max(acc.b, b.b) } : b;
    }
    return acc;
  };

  const measure = (el) => {
    const rb = el.getBoundingClientRect();
    let acc = null;
    for (const child of el.children) {
      const ib = ink(child);
      if (ib) acc = acc ? { l: Math.min(acc.l, ib.l), t: Math.min(acc.t, ib.t), r: Math.max(acc.r, ib.r), b: Math.max(acc.b, ib.b) } : ib;
    }
    if (!acc) return null;
    return {
      rectW: Math.round(rb.width), rectH: Math.round(rb.height),
      inkL: Math.round(acc.l - rb.left), inkR: Math.round(rb.right - acc.r),
      inkT: Math.round(acc.t - rb.top), inkB: Math.round(rb.bottom - acc.b),
    };
  };

  const CARDS = [
    ['.showcase__card', '角色卡'],
    ['.hero-install', '安装卡'],
    ['.event-group', '事件分组卡'],
    ['.faq__item', 'FAQ 条目'],
    ['.mechanisms__item', '机制条目'],
    ['.cta__inner', 'CTA 区块'],
    ['.cmd-card', '命令卡'],
    ['.step-card', '步骤卡'],
  ];
  const out = [];
  for (const [sel, label] of CARDS) {
    const els = document.querySelectorAll(sel);
    if (!els.length) continue;
    const m = measure(els[0]);
    if (!m) continue;
    const cs = getComputedStyle(els[0]);
    out.push({ label, sel, count: els.length, ...m,
      cssPL: cs.paddingLeft, cssPR: cs.paddingRight, cssPT: cs.paddingTop, cssPB: cs.paddingBottom,
      lr: Math.abs(m.inkL - m.inkR), tb: Math.abs(m.inkT - m.inkB) });
  }
  return out;
})()`;

const br = await launchBrowser();
try {
  for (const [pgPath, pgLabel] of [['/index.html', '首页'], ['/mechanisms/index.html', '机制页']]) {
    const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}${pgPath}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const r = await page.evaluate(INK);
    console.log(`\n${'='.repeat(95)}\n${pgLabel} · 卡片内边距审计（边框 ↔ 子元素墨迹的视觉间距）\n${'='.repeat(95)}`);
    console.log(`卡片类型         数量  宽×高     左   右   上   下   左右差 上下差  CSS padding(L/R/T/B)`);
    console.log('-'.repeat(95));
    for (const c of r) {
      const lr = c.lr > 2 ? '✗' : '✓';
      const tb = c.tb > 2 ? '✗' : '✓';
      console.log(`${c.label.padEnd(14)} ${String(c.count).padStart(4)}  ${String(c.rectW).padStart(4)}×${String(c.rectH).padStart(4)}  ${String(c.inkL).padStart(3)}  ${String(c.inkR).padStart(3)}  ${String(c.inkT).padStart(3)}  ${String(c.inkB).padStart(3)}  ${lr} ${String(c.lr).padStart(3)}  ${tb} ${String(c.tb).padStart(3)}  ${c.cssPL}/${c.cssPR}/${c.cssPT}/${c.cssPB}`);
    }
    await ctx.close();
  }
} finally { await br.close(); srv.close(); }
