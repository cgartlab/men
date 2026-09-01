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
