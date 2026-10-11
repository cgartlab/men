#!/usr/bin/env node
/*
 * contrast-check.mjs — R8.5 · WCAG 2.2 AA 对比度验证
 * 检查所有颜色对的对比度，输出 PASS/FAIL
 *
 * 用法：node scripts/contrast-check.mjs
 */

import { readFileSync } from 'node:fs';

// ---------- 调色板同步守卫 ----------
// 上面的 colors 是一份「与 global.css 手工同步」的副本。若 global.css 改了颜色而
// 这里没改，脚本仍会用旧值跑出 PASS —— 这正是假阳性（检查通过但没测到真实值）。
// 因此先从 global.css 读真值逐项比对，不一致直接 FAIL。
// 路径基于 import.meta.url 解析，不依赖 CWD（脚本位于 site/scripts/，但约定从 site/ 运行）。
const CSS_PATH = new URL('../src/styles/global.css', import.meta.url);
const css = readFileSync(CSS_PATH, 'utf8');

// 令牌可能写成字面量 #rrggbb，也可能写成 var(--another-token)（如 --role-men
// 复用 --color-accent 以避免重复字面量）。先收集原始定义，再解析 var() 引用。
const RAW = new Map();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  RAW.set(m[1], m[2].trim());
}
function resolveToken(name, depth = 0) {
  const raw = RAW.get(name);
  if (raw == null || depth > 8) return null;
  const hex = raw.match(/^#[0-9a-fA-F]{3,8}$/);
  if (hex) return hex[0].toLowerCase();
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/);
  if (ref) return resolveToken(ref[1], depth + 1);
  return null;
}
const TOKENS = new Map();
for (const name of RAW.keys()) {
  const v = resolveToken(name);
  if (v) TOKENS.set(name, v);
}

// colors 的键 → global.css 中的令牌名
const PALETTE_TOKEN_MAP = {
  fg: '--color-fg',
  fgSecondary: '--color-fg-secondary',
  fgTertiary: '--color-fg-tertiary',
  fgMuted: '--color-fg-muted',
  fgDecorative: '--color-fg-decorative',
  bg: '--color-bg',
  surface: '--color-surface',
  surfaceWarm: '--color-surface-warm',
  accent: '--color-accent',
  accentDark: '--color-accent-dark',
  accentOnAccent: '--color-accent-on-accent',
  accentSoft: '--color-accent-soft',
  roleMen: '--role-men', roleSi: '--role-si', roleJi: '--role-ji',
  roleChi: '--role-chi', roleYi: '--role-yi', roleXun: '--role-xun',
  roleMenText: '--role-men-text', roleSiText: '--role-si-text', roleJiText: '--role-ji-text',
  roleChiText: '--role-chi-text', roleYiText: '--role-yi-text', roleXunText: '--role-xun-text',
  lineUi: '--color-line-ui',
};

function normalizeHex(hex) {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) return '#' + h.split('').map((c) => c + c).join('');
  return '#' + h.slice(0, 6);
}

// ---------- 颜色定义（品牌规范 v1 · 由 global.css 真值逐项校验） ----------
const colors = {
  // 前景文字（5 级梯度 · 纸底/暖底双达标）
  fg:            '#2b2a27',  // 正文 · 13.6:1 纸 / 12.7:1 暖
  fgSecondary:   '#4a4741',  // 次文本 · 8.8:1
  fgTertiary:    '#5e5d59',  // 三文本 · 6.3:1
  fgMuted:       '#6b6a64',  // 弱化文本 · 5.2:1 (双底达标)
  fgDecorative:  '#8a877e',  // 仅装饰 · 3.4:1 (非强制)
  // 背景
  bg:            '#faf9f5',  // 页面底色（暖纸）
  surface:       '#ffffff',  // 卡片面板
  surfaceWarm:   '#f5f0e8',  // 暖调面板
  // 强调色（赤陶）
  accent:        '#d77656',  // 主强调（仅大文本/填充/图形） · 3.0:1
  accentDark:    '#8f3d28',  // 小字安全强调 · 7.0:1
  accentSoft:    '#bc513a',  // 中等强度（文字/边框/hover 加深）· 4.6:1
  accentOnAccent:'#2b2a27',  // accent 底上的文字（保持「亮底+深字」架构）· 4.5:1
  // 角色色（首页拓扑图 / showcase 卡片 · 莫兰迪暖调）
  roleMen:'#d77656', roleSi:'#6f90a7', roleJi:'#5e9963',
  roleChi:'#a4874d', roleYi:'#a47faa', roleXun:'#9086ab',
  // 角色色文本变体（小字 AA ≥4.5:1 · 纸底/暖底双达标）
  roleMenText:'#8f3d28', roleSiText:'#447191', roleJiText:'#3a7a3f',
  roleChiText:'#85682f', roleYiText:'#9753a1', roleXunText:'#7361aa',
  // 交互控件边界（非文本，§1.4.11）
  lineUi:'#847a6d',
};

