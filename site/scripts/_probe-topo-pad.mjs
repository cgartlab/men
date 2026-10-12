// 拓扑图节点内部间距审计：量每个节点的 rect 边框与内部各 text 行的上下左右间距
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

const br = await launchBrowser();
try {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const fmt = (n) => Math.round(n);
    const out = [];

    for (const g of document.querySelectorAll('.topo-diagram g')) {
      // 找该 g 里的主 rect（排除 pulse / badge）
      const rect = g.querySelector('rect:not(.topo-pulse):not(.topo-badge)');
      const texts = [...g.querySelectorAll('text')];
      if (!rect || texts.length === 0) continue;

      const rb = R(rect);
      const rc = (rect.getAttribute('class') || '').split(' ').find((c) => c.includes('node') || c === 'topo-badge') || '?';

      // badge 是浮标，单独量
      const badge = g.querySelector('rect.topo-badge');
      const badgeText = g.querySelector('.topo-label--badge');

      const rows = texts.filter((t) => t !== badgeText).map((t) => {
        const tb = R(t);
        return {
          txt: t.textContent.trim().slice(0, 20),
          cls: (t.getAttribute('class') || '').split(' ').pop(),
          // 文字到 rect 四边的距离
          padTop: fmt(tb.t - rb.t),
          padBottom: fmt(rb.b - tb.b),
          padLeft: fmt(tb.l - rb.l),
          padRight: fmt(rb.r - tb.r),
          // 文字行高
          h: fmt(tb.h),
        };
      });

      const entry = {
        node: rc,
        rectW: fmt(rb.w), rectH: fmt(rb.h),
        rows,
      };
      if (badge && badgeText) {
        const bb = R(badge), bt = R(badgeText);
        entry.badge = { w: fmt(bb.w), h: fmt(bb.h), padTop: fmt(bt.t - bb.t), padBottom: fmt(bb.b - bt.b), padLeft: fmt(bt.l - bb.l), padRight: fmt(bb.r - bt.r) };
      }
      out.push(entry);
    }
    return out;
  });

  console.log('\n拓扑图节点内部间距（rect 边框 ↔ 文字）\n');
  console.log('  节点'.padEnd(28) + '宽×高'.padEnd(10) + '文字行'.padEnd(22) + '上'.padStart(4) + ' 下'.padStart(4) + ' 左'.padStart(4) + ' 右'.padStart(4) + '  行高');
  console.log('-'.repeat(95));

  // 收集同类节点的 padding 做比对
  const byType = {};
  for (const n of r) {
    for (const row of n.rows) {
      const type = row.cls.replace('topo-label--', '');
      if (!byType[type]) byType[type] = [];
      byType[type].push({ node: n.node, ...row });
    }
  }

  for (const n of r) {
    for (const row of n.rows) {
      const flag = [];
      // 左右 padding 应对称（居中 text-anchor=middle）
      if (Math.abs(row.padLeft - row.padRight) > 2) flag.push('◀▶不对称');
      // 上下 padding 应合理（不贴边）
      if (row.padTop < 4) flag.push('上贴边');
      if (row.padBottom < 2 && row.cls.includes('micro') === false) flag.push('下贴边');
      console.log('  ' + (n.node + ' ' + row.txt).slice(0, 26).padEnd(28) + (n.rectW + '×' + n.rectH).padEnd(10) + row.cls.replace('topo-label--', '').padEnd(22) + String(row.padTop).padStart(4) + String(row.padBottom).padStart(4) + String(row.padLeft).padStart(4) + String(row.padRight).padStart(4) + '  ' + row.h + 'px' + (flag.length ? '  ⚠ ' + flag.join(', ') : ''));
    }
    if (n.badge) {
      const b = n.badge;
      const flag = Math.abs(b.padLeft - b.padRight) > 2 ? '⚠ ◀▶不对称' : '';
      console.log('  ' + (n.node + ' [badge]').slice(0, 26).padEnd(28) + (b.w + '×' + b.h).padEnd(10) + 'badge'.padEnd(22) + String(b.padTop).padStart(4) + String(b.padBottom).padStart(4) + String(b.padLeft).padStart(4) + String(b.padRight).padStart(4) + '  ' + flag);
    }
    console.log();
  }

  // 汇总：同类节点 padding 是否一致
  console.log('─'.repeat(95));
  console.log('同类文字行的 padding 一致性：');
  for (const [type, items] of Object.entries(byType)) {
    if (items.length < 2) continue;
    const pT = [...new Set(items.map((x) => x.padTop))];
    const pB = [...new Set(items.map((x) => x.padBottom))];
    const pL = [...new Set(items.map((x) => x.padLeft))];
    const pR = [...new Set(items.map((x) => x.padRight))];
    const ok = pT.length === 1 && pB.length === 1 && pL.length === 1 && pR.length === 1;
    console.log(`  ${type.padEnd(20)} ${items.length}个  上[${pT.join('/')}] 下[${pB.join('/')}] 左[${pL.join('/')}] 右[${pR.join('/')}]  ${ok ? '✓ 一致' : '✗ 不一致'}`);
  }

  await ctx.close();
} finally { await br.close(); srv.close(); }
