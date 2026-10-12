// 字体回流实测：量化 font-display:swap 带来的布局位移（CLS 代理指标）
// 做法：加载页面后在字体就绪前后各量一次关键元素的位置/宽度，看差多少像素。
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

const PAGES = ['', 'docs/overview/', 'roles/', 'mechanisms/'];
const br = await launchBrowser();
try {
  for (const pg of PAGES) {
    const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    // 阻塞 CDN 字体，直到我们主动放行 —— 模拟「字体慢到达」
    let release;
    const gate = new Promise((r) => { release = r; });
    let held = 0;
    await page.route('**/code.oppo.com/**', async (route) => {
      held++;
      await gate;                      // 卡住，直到字体就绪前先量一次
      await route.continue();
    });

    await page.goto(`http://127.0.0.1:${port}/${pg}`, { waitUntil: 'commit' });
    await page.waitForTimeout(500);

    // 字体还没到：量一次（这是用户最初看到的样子）
    const before = await page.evaluate(() => {
      const R = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), t: Math.round(b.top) }; };
      return {
        h1: R('h1'), desc: R('main p, .doc-lead'), nav: R('.site-header__nav'),
        docH: Math.round(document.documentElement.scrollHeight),
      };
    });

    release();                          // 放行字体
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => {
      const R = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), t: Math.round(b.top) }; };
      return {
        h1: R('h1'), desc: R('main p, .doc-lead'), nav: R('.site-header__nav'),
        docH: Math.round(document.documentElement.scrollHeight),
      };
    });

    console.log(`\n${pg || 'index'}`);
    for (const k of ['h1', 'desc', 'nav']) {
      const b = before[k], a = after[k];
      if (!b || !a) continue;
      const dw = a.w - b.w, dh = a.h - b.h, dt = a.t - b.t;
      const changed = dw !== 0 || dh !== 0 || dt !== 0;
      console.log(`  ${k.padEnd(5)} ${b.w}×${b.h}@${b.t} → ${a.w}×${a.h}@${a.t}   Δ宽 ${dw >= 0 ? '+' : ''}${dw}  Δ高 ${dh >= 0 ? '+' : ''}${dh}  Δ顶 ${dt >= 0 ? '+' : ''}${dt}  ${changed ? '⚠ 跳变' : '✓ 稳定'}`);
    }
    const dDoc = after.docH - before.docH;
    console.log(`  整页高度 ${before.docH} → ${after.docH}  Δ${dDoc >= 0 ? '+' : ''}${dDoc}px  ${Math.abs(dDoc) > 20 ? '⚠ 明显回流' : Math.abs(dDoc) > 5 ? '△ 轻微' : '✓ 无'}`);
    await ctx.close();
  }
} finally { await br.close(); srv.close(); }