// ---------- 对比度计算 ----------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h;
  return {
    r: parseInt(n.substring(0, 2), 16),
    g: parseInt(n.substring(2, 4), 16),
    b: parseInt(n.substring(4, 6), 16),
  };
}

function relativeLuminance(rgb) {
  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(color1, color2) {
  const l1 = relativeLuminance(hexToRgb(color1));
  const l2 = relativeLuminance(hexToRgb(color2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------- 测试对（WCAG 2.2 AA） ----------
const pairs = [
  // 角色色 · 文本专用深色变体（AA 小文本 ≥4.5:1 @ #f5f0e8 拓扑图节点底）
  { fg: colors.roleMenText,  bg: '#f5f0e8', label: 'role-men-text  小字标签 @ 拓扑节点', min: 4.5 },
  { fg: colors.roleSiText,   bg: '#f5f0e8', label: 'role-si-text   小字标签 @ 拓扑节点', min: 4.5 },
  { fg: colors.roleJiText,   bg: '#f5f0e8', label: 'role-ji-text   小字标签 @ 拓扑节点', min: 4.5 },
  { fg: colors.roleChiText,  bg: '#f5f0e8', label: 'role-chi-text  小字标签 @ 拓扑节点', min: 4.5 },
  { fg: colors.roleYiText,   bg: '#f5f0e8', label: 'role-yi-text   小字标签 @ 拓扑节点', min: 4.5 },
  { fg: colors.roleXunText,  bg: '#f5f0e8', label: 'role-xun-text  小字标签 @ 拓扑节点', min: 4.5 },
  // 角色色 · 亮色版：大文本场景（≥3:1，首页 showcase 卡片 20px 粗体 / 白底）
  { fg: colors.roleMen, bg: colors.surface, label: 'role-men  大文本/描边 @ 卡片', min: 3.0 },
  { fg: colors.roleSi,  bg: colors.surface, label: 'role-si   大文本/描边 @ 卡片', min: 3.0 },
  { fg: colors.roleJi,  bg: colors.surface, label: 'role-ji   大文本/描边 @ 卡片', min: 3.0 },
  { fg: colors.roleChi, bg: colors.surface, label: 'role-chi  大文本/描边 @ 卡片', min: 3.0 },
  { fg: colors.roleYi,  bg: colors.surface, label: 'role-yi   大文本/描边 @ 卡片', min: 3.0 },
  { fg: colors.roleXun, bg: colors.surface, label: 'role-xun  大文本/描边 @ 卡片', min: 3.0 },
  // 非文本对比度（WCAG 2.2 §1.4.11 · UI 控件边界 ≥3:1）
  // 只针对「除填充外无其他可见内容」的控件；其余控件按 Boundaries 条款
  // 由文字/图标承担识别，不在此列。
  { fg: colors.lineUi, bg: colors.bg,          label: 'line-ui  控件边界 vs 页面底',   min: 3.0 },
  { fg: colors.lineUi, bg: colors.surface,     label: 'line-ui  控件边界 vs 卡片白底', min: 3.0 },
  { fg: colors.lineUi, bg: '#efe8db',          label: 'line-ui  控件边界 vs 暖底',     min: 3.0 },
  { fg: colors.lineUi, bg: '#efe8db',          label: 'line-ui  控件边界 vs 终端 chrome', min: 3.0 },
  // 正文文本（≥ 4.5:1 · 纸底 + 暖底双面）
  { fg: colors.fg,        bg: colors.bg,           label: '正文(#2b2a27) vs 背景(#faf9f5)',         min: 4.5 },
  { fg: colors.fg,        bg: colors.surface,      label: '正文 vs 白底(#ffffff)',                   min: 4.5 },
  { fg: colors.fg,        bg: colors.surfaceWarm,  label: '正文 vs 暖底(#f5f0e8)',                   min: 4.5 },
  { fg: colors.fgSecondary, bg: colors.bg,          label: '次文本(#4a4741) vs 背景',                 min: 4.5 },
  { fg: colors.fgTertiary,  bg: colors.bg,          label: '三文本(#5e5d59) vs 背景',                 min: 4.5 },
  { fg: colors.fgTertiary,  bg: colors.surfaceWarm, label: '三文本 vs 暖底',                          min: 4.5 },
  // 弱化文本（≥ 4.5:1 · 本版校准到双底达标）
  { fg: colors.fgMuted,     bg: colors.bg,          label: '弱化文本(#6b6a64) vs 背景',             min: 4.5 },
  { fg: colors.fgMuted,     bg: colors.surfaceWarm, label: '弱化文本 vs 暖底',                      min: 4.5 },
  // 装饰文本（≥ 3:1 · WCAG 非强制但建议）
  { fg: colors.fgDecorative, bg: colors.bg,         label: '装饰文本(#8a877e) vs 背景[装饰]',        min: 3.0 },
  // 强调色「填充承载文字」规则（2026-10-11 合并自排版线）：
  // 凡是把文字放在强调色填充上的地方（按钮 / 徽标 / 拓扑中枢 / 选中态），
  // 都必须在这里有断言 —— 填充或文字色改动后若不再达标，这里会 FAIL。
  { fg: colors.accentOnAccent, bg: colors.accent, label: 'accent 填充上的文字（按钮/徽标/拓扑中枢）', min: 4.5 },
  // accent-soft 的正确用法是「浅底上的文字/hover 加深」，不是填充：
  // 深墨字放在 accent-soft(#bc513a) 上只有 2.99:1 —— 故它不得承载文字，只作文字色/边框。
  { fg: colors.accentSoft, bg: colors.bg, label: 'accent-soft 作文字色 vs 纸底（不得作填充承载文字）', min: 4.5 },
  // 浅强调底（accent-tint = 10% 赤陶混纸底 ≈ #f7ece5）上的深强调文字
  { fg: colors.accentDark, bg: '#f7ece5', label: '深强调 vs 浅强调底(#f7ece5)', min: 4.5 },
  // 大文本 accent（≥ 3:1 · 18pt+/14pt bold+）
  { fg: colors.accent,      bg: colors.bg,          label: '赤陶强调(#d77656) vs 背景[大文本]',      min: 3.0 },
  { fg: colors.accent,      bg: colors.surface,     label: '赤陶强调 vs 白底[大文本]',                min: 3.0 },
  // 小字安全强调（≥ 4.5:1 · AA）
  { fg: colors.accentDark,  bg: colors.bg,          label: '深赭小字(#8f3d28) vs 背景',              min: 4.5 },
  { fg: colors.accentDark,  bg: colors.surface,     label: '深赭小字 vs 白底',                        min: 4.5 },
  // accent 底上的文字（≥ 4.5:1 · AA · 保持「亮底 + 深字」架构）
  { fg: colors.accentOnAccent, bg: colors.accent, label: 'accent 底上的文字(#2b2a27) vs 赤陶(#d77656)', min: 4.5 },
  { fg: colors.accentOnAccent, bg: colors.bg,     label: 'accent 底文字色 · 无背景时 vs 纸底',           min: 4.5 },
];

// ---------- 执行检查 ----------
console.log('='.repeat(72));
console.log('R8.5 · WCAG 2.2 AA 对比度检查');
console.log('='.repeat(72));

let drift = 0;
for (const [key, token] of Object.entries(PALETTE_TOKEN_MAP)) {
  const actual = TOKENS.get(token);
  const declared = colors[key];
  if (!actual) {
    console.log(`FAIL  | 调色板守卫 | global.css 缺少令牌 ${token}`);
    drift++;
    continue;
  }
  if (normalizeHex(actual) !== normalizeHex(declared)) {
    console.log(`FAIL  | 调色板守卫 | ${token}：脚本 ${declared} ≠ global.css ${actual}（请同步本文件 colors.${key}）`);
    drift++;
  }
}
if (drift === 0) {
  console.log(`PASS  | 调色板守卫 | ${Object.keys(PALETTE_TOKEN_MAP).length} 项与 global.css 一致`);
}

let pass = 0;
let fail = 0;

for (const { fg, bg, label, min } of pairs) {
  const ratio = contrastRatio(fg, bg);
  const ok = ratio >= min;
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`${icon.padEnd(5)} | ${ratio.toFixed(2)}:1 ≥ ${min}:1 | ${label}`);
  if (ok) pass++; else fail++;
}

console.log('-'.repeat(72));
console.log(`结果：${pass} 通过 / ${fail} 失败 · 调色板漂移 ${drift} 项`);
console.log('='.repeat(72));

if (drift > 0) {
  console.error('❌ 本文件的调色板与 global.css 不一致：对比度结论不可信，请先同步');
  process.exit(1);
}

if (fail > 0) {
  console.error('❌ 存在对比度不足的颜色对，请修正');
  process.exit(1);
}

console.log('✅ 所有颜色对满足 WCAG 2.2 AA 标准');
process.exit(0);