// 孤行审计 —— 测量每个文本块**实际折行**后的末行，找出「末行可见字符数 < N」的块（默认 N=4）。
//
// 为什么需要它：折行位置由「容器宽 + 字号 + 字距 + 禁则处理」共同决定，只有把渲染后的行量出来
// 才知道末行真的剩几个字。中文没有词边界，text-wrap: pretty 对中文几乎无效，CSS 也没有
// 「最后一行」选择器 —— 所以「末行 ≥4 字符」这条标准只能靠改文案/改列宽后**实测**来保证。
//
// 覆盖范围：所有含直接文本的元素（标题 / 正文 / 列表 / 表格 / 卡片小字 / 信息卡 …），
// 排除 code/pre（预格式不折行）、script/style、SVG（单行图形文字）。
//
// 性能：只求末行 —— 整段取一次行盒得到行数与各行 top，再二分定位末行起点，
// 每块只需 O(log n) 次 Range 查询（早期逐字版本在全元素覆盖下要跑 >12 分钟）。
//
// 用法：node scripts/widow-audit.mjs [--min 4] [--json out.json]
// 环境：WIDOW_FIXER=/abs/path/fixer.js 可在页面加载前注入脚本（验证修正器效果）
// 依赖：dist 已构建
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const DIST = 'dist';
const PORT = 4909;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
};

const PAGES = [
  'index.html', 'roles/index.html', 'mechanisms/index.html', 'about/index.html', '404.html',
  'docs/index.html', 'docs/quickstart/index.html', 'docs/overview/index.html', 'docs/agents/index.html',
  'docs/architecture/index.html', 'docs/configure/index.html', 'docs/install/index.html',
  'docs/protocols/index.html', 'docs/governance/index.html', 'docs/releases/index.html', 'docs/bot-mode/index.html',
];
const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 780 },
];

const argOf = (flag, def) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : def; };
const MIN_CHARS = Number(argOf('--min', '4'));
const JSON_OUT = argOf('--json', null);
const FIXER = process.env.WIDOW_FIXER || null;

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
let port = PORT;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    await new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      srv.once('error', onErr);
      srv.listen(port, '127.0.0.1', () => { srv.off('error', onErr); resolve(); });
    });
    break;
  } catch (e) {
    if (e.code !== 'EADDRINUSE' || attempt === 11) throw e;
    port += 1;
  }
}

// ── 页面内采集（字符串化后注入执行）─────────────────────────────────────────
const COLLECT = `(() => {
  const hasCJK = (t) => /[\\u3400-\\u9fff\\u3040-\\u30ff\\uff00-\\uffef]/.test(t);
  // 不可见字符（U+2060 word joiner、零宽空格等）不算「可见字符」
  const isVisible = (ch) => ch.trim() !== '' && !/[\\u200b-\\u200f\\u2060-\\u2064\\ufeff]/.test(ch);
  const sel = (el) => {
    const cls = (el.className && typeof el.className === 'string' ? el.className : '')
      .split(/\\s+/).filter((c) => c && !c.startsWith('astro-')).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const cssPath = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      let seg = n.tagName.toLowerCase();
      const parent = n.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter((c) => c.tagName === n.tagName);
        if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(n) + 1) + ')';
      }
      parts.unshift(seg);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const directText = (el) => {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\\s+/g, ' ').trim();
  };
  const SKIP = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'PATH', 'TEXTAREA', 'SELECT', 'OPTION'];
  function measureLastLine(el) {
    const chars = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue || '';
      for (let i = 0; i < t.length; i++) if (isVisible(t[i])) chars.push({ node: n, i, ch: t[i] });
    }
    if (chars.length === 0) return null;
    const range = document.createRange();
    const rectsFrom = (idx) => {
      range.setStart(chars[idx].node, chars[idx].i);
      const last = chars[chars.length - 1];
      range.setEnd(last.node, last.i + 1);
      return [...range.getClientRects()];
    };
    const all = rectsFrom(0);
    // 行判定：按 3px 容差把 rect 的 top 聚类成「行」——行内元素（如 inline code 字号更小）
    // 的 rect top 会偏移 1–2px，直接用去重后的 top 会虚增行数。
    const topsSorted = all.map((r) => r.top).sort((x, y) => x - y);
    const clusters = [];
    for (const t of topsSorted) {
      const c = clusters[clusters.length - 1];
      if (c && t - c.max <= 3) c.max = Math.max(c.max, t);
      else clusters.push({ min: t, max: t });
    }
    if (clusters.length <= 1) return null;
    const lastTop = clusters[clusters.length - 1].min;
    let lo = 0, hi = chars.length - 1, start = chars.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      // 关键：区间从 mid 到末尾若**整段都落在末行**，则其 rect 的 top 最小值就等于末行 top。
      // （早期写成「存在一个 rect 的 top ≥ 末行 top」是错的：从首行任意位置到末尾的区间
      //   必然包含末行的 rect，条件恒真 → 二分收敛到 0 → 把整段误当末行，虚报字符数。）
      const rs = rectsFrom(mid);
      const minTop = rs.length ? Math.min(...rs.map((r) => Math.round(r.top))) : Infinity;
      if (minTop >= lastTop - 1) { start = mid; hi = mid - 1; }
      else lo = mid + 1;
    }
    const tail = chars.slice(start);
    const rs = rectsFrom(start);
    const width = rs.length ? +(Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left))).toFixed(1) : 0;
    return { lineCount: clusters.length, line: {
      i: clusters.length - 1, text: tail.slice(0, 40).map((c) => c.ch).join(''),
      chars: tail.length, cjk: tail.filter((c) => hasCJK(c.ch)).length, width, isLast: true, fill: 1 } };
  }

  const out = [];
  const candidates = [...document.querySelectorAll('body *')].filter((el) => {
    if (SKIP.includes(el.tagName)) return false;
    if (el.closest('svg') || el.closest('pre, code')) return false;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim().length >= 2) return true;
    return false;
  });
  for (const el of candidates) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 40 || box.height < 2) continue;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    if (box.height < lh * 1.4) continue;                     // 没折行
    if (directText(el).length < 4) continue;                 // 太短不算
    const m = measureLastLine(el);
    if (!m) continue;
    out.push({
      sel: sel(el),
      cssPath: cssPath(el),
      fullText: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
      hasInline: [...el.children].some((c) => /^(CODE|STRONG|EM|A|SPAN|B|I)$/.test(c.tagName)),
      inlineTags: [...new Set([...el.children].map((c) => c.tagName))].join(','),
      page: location.pathname,
      fontSize: +parseFloat(cs.fontSize).toFixed(1),
      boxWidth: Math.round(box.width),
      lineCount: m.lineCount,
      lines: [m.line],
    });
  }
  return out;
})()`;

