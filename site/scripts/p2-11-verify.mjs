// P2-11 验证：角色标签字号/字重升级后是否满足大文本资格
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4905;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const br = await chromium.launch();
try {
  const p = await (await br.newContext()).newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 30_000 });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.showcase__card-role')) {
      const card = el.closest('.showcase__card');
      const id = card?.getAttribute('data-agent') || 'team';
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize); // px
      const fw = parseInt(cs.fontWeight);
      const largeText = (fs >= 18.66 && fw >= 700) || fs >= 24;
      out.push({ id, fontSize: cs.fontSize, fontWeight: cs.fontWeight, largeText, text: el.textContent.trim().slice(0, 20) });
    }
    return out;
  });
  console.log('=== .showcase__card-role 修复后计算值 ===');
  let allOk = true;
  for (const c of r) {
    const ok = c.largeText;
    if (!ok) allOk = false;
    console.log(`  [${c.id}] ${c.fontSize} weight=${c.fontWeight} largeText=${c.largeText ? '✓' : '✗'} text="${c.text}"`);
  }
  console.log(allOk ? '\n✅ 全部满足大文本资格（≥18.66px + ≥700 或 ≥24px）→ 3:1 阈值适用' : '\n❌ 仍有不满足的');
  process.exitCode = allOk ? 0 : 1;
} catch (e) { console.error('[ERR] ' + e.message); process.exitCode = 1; }
finally {
  try { await Promise.race([br.close(), new Promise((_, rj) => setTimeout(() => rj(new Error('t')), 5000))]); } catch {}
  srv.close();
  process.exit(process.exitCode || 0);
}
