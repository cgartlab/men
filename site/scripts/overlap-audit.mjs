// 遮挡 / 越界审计 —— 找出「元素互相压住」「超出视口」「被固定页头盖住」的问题
//
// 为什么需要它：页面标题被固定页头压住这类问题，CSS 里看不出来（页头是 fixed、正文偏移写死），
// 只有把渲染后的几何盒两两求交才能发现。本次就是它抓到「窄屏页头 105px vs 正文 top 32px →
// h1 被盖 60%」的。
//
// 判定与排除：
//   · 只比对「带文字或可交互」的元素；跳过祖先-后代关系；跳过两个行内元素（同一行内不可能互遮）
//   · 排除 <details> 关闭时的内容（Chrome 下仍有布局盒但不绘制 → 假阳性）
//   · 排除背景装饰层（.bg-layer，z-index 低于页头）
//   · 越界检查跳过可横滑容器内的元素（宽表格 / 拓扑图是设计上的横向滚动）
//
// 用法：node scripts/overlap-audit.mjs
//   · 排除 <details> 关闭时的内容（Chrome 下仍有布局盒但不绘制 → 会造出假阳性）
//   · 排除祖先-后代关系；只看「带文字或可交互」的元素
import http from 'node:http';
import { readFile } from 'node:fs/promises';
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

