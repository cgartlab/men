// 间距审计 —— 首页所有板块的「外边距刻度 / 兄弟间隙 / 左边界对齐 / 板块内外留白」
//
// 为什么需要它：间距不一致（同类型兄弟元素一个 16px 一个 12px、左边界差 8px）单看代码看不出来，
// 只有把渲染后的盒子与计算样式逐层量出来才暴露。
//
// 判定：
//   · 外边距刻度：计算后的 margin-top/bottom 必须落在间距令牌上（0 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / auto）
//   · 兄弟间隙：相邻块级兄弟的实测间隙（含外边距折叠后的真实值）—— 同类型兄弟出现不同间隙 → 报告
//   · 左边界对齐：同一板块内带文字的元素，其左边界 x 应当只有 1–2 种（标题/正文同一竖线）
//   · 板块留白：section 的上下内边距、板块之间的间隙
//
// 用法：node scripts/spacing-audit.mjs [--json out.json]
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

const COLLECT = String.raw`(() => {
  const TOKENS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96];
  const onScale = (v) => v === null || TOKENS.some((t) => Math.abs(v - t) < 0.6);
  const name = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter((c) => c && !c.startsWith('astro-'))[0];
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const hasText = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true; return false; };
  const isBlock = (el) => { const d = getComputedStyle(el).display; return d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item'; };
  const inClosedDetails = (el) => { let n = el; while (n && n !== document.body) { if (n.tagName === 'DETAILS' && !n.open) return true; n = n.parentElement; } return false; };
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && !inClosedDetails(el); };

  const out = { sections: [], offScale: [], uneven: [], misaligned: [], json: {} };
  const main = document.querySelector('main');
  const sections = [...main.children].filter((el) => visible(el) && el.getBoundingClientRect().height > 4);

  let prevBottom = null;
  for (const sec of sections) {
    const sb = sec.getBoundingClientRect();
    const secName = name(sec);
    const rec = { name: secName, top: Math.round(sb.top), bottom: Math.round(sb.bottom), h: Math.round(sb.height), gapAbove: prevBottom === null ? null : Math.round(sb.top - prevBottom), padTop: null, padBottom: null, children: [] };

    // 直接子元素（块级、可见）
    const kids = [...sec.children].filter((el) => visible(el) && isBlock(el) && el.getBoundingClientRect().height > 2);
    if (kids.length) {
      rec.padTop = Math.round(kids[0].getBoundingClientRect().top - sb.top);
      rec.padBottom = Math.round(sb.bottom - kids[kids.length - 1].getBoundingClientRect().bottom);
    }
    let pv = null;
    for (const k of kids) {
      const kb = k.getBoundingClientRect();
      const cs = getComputedStyle(k);
      const mt = cs.marginTop === 'auto' ? null : parseFloat(cs.marginTop);
      const mb = cs.marginBottom === 'auto' ? null : parseFloat(cs.marginBottom);
      const gap = pv === null ? null : Math.round(kb.top - pv);
      const padT = Math.round(parseFloat(cs.paddingTop) || 0);
      rec.children.push({ n: name(k), top: Math.round(kb.top), bottom: Math.round(kb.bottom), h: Math.round(kb.height), gap, padT, mt, mb });
      if (!onScale(mt) || !onScale(mb)) out.offScale.push({ sec: secName, el: name(k), mt, mb });
      pv = kb.bottom;
    }
    // 同类型兄弟间隙不一致
    const byType = new Map();
    for (const c of rec.children) { if (c.gap === null) continue; const t = c.n.replace(/\d+/g, ''); if (!byType.has(t)) byType.set(t, []); byType.get(t).push(c.gap); }
    for (const [t, gaps] of byType) {
      if (gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) > 2) out.uneven.push({ sec: secName, type: t, gaps });
    }
    // 左边界对齐（板块内带文字的元素）
    const xs = new Map();
    // 只比「正文块」的左边界：标题/段落/列表项，且不在卡片、代码、SVG 内部
    const CARDISH = '.hero-install, .showcase__card, .mechanisms__item, .faq__item, .topo-diagram, .cta__inner, .topo-legend, .showcase__track, pre, code, svg';
    for (const el of sec.querySelectorAll('h1, h2, h3, h4, p, li, ul, ol, td, dd')) {
      if (!visible(el) || !hasText(el)) continue;
      if (el.closest(CARDISH)) continue;
      if (getComputedStyle(el).display !== 'block') continue;
      const b = el.getBoundingClientRect();
      if (b.width < 40) continue;
      const x = Math.round(b.left);
      if (!xs.has(x)) xs.set(x, []);
      xs.get(x).push(name(el));
    }
    if (xs.size > 3) out.misaligned.push({ sec: secName, xs: [...xs.entries()].sort((a, b) => a[0] - b[0]).map(([x, els]) => x + 'px ×' + els.length + ' (' + els.slice(0, 2).join(', ') + ')') });
    // 内层关键容器：卡片 / 列表项 / CTA 内容 / hero 文字列 / 安装卡
    rec.inner = [];
    for (const sel of ['.hero-content', '.hero-install', '.hero-actions', '.showcase__card', '.mechanisms__list', '.mechanisms__item', '.faq__list', '.faq__item', '.cta__inner', '.cta__actions', '.topo__header', '.topo-legend', '.showcase__header']) {
      const c = sec.querySelector(sel);
      if (!c || !visible(c)) continue;
      const kids = [...c.children].filter((el) => visible(el) && isBlock(el) && el.getBoundingClientRect().height > 2);
      if (kids.length < 2) continue;
      const rows = [];
      let pv = null;
      for (const k of kids) {
        const kb = k.getBoundingClientRect();
        const cs = getComputedStyle(k);
        const padT = parseFloat(getComputedStyle(k).paddingTop) || 0;
        rows.push({ n: name(k), gap: pv === null ? null : Math.round(kb.top - pv), padT: Math.round(padT), h: Math.round(kb.height) });
        pv = kb.bottom;
      }
      rec.inner.push({ sel, rows });
    }
    out.sections.push(rec);
    prevBottom = sb.bottom;
  }
  return out;
})()`;

