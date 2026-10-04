// 令牌对比度注释一致性检查（R16 · 防回归）
// 解析 global.css 令牌行注释中的「N:1 on #xxxxxx」声称值，
// 用 WCAG 相对亮度公式实测并比对；任何 >0.05 的偏差即报错。
import { readFile } from 'node:fs/promises';

const css = await readFile('site/src/styles/global.css', 'utf8');

const lum = (c) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const toHex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const ratio = (a, b) => {
  const l1 = lum(toHex(a)), l2 = lum(toHex(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// 逐行匹配：--name: #rrggbb;  /* ... N.NN:1 on #rrggbb ... */
const re = /(--[a-z0-9-]+):\s+(#[0-9a-f]{6});\s*(\/\*[^*]*?(\d+\.\d{1,2}):1\s*on\s+(#[0-9a-f]{6}))/gi;
let m, checked = 0, bad = 0;
console.log('=== global.css 令牌注释 vs 实测 ===');
console.log('  令牌                                    声称      实测      判定');
while ((m = re.exec(css)) !== null) {
  const [, name, fg, , claimed, bg] = m;
  const r = ratio(fg, bg);
  const c = parseFloat(claimed);
  const ok = Math.abs(c - r) <= 0.05;
  checked++;
  if (!ok) bad++;
  console.log(`  ${name.padEnd(42)} ${claimed.padStart(5)}:1  ${r.toFixed(2).padStart(6)}:1  ${ok ? '✓' : '✗ 失准 ' + (c - r > 0 ? '+' : '') + (c - r).toFixed(2)}`);
}
console.log(`\n  共检查 ${checked} 项声称值，失准 ${bad} 项`);

// 组注释检查：L114 附近不应再声称「每级都满足 4.5:1」而含 <4.5 的成员
const groupHit = /前景文字（5 级梯度）[\s\S]{0,220}?每级都满足 4\.5:1/.test(css);
if (groupHit) {
  bad++;
  console.log('  ✗ 组注释仍声称「每级都满足 4.5:1」，但 --color-fg-decorative 实测 3.31:1');
}

console.log(bad === 0 ? '\n✅ 全部一致' : `\n❌ ${bad} 处不一致`);
process.exit(bad === 0 ? 0 : 1);
