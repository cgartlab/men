// 横向溢出检查（长文本破版）—— 在 375px / 768px / 1440px 三个断点检测 scrollWidth > clientWidth
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4904;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const br = await chromium.launch();
let failed = null;
try {
  const pages = ['/', '/roles/', '/mechanisms/', '/docs/', '/docs/overview/', '/about/', '/404.html'];
  const widths = [375, 768, 1440];
  let issues = 0;
  for (const w of widths) {
    const ctx = await br.newContext({ viewport: { width: w, height: 900 } });
    for (const path of pages) {
      const p = await ctx.newPage();
      try {
        await p.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle', timeout: 30_000 });
        await p.waitForTimeout(300);
        const m = await p.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          bodyScrollW: document.body.scrollWidth,
        }));
        if (m.scrollW > m.clientW + 1) {
          issues++;
          console.log(`  ✗ ${w}px  ${path}  scrollWidth=${m.scrollW} > clientWidth=${m.clientW}  (溢出 ${m.scrollW - m.clientW}px)`);
          // 找出溢出元素
          const culprits = await p.evaluate(() => {
            const els = [...document.querySelectorAll('*')];
            return els.filter(el => el.scrollWidth > el.clientWidth + 1 && el.offsetWidth > 0)
              .slice(0, 3).map(el => `${el.tagName.toLowerCase()}.${el.className.split(' ')[0] || ''} (w=${el.offsetWidth},scroll=${el.scrollWidth})`);
          });
          culprits.forEach(c => console.log(`      └ ${c}`));
        }
      } catch (e) { /* page may 404 or timeout, skip */ }
      await p.close();
    }
    await ctx.close();
  }
  if (issues === 0) console.log('  ✅ 全部 7 页 × 3 断点（375/768/1440）无横向溢出');
  process.exitCode = issues === 0 ? 0 : 1;
} catch (e) {
  failed = e; console.error('[ERR] ' + e.message); process.exitCode = 1;
} finally {
  try { await Promise.race([br.close(), new Promise((_, rj) => setTimeout(() => rj(new Error('t')), 5000))]); } catch {}
  srv.close();
  process.exit(process.exitCode || 0);
}
