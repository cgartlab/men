/*
 * dynamic-el-audit.mjs — 检测「JS 动态创建的元素的样式是否会被 Astro scoped 作用域挡掉」
 *
 * 背景：.astro 的 <style> 默认 scoped，Astro 会给模板里的元素加 data-astro-cid-*
 * 属性并据此改写选择器。而 document.createElement() 动态创建的元素拿不到该属性，
 * 于是形如 `.showcase__dot[data-astro-cid-x]` 的规则**永不匹配**。
 * 实测后果：首页 showcase 分页点渲染为 0×0（全透明、完全不可见不可点）；
 * HeroArt 的 1120 个 .sym 字形漂移动画 animationName 为 none。
 *
 * 判据：对每个 .astro 文件，取出经 createElement + className 赋值的类名，
 * 要求该文件里存在 :global(...) 选择器覆盖它（或整块 <style is:global>）。
 * 纯静态、零依赖，可在 CI 无浏览器环境执行。
 *
 * 退出码：0 = 全部覆盖；1 = 存在未覆盖的动态类名
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.astro')) acc.push(p);
  }
  return acc;
}

// createElement 之后被赋值的 className（两种常见写法：单/双引号、模板串）
const CLASS_ASSIGN = /(?:createElement|createElementNS)\([^)]*\)[\s\S]{0,240}?(?:className\s*=\s*['"]([^'"]+)['"]|classList\.add\(\s*['"]([^'"]+)['"])/g;

const problems = [];
let checked = 0;

for (const file of walk(SRC)) {
  const rel = file.slice(SRC.length).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  const hasGlobalBlock = /<style\s+is:global/.test(text);

  const classes = new Set();
  for (const m of text.matchAll(CLASS_ASSIGN)) {
    const v = (m[1] || m[2] || '').trim();
    if (!v) continue;
    for (const c of v.split(/\s+/)) if (c && !c.includes('$')) classes.add(c);
  }
  if (classes.size === 0) continue;
  checked += classes.size;

  for (const cls of classes) {
    // 命中 :global(...cls...) 即可（允许后代形式，如 :global(.a .sym)）
    const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 类名后必须是非「类名字符」——否则 .showcase__dot 会匹配进 .showcase__dot--active
    // 而漏报（负向验证实测到过这个坑）。
    const covered = hasGlobalBlock || new RegExp(`:global\\([^)]*\\.${escaped}(?![-\\w])[^)]*\\)`).test(text);
    if (!covered) {
      problems.push({ rel, cls });
    }
  }
}

console.log(`扫描 ${walk(SRC).length} 个 .astro，动态类名 ${checked} 个`);
if (problems.length === 0) {
  console.log('PASS | 所有 JS 动态创建的元素类名都有 :global 样式覆盖');
  console.log('结果：全部通过（无浏览器依赖）');
  process.exit(0);
}
for (const p of problems) {
  console.log(`FAIL | ${p.rel} 动态创建的 .${p.cls} 未被 :global 覆盖 —— Astro scoped 样式不会生效，该元素将无样式`);
}
console.log(`结果：${problems.length} 处未覆盖`);
process.exit(1);
