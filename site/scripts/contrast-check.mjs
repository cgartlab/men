#!/usr/bin/env node
/*
 * contrast-check.mjs — R8.5 · WCAG 2.2 AA 对比度验证
 * 检查所有颜色对的对比度，输出 PASS/FAIL
 *
 * 用法：node scripts/contrast-check.mjs
 */

import { readFileSync } from 'node:fs';

// ---------- 颜色定义（R8.5 Token · 与 global.css 同步） ----------
const colors = {
  // 前景文字（5 级梯度）
  fg:            '#1a1a1a',  // 正文 · 16.7:1
  fgSecondary:   '#404040',  // 次文本 · 9.9:1
  fgTertiary:    '#5c5c5c',  // 三文本 · 6.4:1
  fgMuted:       '#737373',  // 弱化文本 · 4.5:1 (AA 边界)
  fgDecorative:  '#8a8a8a',  // 仅装饰 · 3.3:1 (非强制)
  // 背景
  bg:            '#fafafa',  // 页面底色
  surface:       '#ffffff',  // 卡片面板
  surfaceWarm:   '#f5f5f5',  // 暖调面板
  // 强调色
  accent:        '#e85d04',  // 主强调（仅大文本/填充） · 3.4:1
  accentDark:    '#a03c00',  // 小字安全橘 · 6.4:1
  accentOnAccent:'#0a0a0a',  // 橘底文字 · 5.7:1
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
  // 正文文本（≥ 4.5:1）
  { fg: colors.fg,        bg: colors.bg,           label: '正文(#1a1a1a) vs 背景(#fafafa)',          min: 4.5 },
  { fg: colors.fg,        bg: colors.surface,      label: '正文 vs 白底(#ffffff)',                    min: 4.5 },
  { fg: colors.fg,        bg: colors.surfaceWarm,  label: '正文 vs 暖底(#f5f5f5)',                    min: 4.5 },
  { fg: colors.fgSecondary, bg: colors.bg,          label: '次文本(#404040) vs 背景',                  min: 4.5 },
  { fg: colors.fgTertiary,  bg: colors.bg,          label: '三文本(#5c5c5c) vs 背景',                  min: 4.5 },
  { fg: colors.fgTertiary,  bg: colors.surfaceWarm, label: '三文本 vs 暖底',                           min: 4.5 },
  // 弱化文本（≥ 4.5:1 · AA 边界）
  { fg: colors.fgMuted,     bg: colors.bg,          label: '弱化文本(#737373) vs 背景',              min: 4.5 },
  // 装饰文本（≥ 3:1 · WCAG 非强制但建议）
  { fg: colors.fgDecorative, bg: colors.bg,         label: '装饰文本(#8a8a8a) vs 背景[装饰]',        min: 3.0 },
  // 大文本 accent（≥ 3:1 · 18pt+/14pt bold+）
  { fg: colors.accent,      bg: colors.bg,          label: '橘色强调(#e85d04) vs 背景[大文本]',      min: 3.0 },
  { fg: colors.accent,      bg: colors.surface,     label: '橘色强调 vs 白底[大文本]',                min: 3.0 },
  // 小字安全橘（≥ 4.5:1 · AA）
  { fg: colors.accentDark,  bg: colors.bg,          label: '深橘小字(#a03c00) vs 背景',              min: 4.5 },
  { fg: colors.accentDark,  bg: colors.surface,     label: '深橘小字 vs 白底',                        min: 4.5 },
  // 橘底文字（≥ 4.5:1 · AA）
  { fg: colors.accentOnAccent, bg: colors.accent,   label: '黑色(#0a0a0a) vs 橘底(#e85d04)',          min: 4.5 },
  { fg: colors.accentOnAccent, bg: colors.accent,   label: '黑色 vs 橘底[按钮文字]',                   min: 4.5 },
];

// ---------- 执行检查 ----------
console.log('='.repeat(72));
console.log('R8.5 · WCAG 2.2 AA 对比度检查');
console.log('='.repeat(72));

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
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(72));

if (fail > 0) {
  console.error('❌ 存在对比度不足的颜色对，请修正');
  process.exit(1);
}

console.log('✅ 所有颜色对满足 WCAG 2.2 AA 标准');
process.exit(0);