// 视觉留档（③）—— 产物级截图与视觉度量
//
// 设计约束（AGENTS.md 进程管理红线）：
//   - 不使用常驻服务：在本脚本进程内起 http server，finally 中 close
//   - 不 spawn 子进程树外存活物，无 detached / 无裸 Start-Process
//   - 总时长上限 60s，超时自杀
//
// 主题：站点为**确定单主题** —— site/src/styles/global.css:36 声明
// `color-scheme: light;`，全站 `prefers-color-scheme` 媒体查询 0 处，
// 唯一 <meta name="theme-color"> 为 #fafafa。故只产出浅色系；
// 「× 明暗主题」无产出可能（暗色截图将与浅色逐字节相同），已在报告说明。
//
// 用法：在 site/ 目录下运行 `node scripts/shot.mjs`
import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const OUT = '../docs/reports/screenshots';
const MANIFEST = '../tmp/shot-manifest.json';
const PORT = 4891; // 避开 AGENTS.md 规定的 4399
const DEADLINE_MS = 60_000;

// 抽样规则：≤5 页全审；多则每类取一。
// 首页 / 列表 / 详情 / 404 各一；表单类 N/A（全站 0 个 <form>，R8 已确认）。
const PAGES = [
  { key: 'home',       path: 'index.html',                kind: '首页' },
  { key: 'roles',      path: 'roles/index.html',          kind: '列表' },
  { key: 'quickstart', path: 'docs/quickstart/index.html', kind: '详情' },
  { key: 'error404',   path: '404.html',                  kind: '404' },
];
// 断点：375（iPhone SE 级小手机）· 768（iPad 竖屏）· 1440（桌面常规）
const VIEWPORTS = [
  { key: '375',  width: 375,  height: 667,  label: '手机' },
  { key: '768',  width: 768,  height: 1024, label: '平板' },
  { key: '1440', width: 1440, height: 900,  label: '桌面' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

function serve() {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(DIST, p);
    try {
      const buf = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(buf);
    } catch {
      try {
        const buf = await readFile(join(DIST, '404.html'));
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end(buf);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('404');
      }
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const deadline = Date.now() + DEADLINE_MS;
const elapsed = () => Date.now() - (deadline - DEADLINE_MS);
const guard = () => {
  if (Date.now() > deadline) throw new Error(`超过 ${DEADLINE_MS / 1000}s 上限，中止`);
};

let server, browser;
try {
  await mkdir(OUT, { recursive: true });
  server = await serve();
  const base = `http://127.0.0.1:${PORT}/`;
  console.log(`[serve] ${base}（进程内 server，finally 关闭）`);

  browser = await chromium.launch();
  const context = await browser.newContext();
  const manifest = [];
  let totalBytes = 0;

  for (const p of PAGES) {
    for (const v of VIEWPORTS) {
      guard();
      const page = await context.newPage();
      await page.setViewportSize({ width: v.width, height: v.height });

      const consoleErrors = [];
      const failedReq = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
      page.on('requestfailed', (r) => failedReq.push(`${r.failure()?.errorText || 'failed'} ${r.url().slice(0, 90)}`));

      await page.goto(base + p.path, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(600); // 等 font-display:swap 与动画首帧落定

      const name = `${p.key}-${v.key}.png`;
      const outPath = join(OUT, name);
      await page.screenshot({ path: outPath, fullPage: true });

      // 视觉度量：横向溢出（长文本破版信号）/ 文档高度 / 字体状态 / 正文排印
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const b = document.body;
        const cs = getComputedStyle(b);
        // 找首个 h2 作为标题样本（正文用 p）
        const h2 = document.querySelector('h2');
        const para = document.querySelector('p');
        const textEl = para || document.querySelector('li, h2');
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          scrollHeight: doc.scrollHeight,
          bodyTextPx: Math.round(parseFloat(cs.fontSize) * 100) / 100,
          lineHeight: Math.round(parseFloat(cs.lineHeight) * 100) / 100,
          fontReady: document.fonts ? document.fonts.status : 'n/a',
          fontFamily: cs.fontFamily.slice(0, 50),
          sampleTag: textEl ? textEl.tagName : null,
          samplePx: textEl ? Math.round(parseFloat(getComputedStyle(textEl).fontSize) * 100) / 100 : null,
          sampleLh: textEl ? Math.round(parseFloat(getComputedStyle(textEl).lineHeight) * 100) / 100 : null,
        };
      });
      const overflow = m.scrollWidth > m.clientWidth;

      const st = await stat(outPath);
      totalBytes += st.size;
      manifest.push({
        page: p.key, kind: p.kind, viewport: v.key, label: v.label,
        width: v.width, srcPath: p.path, file: name, bytes: st.size,
        docHeight: m.scrollHeight, overflow, overflowBy: overflow ? m.scrollWidth - m.clientWidth : 0,
        bodyTextPx: m.bodyTextPx, lineHeight: m.lineHeight,
        sampleTag: m.sampleTag, samplePx: m.samplePx, sampleLh: m.sampleLh,
        fontReady: m.fontReady, fontFamily: m.fontFamily,
        consoleErrors: consoleErrors.slice(0, 3),
        failedRequests: failedReq.slice(0, 3),
      });
      console.log(`  ${name.padEnd(24)} ${String(st.size / 1024).padStart(7)}KB  h=${String(m.scrollHeight).padStart(5)}  ${overflow ? `⚠ 横向溢出 +${m.scrollWidth - m.clientWidth}px` : '无横向溢出'}`);
      await page.close();
    }
  }

  const totalKB = Math.round(totalBytes / 1024);
  const ov = manifest.filter((x) => x.overflow);
  const ce = manifest.reduce((n, x) => n + x.consoleErrors.length, 0);
  const fr = manifest.reduce((n, x) => n + x.failedRequests.length, 0);
  console.log(`\n[ok] ${manifest.length} 张截图，合计 ${totalKB}KB，耗时 ${elapsed()}ms`);
  console.log(`[ok] 横向溢出 ${ov.length} 张${ov.length ? '：' + ov.map((x) => x.file).join(', ') : ''}`);
  console.log(`[ok] 控制台错误 ${ce} | 请求失败 ${fr}`);
  console.log(`[ok] 字体状态: ${[...new Set(manifest.map((x) => x.fontReady))].join(', ')}`);
  await writeFile(MANIFEST, JSON.stringify({ theme: 'light-only', reason: 'global.css:36 color-scheme: light；prefers-color-scheme 媒体查询 0 处', viewports: VIEWPORTS, pages: PAGES, manifest }, null, 2));
  console.log(`[ok] 清单写入 ${MANIFEST}`);
} catch (e) {
  console.error(`[fail] ${e.message}`);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (server) server.close(); } catch {}
}
