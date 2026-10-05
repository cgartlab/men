/*
 * event.test.mjs — event.mjs 黑盒测试（Wave 3 首批测试）
 *
 * 约束：
 *   - 只 import node:*（零第三方依赖，V7）
 *   - 用临时 sid（test-<ts>）spawn append/list/validate，验证闭环
 *   - event.mjs 的 ROOT = process.cwd()，spawn 时 cwd 用仓库根，
 *     事件落在 .agents/state/sessions/<sid>/ 下，测完清理该 sid 目录
 *   - 只用 node:test 基础 API（test() + assert）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const EVENT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'event.mjs');

function runEvent(args) {
  return spawnSync(process.execPath, [EVENT_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    shell: false,
    timeout: 30_000,
  });
}

function sidEventsPath(sid) {
  return path.join(REPO_ROOT, '.agents', 'state', 'sessions', sid, 'events.jsonl');
}

// 单测内闭环：append → list → validate，并在 finally 清理
test('event blackbox: append → list → validate round-trip', () => {
  const sid = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const eventsPath = sidEventsPath(sid);
  try {
    // 1. append
    const a = runEvent([
      'append', '--type', 'verify', '--subject', 'ji',
      '--sid', sid, '--detail', '{"outcome":"PASS","agent":"ji"}',
    ]);
    assert.strictEqual(a.status, 0, `append stderr: ${a.stderr}`);
    const ev = JSON.parse(a.stdout);
    assert.strictEqual(ev.sid, sid);
    assert.strictEqual(ev.type, 'verify');
    assert.strictEqual(ev.subject, 'ji');
    assert.ok(ev.eventId, 'eventId present');
    assert.ok(ev.ts, 'ts present');

    // 2. 文件真实存在且为合法 jsonl
    assert.ok(fs.existsSync(eventsPath), 'events.jsonl created');
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(JSON.parse(lines[0]).sid, sid);

    // 3. list --json
    const l = runEvent(['list', '--sid', sid, '--json']);
    assert.strictEqual(l.status, 0, `list stderr: ${l.stderr}`);
    const listed = JSON.parse(l.stdout);
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0].type, 'verify');
    assert.strictEqual(listed[0].sid, sid);

    // 4. list --type filter
    const lf = runEvent(['list', '--sid', sid, '--type', 'verify', '--json']);
    assert.strictEqual(JSON.parse(lf.stdout).length, 1);
    const lf2 = runEvent(['list', '--sid', sid, '--type', 'error', '--json']);
    assert.strictEqual(JSON.parse(lf2.stdout).length, 0);

    // 5. validate
    const v = runEvent(['validate', '--sid', sid]);
    assert.strictEqual(v.status, 0, `validate stderr: ${v.stderr}`);
    assert.match(v.stdout, /校验通过/);
  } finally {
    fs.rmSync(path.dirname(eventsPath), { recursive: true, force: true });
  }
});

test('event blackbox: invalid type exits 2 without writing', () => {
  const sid = `test-bad-${Date.now()}`;
  const eventsPath = sidEventsPath(sid);
  try {
    const r = runEvent(['append', '--type', 'nonsense-kind', '--subject', 'x', '--sid', sid]);
    assert.strictEqual(r.status, 2);
    assert.ok(!fs.existsSync(eventsPath), 'no file written for invalid kind');
  } finally {
    fs.rmSync(path.dirname(eventsPath), { recursive: true, force: true });
  }
});

test('event blackbox: validate missing sid exits 1', () => {
  const sid = `test-missing-${Date.now()}`;
  const eventsPath = sidEventsPath(sid);
  try {
    const r = runEvent(['validate', '--sid', sid]);
    assert.strictEqual(r.status, 1);
  } finally {
    fs.rmSync(path.dirname(eventsPath), { recursive: true, force: true });
  }
});

test('event blackbox: sid isolation — different sid has own file', () => {
  const sidA = `test-iso-a-${Date.now()}`;
  const sidB = `test-iso-b-${Date.now()}`;
  try {
    const a = runEvent(['append', '--type', 'verify', '--subject', 'a', '--sid', sidA]);
    assert.strictEqual(a.status, 0);
    const b = runEvent(['append', '--type', 'error', '--subject', 'b', '--sid', sidB]);
    assert.strictEqual(b.status, 0);

    const la = runEvent(['list', '--sid', sidA, '--json']);
    const lb = runEvent(['list', '--sid', sidB, '--json']);
    assert.strictEqual(JSON.parse(la.stdout).length, 1);
    assert.strictEqual(JSON.parse(lb.stdout).length, 1);
    assert.strictEqual(JSON.parse(la.stdout)[0].subject, 'a');
    assert.strictEqual(JSON.parse(lb.stdout)[0].subject, 'b');
  } finally {
    fs.rmSync(path.dirname(sidEventsPath(sidA)), { recursive: true, force: true });
    fs.rmSync(path.dirname(sidEventsPath(sidB)), { recursive: true, force: true });
  }
});

test('event blackbox: help exits 0', () => {
  const r = runEvent(['help']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /用法/);
});

// ── 写入方契约：verify.mjs / gate.mjs 产出的日志必须能通过 validate ──
test('event blackbox: verify/gate 写出的事件通过 validate（eventId 契约）', () => {
  // 回归：verify.mjs 与 gate.mjs 的 emitEvent/appendEvent 早于漏写 eventId，
  // 而 event.mjs:REQUIRED_FIELDS 要求它 —— 于是仓库自己 verify/gate 产出的日志
  // 一律 `event.mjs validate` 退出 1（0 合法 / 1 坏行），「机械证据链」自断。
  // 这里黑盒跑一遍写入方再用 validate 复核，不做源码正则匹配。
  const stamp = Date.now();
  const verifySid = `verify-eid-${stamp}`;
  const gateSid = `gate-eid-${stamp}`;
  // gate 必须用 --dir 指向临时包：否则它会对仓库根执行 `npm run test`，
  // 既在 node --test 内嵌套触发（Node 置 NODE_TEST_CONTEXT=child-v8 后
  // 内层 `node --test` 会静默跳过全部文件、0 测试退出 0），又会顺带改写
  // 仓库的 .agents/state/gates/gate-test.json。test/gate.test.mjs 已是此做法。
  const tmpPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-eid-'));
  fs.writeFileSync(
    path.join(tmpPkg, 'package.json'),
    JSON.stringify({ name: 'gate-eid-fixture', version: '0.0.0', scripts: { test: 'node --version' } }),
  );

  const dirs = [path.dirname(sidEventsPath(verifySid)), path.dirname(sidEventsPath(gateSid))];
  try {
    const vr = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'verify.mjs'), 'men', '--sid', verifySid],
      { cwd: REPO_ROOT, encoding: 'utf-8', shell: false, timeout: 120_000 },
    );
    assert.notStrictEqual(vr.status, null, 'verify.mjs 未在超时内结束');

    const gr = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'gate.mjs'), 'test', '--dir', tmpPkg, '--sid', gateSid],
      { cwd: REPO_ROOT, encoding: 'utf-8', shell: false, timeout: 120_000 },
    );
    const gateOut = `${gr.stdout || ''}${gr.stderr || ''}`;
    assert.match(gateOut, /GATE_PASSED/, `gate 应通过（实得：${gateOut.trim()}）`);
    // GATE_SKIP 同样会写一条带 eventId 的事件，只校验日志会「空过」，
    // 故显式断言确实走了执行路径。
    assert.doesNotMatch(gateOut, /GATE_SKIP/, 'gate 不应走 GATE_SKIP 分支');

    for (const [name, sid] of [['verify.mjs', verifySid], ['gate.mjs', gateSid]]) {
      const v = runEvent(['validate', '--sid', sid]);
      assert.strictEqual(v.status, 0, `${name} 产出的日志未通过 validate：\n${v.stdout}\n${v.stderr}`);
      assert.match(v.stdout, /校验通过/);
    }
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    fs.rmSync(tmpPkg, { recursive: true, force: true });
  }
});

// ── 状态路径与 cwd 无关 ──
test('event blackbox: 从子目录运行也写入仓库内，状态不随 cwd 分裂', () => {
  // 回归：event.mjs 曾用 process.cwd() 解析 .agents/state，于是同一 sid 在不同
  // 目录写出两份 events.jsonl；而 verify.mjs（按模块位置解析）写的是仓库内那份。
  // 同一逻辑事件流被劈成两半，learn.mjs / eval-metrics.mjs 只看得到其中一片。
  const sid = `cwd-${Date.now()}`;
  const repoLog = path.join(REPO_ROOT, '.agents', 'state', 'sessions', sid, 'events.jsonl');
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'event-cwd-'));
  try {
    const r = spawnSync(
      process.execPath,
      [EVENT_SCRIPT, 'append', '--type', 'session.created', '--subject', 'cwd-probe', '--sid', sid],
      { cwd: elsewhere, encoding: 'utf-8', shell: false, timeout: 30_000 },
    );
    assert.strictEqual(r.status, 0, `append 失败：${r.stderr}`);
    assert.ok(fs.existsSync(repoLog), '事件应落在仓库内的 .agents/state 下，而非 cwd');
    assert.ok(
      !fs.existsSync(path.join(elsewhere, '.agents')),
      '不应在 cwd 下另建一份 .agents（那会造成状态分裂）',
    );
  } finally {
    fs.rmSync(elsewhere, { recursive: true, force: true });
    fs.rmSync(path.dirname(repoLog), { recursive: true, force: true });
  }
});
