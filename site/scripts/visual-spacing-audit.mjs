// 视觉间距审计 —— 量「墨迹」之间的实际空隙，不是盒模型的 margin/padding
//
// 为什么必须量墨迹：同一个 margin: 16px，在 line-height 1.75 的段落间和 line-height 1.3 的标题间，
// 呈现出来的视觉空隙完全不同（行框里有一大半是空白行距）。图标 viewBox 也比图形本身大一圈。
// 所以「代码参数统一」≠「视觉统一」。
//
// 墨迹边界（ink box）的取法：
//   · 有可见描边（背景色 / 背景图 / 边框 / 投影 / 轮廓）的元素 → 描边外沿（border-box）
//   · 透明排版容器 → 所有可见子孙墨迹的并集
//   · 文字节点 → Range 取行框，再扣掉半行距（(lineHeight - fontSize)/2），近似到 em box
//   · SVG / 图片 / 表单控件 → 元素框（其外部就是可见范围）
//
// 视觉间距 = 下一个元素的墨迹顶 − 上一个元素的墨迹底（同容器内相邻块级兄弟）
//
// 一致性判定：按语义关系（标题→描述 / 描述→列表 / 卡片→卡片 …）跨板块分组，
// 组内 Δ = max − min；Δ ≤ 2px 视为一致（亚像素舍入误差），否则报告。
//
// 用法：node scripts/visual-spacing-audit.mjs [--json out.json]
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
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
const PORT = srv.address().port;
const JSON_OUT = (() => { const i = process.argv.indexOf('--json'); return i > -1 ? process.argv[i + 1] : null; })();

const AUDIT = String.raw`(() => {
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  const union = (a, b) => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
  const inClosedDetails = (el) => { let n = el; while (n && n !== document.body) { if (n.tagName === 'DETAILS' && !n.open) return true; n = n.parentElement; } return false; };
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 && !inClosedDetails(el); };

  // 元素是否"自身就是可见的"（有描边/背景）—— 是则它的 border-box 就是视觉边界
  const painted = (cs) =>
    (cs.backgroundImage && cs.backgroundImage !== 'none') ||
    (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
    parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 ||
    (cs.boxShadow && cs.boxShadow !== 'none') ||
    (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0);

  const LEAF = new Set(['svg', 'img', 'video', 'input', 'button', 'select', 'hr', 'iframe']);

  // 墨迹边界（ink box）
  const ink = (el) => {
    if (!visible(el)) return null;
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return null;
    const box = (r) => (r.width > 0.5 && r.height > 0.5 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null);
    if (LEAF.has(tag) || painted(cs)) return box(el.getBoundingClientRect());
    let acc = null;
    for (const n of el.childNodes) {
      let b = null;
      if (n.nodeType === 3) {
        if (!n.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5);
        if (!rects.length) continue;
        b = { l: Math.min(...rects.map((r) => r.left)), t: Math.min(...rects.map((r) => r.top)), r: Math.max(...rects.map((r) => r.right)), b: Math.max(...rects.map((r) => r.bottom)) };
        // 行框 → em box：扣掉上下半行距
        const fs = parseFloat(cs.fontSize) || 16;
        const lh = parseFloat(cs.lineHeight);
        if (!Number.isNaN(lh) && lh > fs) { const lead = (lh - fs) / 2; b.t += lead; b.b -= lead; }
      } else if (n.nodeType === 1) b = ink(n);
      if (b) acc = acc ? union(acc, b) : b;
    }
    return acc;
  };

  const isBlock = (el) => ['block', 'flex', 'grid', 'list-item'].includes(getComputedStyle(el).display);
  const role = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = ((typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '')).toLowerCase();
    if (/^h[1-4]$/.test(tag)) return 'h' + tag[1];
    if (tag === 'p') return /label|eyebrow|caption|meta|desc|sub/i.test(cls) ? 'p.label' : 'p';
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'li') return 'li';
    if (tag === 'pre' || tag === 'code') return 'code';
    if (tag === 'a') return /cta|btn/i.test(cls) ? 'a.btn' : 'a';
    if (tag === 'svg' || tag === 'img') return 'img';
    if (/card/i.test(cls)) return 'card';
    if (/(^|[-\s])(header|head|inner|legend|tabs|track|panels|list|nav|actions)([-\s]|$)/.test(cls)) return 'group';
    if (tag === 'div' || tag === 'section') return 'box';
    return tag;
  };
  const label = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter((c) => c && !c.startsWith('astro-'))[0];
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const rel = (a, b) => role(a) + '→' + role(b);

  const out = { gaps: [], groups: [], sections: [] };
  const main = document.querySelector('main');

  // 递归：收集同容器内的相邻块级兄弟对
  const walk = (root, path, depth) => {
    if (depth > 6) return;
    const kids = [...root.children].filter((el) => visible(el) && isBlock(el) && el.getBoundingClientRect().height > 2 && ink(el));
    let prev = null;
    for (const k of kids) {
      const kb = ink(k);
      if (!kb) { continue; }
      if (prev) {
        const gap = kb.t - prev.b;
        const pair = { from: label(prev.el), to: label(k), rel: rel(prev.el, k), gap: Math.round(gap), top: Math.round(kb.t), path };
        out.gaps.push(pair);
        let g = out.groups.find((x) => x[0] === pair.rel);
        if (!g) { g = [pair.rel, []]; out.groups.push(g); }
        g[1].push(pair);
      }
      // 组容器（卡片/头部/列表/CTA 内容）内部再下钻；纯排版容器不下钻到文字里
      if (role(k) === 'card' || role(k) === 'group' || /(__header|__inner|__card|__item|legend|actions|panels)/.test(label(k))) walk(k, path + ' > ' + label(k), depth + 1);
      prev = { el: k, b: kb.b };
    }
  };

  for (const sec of main.children) {
    if (!visible(sec)) continue;
    const sb = sec.getBoundingClientRect();
    out.sections.push({ name: label(sec), top: Math.round(sb.top), bottom: Math.round(sb.bottom), h: Math.round(sb.height) });
    walk(sec, label(sec), 0);
  }
  return out;
})()`;

