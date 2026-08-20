/*
 * TDD harness for P0 learning scripts
 * Zero-dep, Node ESM, Windows pwsh compatible.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const repoRoot = here.replace(/\/$/, ''); // D:/github-repos/men

function assertContains(s, sub) {
  assert.ok(s.includes(sub), `expected to contain "${sub}"`);
}

function importFromHere(name) {
  return import(new URL(name, import.meta.url));
}

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.error(`  [FAIL] ${name}: ${e.message}`); }
}

// ── 1. learn-rules.mjs ──────────────────────────────────
console.log('\n=== learn-rules.mjs ===');
check('exports classify function', async () => {
  const mod = await importFromHere('./learn-rules.mjs');
  assert.ok(typeof mod.classify === 'function');
});
check('empty events returns type skip', async () => {
  const mod = await importFromHere('./learn-rules.mjs');
  const r = mod.classify([]);
  assert.strictEqual(r.type, 'skip');
  assert.ok(Array.isArray(r.actions));
});
check('single error event classified as type-B', async () => {
  const mod = await importFromHere('./learn-rules.mjs');
  const events = [{ kind: 'error', subject: 'verify', detail: 'file not found' }];
  const r = mod.classify(events);
  assert.strictEqual(r.type, 'B');
});
check('three consecutive FAIL triggers BLOCKED', async () => {
  const mod = await importFromHere('./learn-rules.mjs');
  const events = [];
  for (let i = 0; i < 3; i++) {
    events.push({ kind: 'verify', subject: 'verify', detail: JSON.stringify({ outcome: 'FAIL', agent: 'ji' }) });
  }
  const r = mod.classify(events);
  assert.strictEqual(r.type, 'BLOCKED');
});

// ── 2. learn.mjs ────────────────────────────────────────
console.log('\n=== learn.mjs ===');
check('CLI --help shows usage', async () => {
  const mod = await importFromHere('./learn.mjs');
  const out = mod.main(['--help']);
  assert.ok(out.startsWith('learn'), `expected to start with learn, got: ${out.slice(0, 40)}`);
});
check('CLI --dry-run with fake sid returns JSON', async () => {
  const mod = await importFromHere('./learn.mjs');
  const out = mod.main(['--sid', 'test-001', '--dry-run', '--json']);
  const j = JSON.parse(out);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.dryRun, true);
});

// ── 3. eval-metrics.mjs ─────────────────────────────────
console.log('\n=== eval-metrics.mjs ===');
check('exports computeMetrics function', async () => {
  const mod = await importFromHere('./eval-metrics.mjs');
  assert.ok(typeof mod.computeMetrics === 'function');
});
check('returns all 8 KPIs', async () => {
  const mod = await importFromHere('./eval-metrics.mjs');
  const metrics = mod.computeMetrics([]);
  const ids = Object.keys(metrics);
  assert.strictEqual(ids.length, 8, `expected 8 KPIs, got ${ids.length}: ${ids.join(', ')}`);
  for (const k of [
    'KPI-task-completion', 'KPI-first-pass', 'KPI-regression',
    'KPI-avg-retries', 'KPI-skill-usage', 'KPI-knowledge',
    'KPI-error-repeat', 'KPI-learn-efficiency'
  ]) assert.ok(ids.includes(k), `missing ${k}`);
});

// ── 4. eval-report.mjs ──────────────────────────────────
console.log('\n=== eval-report.mjs ===');
check('eval-report --help contains usage text', async () => {
  const mod = await importFromHere('./eval-report.mjs');
  const out = mod.main(['--help']);
  assert.ok(out.startsWith('eval-report'), `expected to start with eval-report, got: ${out.slice(0, 40)}`);
});

// ── 5. learn-budget.mjs ─────────────────────────────────
console.log('\n=== learn-budget.mjs ===');
check('CLI check returns JSON with ok field', async () => {
  const mod = await importFromHere('./learn-budget.mjs');
  const out = mod.main(['check']);
  const j = JSON.parse(out);
  assert.ok(j.ok === true || j.ok === false);
});
check('CLI consume creates budget.json', async () => {
  const f = `.agents/state/learn/budget.json`;
  if (fs.existsSync(f)) fs.unlinkSync(f);
  const mod = await importFromHere('./learn-budget.mjs');
  const out = mod.main(['consume']);
  const j = JSON.parse(out);
  assert.strictEqual(j.ok, true);
  assert.ok(fs.existsSync(f));
});
check('CLI status shows dailyLlmCalls', async () => {
  const mod = await importFromHere('./learn-budget.mjs');
  const out = mod.main(['status']);
  const j = JSON.parse(out);
  assert.ok('dailyLlmCalls' in j);
});

// ── summary ─────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
