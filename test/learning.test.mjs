/*
 * TDD harness for P0 learning scripts
 * Migrated from scripts/learning.test.mjs to node:test runner (node --test).
 * Zero-dep, Node ESM, Windows pwsh compatible.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
  // F7 回归：旧测试用磁盘上并不存在的硬编码 sid（events 恒空读），
  // 且只断言 key 存在——computeMetrics 空数组也返回 8 个固定 key，
  // 于是 H2/P0 的回归面（computeMetrics 收空数组、KPI 全 0）完全测不到。
  // 现场造 fixture sid，断言真实读取后的非零计数。
  const mod = await import('../scripts/eval-metrics.mjs');
  const sid = `test-kpi-${Date.now()}`;
  const dir = `.agents/state/sessions/${sid}`;
  const now = new Date().toISOString();
  const events = [
    { eventId: 'e1', ts: now, sid, type: 'verify', subject: 'ji', detail: JSON.stringify({ outcome: 'PASS', agent: 'ji', attempt: 1 }) },
    { eventId: 'e2', ts: now, sid, type: 'dispatch', subject: 'ji-frontend' },
  ];
  // --output 指向临时文件：避免触发 F1 修复后的 kpi-latest.json 自动落盘副作用
  const tmpOut = `.agents/state/learn/test-kpi-out-${Date.now()}.json`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/events.jsonl`, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  try {
    const out = mod.main(['--sid', sid, '--output', tmpOut, '--json']);
    const j = JSON.parse(out);
    assert.ok('KPI-task-completion' in j);
    assert.strictEqual(j['KPI-task-completion'].total, 1, '应从 events.jsonl 读到 1 条 verify/judge 事件');
    assert.strictEqual(j['KPI-task-completion'].pass, 1, 'PASS 事件应被计数');
    assert.strictEqual(j['KPI-task-completion'].value, 1, '完成率应为 100%（非 0 才证明读取路径生效）');
    assert.strictEqual(j['KPI-skill-usage'].value, 1, 'dispatch 事件应进入技能分布');
    assert.ok(fs.existsSync(tmpOut), '--output 指定的文件应被写出');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(tmpOut, { force: true });
  }
});

// ── 4. eval-report.mjs ──────────────────────────────────
test('eval-report: CLI --help contains usage text', async () => {
  const mod = await import('../scripts/eval-report.mjs');
  const out = mod.main(['--help']);
  assert.ok(out.startsWith('eval-report'));
});

// ── 5. learn-budget.mjs ─────────────────────────────────
// F8：以下测试此前直接删除并消耗仓库真实的 .agents/state/learn/budget.json
// （每跑一次 npm test 烧 1/3 当日 L2 预算，且无还原）。统一改为
// 备份 → 注入已知状态 → 断言 → finally 还原，测试结果不再依赖执行顺序。
function withBudgetBackup(fn) {
  const f = path.join('.agents', 'state', 'learn', 'budget.json');
  const backup = fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null;
  try {
    fn(f);
  } finally {
    if (backup !== null) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, backup);
    } else {
      fs.rmSync(f, { force: true });
    }
  }
}

test('learn-budget: check 在未超限时 ok:true、超限时 ok:false（F24：非恒真断言）', async () => {
  // F24：旧断言 `j.ok === true || j.ok === false` 对任何布尔恒真，
  // 名为「returns JSON with ok field」实测不到任何逻辑。改为注入两种已知状态分别断言真值。
  const mod = await import('../scripts/learn-budget.mjs');
  withBudgetBackup((f) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const today = new Date().toISOString().slice(0, 10);

    fs.writeFileSync(f, JSON.stringify({ date: today, dailyLlmCalls: 0, dailyEvents: 0, lastLlmCall: null, lastTaskCount: 0 }));
    let j = JSON.parse(mod.main(['check']));
    assert.strictEqual(j.ok, true, `未超限应 ok:true，实际: ${JSON.stringify(j)}`);
    assert.strictEqual(j.reason, 'within budget');

    fs.writeFileSync(f, JSON.stringify({ date: today, dailyLlmCalls: 99, dailyEvents: 0, lastLlmCall: null, lastTaskCount: 0 }));
    j = JSON.parse(mod.main(['check']));
    assert.strictEqual(j.ok, false, `超限应 ok:false，实际: ${JSON.stringify(j)}`);
    assert.match(j.reason, /limit reached/);

    // F21：形状不符的文件 → fail-closed 拒绝，而非静默重开预算
    fs.writeFileSync(f, '{}');
    j = JSON.parse(mod.main(['check']));
    assert.strictEqual(j.ok, false, '损坏状态必须 fail-closed');
    assert.match(j.reason, /corrupt/);
  });
});

test('learn-budget: CLI consume 写出合法 budget.json（隔离，不碰真实状态）', async () => {
  const mod = await import('../scripts/learn-budget.mjs');
  withBudgetBackup((f) => {
    fs.rmSync(f, { force: true });
    const out = mod.main(['consume']);
    const j = JSON.parse(out);
    assert.strictEqual(j.ok, true);
    assert.ok(fs.existsSync(f), 'consume 应创建 budget.json');
    const saved = JSON.parse(fs.readFileSync(f, 'utf-8'));
    assert.strictEqual(saved.dailyLlmCalls, 1, '消耗后计数为 1');
    assert.strictEqual(typeof saved.date, 'string');
  });
});

test('learn-budget: CLI status 报告注入状态的 dailyLlmCalls', async () => {
  const mod = await import('../scripts/learn-budget.mjs');
  withBudgetBackup((f) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(f, JSON.stringify({ date: today, dailyLlmCalls: 2, dailyEvents: 5, lastLlmCall: null, lastTaskCount: 2 }));
    const j = JSON.parse(mod.main(['status']));
    assert.strictEqual(j.dailyLlmCalls, 2, `status 应报告注入值 2，实际: ${JSON.stringify(j)}`);
    assert.strictEqual(j.dailyEvents, 5);
    assert.strictEqual(j.limit, 3);
    assert.strictEqual(j.remaining, 1);
  });
});
