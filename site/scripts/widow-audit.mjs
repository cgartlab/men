// 孤行审计 —— 逐字测量每个文本块**实际折行**后的每一行，找出「不足 N 个字符」的行
// （默认 N=4：中文排版里末行只剩 1–3 个字即「孤字/孤行」，视觉上很难看）。
//
// 为什么不能靠读 CSS：折行位置由「容器宽 + 字号 + 字距 + 禁则处理 + 标点挤压」共同决定，
// 只有把每个字渲染后的位置量出来，才能知道最后一行真的剩几个字。
//
// 用法：cd site && node scripts/widow-audit.mjs [--min 4] [--json out.json]
// 依赖：dist 已构建（npm run build）
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const DIST = 'dist';
const PORT = 4909;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
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

const argOf = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
};
const MIN_CHARS = Number(argOf('--min', '4'));
const JSON_OUT = argOf('--json', null);
// WIDOW_FIXER=/abs/path/fixer.js → 在页面加载前注入该脚本，用于验证「孤行修正器」的效果
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
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── 逐字测量折行（页面内执行）────────────────────────────────────────────────
const COLLECT = `(() => {
  const hasCJK = (t) => /[\\u3400-\\u9fff\\u3040-\\u30ff\\uff00-\\uffef]/.test(t);
  // 不可见字符（换行连接符 U+2060、零宽空格等）不算「可见字符」，否则修正器会让审计假通过
  const isVisible = (ch) => ch.trim() !== '' && !/[\\u200b-\\u200f\\u2060-\\u2064\\ufeff]/.test(ch);
  const sel = (el) => {
    const cls = (el.className && typeof el.className === 'string' ? el.className : '')
      .split(/\\s+/).filter((c) => c && !c.startsWith('astro-')).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const directTextLen = (el) => {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\\s+/g, ' ').trim().length;
  };
  // 把元素里的文字按「渲染后的行」切分，并统计每行字符数与像素宽度
  function linesOf(el) {
    const rows = [];
    let cur = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.nodeValue || '';
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        const r = document.createRange();
        try { r.setStart(node, i); r.setEnd(node, i + 1); } catch { continue; }
        const rects = r.getClientRects();
        if (!rects.length) continue;
        const rc = rects[0];
        if (rc.width === 0 && rc.height === 0) continue;
        if (!cur || Math.abs(rc.top - cur.top) > 3) {
          cur = { top: rc.top, text: '', chars: 0, cjk: 0, left: rc.left, right: rc.right, width: 0 };
          rows.push(cur);
        }
        cur.text += ch;
        cur.right = Math.max(cur.right, rc.right);
        cur.left = Math.min(cur.left, rc.left);
        if (isVisible(ch)) { cur.chars += 1; if (hasCJK(ch)) cur.cjk += 1; }
      }
    }
    for (const r of rows) r.width = +(r.right - r.left).toFixed(1);
    return rows;
  }

  const out = [];
  const CANDIDATES = 'p, li, dd, dt, td, th, blockquote, figcaption, summary, .wiki-note, .hero-desc, .showcase__card-desc, .faq__a, .site-footer__stack, .about-lede, .doc-lead';
  for (const el of document.querySelectorAll(CANDIDATES)) {
    if (el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const box = el.getBoundingClientRect();
    if (box.width < 40 || box.height < 2) continue;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    if (box.height < lh * 1.4) continue;            // 没折行 → 无孤行可言
    const textLen = directTextLen(el);
    if (textLen < 12) continue;                      // 太短的内容不算
    const rows = linesOf(el);
    if (rows.length < 2) continue;
    out.push({
      sel: sel(el),
      page: location.pathname,
      fontSize: +parseFloat(cs.fontSize).toFixed(1),
      boxWidth: Math.round(box.width),
      textWrap: cs.textWrap || cs.textWrapStyle || '',
      lines: rows.map((r, i) => ({
        i,
        text: r.text.trim().slice(0, 40),
        chars: r.chars,
        cjk: r.cjk,
        width: r.width,
        isLast: i === rows.length - 1,
        fill: +(r.width / Math.max(1, rows[0].width)).toFixed(2),
      })),
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
        await page.goto(`http://127.0.0.1:${PORT}/${pg}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(250);
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

// ── 判定：末行字符数 < MIN_CHARS ────────────────────────────────────────────
const viol = [];
for (const b of blocks) {
  const last = b.lines[b.lines.length - 1];
  if (last && last.chars < MIN_CHARS) viol.push({ ...b, lastLine: last });
}
// 次级：末行不足但不属于孤字（4–5 字，仅供观察）
const near = [];
for (const b of blocks) {
  const last = b.lines[b.lines.length - 1];
  if (last && last.chars >= MIN_CHARS && last.chars <= 5) near.push({ ...b, lastLine: last });
}

console.log('='.repeat(96));
console.log(`孤行审计 · 判定标准：末行可见字符数 < ${MIN_CHARS}`);
console.log(`样本：${PAGES.length} 页 × ${VIEWPORTS.length} 视口 · 参与判定的折行文本块 ${blocks.length} 个`);
console.log('='.repeat(96));

console.log(`\n【一】违规（末行 < ${MIN_CHARS} 字符）：${viol.length} 处`);
const byPage = new Map();
for (const v of viol) {
  const k = `${v.vp} · ${v.page} · ${v.sel}`;
  if (!byPage.has(k)) byPage.set(k, []);
  byPage.get(k).push(v);
}
for (const [k, list] of [...byPage.entries()].sort()) {
  const v = list[0];
  const prev = v.lines[v.lines.length - 2];
  console.log(`\n  ${k}   （块宽 ${v.boxWidth}px · ${v.fontSize}px · ${v.lines.length} 行）`);
  console.log(`      末行: 「${v.lastLine.text}」 = ${v.lastLine.chars} 字符（宽 ${v.lastLine.width}px）`);
  if (prev) console.log(`      前行: 「${prev.text.slice(0, 32)}」 填充 ${prev.fill}`);
}

console.log(`\n【二】临界（末行 ${MIN_CHARS}–5 字符，观察项）：${near.length} 处`);
for (const n of near.slice(0, 12)) {
  console.log(`  ${n.vp} · ${n.page} · ${n.sel}  末行「${n.lastLine.text}」=${n.lastLine.chars}`);
}
if (near.length > 12) console.log(`  … 另 ${near.length - 12} 处`);

console.log('\n【三】汇总');
const byVpPage = {};
for (const v of viol) byVpPage[`${v.vp}:${v.page}`] = (byVpPage[`${v.vp}:${v.page}`] || 0) + 1;
console.log('  ' + JSON.stringify(byVpPage, null, 0).replace(/,"/g, ', "'));
console.log(`  违规合计 ${viol.length} · 临界 ${near.length} · 文本块样本 ${blocks.length}`);

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify({ minChars: MIN_CHARS, blocks, viol, near }, null, 1), 'utf8');
  console.log(`  JSON → ${JSON_OUT}`);
}
