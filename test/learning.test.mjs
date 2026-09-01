/*
 * TDD harness for P0 learning scripts
 * Migrated from scripts/learning.test.mjs to node:test runner (node --test).
 * Zero-dep, Node ESM, Windows pwsh compatible.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';

// ── 1. learn-rules.mjs ──────────────────────────────────
test('learn-rules: exports classify function', async () => {
  const mod = await import('../scripts/learn-rules.mjs');
  assert.ok(typeof mod.classify === 'function');
});
test('learn-rules: empty events returns type skip', async () => {
  const mod = await import('../scripts/learn-rules.mjs');
  const r = mod.classify([]);
  assert.strictEqual(r.type, 'skip');
  assert.ok(Array.isArray(r.actions));
});
test('learn-rules: single error event classified as type-B', async () => {
  const mod = await import('../scripts/learn-rules.mjs');
  const events = [{ kind: 'error', subject: 'verify', detail: 'file not found' }];
  const r = mod.classify(events);
  assert.strictEqual(r.type, 'B');
});
test('learn-rules: three consecutive FAIL triggers BLOCKED', async () => {
  const mod = await import('../scripts/learn-rules.mjs');
  const events = [];
  for (let i = 0; i < 3; i++) {
    events.push({ kind: 'verify', subject: 'verify', detail: JSON.stringify({ outcome: 'FAIL', agent: 'ji' }) });
  }
  const r = mod.classify(events);
  assert.strictEqual(r.type, 'BLOCKED');
});
test('learn-rules: event.mjs format JSON detail classified as type-B', async () => {
  const mod = await import('../scripts/learn-rules.mjs');
  const events = [{ type: 'error', subject: 'ji', detail: '{"agent":"ji","skill":"ji-frontend","reason":"file not found"}' }];
  const r = mod.classify(events);
  assert.strictEqual(r.type, 'B');
});
test('learn-rules: event.mjs format three FAIL JSON triggers BLOCKED', async () => {
  const mod = await import('../scripts/learn-rules.mjs');
  const events = [];
  for (let i = 0; i < 3; i++) {
    events.push({ type: 'verify', subject: 'verify', detail: JSON.stringify({ outcome: 'FAIL', agent: 'ji', attempt: 1 }) });
  }
  const r = mod.classify(events);
  assert.strictEqual(r.type, 'BLOCKED');
});
test('learn-rules: event.mjs format Rule A skill mismatch via JSON detail', async () => {
  const mod = await import('../scripts/learn-rules.mjs');
  const events = [{ type: 'judge', subject: 'chi', detail: '{"outcome":"FAIL","reason":"wrong skill should use ji"}' }];
  const r = mod.classify(events);
  assert.ok(r.actions.some(a => a.type === 'A'), 'expected Rule A action');
});

// ── 2. learn.mjs ────────────────────────────────────────
test('learn: CLI --help shows usage', async () => {
  const mod = await import('../scripts/learn.mjs');
  const out = mod.main(['--help']);
  assert.ok(out.startsWith('learn'));
});
test('learn: CLI --dry-run with fake sid returns JSON', async () => {
  const mod = await import('../scripts/learn.mjs');
  const out = mod.main(['--sid', 'test-001', '--dry-run', '--json']);
  const j = JSON.parse(out);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.dryRun, true);
});

// ── 3. eval-metrics.mjs ─────────────────────────────────
test('eval-metrics: exports computeMetrics function', async () => {
  const mod = await import('../scripts/eval-metrics.mjs');
  assert.ok(typeof mod.computeMetrics === 'function');
});
test('eval-metrics: returns all 8 KPIs', async () => {
  const mod = await import('../scripts/eval-metrics.mjs');
  const metrics = mod.computeMetrics([]);
  const ids = Object.keys(metrics);
  assert.strictEqual(ids.length, 8);
  for (const k of [
    'KPI-task-completion', 'KPI-first-pass', 'KPI-regression',
    'KPI-avg-retries', 'KPI-skill-usage', 'KPI-knowledge',
    'KPI-error-repeat', 'KPI-learn-efficiency'
  ]) assert.ok(ids.includes(k), `missing ${k}`);
});
test('eval-metrics: event.mjs format computeMetrics non-zero KPIs', async () => {
  const mod = await import('../scripts/eval-metrics.mjs');
  const events = [
    { type: 'verify', subject: 'ji', detail: JSON.stringify({ outcome: 'PASS', agent: 'ji', attempt: 1 }) },
    { type: 'verify', subject: 'ji', detail: JSON.stringify({ outcome: 'FAIL', agent: 'ji', attempt: 2 }) },
    { type: 'error', subject: 'ji', detail: '{"agent":"ji","skill":"ji","reason":"timeout"}' },
    { type: 'dispatch', subject: 'ji-frontend' },
    { type: 'dispatch', subject: 'si-content' },
  ];
  const m = mod.computeMetrics(events);
  assert.ok(m['KPI-task-completion'].value > 0, 'completion rate > 0');
  assert.ok(m['KPI-error-repeat'].value >= 0, 'error repeat rate present');
  assert.ok(Object.keys(m['KPI-skill-usage'].distribution).length >= 1, 'skill distribution populated');
});
test('eval-metrics: CLI --sid reads from events.jsonl', async () => {
  const mod = await import('../scripts/eval-metrics.mjs');
  const out = mod.main(['--sid', 'eval-lessons-1786816690877', '--json']);
  const j = JSON.parse(out);
  assert.ok('KPI-task-completion' in j);
});

// ── 4. eval-report.mjs ──────────────────────────────────
test('eval-report: CLI --help contains usage text', async () => {
  const mod = await import('../scripts/eval-report.mjs');
  const out = mod.main(['--help']);
  assert.ok(out.startsWith('eval-report'));
});

// ── 5. learn-budget.mjs ─────────────────────────────────
test('learn-budget: CLI check returns JSON with ok field', async () => {
  const mod = await import('../scripts/learn-budget.mjs');
  const out = mod.main(['check']);
  const j = JSON.parse(out);
  assert.ok(j.ok === true || j.ok === false);
});
test('learn-budget: CLI consume creates budget.json', async () => {
  const f = `.agents/state/learn/budget.json`;
  if (fs.existsSync(f)) fs.unlinkSync(f);
  const mod = await import('../scripts/learn-budget.mjs');
  const out = mod.main(['consume']);
  const j = JSON.parse(out);
  assert.strictEqual(j.ok, true);
  assert.ok(fs.existsSync(f));
});
test('learn-budget: CLI status shows dailyLlmCalls', async () => {
  const mod = await import('../scripts/learn-budget.mjs');
  const out = mod.main(['status']);
  const j = JSON.parse(out);
  assert.ok('dailyLlmCalls' in j);
});
