// 排版事实审计 —— 对站点每个含文本的元素，实测 font-size / 字重 / 行高 / 字距 /
// 颜色对比度 / 段落间距 / 每行字符数，按规则集判定阅读体验问题，输出聚合事实表。
//
// 为什么需要它：字号、行距、字距这类「是否读得舒服」的判断，靠读 CSS 会漏掉
// 继承、scoped 样式、动画覆盖后的真实值；靠肉眼则不可复现。本脚本以计算样式为准，
// 输出可复算的数字（CJK 行高 ≥1.6、字距不为负、对比度达标、段落间距 ≥0.5em…）。
//
// 用法：cd site && node scripts/typography-audit.mjs [--json <out.json>]
// 依赖：dist 已构建（npm run build）
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const DIST = 'dist';
const PORT = 4896;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const PAGES = [
  'index.html',
  'roles/index.html',
  'mechanisms/index.html',
  'about/index.html',
  'docs/index.html',
  'docs/quickstart/index.html',
  'docs/overview/index.html',
  'docs/agents/index.html',
  'docs/architecture/index.html',
  'docs/configure/index.html',
  'docs/install/index.html',
  'docs/protocols/index.html',
  'docs/governance/index.html',
  'docs/releases/index.html',
  'docs/bot-mode/index.html',
  '404.html',
];

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 780 },
];

const jsonArgIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonArgIdx > -1 ? process.argv[jsonArgIdx + 1] : null;

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const buf = await readFile(join(DIST, p));
    res.writeHead(200, {
      'content-type': MIME[extname(p)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(join(DIST, '404.html')).catch(() => '404'));
  }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── 页面内采集器（字符串化后注入页面执行，不能用模块作用域变量）────────────
const COLLECT = `(() => {
  const hexToRgb = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const parseColor = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
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
  // 半透明前景合成到背景上再算对比度（site 里有 color-mix / rgba 文字）
  const flatten = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
  const bgOf = (el) => {
    let n = el, guard = 0;
    while (n && n !== document.documentElement && guard++ < 40) {
      const cs = getComputedStyle(n);
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0.5) return toHex(c.rgb);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) {
        const hex = cs.backgroundImage.match(/#[0-9a-f]{6}/i);
        if (hex) return hex[0].toLowerCase();
      }
      n = n.parentElement;
    }
    return '#fafafa';
  };
  const directText = (el) => {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\\s+/g, ' ').trim();
  };
  const sel = (el) => {
    const cls = (el.className && typeof el.className === 'string' ? el.className : '')
      .split(/\\s+/).filter((c) => c && !c.startsWith('astro-')).slice(0, 3).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const hasCJK = (t) => /[\\u3400-\\u9fff\\u3000-\\u303f\\uff00-\\uffef]/.test(t);
  const cjkCount = (t) => (t.match(/[\\u3400-\\u9fff\\u3040-\\u30ff]/g) || []).length;

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'SVG', 'PATH', 'TITLE'].includes(el.tagName)) continue;
    const t = directText(el);
    if (!t || t.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    // SVG 内的文字：font-size 是用户单位，实际渲染还要乘 viewBox 缩放系数
    // （拓扑图 1200 单位的 viewBox 渲染成约 950px → 8.5px 标签实际只有 6.7px）
    let svgScale = 1;
    const svg = el.closest('svg');
    if (svg) {
      const attr = svg.getAttribute('viewBox') || svg.getAttribute('viewbox') || '';
      const vb = attr.split(/[\s,]+/).map(Number);
      const sr = svg.getBoundingClientRect();
      const vbw = (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) || vb[2] || 0;
      if (vbw > 0 && sr.width > 0) svgScale = sr.width / vbw;
    }
    const px = +(parseFloat(cs.fontSize) * svgScale).toFixed(2);
    const lhRaw = cs.lineHeight;
    const lhPx = lhRaw === 'normal' ? px * 1.2 : parseFloat(lhRaw);
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing);
    const fg = parseColor(cs.color);
    if (!fg) continue;
    const bgHex = bgOf(el);
    const bgRgb = hexToRgb(bgHex);
    const eff = fg.a < 1 ? flatten(fg, bgRgb) : fg.rgb;
    const w = parseFloat(cs.fontWeight) || 400;
    const isLarge = px >= 24 || (px >= 18.66 && w >= 700);
    const cjk = hasCJK(t);
    // 每行 CJK 字符数：块级元素的文本宽度 / 字号（近似，用于看行宽是否过长）
    const charsPerLine = cjk && r.width > 120 ? +(r.width / px).toFixed(1) : null;
    const mb = parseFloat(cs.marginBottom) || 0;
    const key = [sel(el), px, w, lhPx.toFixed(1), ls, bgHex, toHex(eff), cjk ? 'cjk' : 'lat'].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      sel: sel(el) + (svgScale !== 1 ? ' [svg×' + svgScale.toFixed(2) + ']' : ''),
      tag: el.tagName.toLowerCase(),
      px,
      weight: w,
      lhPx: +lhPx.toFixed(1),
      lhRatio: +(lhPx / px).toFixed(2),
      ls,
      lsEm: +(ls / px).toFixed(3),
      color: toHex(eff),
      bg: bgHex,
      contrast: +ratio(eff, bgRgb).toFixed(2),
      isLarge,
      cjk,
      text: t.slice(0, 42),
      len: t.length,
      marginBottom: mb,
      marginBottomEm: +(mb / px).toFixed(2),
      charsPerLine,
      blockWidth: Math.round(r.width),
      svgScale: +svgScale.toFixed(3),
    });
  }
  return out;
})()`;

const br = await launchBrowser();
const rows = [];
const perPage = {};

try {
  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) {
      const ctx = await br.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      try {
        await page.goto(`http://127.0.0.1:${PORT}/${pg}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(250);
        const r = await page.evaluate(COLLECT);
        perPage[`${vp.label}:${pg}`] = r.length;
        for (const x of r) rows.push({ vp: vp.label, page: pg, ...x });
      } catch (e) {
        console.log(`  ! ${vp.label} ${pg}: ${String(e.message).split('\n')[0]}`);
      }
      await ctx.close();
    }
  }
} finally {
  await br.close();
  srv.close();
}

// ── 规则集 ────────────────────────────────────────────────────────────────
const H = (el) => /^h[1-6]$/.test(el.tag);
const issues = [];
const push = (rule, row, msg) => issues.push({ rule, page: row.page, vp: row.vp, sel: row.sel, msg, px: row.px, lhRatio: row.lhRatio, lsEm: row.lsEm, contrast: row.contrast, text: row.text });

// 判定阈值 = 站点的排版规格（见 global.css 的令牌注释）：
//   中文小字下限 13px（--font-size-small）· 正文 16px
//   行高：大标题 ≥1.3 / 正文 ≥1.6 / 长文(≥100 字) ≥1.75
//   正文每行 16–48 汉字 · 对比度按 WCAG（小字 4.5:1，大文本 3:1）
const IN_CODE = (r) => ['code', 'pre'].includes(r.tag) || r.sel.includes('code-block');
for (const r of rows) {
  const SVG_SCALED = r.sel.includes('[svg×');
  const isHeading = /^h[1-6]$/.test(r.tag);
  const isProse = !isHeading && r.len >= 40 && r.px <= 17;
  // R1 中文小字下限：13px（12px 只留给全大写西文标签）
  //    例外：拓扑图 SVG 内的文字受 viewBox 缩放限制 —— 图已放到 min-width
  //    1000/1080px 并隐藏最密两行，窄屏仍会落在 0.9 倍左右，属已知取舍。
  if (r.cjk && r.px < 12.99 && r.len > 12 && !(SVG_SCALED && r.vp === 'mobile')) {
    push('R1-中文字号低于 13px 下限', r, `${r.px}px · ${r.len} 字`);
  }
  if (!r.cjk && r.px < 11 && r.len > 12) push('R1-西文字号过小', r, `${r.px}px · ${r.len} 字`);
  // R2 行高：标题按标题判，正文按正文判，代码块不判（有自己的节奏）
  if (!IN_CODE(r)) {
    // 标题行高只对中文判定：拉丁大写字 / 数字（404、THE TEAM）行高 1.2 以内属正常
    if (r.cjk && (isHeading || r.px >= 17) && r.lhRatio < 1.29) push('R2-标题行高过紧', r, `行高 ${r.lhRatio}（中文标题宜 ≥1.3）· ${r.px}px`);
    if (isProse && r.lhRatio < 1.59) push('R2-正文行高不足', r, `行高 ${r.lhRatio}（中文正文宜 ≥1.6）· ${r.px}px`);
    if (isProse && r.len >= 100 && r.lhRatio < 1.74) push('R2-长文行高偏紧', r, `行高 ${r.lhRatio}（长文宜 ≥1.75）· ${r.px}px`);
  }
  // R3 中文负字距
  if (r.cjk && r.lsEm < -0.005) push('R3-中文负字距', r, `字距 ${r.lsEm}em`);
  // R4 对比度
  const need = r.isLarge ? 3.0 : 4.5;
  if (r.contrast < need - 0.01) push('R4-对比度不足', r, `${r.contrast}:1（需 ≥${need}）· ${r.color} on ${r.bg}`);
  // R5 段落间距
  if (isProse && r.tag === 'p' && r.marginBottomEm > 0 && r.marginBottomEm < 0.5) push('R5-段落间距过小', r, `margin-bottom ${r.marginBottomEm}em`);
  // R6 行宽：代码块（横向可滚动）与表格单元格（表格自身布局）不判；
  //    窄屏因断点收窄属预期，只在桌面判「过窄」。
  if (!IN_CODE(r) && r.tag !== 'td' && r.cjk && r.charsPerLine && r.len >= 40) {
    if (r.charsPerLine > 48) push('R6-行宽过宽', r, `每行约 ${r.charsPerLine} 汉字（宜 ≤48）`);
    if (r.charsPerLine < 16 && r.vp === 'desktop') push('R6-行宽过窄', r, `每行约 ${r.charsPerLine} 汉字（宜 ≥16）`);
  }
  // R7 多行小字行高过紧（单行按钮/标签不判）
  if (!IN_CODE(r) && r.lhRatio < 1.29 && r.px < 20 && r.text.length >= 12) push('R7-多行小字行高过紧', r, `行高 ${r.lhRatio} · ${r.px}px`);
}

// ── 输出 ─────────────────────────────────────────────────────────────────
const bySel = new Map();
for (const r of rows) {
  const k = r.sel;
  if (!bySel.has(k)) bySel.set(k, []);
  bySel.get(k).push(r);
}

console.log('='.repeat(96));
console.log(`排版事实审计 · 页面 ${Object.keys(perPage).length} 个视口-页组合 · 文本元素 ${rows.length} 条去重观测`);
console.log('='.repeat(96));

console.log('\n【一】字号 × 字重分布（desktop 视口）');
const dist = new Map();
for (const r of rows.filter((x) => x.vp === 'desktop')) {
  const k = `${r.px}px/${r.weight}`;
  dist.set(k, (dist.get(k) || 0) + 1);
}
for (const [k, n] of [...dist.entries()].sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))) {
  console.log(`  ${k.padEnd(12)} ${String(n).padStart(4)} 处`);
}

console.log('\n【二】问题清单（按规则聚合）');
const byRule = new Map();
for (const i of issues) {
  if (!byRule.has(i.rule)) byRule.set(i.rule, []);
  byRule.get(i.rule).push(i);
}
for (const [rule, list] of [...byRule.entries()].sort()) {
  const uniqSel = [...new Set(list.map((x) => x.sel))];
  console.log(`\n  ${rule} · 命中 ${list.length} 处 · 涉及 ${uniqSel.length} 个选择器`);
  for (const s of uniqSel.slice(0, 14)) {
    const x = list.find((i) => i.sel === s);
    console.log(`      ${s.padEnd(38)} ${x.msg}   「${x.text.slice(0, 26)}」`);
  }
  if (uniqSel.length > 14) console.log(`      … 另 ${uniqSel.length - 14} 个选择器`);
}

console.log('\n【三】正文级事实表（≥40 字的中文文本块，按选择器）');
console.log(`  ${'选择器'.padEnd(34)} ${'px'.padStart(6)} ${'行高'.padStart(7)} ${'字距em'.padStart(8)} ${'对比度'.padStart(7)} ${'段距em'.padStart(7)} ${'字/行'.padStart(6)}`);
const paraSel = [...bySel.entries()].filter(([, v]) => v.some((r) => r.cjk && r.len >= 40));
for (const [k, v] of paraSel) {
  const r = v.find((x) => x.cjk && x.len >= 40) || v[0];
  console.log(
    `  ${k.padEnd(34)} ${String(r.px).padStart(6)} ${String(r.lhRatio).padStart(7)} ${String(r.lsEm).padStart(8)} ${String(r.contrast).padStart(7)} ${String(r.marginBottomEm).padStart(7)} ${String(r.charsPerLine ?? '-').padStart(6)}`,
  );
}

console.log('\n【四】标题层级（每页 h1..h3 实测字号）');
for (const pg of PAGES) {
  const hs = rows.filter((r) => r.vp === 'desktop' && r.page === pg && H(r) && r.len >= 2);
  if (!hs.length) continue;
  const uniq = [...new Set(hs.map((r) => `${r.tag}:${r.px}/${r.weight}`))].sort();
  console.log(`  ${pg.padEnd(28)} ${uniq.join('  ')}`);
}

const summary = { rows: rows.length, issues: issues.length, byRule: {} };
for (const [k, v] of byRule) summary.byRule[k] = v.length;
console.log('\n【五】汇总');
console.log('  ' + JSON.stringify(summary.byRule));
console.log(`  总计 ${issues.length} 处命中`);

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify({ summary, issues, rows }, null, 1), 'utf8');
  console.log(`\n  JSON → ${JSON_OUT}`);
}
