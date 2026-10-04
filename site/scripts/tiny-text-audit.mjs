// 小字号文本对比度实测 —— 对每个 <16px 文本元素，向上解析出实际背景色，
// 按 WCAG 相对亮度公式实算对比度，并判定大文本资格（≥24px 或 ≥18.66px 粗体）。
// 用法：cd site && node scripts/tiny-text-audit.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const PORT = 4893;
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

const SELS = ['p', 'li', 'span', 'td', 'th', 'blockquote', 'dd', 'dt', 'figcaption', 'a', 'summary'];

let totalFail = 0, total = 0;
const fails = [];

for (const pg of PAGES) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${PORT}/${pg}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate((sels) => {
    const hexToRgb = (h) => {
      h = h.replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const parseColor = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return { rgb: p.slice(0, 3), a: p[3] ?? 1 };
    };
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    // 向上找第一个不透明背景
    const bgOf = (el) => {
      let n = el, guard = 0;
      while (n && n !== document.documentElement && guard++ < 30) {
        const cs = getComputedStyle(n);
        const c = parseColor(cs.backgroundColor);
        if (c && c.a > 0.5) return toHex(c.rgb);
        n = n.parentElement;
      }
      return '#ffffff';
    };
    const out = [];
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        const t = (el.textContent || '').trim();
        if (!t || t.length < 4 || el.children.length > 2) continue;
        const cs = getComputedStyle(el);
        const px = parseFloat(cs.fontSize);
        if (px >= 16) continue;
        const fg = parseColor(cs.color);
        if (!fg) continue;
        const bg = bgOf(el);
        const fgbg = hexToRgb(bg);
        const r = ratio(fg.rgb, fgbg);
        const w = parseFloat(cs.fontWeight) || 400;
        const isLarge = px >= 24 || (px >= 18.66 && w >= 700);
        out.push({ px, ratio: Math.round(r * 100) / 100, fg: toHex(fg.rgb), bg, isLarge, cls: (el.className?.toString() || '').slice(0, 34), txt: t.slice(0, 30) });
      }
    }
    return out;
  }, SELS);

  const bad = r.filter((x) => x.isLarge ? x.ratio < 3.01 : x.ratio < 4.51);
  total += r.length; totalFail += bad.length;
  console.log(`\n=== ${pg}（1440px）===  <16px 元素 ${r.length} 个，对比度不合格 ${bad.length} 个`);
  for (const b of [...bad].sort((a, b2) => a.ratio - b2.ratio)) {
    fails.push({ page: pg, ...b });
    console.log(`  ${String(b.ratio).padStart(6)}:1  ${String(b.px).padStart(6)}px  ${b.fg} on ${b.bg}  <${b.cls}>"${b.txt}"`);
  }
  await page.close();
}

console.log(`\n=== 汇总 ===`);
console.log(`小字号元素总数 ${total} | 对比度不合格 ${totalFail}`);
const uniq = [...new Set(fails.map((f) => `${f.fg} on ${f.bg}`))];
console.log(`不合格色对: ${uniq.join(' | ')}`);
await br.close();
srv.close();
