// 把孤行审计结果映射回源文件（供按文件分组派发修复任务）
// 用法：MAP_IN=<widow.json> MAP_OUT=<map.json> node scripts/_widow-map.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.env.APPLY_ROOT || 'D:/2-Area/github-repos/men';
const IN = process.env.MAP_IN, OUT = process.env.MAP_OUT;
const DIRS = ['site/src/components', 'site/src/pages', 'site/src/layouts', 'site/src/data'];
const EXTS = ['.astro', '.json', '.js', '.ts'];
const walk = (d, o = []) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p, o) : (EXTS.includes(extname(p)) && o.push(p));
  }
  return o;
};
const files = DIRS.flatMap((d) => { try { return walk(join(ROOT, d)); } catch { return []; } });

// 去标签：<...> 视作空洞，并还原常见实体，使文本与 textContent 对齐
function stripTags(s) {
  const map = []; let t = '', i = 0;
  while (i < s.length) {
    if (s[i] === '<') {
      const c = s.indexOf('>', i);
      if (c === -1) break;
      if (/^<\/?[A-Za-z!]/.test(s.slice(i, c + 1))) { i = c + 1; continue; }
    }
    if (s[i] === '&') {
      const m = s.slice(i).match(/^&(#\d+|#x[0-9a-f]+|[a-z]+);/i);
      if (m) {
        const ent = m[1].toLowerCase();
        const ch = ent === 'amp' ? '&' : ent === 'lt' ? '<' : ent === 'gt' ? '>' : ent === 'quot' ? '"'
          : ent === 'nbsp' ? '\u00a0' : ent === 'mdash' ? '—'
          : ent.startsWith('#x') ? String.fromCodePoint(parseInt(ent.slice(2), 16))
          : ent.startsWith('#') ? String.fromCodePoint(parseInt(ent.slice(1), 10)) : null;
        if (ch !== null) { t += ch; map.push(i); i += m[0].length; continue; }
      }
    }
    t += s[i]; map.push(i); i += 1;
  }
  return { text: t, map };
}

const audit = JSON.parse(await readFile(IN, 'utf8'));
const byText = new Map();
for (const v of audit.viol) if (!byText.has(v.fullText)) byText.set(v.fullText, v);
const occ = new Map();
for (const v of audit.viol) {
  if (!occ.has(v.fullText)) occ.set(v.fullText, []);
  occ.get(v.fullText).push({ page: v.page, vp: v.vp, cssPath: v.cssPath, sel: v.sel,
    lastChars: v.lines[v.lines.length - 1].chars, lastText: v.lines[v.lines.length - 1].text,
    fontSize: v.fontSize, boxWidth: v.boxWidth, hasInline: v.hasInline, inlineTags: v.inlineTags });
}
const out = [];
for (const [text, v] of byText) {
  const needle = text.replace(/\s+/g, ' ').trim();
  const hits = [];
  for (const f of files) {
    const raw = await readFile(f, 'utf8');
    const { text: stripped } = stripTags(raw);
    const norm = stripped.replace(/\s+/g, ' ');
    if (norm.includes(needle)) hits.push(relative(ROOT, f).replace(/\\/g, '/'));
    else {
      const head = needle.slice(0, 24);
      if (head.length >= 8 && norm.includes(head)) hits.push(relative(ROOT, f).replace(/\\/g, '/') + ' (头部匹配)');
    }
  }
  out.push({ text, occurrences: occ.get(text), hits });
}
await writeFile(OUT, JSON.stringify(out, null, 1), 'utf8');
const miss = out.filter((x) => !x.hits).length;
console.log(`映射 ${out.length} 段（未定位 ${miss}）→ ${OUT}`);