const br = await launchBrowser();
const blocks = [];
try {
  for (const vp of VIEWPORTS) {
    const ctx = await br.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const pg of PAGES) {
      const page = await ctx.newPage();
      try {
        if (FIXER) await page.addInitScript({ path: FIXER });
        await page.goto(`http://127.0.0.1:${port}/${pg}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(200);
        const r = await page.evaluate(COLLECT);
        for (const b of r) blocks.push({ vp: vp.label, page: pg, ...b });
      } catch (e) {
        console.log(`  ! ${vp.label} ${pg}: ${String(e.message).split('\n')[0]}`);
      }
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await br.close();
  srv.close();
}

const viol = [];
const near = [];
for (const b of blocks) {
  const last = b.lines[b.lines.length - 1];
  if (!last) continue;
  if (last.chars < MIN_CHARS) viol.push({ ...b, lastLine: last });
  else if (last.chars <= 5) near.push({ ...b, lastLine: last });
}

console.log('='.repeat(96));
console.log(`孤行审计 · 判定标准：末行可见字符数 < ${MIN_CHARS}`);
console.log(`样本：${PAGES.length} 页 × ${VIEWPORTS.length} 视口 · 折行文本块 ${blocks.length} 个`);
console.log('='.repeat(96));
console.log(`\n【一】违规：${viol.length} 处`);
const byKey = new Map();
for (const v of viol) {
  const k = `${v.vp} · ${v.page} · ${v.sel}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(v);
}
for (const [k, list] of [...byKey.entries()].sort()) {
  const v = list[0];
  console.log(`  ${k}  （块宽 ${v.boxWidth}px · ${v.fontSize}px · ${v.lineCount} 行${v.hasInline ? ' · 含行内标记 ' + v.inlineTags : ''}）`);
  console.log(`      末行: 「${v.lastLine.text}」 = ${v.lastLine.chars} 字符（宽 ${v.lastLine.width}px）`);
}
console.log(`\n【二】临界（末行 ${MIN_CHARS}–5 字符）：${near.length} 处`);
console.log(`\n【三】汇总`);
const byVpPage = {};
for (const v of viol) byVpPage[`${v.vp}:${v.page}`] = (byVpPage[`${v.vp}:${v.page}`] || 0) + 1;
console.log('  ' + JSON.stringify(byVpPage).replace(/,"/g, ', "'));
console.log(`  违规合计 ${viol.length} · 临界 ${near.length} · 折行块样本 ${blocks.length}`);

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify({ minChars: MIN_CHARS, blocks, viol, near }, null, 1), 'utf8');
  console.log(`  JSON → ${JSON_OUT}`);
}
