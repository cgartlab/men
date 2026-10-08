/*
 * runtime-probe.test.mjs — runtime-probe.mjs 纯函数测试
 *
 * 约束：
 *   - 只 import node:* 与 ../scripts/runtime-probe.mjs（零第三方依赖）
 *   - 不 spawn 真实环境探测（环境信号由注入的 env/readText 构造）
 *   - 只用 node:test 基础 API（test() + assert）
 */
import { test } from 'node:test';
import assert from 'node:assert';

import {
  parseYamlLite,
  resolveHome,
  probe,
  evaluateExpect,
  run,
} from '../scripts/runtime-probe.mjs';

// ── 构造夹具 ─────────────────────────────────────────────

/** named profile 夹具：HERMES_HOME=.../profiles/si */
function namedProfileEnv() {
  return { HERMES_HOME: 'C:\\hermes\\profiles\\si', HERMES_SESSION_ID: 'sid-1' };
}

/** default profile 夹具 */
function defaultProfileEnv() {
  return { HERMES_HOME: 'C:\\hermes' };
}

/** profile.yaml 内容（含 Bot-Mode 标记、section、group） */
const PROFILE_YAML = [
  'ui_meta:',
  '  hermes-bots:',
  '    color: hsl(30 68% 58%)',
  '    sectionId: sec-abc123',
  '    sectionName: Men Team',
  '    groups: []',
  '    group: null',
  '    shape: blobatar',
  '_ui_meta_revisions:',
  '  hermes-bots: 9',
  'description: 私人助理',
  '',
].join('\n');

/** default profile 的 rooms envelope（v3：id:/name: key） */
const ROOMS_YAML = [
  'ui_meta:',
  '  hermes-bots:',
  '    sectionId: sec-abc123',
  '  hermes-bots-groups:',
  '    version: 3',
  '    updatedAt: 1791452658239',
  '    rooms:',
  '      id:rmabc123:',
  '        name: Men Agent Team',
  '        roomId: rmabc123',
  '        members:',
  '          - profile: men',
  '            handle: men',
  '          - profile: si',
  '            handle: si',
  '      name:LegacyRoom:',
  '        log: []',
  '    deleted:',
  '      id:rmgone: 115',
  '      name:Old Team: 85',
  '',
].join('\n');

function makeRead(files) {
  return (p) => {
    const norm = String(p).replace(/\\/g, '/');
    for (const [k, v] of Object.entries(files)) {
      if (norm.endsWith(k)) return v;
    }
    return null;
  };
}

// ── parseYamlLite ────────────────────────────────────────
test('probe parseYamlLite: 基本 kv 与嵌套', () => {
  const o = parseYamlLite('a: 1\nb:\n  c: hello\n');
  assert.strictEqual(o.a, '1');
  assert.strictEqual(o.b.c, 'hello');
});

test('probe parseYamlLite: null/bool/引号/内联空集合', () => {
  const o = parseYamlLite('n: null\nt: true\nf: false\ns: "quoted text"\ng: {}\nl: []\n');
  assert.strictEqual(o.n, null);
  assert.strictEqual(o.t, true);
  assert.strictEqual(o.f, false);
  assert.strictEqual(o.s, 'quoted text');
  assert.deepStrictEqual(o.g, {});
  assert.deepStrictEqual(o.l, []);
});

test('probe parseYamlLite: CRLF + BOM + 注释 + 空行', () => {
  const text = '\uFEFF# comment\r\na: 1\r\n\r\nb: 2\r\n';
  const o = parseYamlLite(text);
  assert.strictEqual(o.a, '1');
  assert.strictEqual(o.b, '2');
});

test('probe parseYamlLite: 行尾裸冒号视为嵌套 key（房间 key id:rmabc:）', () => {
  const o = parseYamlLite('rooms:\n  id:rmabc:\n    name: My Room\n');
  assert.strictEqual(o.rooms['id:rmabc'].name, 'My Room');
});

test('probe parseYamlLite: 序列项 - profile: men', () => {
  const o = parseYamlLite('members:\n  - profile: men\n    handle: men\n  - profile: si\n');
  // 序列降级容错：首项成为 map 或数组成员，si 至少被记录
  const raw = JSON.stringify(o);
  assert.ok(raw.includes('men'), '应记录 men');
  assert.ok(raw.includes('si'), '应记录 si');
});

