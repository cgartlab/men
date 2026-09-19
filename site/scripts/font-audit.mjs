// 字号实测分布 —— 判定 global.css:1331 `body{font-size:15px}` 是否真的把
// 正文降到 16px 以下。关键：rem 相对 html 而非 body，故 token 化的
// `var(--font-size-body)`（=1rem）不受 body 自身字号影响。本脚本按实测分布回答。
// 用法：cd site && node scripts/font-audit.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const PORT = 4892;
const PAGES = ['index.html', 'roles/index.html', 'docs/quickstart/index.html', '404.html'];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const buf = await readFile(join(DIST, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(join(DIST, '404.html')).catch(() => '404'));
  }
});

await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const br = await chromium.launch();
const ctx = await br.newContext();

const SELS = ['p', 'li', 'span', 'td', 'th', 'blockquote', 'dd', 'dt', 'figcaption'];
for (const [w, label] of [[375, '手机'], [768, '平板'], [1440, '桌面']]) {
  console.log(`\n=== ${label}（${w}px）===`);
  for (const pg of PAGES) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(`http://127.0.0.1:${PORT}/${pg}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(400);
    const r = await page.evaluate((sels) => {
      const dist = {};
      const small = [];
      for (const s of sels) {
        document.querySelectorAll(s).forEach((el) => {
          const t = (el.textContent || '').trim();
          if (!t || t.length < 12 || el.children.length > 2) return;
          const px = parseFloat(getComputedStyle(el).fontSize);
          dist[px] = (dist[px] || 0) + 1;
          if (px < 16) small.push({ tag: s, px, cls: el.className?.toString().slice(0, 40), txt: t.slice(0, 44) });
        });
      }
      return { dist, small: small.slice(0, 4) };
    }, SELS);
    const sorted = Object.entries(r.dist).sort((a, b) => Number(a[0]) - Number(b[0]));
    const sub = sorted.filter(([k]) => Number(k) < 16);
    console.log(`  ${pg}`);
    console.log(`    分布: ${sorted.map(([k, v]) => `${k}px×${v}`).join('  ')}`);
    console.log(`    <16px 元素数: ${sub.reduce((n, [, v]) => n + v, 0)} / 总 ${sorted.reduce((n, [, v]) => n + v, 0)}`);
    for (const s of r.small) console.log(`      ${String(s.px).padStart(5)}px <${s.tag}> .${s.cls}  "${s.txt}"`);
    await page.close();
  }
}
await br.close();
srv.close();
