import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// 基于本文件位置定位仓库根，可在任意位置运行（不硬编码绝对路径）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

const t = readFileSync(path.join(ROOT, 'scripts/learn-rules.mjs'), 'utf8');
const lines = t.split('\n');
console.log('=== learn-rules.mjs — event type references ===');
lines.forEach((l, i) => {
  if (l.includes('normalizeType') || l.includes('eventTypes') || l.includes('eventType')) {
    console.log(`${i+1}: ${l.trim().slice(0, 120)}`);
  }
});

console.log('\n=== event.mjs — KINDS/TYPES constants ===');
const t2 = readFileSync(path.join(ROOT, 'scripts/event.mjs'), 'utf8');
const lines2 = t2.split('\n');
lines2.forEach((l, i) => {
  if (l.includes('KINDS') || l.includes('TYPES') || l.includes('const') && l.includes('kind') || l.includes('const') && l.includes('type')) {
    console.log(`${i+1}: ${l.trim().slice(0, 120)}`);
  }
  // Also find kind: "xxx" patterns
  const m = l.match(/kind:\s*["']([^"']+)["']/);
  if (m) console.log(`  kind: "${m[1]}"`);
});

console.log('\n=== event.mjs — all KIND entries ===');
lines2.forEach((l, i) => {
  if (l.trim().startsWith('"') && l.includes('kind')) {
    console.log(`${i+1}: ${l.trim().slice(0, 120)}`);
  }
});