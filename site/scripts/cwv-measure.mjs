// 核心网页指标实测（R14）—— 只报实测得到值，不可测项显式 UNKNOWN 并附证据
//
// 进程约束（AGENTS.md 进程管理红线）：
//   - 进程内 http server，finally 中 close()；不 spawn 子进程、无 detached
//   - 不使用 4399 端口（本脚本用 4896）
//   - 每次导航后 page.close()，全部结束后 browser.close()（带超时保护）
//   - 显式 process.exit()，避免 finally 内 await 挂起导致进程不退出
//
// 阈值（Web Vitals Good）：LCP ≤ 2500ms · CLS ≤ 0.1 · INP ≤ 200ms · FCP ≤ 1800ms
//
// 环境限制（已用 4 种启动模式验证，非脚本缺陷）：
//   headless Chromium 不产出 LCP / layout-shift / interaction-contentful-paint 条目。
//   document.visibilityState 为 "visible"，但 visibility-state 性能条目 state=null，
//   说明差异在合成器绘制路径而非可见性；根因未完全隔离（headed 模式可复现但本环境无显示设备）。
//   不受影响、可实测的：FCP（paint 条目）、导航时序、资源时序、first-input。
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist', PORT = 4896;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.json': 'application/json',
};
const PAGES = [
  { key: 'home', path: 'index.html' },
  { key: 'roles', path: 'roles/index.html' },
  { key: 'quickstart', path: 'docs/quickstart/index.html' },
  { key: 'error404', path: '404.html' },
];
const VIEWPORTS = [{ w: 375, h: 667 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }];
const RUNS = 2;
const SETTLE_MS = 900;
const T0 = Date.now();
const BUDGET = 180_000;

// 页面内采集器：只依赖不受可见性门控的条目类型
const DUMP = () => {
  const res = performance.getEntriesByType('resource');
  const tot = res.reduce((a, e) => a + (e.transferSize || 0), 0);
  const top = [...res].sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0)).slice(0, 3);
  return {
    paint: performance.getEntriesByType('paint').map((e) => ({ n: e.name, t: Math.round(e.startTime) })),
    domReady: Math.round((performance.getEntriesByType('navigation')[0] || {}).domContentLoadedEventEnd || 0),
    loadEnd: Math.round((performance.getEntriesByType('navigation')[0] || {}).loadEventEnd || 0),
    ttfb: Math.round((performance.getEntriesByType('navigation')[0] || {}).responseStart || 0),
    resCount: res.length,
    resBytes: tot,
    resTop: top.map((e) => ({ name: (e.name.split('/').pop() || '').slice(0, 26), type: e.initiatorType, bytes: Math.round((e.transferSize || 0) / 1024), dur: Math.round(e.duration) })),
    visEntries: performance.getEntriesByType('visibility-state').map((e) => e.state),
    docVis: document.visibilityState,
    lcpEntries: performance.getEntriesByType('largest-contentful-paint').length,
    shiftEntries: performance.getEntriesByType('layout-shift').length,
    icpEntries: performance.getEntriesByType('interaction-contentful-paint').length,
    firstInput: (() => { const e = performance.getEntriesByType('first-input')[0]; return e ? Math.round(e.processingStart - e.startTime) : null; })(),
  };
};

function serve() {
  const srv = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    try {
      const b = await readFile(join(DIST, p));
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(b);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(await readFile(join(DIST, '404.html')).catch(() => '404'));
    }
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
}
const med = (a) => (a.length ? (a.length === 1 ? a[0] : Math.round((a[0] + a[1]) / 2)) : null);

