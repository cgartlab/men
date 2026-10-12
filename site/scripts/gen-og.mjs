// 生成 og.png（1200×630 社交分享卡）—— 用法：node scripts/gen-og.mjs
// logo 几何从 GateLogo.astro 的公式现算，不再手抄路径（此前手抄把孔圆心写偏了 7.29 单位）。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

// —— GateLogo 的几何常量（与 src/components/GateLogo.astro 一致）——
const VB_H = 83.7963;
const HCX = 49.9135;   // 孔心 x
const HCY = 40.6010;   // 孔心 y
const R_FULL = 19.0983; // 主孔半径（≥48px）
const OUTER =
  'M 49.4949,12.2222 C 34.4265,12.2222 33.9309,0.0 25.5529,0.0 C -3.0669,0.0 0.104,11.5407 0.104,41.3544 C 0.104,70.5679 -0.8861,74.2725 20.6975,83.2112 C 32.2645,88.0015 27.2247,61.9479 49.8298,61.9479 C 71.9301,61.9479 67.6945,87.8998 78.962,83.0437 C 100.8451,73.6126 100.8205,70.6946 99.5555,40.5173 C 98.3835,12.557 102.3083,0.0 74.4415,0.0 C 66.6945,0.0 67.0189,12.2222 49.4949,12.2222 Z';
const holePath =
  `M ${(HCX + R_FULL).toFixed(4)},${HCY}` +
  ` A ${R_FULL},${R_FULL} 0 1 0 ${(HCX - R_FULL).toFixed(4)},${HCY}` +
  ` A ${R_FULL},${R_FULL} 0 1 0 ${(HCX + R_FULL).toFixed(4)},${HCY} Z`;
const LOGO_D = OUTER + ' ' + holePath;

// 站点自己的静态服务器（build 产物），字体走线上 CDN
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

// 字体 CSS 从产物里取（保证用的是站点真实加载的那条 @font-face）
const layoutHtml = await readFile(join('dist', 'index.html'), 'utf8');
const fontFace = [...layoutHtml.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]).join('\n');

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
${fontFace}
html,body{margin:0;padding:0}
body{
  width:1200px;height:630px;display:flex;flex-direction:column;
  justify-content:center;align-items:center;
  background:#faf9f5;font-family:"OPPO Sans",sans-serif;
  -webkit-font-smoothing:antialiased;
}
.logo{margin-bottom:34px}
.title{font-size:78px;font-weight:600;color:#2b2a27;letter-spacing:1px;margin:0 0 18px;line-height:1.2}
.sub{font-size:30px;color:#5e5d59;margin:0 0 46px;line-height:1.5}
.url{font-size:22px;font-family:"Hack Nerd Font",monospace;color:#8f3d28;letter-spacing:0.5px;margin:0}
</style></head><body>
<svg class="logo" width="132" height="${(132 / (100 / VB_H)).toFixed(1)}" viewBox="0 0 100 ${VB_H}" xmlns="http://www.w3.org/2000/svg">
  <path fill="#bc513a" fill-rule="evenodd" d="${LOGO_D}"/>
</svg>
<h1 class="title">Men</h1>
<p class="sub">你说一句话，剩下交给它们。</p>
<p class="url">men.cgartlab.com</p>
</body></html>`;

const br = await launchBrowser();
try {
  const ctx = await br.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // 走本地服务器以便相对路径/CSS 正常解析，同时 fonts.ready 可等待
  await page.route('**/og-preview', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.goto(`http://127.0.0.1:${port}/index.html#og`, { waitUntil: 'domcontentloaded' });
  await page.setContent(html, { waitUntil: 'networkidle' });
  // 等 webfont 真正就绪，否则文字会先用兜底字体渲染
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  // 自检：字体是否真的用上了、logo 孔圆心是否居中
  const check = await page.evaluate(() => {
    const t = document.querySelector('.title');
    const svg = document.querySelector('.logo');
    const sb = svg.getBoundingClientRect();
    return {
      titleFont: getComputedStyle(t).fontFamily,
      logoW: Math.round(sb.width), logoH: Math.round(sb.height),
      logoCx: Math.round(sb.left + sb.width / 2),
      titleCx: Math.round(t.getBoundingClientRect().left + t.getBoundingClientRect().width / 2),
      fontsReady: document.fonts.status,
    };
  });
  await page.screenshot({ path: join('public', 'og.png') });
  console.log('✓ public/og.png 已生成');
  console.log(`  字体状态 ${check.fontsReady} · ${check.titleFont}`);
  console.log(`  logo ${check.logoW}×${check.logoH} 中心 x=${check.logoCx}`);
  console.log(`  标题中心 x=${check.titleCx}  ${Math.abs(check.logoCx - check.titleCx) <= 1 ? '✓ 对齐' : '✗ 未对齐'}`);
} finally {
  await br.close();
  srv.close();
}
