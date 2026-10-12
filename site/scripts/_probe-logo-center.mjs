// logo 孔圆心实测：从渲染像素反推镂空孔的实际中心，与几何圆心比对
// 不依赖视觉模型，纯像素统计。
import { PNG } from 'node:zlib'; // 占位，实际用自实现解码
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launchBrowser } from './lib/browser.mjs';

// 用浏览器解码 PNG → canvas → 像素数据（避免手写 PNG 解码）
const br = await launchBrowser();
try {
  const ctx = await br.newContext({ viewport: { width: 400, height: 400 } });
  const page = await ctx.newPage();

  // 在页面里渲染 logo，并把像素读回来
  const result = await page.evaluate(async (d) => {
    const svg = `<svg width="360" height="302" viewBox="0 0 100 83.7963" xmlns="http://www.w3.org/2000/svg">
      <path fill="#bc513a" fill-rule="evenodd" d="${d}"/></svg>`;
    const blobUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    const img = new Image();
    img.src = blobUrl;
    await img.decode();

    const cv = document.createElement('canvas');
    cv.width = 360; cv.height = 302;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, 360, 302).data;

    // 背景透明/白 = 孔；橙 = 图形。统计每一行的「孔像素」x 范围
    const rows = [];
    for (let y = 0; y < 302; y++) {
      let first = -1, last = -1, count = 0;
      for (let x = 0; x < 360; x++) {
        const i = (y * 360 + x) * 4;
        const r = px[i], gg = px[i + 1], b = px[i + 2], a = px[i + 3];
        const isOrange = a > 128 && r > 140 && r < 230 && gg < 130 && b < 110;
        if (!isOrange) { if (first === -1) first = x; last = x; count++; }
      }
      if (count > 0) rows.push({ y, first, last, count });
    }
    return { rows, W: 360, H: 302 };
  }, 'M 49.4949,12.2222 C 34.4265,12.2222 33.9309,0.0 25.5529,0.0 C -3.0669,0.0 0.104,11.5407 0.104,41.3544 C 0.104,70.5679 -0.8861,74.2725 20.6975,83.2112 C 32.2645,88.0015 27.2247,61.9479 49.8298,61.9479 C 71.9301,61.9479 67.6945,87.8998 78.962,83.0437 C 100.8451,73.6126 100.8205,70.6946 99.5555,40.5173 C 98.3835,12.557 102.3083,0.0 74.4415,0.0 C 66.6945,0.0 67.0189,12.2222 49.4949,12.2222 Z M 69.0118,40.6010 A 19.0983,19.0983 0 1 0 30.8152,40.6010 A 19.0983,19.0983 0 1 0 69.0118,40.6010 Z');

  // 找孔：中间那一段连续的「非橙」像素区（孔在图形内部）
  // 取图形左右边界（整行最左/最右的橙像素），孔在这之间
  // 先算橙像素的水平范围
  const orangeRows = result.rows.map(() => 0);
  // 逐行找：非橙像素里，夹在橙像素之间的那些才算「孔」
  const holeRows = [];
  // 需要重新取每行的橙/非橙序列
  const seq = await page.evaluate(async (d) => {
    const svg = `<svg width="360" height="302" viewBox="0 0 100 83.7963" xmlns="http://www.w3.org/2000/svg">
      <path fill="#bc513a" fill-rule="evenodd" d="${d}"/></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 360; cv.height = 302;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, 360, 302).data;
    const out = [];
    for (let y = 0; y < 302; y++) {
      const bits = [];
      for (let x = 0; x < 360; x++) {
        const i = (y * 360 + x) * 4;
        const a = px[i + 3];
        const isO = a > 128 && px[i] > 140 && px[i] < 230 && px[i + 1] < 130 && px[i + 2] < 110;
        bits.push(isO ? 1 : 0);
      }
      out.push(bits);
    }
    return out;
  }, 'M 49.4949,12.2222 C 34.4265,12.2222 33.9309,0.0 25.5529,0.0 C -3.0669,0.0 0.104,11.5407 0.104,41.3544 C 0.104,70.5679 -0.8861,74.2725 20.6975,83.2112 C 32.2645,88.0015 27.2247,61.9479 49.8298,61.9479 C 71.9301,61.9479 67.6945,87.8998 78.962,83.0437 C 100.8451,73.6126 100.8205,70.6946 99.5555,40.5173 C 98.3835,12.557 102.3083,0.0 74.4415,0.0 C 66.6945,0.0 67.0189,12.2222 49.4949,12.2222 Z M 69.0118,40.6010 A 19.0983,19.0983 0 1 0 30.8152,40.6010 A 19.0983,19.0983 0 1 0 69.0118,40.6010 Z');

  const SCALE = 360 / 100;  // viewBox 100 → 360px
  for (let y = 0; y < seq.length; y++) {
    const bits = seq[y];
    // 找第一段和最后一段橙像素
    let firstO = bits.indexOf(1);
    if (firstO === -1) continue;
    let lastO = bits.length - 1;
    while (lastO >= 0 && bits[lastO] === 0) lastO--;
    if (lastO - firstO < 20) continue;
    // 在 [firstO, lastO] 之间找 0 的连续段 = 孔
    const inner = bits.slice(firstO, lastO + 1);
    const zeroRuns = [];
    let s = -1;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === 0 && s === -1) s = i;
      if ((inner[i] === 1 || i === inner.length - 1) && s !== -1) { zeroRuns.push([s + firstO, i - 1 + firstO]); s = -1; }
    }
    const widest = zeroRuns.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    if (!widest) continue;
    const w = widest[1] - widest[0];
    if (w > 8) holeRows.push({ y, x0: widest[0], x1: widest[1], w });
  }

  if (!holeRows.length) { console.log('  未检出孔'); process.exit(1); }
  // 孔的垂直范围中点
  const y0 = holeRows[0].y, y1 = holeRows[holeRows.length - 1].y;
  // 取孔最宽那一行的中心 x（圆心所在行）
  const midY = Math.round((y0 + y1) / 2);
  const near = holeRows.filter(h => Math.abs(h.y - midY) <= 2);
  const xs = near.flatMap(h => [h.x0, h.x1]);
  const measuredCx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const measuredCy = (y0 + y1) / 2;
  // 几何圆心（viewBox 单位 → 像素）
  const geomCxPx = 49.9135 * SCALE;
  const geomCyPx = 40.6010 * SCALE;

  console.log('\nlogo 孔圆心 —— 像素实测 vs 几何公式');
  console.log('-'.repeat(58));
  console.log(`  孔垂直范围   y ${y0} – ${y1}px  → 实测中心 y = ${measuredCy.toFixed(1)}px`);
  console.log(`  孔水平中心   实测 x = ${measuredCx.toFixed(1)}px`);
  console.log(`  几何圆心     x = ${geomCxPx.toFixed(1)}px  y = ${geomCyPx.toFixed(1)}px`);
  const dx = measuredCx - geomCxPx, dy = measuredCy - geomCyPx;
  console.log(`  偏差         dx = ${dx.toFixed(2)}px  dy = ${dy.toFixed(2)}px`);
  console.log(`  判定         ${Math.hypot(dx, dy) <= 2 ? '✓ 同心（偏差 ≤2px，渲染抗锯齿范围内）' : '✗ 不同心'}`);
  // 孔的实际直径
  const widestRow = holeRows.reduce((a, b) => (b.w > a.w ? b : a));
  console.log(`  孔直径       ${widestRow.w}px  (理论 ${(19.0983 * 2 * SCALE).toFixed(0)}px)`);
} finally {
  await br.close();
}