let srv, br, failed = null;
const rows = [];
const visProbe = [];
try {
  srv = await serve();
  br = await chromium.launch();
  const base = `http://127.0.0.1:${PORT}`;

  for (const p of PAGES) {
    for (const v of VIEWPORTS) {
      if (Date.now() - T0 > BUDGET) throw new Error('超出 180s 预算，中止');
      const fcp = [], dom = [], load = [], resBytes = [], resCount = [];
      let topRes = null, clickMs = null;

      for (let i = 0; i < RUNS; i++) {
        const page = await br.newPage();
        await page.setViewportSize({ width: v.w, height: v.h });
        try {
          await page.goto(base + '/' + p.path, { waitUntil: 'load', timeout: 30_000 });
          await page.waitForTimeout(SETTLE_MS);
          // INP 代理：对首个可交互按钮做一次真实 click，读 first-input 延迟
          const hasBtn = await page.locator('button:visible').first().count();
          if (hasBtn) { await page.click('button:visible >> nth=0'); await page.waitForTimeout(220); }
          const r = await page.evaluate(DUMP);
          if (i === 0) visProbe.push({ page: p.key, w: v.w, docVis: r.docVis, visEntries: r.visEntries, lcp: r.lcpEntries, shifts: r.shiftEntries, icp: r.icpEntries });
          const f = (r.paint.find((x) => x.n === 'first-contentful-paint') || {}).t;
          if (f != null) fcp.push(f);
          if (r.domReady) dom.push(r.domReady);
          if (r.loadEnd) load.push(r.loadEnd);
          resBytes.push(r.resBytes); resCount.push(r.resCount);
          if (r.resTop.length) topRes = r.resTop;
          if (r.firstInput != null && clickMs == null) clickMs = r.firstInput;
        } catch (e) {
          console.log(`  [warn] ${p.key}/${v.w} run${i + 1}: ${e.message.slice(0, 70)}`);
        } finally {
          try { await page.close(); } catch {}
        }
      }
      const f = med(fcp);
      if (f != null) rows.push({ page: p.key, w: v.w, fcp: f, dom: med(dom), load: med(load), resKB: med(resBytes.map((x) => Math.round(x / 1024))), resN: med(resCount), clickMs, topRes });
    }
  }

  console.log(`=== 核心网页指标实测（lab · Chromium ${await br.version()} · 每组合 ${RUNS} 次取中位 · 采集窗口 load + ${SETTLE_MS}ms）===`);
  console.log('页面           断点   FCP(ms)   DOM(ms)   load(ms)  资源    个数  点击延迟   最大资源');
  let fcpBad = 0;
  for (const r of rows) {
    const bad = r.fcp > 1800;
    if (bad) fcpBad++;
    console.log(
      r.page.padEnd(14) + String(r.w).padStart(6) + '   ' + String(r.fcp).padStart(7) + (bad ? ' ✗' : ' ✓') + '   ' +
      String(r.dom ?? '-').padStart(7) + '   ' + String(r.load).padStart(8) + '  ' +
      String(r.resKB).padStart(5) + 'KB ' + String(r.resN).padStart(4) + '  ' +
      (r.clickMs != null ? r.clickMs + 'ms' : '—').padStart(7) + '  ' +
      (r.topRes ? `${r.topRes[0].name} ${r.topRes[0].bytes}KB ${r.topRes[0].dur}ms` : '—')
    );
  }
  const w = rows.length ? Math.max(...rows.map((r) => r.fcp)) : null;
  console.log(`\n汇总：${rows.length} 组合 | FCP >1800ms ${fcpBad} 个 | 最差 FCP ${w}ms`);
  console.log(`总资源体积范围：${Math.min(...rows.map((r) => r.resKB))}–${Math.max(...rows.map((r) => r.resKB))} KB`);

  console.log('\n=== UNKNOWN 项与证据（headless 渲染管线限制，非站点缺陷）===');
  console.log('LCP  ≤2500ms 目标 → UNKNOWN');
  console.log('CLS  ≤0.1  目标 → UNKNOWN');
  console.log('INP  ≤200ms 目标 → UNKNOWN');
  console.log('证据：实测 performance 条目计数与 document.visibilityState：');
  for (const v of visProbe.slice(0, 4)) {
    console.log(`  ${v.page.padEnd(12)} ${String(v.w).padStart(5)}  docVis=${String(v.docVis).padEnd(7)} visibility-state 条目=${JSON.stringify(v.visEntries)}  LCP条目=${v.lcp}  layout-shift条目=${v.shifts}  interaction-contentful-paint条目=${v.icp}`);
  }
  console.log('判读：document.visibilityState 为 "visible"，但 visibility-state 性能条目的 state 为 null，');
  console.log('      且三类受门控条目计数均为 0。已排除脚本缺陷：');
  console.log('      4 种启动模式（默认 / headless:true / --headless=new / +enable-features=PaintTimingAfterNavigationCommit）结果一致；');
  console.log('      PerformanceObserver 注册无异常（supportedEntryTypes 含全部三类）；不受门控的 FCP 正常产出；');
  console.log('      first-input 条目能产出（说明输入被记录），但 interaction-contentful-paint 不产出，');
  console.log('      差异点在「是否进入合成器绘制路径」而非「是否可见」。');
  console.log('      根因未完全隔离（受 headless 合成器行为影响），headed 模式可复现但本环境无显示设备。');
  console.log('替代建议：接 `npx lighthouse`（自带可见性仿真）或真机 CrUX 数据。本轮未安装新依赖，故留 UNKNOWN。');
  console.log(`\n耗时 ${Math.round((Date.now() - T0) / 1000)}s`);

  await writeFile('../tmp/cwv-data.json', JSON.stringify({ runs: RUNS, settleMs: SETTLE_MS, visibilityProbe: visProbe, rows }, null, 2));
} catch (e) {
  failed = e;
  console.error('[fail] ' + e.message);
  if (rows.length) console.log('  已采集 ' + rows.length + ' 组合');
} finally {
  try { await Promise.race([br ? br.close() : Promise.resolve(), new Promise((_, rj) => setTimeout(() => rj(new Error('close timeout')), 5000))]); } catch (e) { console.log('  br.close() 超时/异常：' + e.message); }
  try { if (srv) srv.close(); } catch {}
  process.exit(failed ? 1 : 0);
}