test('probe parseYamlLite: 多行标量续行（description 折行）', () => {
  const o = parseYamlLite('description: 第一行\n  第二行\nother: x\n');
  assert.ok(String(o.description).includes('第一行'));
  assert.ok(String(o.description).includes('第二行'));
  assert.strictEqual(o.other, 'x');
});

test('probe parseYamlLite: 空输入返回空对象，不抛', () => {
  assert.deepStrictEqual(parseYamlLite(''), {});
  assert.deepStrictEqual(parseYamlLite(null), {});
});

// ── resolveHome ──────────────────────────────────────────
test('probe resolveHome: named profile 路径', () => {
  const r = resolveHome('C:\\hermes\\profiles\\si');
  assert.strictEqual(r.profile, 'si');
  assert.strictEqual(r.isNamedProfile, true);
  assert.ok(r.root.replace(/\\/g, '/').endsWith('/hermes'));
});

test('probe resolveHome: default profile 路径', () => {
  const r = resolveHome('C:\\hermes');
  assert.strictEqual(r.profile, 'default');
  assert.strictEqual(r.isNamedProfile, false);
  assert.strictEqual(r.root.replace(/\\/g, '/'), 'c:/hermes'.replace(/^c/, 'C'));
});

test('probe resolveHome: null 返回 null', () => {
  assert.strictEqual(resolveHome(null), null);
  assert.strictEqual(resolveHome(''), null);
});

// ── probe（注入 env/readText） ───────────────────────────
test('probe: 非 Hermes 环境 → runtime unknown + expect hermes 不满足', () => {
  const r = probe({ env: {} });
  assert.strictEqual(r.runtime, 'unknown');
  assert.strictEqual(r.botModeManaged, false);
  assert.strictEqual(evaluateExpect('hermes', r).satisfied, false);
});

test('probe: HERMES_AGENT 标记但无 HERMES_HOME → hermes + warning', () => {
  const r = probe({ env: { HERMES_AGENT: 'true' } });
  assert.strictEqual(r.runtime, 'hermes');
  assert.ok(r.warnings.some((w) => w.includes('HERMES_HOME')), '应有 HERMES_HOME 缺失警告');
  assert.strictEqual(r.profile, null);
});

test('probe: named profile + profile.yaml 含 hermes-bots → 托管 + section 正确', () => {
  const r = probe({
    env: namedProfileEnv(),
    readText: makeRead({ 'profiles/si/profile.yaml': PROFILE_YAML }),
  });
  assert.strictEqual(r.runtime, 'hermes');
  assert.strictEqual(r.profile, 'si');
  assert.strictEqual(r.botModeManaged, true);
  assert.strictEqual(r.section.id, 'sec-abc123');
  assert.strictEqual(r.section.name, 'Men Team');
  assert.strictEqual(evaluateExpect('bot-mode', r).satisfied, true);
});

test('probe: profile.yaml 无 hermes-bots → 未托管，bot-mode expect 不满足', () => {
  const r = probe({
    env: namedProfileEnv(),
    readText: makeRead({ 'profiles/si/profile.yaml': 'description: 普通 profile\n' }),
  });
  assert.strictEqual(r.botModeManaged, false);
  assert.strictEqual(evaluateExpect('bot-mode', r).satisfied, false);
});