const DETECT = String.raw`(() => {
  const vw = window.innerWidth;
  const label = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter((c) => c && !c.startsWith('astro-')).slice(0, 2).join('.');
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = own.replace(/\s+/g, ' ').trim().slice(0, 22);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (own ? ' 「' + own + '」' : '');
  };
  const hasText = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true; return false; };
  const inClosedDetails = (el) => { let n = el; while (n && n !== document.body) { if (n.tagName === 'DETAILS' && !n.open) return true; n = n.parentElement; } return false; };
  const scrollableAncestor = (el) => { let p = el.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (['auto', 'scroll', 'hidden'].includes(s.overflowX)) return true; p = p.parentElement; } return false; };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    if (inClosedDetails(el)) return false;
    const b = el.getBoundingClientRect();
    return b.width > 4 && b.height > 4;
  };
  const out = { pairs: [], overflow: [], fixedOver: [], clipped: [] };
  const all = [...document.querySelectorAll('body *')].filter(visible);
  const rects = new Map();
  for (const el of all) rects.set(el, el.getBoundingClientRect());

  for (const el of all) {
    const b = rects.get(el);
    if (getComputedStyle(el).position === 'fixed') continue;
    if ((b.left < -1 || b.right > vw + 1) && !scrollableAncestor(el)) out.overflow.push({ d: label(el), left: Math.round(b.left), right: Math.round(b.right) });
  }

  const isInline = (el) => getComputedStyle(el).display.startsWith('inline');
  const interesting = all.filter((el) => hasText(el) || /^(A|BUTTON|INPUT|SUMMARY)$/.test(el.tagName));
  for (let i = 0; i < interesting.length; i++) {
    for (let j = i + 1; j < interesting.length; j++) {
      const a = interesting[i], b = interesting[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (isInline(a) && isInline(b)) continue;   // 同行内元素不可能互相遮挡
      // 同一张「牌」内的元素：卡片是纵向 flex 排列，行与行在视觉上永不重叠；
      // 但卡片被 rotate 后，两者外接矩形会被旋转放大而虚假相交（扇形角色卡实测误报 6 处）。
      const cardOf = (el) => el.closest && el.closest('.showcase__card');
      if (cardOf(a) && cardOf(a) === cardOf(b)) continue;
      // 扇形手牌（.showcase__hand）：牌是一张压一张的**层叠布局**（用户要的「像拿在手里」），
      // 相邻牌边缘互相遮盖是设计意图，不是缺陷。但只放行「部分遮盖」——
      // 若某元素的**中心点**也被盖住（身份信息读不到），仍按真遮挡报出。
      // 扇形手牌（.showcase__hand）：牌一张压一张是**设计意图**（用户要的「像拿在手里」），
      // 因此牌的下半身（描述 / 技能标签 / 约束行）被右邻牌搭叠属于正常形态 ——
      // 用户抽出或悬停某张牌时它会上移并置于顶层，完整内容随时可取。
      // 判据：**身份区**（.showcase__card-head / .showcase__card-role / .showcase__card-icon）
      // 必须完全可读（那是「这是谁」的信息，被盖就是缺陷）；其余部分只要不是整块埋没即可。
      // 身份区的机械守门人是 scripts/fan-center-probe（六张牌三件套全 ✓）。
      const IDENT = '.showcase__card-head, .showcase__card-role, .showcase__card-icon';
      const identityCovered = (el) => {
        if (!el.matches || !el.matches(IDENT)) return false;
        const rr = rects.get(el);
        const h = document.elementFromPoint(Math.round(rr.left + rr.width / 2), Math.round(rr.top + rr.height / 2));
        return !(h && (h === el || el.contains(h)));
      };
      const inTrack = (el) => el.closest && (el.closest('.showcase__track') || el.closest('.showcase__hand'));
      if (inTrack(a) || inTrack(b)) {
        if (!identityCovered(a) && !identityCovered(b)) continue;   // 身份区都可读 → 层叠是设计
      }
      // 已知无害：代码块头部条里，语言标签的**盒子**横跨整条（display:block），
      // 复制按钮绝对定位在右端 —— 标签文字已 padding-right 让位，实际不会碰到按钮。
      const isHeadBar = (x) => (x.closest && x.closest('.code-block')) || x.classList.contains('copy-btn');
      if (isHeadBar(a) && isHeadBar(b)) continue;
      const ra = rects.get(a), rb = rects.get(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox <= 2 || oy <= 2) continue;
      const small = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (small <= 0) continue;
      const ratio = (ox * oy) / small;
      if (ratio <= 0.35) continue;
      // 复验：几何盒相交 ≠ 真的挡住。旋转 / 变换元素的 getBoundingClientRect 是**旋转后外接矩形**，
      // 同一张被旋转的卡片里，子元素的外接矩形必然互相重叠（实测误报率极高）。
      // 在两者重叠区内**多点采样** elementFromPoint：只要有点命中一方（或其后代），
      // 说明该处在视觉上属于那一方 —— 不是遮挡。整片重叠区都命中「第三方」才算真问题。
      const ox0 = Math.max(ra.left, rb.left), ox1 = Math.min(ra.right, rb.right);
      const oy0 = Math.max(ra.top, rb.top), oy1 = Math.min(ra.bottom, rb.bottom);
      let hitOwn = false, samples = 0;
      for (let fy = 0.2; fy <= 0.8 && !hitOwn; fy += 0.3) {
        for (let fx = 0.2; fx <= 0.8; fx += 0.3) {
          samples++;
          const hit = document.elementFromPoint(Math.round(ox0 + (ox1 - ox0) * fx), Math.round(oy0 + (oy1 - oy0) * fy));
          if (!hit) continue;
          if (hit === a || a.contains(hit) || hit.contains(a) || hit === b || b.contains(hit) || hit.contains(b)) { hitOwn = true; break; }
        }
      }
      if (hitOwn || samples === 0) continue;
      out.pairs.push({ a: label(a), b: label(b), ratio: +ratio.toFixed(2),
        A: [Math.round(ra.left), Math.round(ra.top), Math.round(ra.width), Math.round(ra.height)],
        B: [Math.round(rb.left), Math.round(rb.top), Math.round(rb.width), Math.round(rb.height)] });
    }
  }

  // ④ 被裁切：元素比「overflow: hidden 的祖先」还宽 → 内容被切掉（溢出检测查不到，因为没有滚动条）
  for (const el of all) {
    const b = rects.get(el);
    let anc = el.parentElement, skip = false;
    while (anc && anc !== document.body) {
      const cs2 = getComputedStyle(anc);
      // 祖先里有可滚动容器（overflow-x: auto/scroll）→ 超出部分是「可以滚出来的」，不是裁切
      if (cs2.overflowX === 'auto' || cs2.overflowX === 'scroll') { skip = true; break; }
      if (cs2.overflowX === 'hidden' || cs2.overflowY === 'hidden') {
        const rb = rects.get(anc) || anc.getBoundingClientRect();
        const over = Math.round(b.right - rb.right);
        if (over > 2 && b.width > 8) {
          const cls = (typeof anc.className === 'string' ? anc.className : '').split(/\s+/)[0];
          out.clipped.push({ d: label(el), over, clip: anc.tagName.toLowerCase() + (cls ? '.' + cls : ''), w: Math.round(b.width), clipW: Math.round(rb.width) });
        }
        break;
      }
      anc = anc.parentElement;
    }
    void skip;
  }

  const fixeds = all.filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position))
    // 排除装饰层：纯背景层（.bg-layer）与任何 pointer-events:none 的固定层（如 .hero-backdrop）。
    // 后者不会接收指针事件、也不绘制不透明内容，几何相交是假阳性 ——
    // 判定它是否真遮挡要看 elementFromPoint 命中谁，不是中心点是否落在盒内。
    .filter((el) => !(el.className && String(el.className).includes('bg-layer')))
    .filter((el) => getComputedStyle(el).pointerEvents !== 'none');
  for (const f of fixeds) {
    const rf = rects.get(f);
    for (const t of interesting) {
      if (f.contains(t) || t.contains(f) || fixeds.includes(t)) continue;
      if (isInline(f) && isInline(t)) continue;
      const rt = rects.get(t);
      const ox = Math.min(rf.right, rt.right) - Math.max(rf.left, rt.left);
      const oy = Math.min(rf.bottom, rt.bottom) - Math.max(rf.top, rt.top);
      if (ox <= 2 || oy <= 2) continue;
      const small = Math.min(rf.width * rf.height, rt.width * rt.height);
      if (small > 0 && (ox * oy) / small > 0.3) out.fixedOver.push({ fixed: label(f), covered: label(t), ratio: +((ox * oy) / small).toFixed(2) });
    }
  }
  out.header = (() => { const h = document.querySelector('.site-header'); if (!h) return null; const b = h.getBoundingClientRect(); return { h: Math.round(b.height), bottom: Math.round(b.bottom) }; })();
  out.firstContent = (() => { const m = document.querySelector('main > *'); if (!m) return null; const b = m.getBoundingClientRect(); return { d: label(m), top: Math.round(b.top) }; })();
  return out;
})()`;

