// R21 定点重摄：仅首页（P2-11 角色标签 14→20px + R18 infobox 标题 14→16px 后视觉变化）
// 复用 shot.mjs 的进程内 server + finally 模式，仅重摄 index.html × 3 断点
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const OUT = '../docs/reports/screenshots';
const PORT = 4906;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(DIST, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const br = await chromium.launch();
const results = [];
try {
  const ctx = await br.newContext();
  for (const [label, w, h] of [['375', 375, 667], ['768', 768, 1024], ['1440', 1440, 900]]) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 15_000 });
    await p.waitForTimeout(600);
    const name = `home-${label}.png`;
    const buf = await p.screenshot({ fullPage: true, type: 'png' });
    await writeFile(join(OUT, name), buf);
    results.push(`${name} ${buf.length} bytes`);
    await p.close();
  }
  await ctx.close();
} finally {
  try { await Promise.race([br.close(), new Promise((_, rj) => setTimeout(() => rj(new Error('t')), 5000))]); } catch {}
  srv.close();
}
console.log('=== R21 定点重摄（仅首页）===');
results.forEach(r => console.log('  ' + r));
