import { readFileSync } from 'fs';

const t = readFileSync('D:/github-repos/men/scripts/learn-rules.mjs', 'utf8');
const lines = t.split('\n');
console.log('=== learn-rules.mjs — event type references ===');
lines.forEach((l, i) => {
  if (l.includes('normalizeType') || l.includes('eventTypes') || l.includes('eventType')) {
    console.log(`${i+1}: ${l.trim().slice(0, 120)}`);
  }
});

console.log('\n=== event.mjs — KINDS/TYPES constants ===');
const t2 = readFileSync('D:/github-repos/men/scripts/event.mjs', 'utf8');
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