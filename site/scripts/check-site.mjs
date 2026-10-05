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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 用 fileURLToPath 而非 new URL(...).pathname：后者是**百分号编码**的 URL 路径，
// 仓库路径含空格或非 ASCII 时会得到 'D:/My%20Projects/men'，导致 git 调用失败
// 而「来源链接校验」被静默跳过（守卫形同虚设）。
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

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

// 仓库真实文件清单（用于「来源」链接死链守卫）。从 git 读取；非 git 环境下
// 降级为空集合并跳过该检查，而不是误报。
const REPO_FILES = (() => {
  try {
    const out = spawnSync('git', ['ls-files'], {
      cwd: REPO_ROOT, encoding: 'utf-8', timeout: 15_000,
    });
    if (out.status !== 0 || !out.stdout) return new Set();
    return new Set(out.stdout.split(/\r?\n/).filter(Boolean));
  } catch {
    return new Set();
  }
})();
if (REPO_FILES.size > 0) ok(`仓库文件清单：${REPO_FILES.size} 项（用于来源链接校验）`);
else console.log('SKIP | 无法读取 git ls-files，跳过来源链接校验');

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

  // 7) 转义 HTML 泄漏守卫：模板里用 `.map().join()` 拼 HTML 字符串会被 Astro 转义，
  // 页面直接显示 `<span ...>` 字面量（曾真实发生 19 处）。**带 class** 的转义标签
  // 即证据；刻意展示的命令占位符（如 <code>--dir &lt;path&gt;</code>）不带 class，
  // 本就不匹配此规则，无需白名单。
  const escapedTags = text.match(/&lt;\/?(?:span|strong|em|code|a|div|ul|ol|li|table|h[1-6])[^&]*class=/gi) || [];
  for (const t of escapedTags) {
    fail(`${rel} 出现被转义的带 class HTML（模板字符串未用 JSX 渲染）：${t.slice(0, 60)}`);
  }

  // 8) 死链守卫：blob/main/ 后的路径必须真实存在于仓库，避免「来源」链接 404
  // REPO_FILES 为空（不在 git 仓库 / git 不可用）时**整项跳过**，否则会把
  // 每条链接都误报成「不存在」。上面的 SKIP 分支只跳过了提示，没跳过检查本身。
  if (REPO_FILES.size > 0) {
    for (const m of text.matchAll(/href="https:\/\/github\.com\/cgartlab\/men\/blob\/main\/([^"#?]+)/g)) {
      const p = decodeURIComponent(m[1]);
      if (!REPO_FILES.has(p)) fail(`${rel} 来源链接指向仓库中不存在的文件：${p}`);
    }
  }
}
ok('全部页面：UTF-8 解码 / charset / mojibake 特征 / base 守卫 检查完成');

// 7) meta description：每页必有、互不重复、长度合理
// 动机：description 是站点最重要的「内容描述」载体。漏写或全是
// 「men（门）Agent 团队 — XXX」这类同构短句时，搜索引擎与分享卡片拿不到
// 任何页面信息。这里直接对产物断言，防止退化。
const descSeen = new Map();
for (const f of files) {
  const rel = f.slice(DIST.length).replaceAll('\\', '/');
  const text = new TextDecoder('utf-8').decode(readFileSync(f));
  const m = text.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if (!m) { fail(`${rel} 缺少 <meta name="description">`); continue; }
  const desc = m[1].trim();
  if (!desc) { fail(`${rel} meta description 为空`); continue; }
  if (desc.length < 20) fail(`${rel} meta description 过短（${desc.length} 字符）：${desc}`);
  if (desc.length > 160) fail(`${rel} meta description 过长（${desc.length} 字符，搜索结果约 90 字符后截断）`);
  if (descSeen.has(desc)) fail(`${rel} meta description 与 ${descSeen.get(desc)} 完全重复`);
  else descSeen.set(desc, rel);
}
ok(`meta description：${files.length} 页均存在、互不重复、长度 20–160`);

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
