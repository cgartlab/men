// 可点击性感知审计：hover 态与静态态的视觉差是否可辨（不只是 cursor:pointer）
// 只查「有 cursor:pointer 但 hover 时毫无变化」的元素 —— 用户看不出它能点。
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

// 视觉属性（只看这些 —— 变了才说明 hover 有反馈）
const PROPS = ['color', 'backgroundColor', 'borderBottomColor', 'borderTopColor', 'borderLeftColor', 'borderRightColor', 'textDecorationLine', 'boxShadow', 'transform', 'opacity', 'letterSpacing'];

const SNAP = `(el) => {
  const cs = getComputedStyle(el);
  const out = {};
  for (const p of ${JSON.stringify(PROPS)}) out[p] = cs[p];
  return JSON.stringify(out);
}`;

const br = await launchBrowser();
try {
  const findings = [];
  for (const pg of PAGES) {
    const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/${pg}`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(250);

    // 收集可点击元素（排除侧栏/页脚外的纯装饰）
    const targets = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('a[href], button, summary, [role="tab"], .copy-btn, .carousel-dot, [role="button"]')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
        if (el.classList.contains('skip-link')) continue;
        const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter((c) => c && !c.startsWith('astro-')).join('.');
        const r = el.getBoundingClientRect();
        out.push({ i: out.length, sel: el.tagName.toLowerCase() + (cls ? '.' + cls : ''), text: el.textContent.trim().slice(0, 14) || el.getAttribute('aria-label') || '', visible: r.width > 0 && r.height > 0 });
      }
      return out;
    });

    for (const t of targets) {
      if (!t.visible) continue;
      // 静态样式
      const before = await page.evaluate(({ i }) => {
        const els = [...document.querySelectorAll('a[href], button, summary, [role="tab"], .copy-btn, .carousel-dot, [role="button"]')].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && !el.classList.contains('skip-link');
        });
        const el = els[i]; if (!el) return null;
        const cs = getComputedStyle(el);
        const o = {}; for (const p of ["color","backgroundColor","borderBottomColor","borderTopColor","borderLeftColor","borderRightColor","textDecorationLine","boxShadow","transform","opacity","letterSpacing"]) o[p] = cs[p];
        return JSON.stringify(o);
      }, { i: t.i });
      if (!before) continue;

      // hover 后
      const handle = await page.$(`a[href], button, summary, [role="tab"], .copy-btn, .carousel-dot, [role="button"]`);
      // 用 index 定位：改用 evaluate 直接触发 :hover 不可行 → 用 CDP
      const box = await page.evaluate(({ i }) => {
        const els = [...document.querySelectorAll('a[href], button, summary, [role="tab"], .copy-btn, .carousel-dot, [role="button"]')].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && !el.classList.contains('skip-link');
        });
        const el = els[i]; if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, { i: t.i });
      if (!box || box.x < 0 || box.y < 0 || box.x > 1440 || box.y > 900) continue;

      await page.mouse.move(box.x, box.y);
      await page.waitForTimeout(120);
      const after = await page.evaluate(({ i }) => {
        const els = [...document.querySelectorAll('a[href], button, summary, [role="tab"], .copy-btn, .carousel-dot, [role="button"]')].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && !el.classList.contains('skip-link');
        });
        const el = els[i]; if (!el) return null;
        const cs = getComputedStyle(el);
        const o = {}; for (const p of ["color","backgroundColor","borderBottomColor","borderTopColor","borderLeftColor","borderRightColor","textDecorationLine","boxShadow","transform","opacity","letterSpacing"]) o[p] = cs[p];
        return JSON.stringify(o);
      }, { i: t.i });
      await page.mouse.move(2, 2);

      if (after && before !== after) {
        const a = JSON.parse(before), b = JSON.parse(after);
        const diffs = Object.keys(a).filter((k) => a[k] !== b[k]);
        findings.push({ pg: pg || 'index', sel: t.sel, text: t.text, diffs });
      }
    }
    await ctx.close();
  }

  const noHover = findings.filter((f) => f.diffs.length === 0);
  console.log(`\n${'='.repeat(90)}\n可点击性感知 · ${PAGES.length} 页 · 有 hover 反馈的 ${findings.length - noHover.length} 个\n${'='.repeat(90)}`);
  if (!noHover.length) console.log('✓ 每个可点元素都有可见 hover 反馈');
  else {
    console.log(`\n✗ ${noHover.length} 个可点元素 hover 时毫无视觉变化（看不出能点）：\n`);
    const seen = new Set();
    for (const f of noHover) {
      const key = f.sel;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${key.padEnd(38)} 「${f.text}」  /${f.pg}`);
    }
  }
} finally { await br.close(); srv.close(); }
