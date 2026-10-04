#!/usr/bin/env node
/*
 * text-contrast-audit.mjs — 站点源码级「文本着色对比度」机械审计
 *
 * 与 contrast-check.mjs 的分工：
 *   - contrast-check.mjs  检查一组手工登记的颜色对（令牌级 + 调色板漂移守卫）
 *   - 本脚本              扫描全部 CSS 规则，找「颜色令牌用作文本但对比度不足」
 *
 * 起因：首页拓扑图曾有 7 处 9–11px 小字用角色亮色（2.95–3.17:1），
 * 而 contrast-check 当时未覆盖角色色，只能靠人工发现。本脚本把这类问题
 * 变成可回归的门。
 *
 * 判定（WCAG 2.2 AA）：
 *   - 文本 <24px 且非「>=18.66px 粗体」→ 阈值 4.5:1
 *   - 其余（大文本）→ 阈值 3:1
 *   - 背景取「页面底」与「卡片白底」两者的较低对比度（保守）
 *   - 字号支持 px / rem / var(--font-size-*)；无法判定时跳过并计数，不猜
 *
 * 明确不覆盖（避免假阳性）：
 *   - SVG 图形 fill（圆点/节点/箭头/badge）——属非文本图形，适用 1.4.11 非文本判据
 *   - 纯装饰伪元素（content 只有分隔符/项目符号）
 *   - background / border 声明——不是文本着色
 *
 * 退出码：0 = 无违规；1 = 有违规
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const CSS_PATH = fileURLToPath(new URL('../src/styles/global.css', import.meta.url));

// ── 调色板（递归解析 var() 引用链，如 --role-men: var(--color-accent)）──
const css = readFileSync(CSS_PATH, 'utf8');
const RAW = new Map();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) RAW.set(m[1], m[2].trim());

function resolveToken(name, depth = 0) {
  const raw = RAW.get(name);
  if (raw == null || depth > 8) return null;
  const hex = raw.match(/^#[0-9a-fA-F]{3,8}$/);
  if (hex) return hex[0].toLowerCase();
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/);
  return ref ? resolveToken(ref[1], depth + 1) : null;
}
const COLOR = new Map();
const FONT_SIZE = new Map();
for (const [name, raw] of RAW) {
  const hex = resolveToken(name);
  if (hex && hex.startsWith('#')) COLOR.set(name, hex);
  const rem = raw.match(/^([\d.]+)rem$/);
  if (rem) FONT_SIZE.set(name, parseFloat(rem[1]) * 16);
}

// ── 对比度 ──────────────────────────────────────────────────
const lum = (hex) => {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const BACKGROUNDS = ['#ffffff', '#fafafa']; // 卡片白底 / 页面底色

// ── 遍历 ────────────────────────────────────────────────────
function collect(dir, exts) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...collect(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// 纯装饰组件（整块 aria-hidden 的背景美术），其内部配色不承载信息，不参与文本判据。
// HeroArt 的 symbol-matrix 即属此类：aria-hidden + mask + opacity 0.7 的 ASCII 背景。
const DECORATIVE_COMPONENT_SEL = /\b(symbol-matrix|dither-band|hero-canvas|background-canvas)\b/i;
// 明显是图形的选择器（SVG 形状 / 非文本）
const NON_TEXT_SEL = /(dot|badge|rect|circle|node-bg|path|arrow|marker|spark|bar|track|-bg)\b/i;
// 纯装饰伪元素（只放分隔符/项目符号）
const DECORATIVE_PSEUDO = /^::(before|after)$/;

const violations = [];
let checked = 0, skippedNoFontSize = 0, skippedNonText = 0;

for (const file of collect(SRC, ['.astro'])) {
  const rel = file.slice(SRC.length).replaceAll('\\', '/');
  const src = readFileSync(file, 'utf8');

  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split('\n').pop().trim();
    const body = m[2];

    // 只认 color:（文本语义）；background/border/fill 均不纳入
    // 负向先行断言：确保不是 background-color / border-color / fill 等以 color 结尾的属性
    const cm = body.match(/(?:^|[;\s{])(?<![a-z-])color\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/);
    if (!cm) continue;
    if (DECORATIVE_COMPONENT_SEL.test(selector)) { skippedNonText++; continue; }
    if (NON_TEXT_SEL.test(selector)) { skippedNonText++; continue; }

    if (DECORATIVE_PSEUDO.test(selector)) {
      const content = body.match(/content\s*:\s*['"]([^'"]*)['"]/);
      if (!content || !/[^\s·•\-—–|/]/.test(content[1])) { skippedNonText++; continue; }
    }

    const hex = COLOR.get(cm[1]);
    if (!hex) continue;

    let size = null;
    const px = body.match(/font-size\s*:\s*([\d.]+)px/);
    const rem = body.match(/font-size\s*:\s*([\d.]+)rem/);
    const varRef = body.match(/font-size\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/);
    if (px) size = parseFloat(px[1]);
    else if (rem) size = parseFloat(rem[1]) * 16;
    else if (varRef && FONT_SIZE.has(varRef[1])) size = FONT_SIZE.get(varRef[1]);
    if (size == null) { skippedNoFontSize++; continue; } // clamp()/继承 -> 不猜

    const fw = body.match(/font-weight\s*:\s*(\d+)/);
    const weight = fw
      ? parseInt(fw[1], 10)
      : (/font-weight\s*:\s*var\(--font-weight-bold\)/.test(body) ? 700 : 400);
    const isLarge = size >= 24 || (weight >= 700 && size >= 18.66);
    const threshold = isLarge ? 3 : 4.5;

    // 背景判定：优先用同规则内显式声明的 background（深底反白字是常见写法，
    // 忽略它会把 16:1 的反色误判成 1:1）；否则退回页面底/卡片底候选。
    const bgDecl = body.match(/(?:^|[;\s{])background\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/);
    const localBg = bgDecl ? COLOR.get(bgDecl[1]) : null;
    const backdrops = localBg ? [localBg] : BACKGROUNDS;
    const worst = Math.min(...backdrops.map((bg) => ratio(hex, bg)));
    checked++;
    if (worst < threshold) {
      violations.push({ rel, selector, token: cm[1], hex, size, weight, worst, threshold });
    }
  }
}

console.log('='.repeat(72));
console.log('站点文本着色对比度审计（WCAG 2.2 AA · 零依赖）');
console.log('='.repeat(72));
console.log(`可判定规则 ${checked} · 缺字号跳过 ${skippedNoFontSize} · 非文本/装饰跳过 ${skippedNonText}`);

if (violations.length === 0) {
  console.log('PASS | 未发现「颜色令牌用作文本但对比度不足」的规则');
} else {
  for (const v of violations) {
    console.log(
      `FAIL | ${v.rel} ${v.selector} | ${v.token} ${v.hex} | ` +
      `${v.size}px w${v.weight} -> ${v.worst.toFixed(2)}:1 < ${v.threshold}:1`
    );
  }
}

console.log('='.repeat(72));
if (violations.length > 0) {
  console.error(`结果：${violations.length} 处违规`);
  process.exit(1);
}
console.log('结果：全部通过（无浏览器依赖）');
