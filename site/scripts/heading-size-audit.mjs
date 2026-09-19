// 未定义令牌 --font-size-h5 的实际影响 —— 4 处使用均未定义，var() 无 fallback
// 时属性在 computed-value 阶段失效，font-size 作为可继承属性退化为继承值。
// 其中 2 处是 <h3>，若渲染为正文尺寸则标题层级视觉失效。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist', PORT = 4895;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(DIST, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end(await readFile(join(DIST, '404.html')).catch(() => '404')); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const br = await chromium.launch();
const ctx = await br.newContext();

for (const pg of ['docs/index.html', 'docs/quickstart/index.html', 'mechanisms/index.html', 'roles/index.html', 'index.html']) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${PORT}/${pg}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const out = [];
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'p']) {
      for (const el of [...document.querySelectorAll(tag)].slice(0, 4)) {
        const cs = getComputedStyle(el);
        out.push({ tag, px: parseFloat(cs.fontSize), cls: (el.className?.toString() || '').slice(0, 30), txt: (el.textContent || '').trim().slice(0, 24) });
      }
    }
    return out;
  });
  const rows = r.filter((x) => x.tag === 'h3').concat(r.filter((x) => x.tag === 'h1'));
  console.log('\n=== ' + pg + ' ===');
  console.log('  ' + r.filter((x) => x.tag === 'h1').map((x) => `h1=${x.px}px`).join(' ') + ' | ' + r.filter((x) => x.tag === 'h2').slice(0, 2).map((x) => `h2=${x.px}px`).join(' ') + ' | ' + r.filter((x) => x.tag === 'h3').slice(0, 3).map((x) => `h3=${x.px}px`).join(' '));
  for (const h of r.filter((x) => x.tag === 'h3').slice(0, 3)) console.log(`    h3 ${h.px}px  .${h.cls}  "${h.txt}"`);
  await page.close();
}
await br.close();
srv.close();