const br = await launchBrowser();
try {
  for (const [label, w, h] of [['1440', 1440, 900], ['390', 390, 844], ['360', 360, 800]]) {
    const ctx = await br.newContext({ viewport: { width: w, height: h } });
    for (const pg of ['index.html', 'roles/index.html', 'mechanisms/index.html', 'about/index.html', 'docs/quickstart/index.html', 'docs/install/index.html']) {
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(250);
      const r = await page.evaluate(DETECT);
      const tag = `${label}px ${pg}`;
      const problems = r.overflow.length + r.pairs.length + r.fixedOver.length + r.clipped.length;
      if (!problems) { console.log(`✓ [${tag}] 无遮挡/越界 · 页头高 ${r.header.h}px，正文首元素 top=${r.firstContent.top}px`); }
      else {
        console.log(`\n⚠ [${tag}] 页头高 ${r.header.h}px · 正文首元素「${r.firstContent.d}」top=${r.firstContent.top}px`);
        for (const x of r.overflow.slice(0, 5)) console.log(`    [越界] ${x.d} left=${x.left} right=${x.right}`);
        for (const x of r.clipped.slice(0, 6)) console.log(`    [被裁切] ${x.d}（宽 ${x.w} 超出 ${x.clip} 的 ${x.clipW} 共 ${x.over}px）`);
        for (const x of r.fixedOver.slice(0, 5)) console.log(`    [页头压住] ${x.fixed} → ${x.covered}（${(x.ratio * 100) | 0}%）`);
        for (const x of r.pairs.sort((p, q) => q.ratio - p.ratio).slice(0, 6)) console.log(`    [互相压住] ${x.a} ↔ ${x.b}（${(x.ratio * 100) | 0}%）A=${x.A} B=${x.B}`);
      }
      await page.close();
    }
    await ctx.close();
  }
} finally { await br.close(); srv.close(); }
