#!/usr/bin/env node
/**
 * check-site.mjs — 站点产物级机械验证（无需启动任何服务器）
 *
 * 动机：Agent 禁止启动常驻 dev server（Windows 进程树泄漏事故，见 AGENTS.md 进程红线）。
 * 本脚本直接扫描 dist/，替代 HTTP 冒烟：
 *   1. 每个 HTML 可严格 UTF-8 解码（乱码即失败）
 *   2. 含 <meta charset="UTF-8">
 *   3. 无 U+FFFD 替换符、无双编码特征（Ã© 等）
 *   4. 关键路由含预期中文锚点文案
 *   5. base 回归守卫：禁止出现 href="/men/" 类旧前缀
 *
 * 用法：node scripts/check-site.mjs   （在 site/ 目录下运行；退出码 0=PASS）
 */
import { readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ROUTE_ANCHORS = {
  'index.html': ['6+1 Agent 团队系统'],
  'docs/index.html': ['Wiki 手册'],
  'docs/overview/index.html': ['编排与路由核心'],
  'docs/agents/index.html': ['全员红线'],
  'docs/releases/index.html': ['路线图'],
};

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

let fails = 0;
const fail = (msg) => { console.error('FAIL | ' + msg); fails += 1; };
const ok = (msg) => console.log('PASS | ' + msg);

const files = walk(DIST);
ok(`dist HTML 总数: ${files.length}`);

for (const f of files) {
  const rel = f.slice(DIST.length).replaceAll('\\', '/');
  const buf = readFileSync(f);

  // 1) 严格 UTF-8 解码（非法字节序列会产出 U+FFFD）
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (text.includes('\uFFFD')) fail(`${rel} 含 U+FFFD 替换符（非严格 UTF-8 或源损坏）`);

  // 2) charset 声明
  if (!/<meta\s+charset="UTF-8"/i.test(text)) fail(`${rel} 缺少 <meta charset="UTF-8">`);

  // 3) 双编码特征抽样
  if (/Ã[©¨®³¼]|æ[€‚†‡ˆ]/.test(text)) fail(`${rel} 疑似双重编码（mojibake 特征）`);

  // 5) base 回归守卫
  if (/(href|src)="\/men\//.test(text)) fail(`${rel} 出现旧 base 前缀 /men/`);

  // 6) 空 slot 守卫：doc-body 存在但为空 = 章节内容丢失
  if (/class="doc-body"[^>]*><\/div>/.test(text)) fail(`${rel} doc-body 为空（slot 内容未传入）`);
}
ok('全部页面：UTF-8 解码 / charset / mojibake 特征 / base 守卫 检查完成');

// 4) 路由锚点
for (const [route, anchors] of Object.entries(ROUTE_ANCHORS)) {
  const f = join(DIST, route);
  let text = '';
  try { text = new TextDecoder('utf-8').decode(readFileSync(f)); }
  catch (e) { fail(`锚点检查：${route} 不存在（${e instanceof Error ? e.message : String(e)}）`); continue; }
  for (const a of anchors) {
    if (text.includes(a)) ok(`锚点 ${route} ← 「${a}」`);
    else fail(`锚点 ${route} 缺少「${a}」`);
  }
}

console.log('='.repeat(60));
if (fails > 0) { console.error(`结果：${fails} 项失败`); process.exit(1); }
console.log('结果：站点产物验证全部通过（无服务器、零常驻进程）');