const br = await launchBrowser();
try {
  for (const [wl, label, w, h] of [['1440', '1440px', 1440, 1000], ['390', '390px', 390, 844]]) {
    const ctx = await br.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(450);
    const r = await page.evaluate(AUDIT);
    const groups = r.groups.map(([k, v]) => [k, [...v]]);
    console.log(`\n${'='.repeat(98)}\n视觉间距审计 · ${label} · 相邻块级兄弟对 ${r.gaps.length} 对 / ${groups.length} 种语义关系\n${'='.repeat(98)}`);
    console.log(`\n关系类型                实例数   视觉间距(px)                       Δ     判定`);
    console.log('-'.repeat(98));
    const bad = [];
    for (const [rel, pairs] of groups.sort((a, b) => b[1].length - a[1].length)) {
      if (pairs.length < 2) continue;
      const vals = pairs.map((p) => p.gap);
      const d = Math.max(...vals) - Math.min(...vals);
      const uniq = [...new Set(vals)];
      const verdict = d <= 2 ? '✓ 一致' : d <= 6 ? '△ 接近' : '✗ 不一致';
      console.log(`  ${rel.padEnd(22)} ${String(pairs.length).padStart(4)}   ${uniq.join(' / ').padEnd(30)} ${String(d).padStart(4)}px  ${verdict}`);
      if (d > 2) bad.push({ rel, d, pairs: pairs.map((p) => `${p.from}→${p.to}=${p.gap}px @${p.top}px`) });
    }
    // 单实例关系（无法比较，但列出供人工判断量级是否合理）
    const single = groups.filter(([, v]) => v.length === 1);
    if (single.length) {
      console.log(`\n单实例关系（无法与同类比较，仅供量级参照）：`);
      for (const [rel, [p]] of single.sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${rel.padEnd(22)} ${p.gap}px   ${p.from} → ${p.to}`);
    }
    console.log(`\n⚠ 视觉不一致的关系 ${bad.length} 种：`);
    for (const b of bad) console.log(`  【${b.rel}】Δ=${b.d}px\n     ` + b.pairs.join('\n     '));
    if (JSON_OUT) await writeFile(`${JSON_OUT.replace('.json', '-' + wl + '.json')}`, JSON.stringify({ gaps: r.gaps, sections: r.sections }, null, 1), 'utf8');
    await ctx.close();
  }
} finally { await br.close(); srv.close(); }