test('probe: rooms 从 default profile.yaml 读取（named profile 场景）', () => {
  const r = probe({
    env: namedProfileEnv(),
    readText: makeRead({
      'profiles/si/profile.yaml': PROFILE_YAML,
      'profile.yaml': ROOMS_YAML,
    }),
  });
  assert.strictEqual(r.rooms.active.length, 2);
  const men = r.rooms.active.find((x) => x.name === 'Men Agent Team');
  assert.ok(men, '应识别 Men Agent Team');
  assert.strictEqual(men.roomId, 'rmabc123');
  assert.deepStrictEqual(men.members, ['men', 'si']);
  const legacy = r.rooms.active.find((x) => x.name === 'LegacyRoom');
  assert.ok(legacy, '应识别 name: 前缀的 legacy 房间');
  assert.strictEqual(legacy.roomId, null);
  assert.strictEqual(r.rooms.deleted.length, 2);
  const gone = r.rooms.deleted.find((x) => x.roomId === 'rmgone');
  assert.ok(gone, '应识别 id: 前缀的删除墓碑');
  const old = r.rooms.deleted.find((x) => x.name === 'Old Team');
  assert.ok(old, '应识别 name: 前缀的删除墓碑');
  // room: expect
  assert.strictEqual(evaluateExpect('room:Men Agent Team', r).satisfied, true);
  assert.strictEqual(evaluateExpect('room:NoSuch', r).satisfied, false);
});

test('probe: profile.yaml 文件缺失 → warning + 不抛', () => {
  const r = probe({ env: defaultProfileEnv(), readText: () => null });
  assert.strictEqual(r.ok, true);
  assert.ok(r.warnings.length >= 1, '应有缺失警告');
});

test('probe: readText 抛异常 → 降级 ok=false + warning，不向外抛', () => {
  const r = probe({
    env: defaultProfileEnv(),
    readText: () => {
      throw new Error('disk error');
    },
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.warnings.some((w) => w.includes('disk error')));
});

test('probe: config.yaml 显式 bot_mode_protocol: false → 解析为 false', () => {
  const r = probe({
    env: defaultProfileEnv(),
    readText: makeRead({ 'config.yaml': 'agent:\n  bot_mode_protocol: false\n' }),
  });
  assert.strictEqual(r.botModeProtocol.configured, true);
  assert.strictEqual(r.botModeProtocol.value, false);
});

test('probe: config.yaml 缺失 → 默认 true + note', () => {
  const r = probe({ env: defaultProfileEnv(), readText: () => null });
  assert.strictEqual(r.botModeProtocol.value, true);
  assert.strictEqual(r.botModeProtocol.configured, false);
  assert.ok(r.botModeProtocol.note.includes('默认'));
});

// ── evaluateExpect ───────────────────────────────────────
test('probe evaluateExpect: 未知值 → 不满足并说明', () => {
  const r = probe({ env: {} });
  const e = evaluateExpect('bogus', r);
  assert.strictEqual(e.satisfied, false);
  assert.ok(e.reason.includes('未知'));
});

test('probe evaluateExpect: 空 expect → 满足', () => {
  const e = evaluateExpect(null, probe({ env: {} }));
  assert.strictEqual(e.satisfied, true);
});

test('probe evaluateExpect: room: 空名 → 不满足', () => {
  const e = evaluateExpect('room:', probe({ env: {} }));
  assert.strictEqual(e.satisfied, false);
});

// ── run（CLI 解析，不 spawn 子进程） ─────────────────────
test('probe run: -h 退出 0 且输出用法', () => {
  const r = run(['-h']);
  assert.strictEqual(r.code, 0);
  assert.ok(r.stdout.includes('用法'));
});

test('probe run: --help 同样退出 0', () => {
  assert.strictEqual(run(['--help']).code, 0);
});

test('probe run: 未知参数 → 退出 2', () => {
  const r = run(['--bogus']);
  assert.strictEqual(r.code, 2);
  assert.ok(r.stderr.includes('--bogus'));
});

test('probe run: --expect 缺值 → 退出 2', () => {
  const r = run(['--expect']);
  assert.strictEqual(r.code, 2);
  assert.ok(r.stderr.includes('缺少取值'));
});

// ── 真实路径：当前运行环境（只断言结构，不依赖 Hermes 是否存在） ──
test('probe: 真实 process.env 探测返回结构完整且不抛', () => {
  const r = probe();
  assert.ok(['hermes', 'unknown'].includes(r.runtime));
  assert.strictEqual(typeof r.botModeManaged, 'boolean');
  assert.ok(Array.isArray(r.signals));
  assert.ok(Array.isArray(r.warnings));
  assert.ok(Array.isArray(r.rooms.active));
  assert.ok(Array.isArray(r.rooms.deleted));
  assert.ok(typeof r.ts === 'string');
});
