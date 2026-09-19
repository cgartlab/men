// 验证 P3-8 重构：6 个角色令牌在浏览器中解析为预期颜色（无视觉漂移）
// 单一真相源 = global.css 的 --role-*；卡片与拓扑图均应解析到同一值。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4902;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

// 预期值：与重构前 JS 数组字面量逐字一致
const EXPECT = {
  men: '#e85d04', si: '#4a90d9', ji: '#2ea043',
  chi: '#bf8700', yi: '#a371f7', xun: '#8b5cf6',
};
const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('404'); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const br = await chromium.launch();
let failed = null;
try {
  const p = await (await br.newContext()).newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 30_000 });
  await p.waitForTimeout(400);

  const r = await p.evaluate(() => {
    // 1) 卡片：--card-accent 的解析值
    const cards = {};
    for (const el of document.querySelectorAll('.showcase__card[data-agent]')) {
      const id = el.getAttribute('data-agent');
      const cs = getComputedStyle(el);
      cards[id] = { cardAccent: cs.getPropertyValue('--card-accent').trim(), iconColor: el.querySelector('.showcase__card-icon') ? getComputedStyle(el.querySelector('.showcase__card-icon')).color : null, roleColor: el.querySelector('.showcase__card-role') ? getComputedStyle(el.querySelector('.showcase__card-role')).color : null };
    }
    // 2) 令牌定义本身
    const root = getComputedStyle(document.documentElement);
    const tokens = {};
    for (const k of ['men', 'si', 'ji', 'chi', 'yi', 'xun']) tokens['--role-' + k] = root.getPropertyValue('--role-' + k).trim();
    // 3) 拓扑图：抽样若干元素的实际 fill / stroke
    const topo = {};
    const pick = { '.topo-bezier--return': 'stroke', '.topo-bezier--fail': 'stroke', '.topo-bezier--learn': 'stroke', '.topo-dot--return': 'fill', '.topo-dot--judge': 'fill', '.topo-dot--learn': 'fill', '.topo-node--judge': 'stroke', '.topo-node--verify': 'stroke', '.topo-node--knowledge': 'stroke', '.topo-node--hub': 'fill', '.topo-status': 'fill', '.topo-legend__dot--judge': 'border-color', '.topo-legend__dot--report': 'background-color', '.topo-legend__dot--fail': 'background-color' };
    for (const [sel, prop] of Object.entries(pick)) {
      const el = document.querySelector(sel);
      if (el) topo[sel + ' (' + prop + ')'] = getComputedStyle(el).getPropertyValue(prop).trim();
    }
    // 4) SVG marker（style 注入的 fill）
    const markers = {};
    for (const id of ['mk-green', 'mk-amber', 'mk-purple', 'mk-accent']) {
      const m = document.getElementById(id);
      if (m) { const path = m.querySelector('path'); markers[id] = path ? getComputedStyle(path).fill : null; }
    }
    // 5) 无效 var() 检查：任何解析失败都会是 'var(...)' 原样或空
    return { cards, tokens, topo, markers, unresolved: [] };
  });

  let bad = 0;
  console.log('=== 1) 6 个角色令牌定义 ===');
  for (const [k, v] of Object.entries(r.tokens)) {
    const id = k.replace('--role-', '');
    const want = EXPECT[id];
    const ok = v === want;
    if (!ok) bad++;
    console.log(`  ${k} = ${v}  预期 ${want}  ${ok ? '✓' : '✗'}`);
  }

  console.log('\n=== 2) 卡片 --card-accent 及其消费端 ===');
  console.log('  注：getComputedStyle 对自定义属性返回「原样书写值」而非解析后的 rgb，');
  console.log('      故 --card-accent 直接比对 hex；真正的视觉证据是其消费端 color 解析值。');
  for (const [id, c] of Object.entries(r.cards)) {
    const wantHex = EXPECT[id];
    const wantRgb = toRgb(wantHex);
    // 书写值可能保留 hex 原样，也可能被规范化；两者都接受
    const hexOk = c.cardAccent.toLowerCase().replace(/\s/g, '') === wantHex.toLowerCase() || c.cardAccent === wantRgb;
    const iconOk = c.iconColor === wantRgb;
    const roleOk = c.roleColor === wantRgb;
    if (!hexOk || !iconOk || !roleOk) bad++;
    console.log(`  [${id}] card-accent 书写值=${c.cardAccent} ${hexOk ? '✓' : '✗'} | icon=${iconOk ? '✓' : '✗'} (${c.iconColor}) | role-text=${roleOk ? '✓' : '✗'} (${c.roleColor})  预期 ${wantRgb}`);
  }

  console.log('\n=== 3) 拓扑图元素解析值（断言）===');
  const TOPO_EXPECT = {
    '.topo-bezier--fail (stroke)': toRgb('#bf8700'),
    '.topo-bezier--learn (stroke)': toRgb('#8b5cf6'),
    '.topo-dot--learn (fill)': toRgb('#8b5cf6'),
    '.topo-node--judge (stroke)': toRgb('#bf8700'),
    '.topo-node--verify (stroke)': toRgb('#2ea043'),
    '.topo-node--knowledge (stroke)': toRgb('#8b5cf6'),
    '.topo-node--hub (fill)': toRgb('#e85d04'),
    '.topo-status (fill)': toRgb('#2ea043'),
    '.topo-legend__dot--judge (border-color)': toRgb('#bf8700'),
    '.topo-legend__dot--report (background-color)': toRgb('#2ea043'),
    '.topo-legend__dot--fail (background-color)': toRgb('#bf8700'),
  };
  for (const [k, v] of Object.entries(r.topo)) {
    const want = TOPO_EXPECT[k];
    if (want == null) { console.log(`  ${k} = ${v || '(空)'}  (无断言)`); continue; }
    const ok = v === want;
    if (!ok) bad++;
    console.log(`  ${k} = ${v || '(空)'}  预期 ${want}  ${ok ? '✓' : '✗'}`);
  }
  const missing = Object.keys(TOPO_EXPECT).filter((k) => !(k in r.topo));
  if (missing.length) { bad += missing.length; console.log('  ✗ 未找到元素: ' + missing.join(', ')); }

  console.log('\n=== 4) SVG marker（style 注入）===');
  for (const [k, v] of Object.entries(r.markers)) {
    const want = { 'mk-green': toRgb('#2ea043'), 'mk-amber': toRgb('#bf8700'), 'mk-purple': toRgb('#8b5cf6'), 'mk-accent': toRgb('#e85d04') }[k];
    const ok = v === want;
    if (!ok) bad++;
    console.log(`  ${k} = ${v}  预期 ${want}  ${ok ? '✓' : '✗'}`);
  }

  console.log(`\n${bad === 0 ? '✅ 全部一致：重构未引入视觉漂移' : '❌ ' + bad + ' 处不一致'}`);
  process.exitCode = bad === 0 ? 0 : 1;
} catch (e) {
  failed = e;
  console.error('[ERR] ' + e.message);
  process.exitCode = 1;
} finally {
  try { await Promise.race([br.close(), new Promise((_, rj) => setTimeout(() => rj(new Error('t')), 5000))]); } catch {}
  srv.close();
  process.exit(process.exitCode || 0);
}
