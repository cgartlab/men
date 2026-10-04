// P2-12 验证：测量 --font-size-h5 引用点的当前计算字号（token 未定义 → 继承值）
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4903;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('404'); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const br = await chromium.launch();
let failed = null;
try {
  const ctx = await br.newContext();
  // 测量两个页面上的 4 个选择器
  const pages = [
    { url: '/mechanisms/', selectors: ['.step-card__header h3'] },
    { url: '/docs/', selectors: ['.docs-category__title'] },
    { url: '/docs/overview/', selectors: ['.doc-section h3', '.wiki-infobox__title'] },
  ];
  for (const { url, selectors } of pages) {
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await p.waitForTimeout(300);
    for (const sel of selectors) {
      const r = await p.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return { found: false };
        const cs = getComputedStyle(el);
        return { found: true, fontSize: cs.fontSize, fontWeight: cs.fontWeight, text: el.textContent.trim().slice(0, 40) };
      }, sel);
      if (r.found) {
        console.log(`  ${url}  ${sel.padEnd(28)} font-size=${r.fontSize}  weight=${r.fontWeight}  text="${r.text}"`);
      } else {
        console.log(`  ${url}  ${sel.padEnd(28)} ✗ 未找到（此页无此元素）`);
      }
    }
    await p.close();
  }
  // 同时测量 body 与 h3 的基准字号作为对照
  const p2 = await ctx.newPage();
  await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 30_000 });
  await p2.waitForTimeout(200);
  const base = await p2.evaluate(() => ({
    body: getComputedStyle(document.body).fontSize,
    h3: (() => { const e = document.querySelector('h3'); return e ? getComputedStyle(e).fontSize : null; })(),
    h4: (() => { const e = document.querySelector('h4'); return e ? getComputedStyle(e).fontSize : null; })(),
  }));
  console.log(`\n  基准：body=${base.body}  h3=${base.h3}  h4=${base.h4}`);
  await p2.close();
} catch (e) {
  failed = e; console.error('[ERR] ' + e.message); process.exitCode = 1;
} finally {
  try { await Promise.race([br.close(), new Promise((_, rj) => setTimeout(() => rj(new Error('t')), 5000))]); } catch {}
  srv.close();
  process.exit(process.exitCode || 0);
}
