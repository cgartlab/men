// 跨页面「同名组件」一致性审计：同一个 class 在不同页面的 computed style 是否一致
// 这比按标签名比对严谨 —— class 相同就意味着设计意图相同，样式就该相同。
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

const PAGES = ['', 'about/', 'roles/', 'mechanisms/', 'docs/', 'docs/overview/', 'docs/quickstart/', 'docs/protocols/', 'docs/architecture/', 'docs/agents/', 'docs/configure/', 'docs/install/', 'docs/releases/', 'docs/bot-mode/', 'docs/governance/', '404.html'];

const PROPS = ['fontSize', 'fontWeight', 'lineHeight', 'color', 'letterSpacing', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'padding', 'margin', 'borderRadius', 'maxWidth'];

const br = await launchBrowser();
try {
  const byClass = {};

  for (const pg of PAGES) {
    const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/${pg}`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(300);
    const rows = await page.evaluate((props) => {
      const out = {};
      for (const el of document.querySelectorAll('main *, header *, footer *')) {
        const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/)
          .filter((c) => c && !c.startsWith('astro-') && !/^(is|has)-/.test(c)).sort().join('.');
        if (!cls) continue;
        const cs = getComputedStyle(el);
        const st = {};
        for (const p of props) {
          let v = cs[p];
          if (p === 'maxWidth' && v === 'none') continue;
          if (typeof v === 'string') v = v.replace(/-?\d+\.\d+/g, (m) => String(Math.round(parseFloat(m) * 10) / 10));
          st[p] = v;
        }
        const key = JSON.stringify(st);
        (out[cls] = out[cls] || {})[key] = ((out[cls] || {})[key] || 0) + 1;
      }
      return out;
    }, PROPS);

    for (const [cls, variants] of Object.entries(rows)) {
      if (!byClass[cls]) byClass[cls] = { pages: {}, intraPage: [] };
      if (Object.keys(variants).length > 1) byClass[cls].intraPage.push(pg || 'index');
      const top = Object.entries(variants).sort((a, b) => b[1] - a[1])[0][0];
      byClass[cls].pages[pg || 'index'] = top;
    }
    await ctx.close();
  }

  const cross = [];
  const intra = [];
  for (const [cls, info] of Object.entries(byClass)) {
    const pageStyles = Object.entries(info.pages);
    if (pageStyles.length < 2) continue;
    const uniq = [...new Set(pageStyles.map(([, v]) => v))];
    if (uniq.length > 1) cross.push({ cls, variants: pageStyles.map(([p, v]) => [p, JSON.parse(v)]) });
    if (info.intraPage.length) intra.push({ cls, pages: info.intraPage });
  }

  console.log(`\n${'='.repeat(100)}\n跨页面同名组件一致性（${PAGES.length} 页 · ${Object.keys(byClass).length} 个 class）\n${'='.repeat(100)}`);

  if (cross.length === 0) console.log('✓ 跨页无同名不同样式');
  else {
    console.log(`\n✗ ${cross.length} 个 class 在不同页面有不同样式：\n`);
    for (const c of cross) {
      console.log(`  ${c.cls}`);
      const keys = Object.keys(c.variants[0][1]);
      const diffProps = keys.filter((k) => new Set(c.variants.map(([, s]) => s[k])).size > 1);
      console.log(`     差异属性: ${diffProps.join(', ')}`);
      for (const [p, s] of c.variants) {
        console.log(`     ${p.padEnd(22)} ${diffProps.map((k) => `${k}=${s[k]}`).join('  ')}`);
      }
      console.log();
    }
  }

  if (intra.length) {
    console.log(`\n⚠ ${intra.length} 个 class 在同一页面内部就有多种样式：`);
    for (const i of intra.slice(0, 15)) console.log(`  ${i.cls.padEnd(42)} ${i.pages.slice(0, 3).join(', ')}`);
  }
} finally { await br.close(); srv.close(); }