const br = await launchBrowser();
try {
  for (const [label, w, h] of [['1440', 1440, 1000], ['390', 390, 844]]) {
    const ctx = await br.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(450);
    const r = await page.evaluate(COLLECT);
    console.log(`\n${'='.repeat(96)}\n首页间距审计 · ${label}px\n${'='.repeat(96)}`);
    for (const s of r.sections) {
      console.log(`\n【${s.name}】 高 ${s.h}px · 上方板块间隙 ${s.gapAbove}px · 内边距 上 ${s.padTop} / 下 ${s.padBottom}`);
      for (const c of s.children) {
        const flags = [];
        if (c.gap !== null && c.gap + (c.padT || 0) <= 4) flags.push('紧贴');
        if (![0, null].includes(c.mt) && ![4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96].some((t) => Math.abs(c.mt - t) < 0.6)) flags.push('mt=' + c.mt + ' 不在刻度');
        if (![0, null].includes(c.mb) && ![4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96].some((t) => Math.abs(c.mb - t) < 0.6)) flags.push('mb=' + c.mb + ' 不在刻度');
        console.log(`   ${String(c.gap === null ? '—' : c.gap).padStart(4)}px  ${c.n.padEnd(30)} h=${String(c.h).padStart(4)} mt=${String(c.mt).padStart(5)} mb=${String(c.mb).padStart(5)} ${flags.join(' · ')}`);
      }
    }
    for (const s of r.sections) {
      if (!s.inner || !s.inner.length) continue;
      for (const c of s.inner) {
        console.log(`   └ ${c.sel}: ` + c.rows.map((x) => `${x.n}=${x.gap === null ? '首' : x.gap + (x.padT ? '+pad' + x.padT : '') + 'px'}`).join(' · '));
      }
    }
    if (r.offScale.length) { console.log('\n⚠ 外边距不在间距刻度：'); for (const x of r.offScale.slice(0, 12)) console.log(`   ${x.sec} → ${x.el}  mt=${x.mt} mb=${x.mb}`); }
    if (r.uneven.length) { console.log('\n⚠ 同类型兄弟间隙不一致：'); for (const x of r.uneven) console.log(`   ${x.sec} → ${x.type}  间隙 ${x.gaps.join(' / ')}`); }
    if (r.misaligned.length) { console.log('\n⚠ 板块内左边界不统一：'); for (const x of r.misaligned) console.log(`   ${x.sec}: ${x.xs.join('  |  ')}`); }
    if (JSON_OUT) await writeFile(`${JSON_OUT.replace('.json', '-' + label + '.json')}`, JSON.stringify(r, null, 1), 'utf8');
    await ctx.close();
  }
} finally { await br.close(); srv.close(); }
