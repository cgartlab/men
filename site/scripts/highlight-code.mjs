// 代码高亮（构建后处理）—— 把 dist 里所有 .code-block 的 <pre><code> 用 Shiki 高亮
//
// 为什么放在构建后：文档里的代码块是手写在 .astro 模板里的 <pre><code>（不是 Markdown），
// 走不到 Astro 内置的 Shiki 管道；这里在产物上做一次转换，源码保持朴素、零模板改动。
// Shiki 随 Astro 一起安装（node_modules/shiki），不新增依赖。
//
// 主题：**品牌自定义主题**（见下方 brandTheme）—— 取色全部来自 global.css 的设计令牌
//   （赤陶 / 苔绿 / 雾蓝 / 赭金 + 五级墨色），因此高亮色与站点是同一套色板；
//   每个 token 色对代码底 #f5f0e8 的对比度都 ≥4.5:1，并有 contrast-check.mjs 的断言守卫。
//
// 同时给每个代码块补一个复制按钮（复用 global.css 的 pre .copy-btn 样式，
// 点击逻辑由 BaseLayout 的通用脚本处理）。
//
// 用法：node scripts/highlight-code.mjs   （已接入 npm run build）
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHighlighter } from 'shiki';

const DIST = 'dist';

// ── 品牌主题：色值 = global.css 的令牌（改令牌时同步这里；有守卫） ──────────────
const brandTheme = {
  name: 'men-brand',
  type: 'light',
  colors: {
    'editor.background': '#f5f0e8',   // --color-code-bg（暖纸）
    'editor.foreground': '#2b2a27',   // --color-code
  },
  settings: [
    { settings: { foreground: '#2b2a27', background: '#f5f0e8' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#6b6a64', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'storage.type', 'keyword.operator.new'], settings: { foreground: '#8f3d28' } },
    { scope: ['string', 'string.quoted', 'punctuation.definition.string'], settings: { foreground: '#3a7a3f' } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character.escape'], settings: { foreground: '#85682f' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call'], settings: { foreground: '#447191' } },
    { scope: ['variable', 'variable.other', 'variable.parameter', 'entity.name.tag', 'support.type.property-name'], settings: { foreground: '#5e5d59' } },
    { scope: ['entity.name.type', 'support.class', 'entity.name.class'], settings: { foreground: '#9753a1' } },
    { scope: ['punctuation', 'meta.punctuation'], settings: { foreground: '#5e5d59' } },
  ],
};

const LANGS = ['bash', 'powershell', 'yaml', 'text', 'plaintext', 'json', 'javascript', 'typescript'];
const langAlias = { text: 'text', plaintext: 'text' };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (extname(p) === '.html') out.push(p);
  }
  return out;
}
const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const files = walk(DIST);
const highlighter = await createHighlighter({ themes: [brandTheme], langs: LANGS });
let blocks = 0, filesTouched = 0;

for (const f of files) {
  let html = await readFile(f, 'utf8');
  // <div class="code-block"> … <span class="code-block__lang">LANG</span> <pre><code>CODE</code></pre> … </div>
  const re = /(<div class="code-block"[^>]*>\s*<span class="code-block__lang">([a-zA-Z]+)<\/span>\s*)<pre><code>([\s\S]*?)<\/code><\/pre>/g;
  let touched = false;
  html = html.replace(re, (m, head, langRaw, codeHtml) => {
    const lang = langAlias[langRaw] || langRaw;
    const code = decode(codeHtml).replace(/\n$/, '');
    if (!LANGS.includes(lang)) return m;         // 未知语言：保持原样
    let out;
    try {
      out = highlighter.codeToHtml(code, { lang, theme: 'men-brand' });
    } catch {
      return m;
    }
    // Shiki 输出自带 <pre class="shiki" style="background-color:…">；这里清掉自带底色，
    // 让底色由 .code-block 统一控制（避免与品牌暖底打架）。
    out = out.replace(/<pre class="shiki[^"]*"([^>]*)style="[^"]*"/, '<pre class="shiki"$1')
             .replace(/style="background-color:[^"]*"/g, '');
    // 复制按钮（复用 global.css 的 pre .copy-btn）；不重复内联代码，
    // 点击时由 BaseLayout 的脚本读 pre.textContent —— 避免同一段代码在 HTML 里出现两份。
    const btn = '<button class="copy-btn" type="button" aria-label="复制代码">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
    blocks++; touched = true;
    return head + out + btn;
  });
  // hero 安装卡里的命令（<code class="hero-install__code" data-lang="bash">…</code>）：
  // 同一套品牌主题，让命令行与文档代码块配色一致。复制按钮读的是 data-cmd 属性，
  // 所以插入 token span 不会影响复制内容。
  // 注意：Astro 会给元素自动加 data-astro-cid-*，属性顺序不定 → 用 [^>]* 吞掉其余属性
  const reInline = /<code class="hero-install__code" data-lang="([a-zA-Z]+)"([^>]*)>([\s\S]*?)<\/code>/g;
  html = html.replace(reInline, (m, langRaw, attrs, codeHtml) => {
    const lang = langAlias[langRaw] || langRaw;
    if (!LANGS.includes(lang)) return m;
    let out;
    try {
      out = highlighter.codeToHtml(decode(codeHtml), { lang, theme: 'men-brand' });
    } catch {
      return m;
    }
    const inner = out
      .replace(/^[\s\S]*?<code[^>]*>/, '')
      .replace(/<\/code>[\s\S]*$/, '')
      .replace(/\n$/, '');
    blocks++; touched = true;
    return `<code class="hero-install__code" data-lang="${langRaw}"${attrs}>${inner}</code>`;
  });
  if (touched) { await writeFile(f, html, 'utf8'); filesTouched++; }
}

highlighter.dispose();
console.log(`代码高亮：${blocks} 个代码块（${filesTouched} 个页面），主题 men-brand`);
