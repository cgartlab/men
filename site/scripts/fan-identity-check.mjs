
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'app/x' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
try {
  await new Promise((ok) => server.listen(4910, ok));
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4910/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const d = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.showcase__hand .showcase__card')];
    // 旋转不改变元素外接矩形的中心 → 用「中心点命中测试」判定可见性（可靠）
    const centerHit = (el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === el || el.contains(hit));
    };
    return cards.map((c, i) => ({
      i, id: c.dataset.agent,
      icon: centerHit(c.querySelector('.showcase__card-icon')),
      head: centerHit(c.querySelector('.showcase__card-head')),
      role: centerHit(c.querySelector('.showcase__card-role')),
      z: getComputedStyle(c).zIndex,
    }));
  });
  console.log('扇形手牌 · 身份可读性（扇形每张牌只露左边一条，身份区必须完整可见）');
  d.forEach(r => console.log(` ${r.i} ${r.id.padEnd(4)}  图标${r.icon?'✓':'✗'}  汉字+代号${r.head?'✓':'✗'}  职责${r.role?'✓':'✗'}`));
  const bad = d.filter(r => !r.head || !r.icon || !r.role);
  if (bad.length) { console.log(`\n✗ 身份不可见：${bad.map(r=>r.id).join(', ')}`); process.exitCode = 1; }
  else console.log('\n✓ 六张牌的身份区（图标 / 汉字+代号 / 职责）全部可读');
  await browser.close();
} finally { server.close(); }
