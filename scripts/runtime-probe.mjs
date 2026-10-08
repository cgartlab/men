#!/usr/bin/env node
/**
 * runtime-probe.mjs — Hermes Bot Mode 机械探测（自动识别能力）
 *
 * 探测当前环境是否运行在 Hermes、profile 是否被 Bot Mode 管理、存在哪些群组房间，
 * 为「群组有序执行协议」提供机械可验证的环境事实。纯 Node 零依赖。
 *
 * CLI:
 *   runtime-probe [--json] [--expect hermes|bot-mode|room:<name>] [--help]
 *
 * 退出码:
 *   0  探测完成（且 --expect 满足或未指定）
 *   1  意外错误
 *   2  用法错误
 *   3  --expect 未满足
 *
 * 检测信号（不猜测，逐项取证）:
 *   - runtime:    HERMES_HOME 环境变量存在，或 HERMES_AGENT/AI_AGENT 标记
 *   - profile:    HERMES_HOME 路径形态（.../profiles/<name> → <name>，否则 default）
 *   - bot mode:   profile.yaml 的 ui_meta['hermes-bots'] 字段（Bot Mode 托管标记）
 *   - protocol:   config.yaml 的 agent.bot_mode_protocol（缺省按 Hermes 默认 true）
 *   - rooms:      default profile 的 profile.yaml 中 ui_meta['hermes-bots-groups']
 *                 （v3 envelope: {version, rooms: {key: {name, roomId, members}}, deleted}）
 *
 * 群组轮次内的身份识别（我是否正处在某个房间的发言轮）无法由本脚本判定——
 * 那是 prompt 层信号（turn 以 `[Group chat: "…"]` / `[Discussion: "…"]` 开头），
 * 见 .opencode/skills/hermes-bot-mode/SKILL.md。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// ================= YAML-lite 解析（桌面端 profile.yaml / config.yaml 子集） =================

/**
 * 解析桌面端生成的 YAML 子集：
 *   - `key: value` / `key:`（嵌套块）/ 行首缩进表达层级
 *   - `key: scalar` 之后更深缩进且无 `: ` 的行视为多行标量续行
 *   - 序列项 `- item`（标量或 `- key: value` 起始的映射）
 *   - 花括号/方括号内联空集合 `{}` / `[]`、单双引号字符串
 *   - 忽略空行与 `#` 整行注释；兼容 BOM 与 CRLF
 *
 * 容错约定：无法识别的行降级为字符串挂到当前节点，绝不抛异常。
 * 解析目标只是 profile.yaml 的已知字段，不是通用 YAML。
 */
export function parseYamlLite(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const root = {};
  // 栈：{ indent, container } — container 为当前层级的 map
  const stack = [{ indent: -1, container: root }];
  // 待续行的多行标量：{ key, container, indent }
  let pending = null;

  const top = () => stack[stack.length - 1];

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();

    // 弹出不深于当前缩进的旧层级
    while (stack.length > 1 && indent <= top().indent) stack.pop();
    // 多行标量续行：更深缩进且不构成新的 `key:` 条目
    if (pending && indent > pending.indent) {
      const isEntry = splitKeyValue(line) !== null || line.startsWith('- ');
      if (!isEntry) {
        pending.container[pending.key] += '\n' + line;
        continue;
      }
      pending = null;
    } else if (pending && indent <= pending.indent) {
      pending = null;
    }

    if (line.startsWith('- ')) {
      const frame = top();
      // 首次遇到序列项：把 `key:` 建立的 {} 占位原地换成数组
      if (!Array.isArray(frame.container)) {
        const arr = [];
        if (frame.key !== undefined && frame.parent) frame.parent[frame.key] = arr;
        frame.container = arr;
      }
      const item = line.slice(2).trim();
      const kv = splitKeyValue(item);
      if (kv) {
        const obj = {};
        frame.container.push(obj);
        if (kv.value === '') {
          const bucket = {};
          obj[kv.key] = bucket;
          stack.push({ indent, container: bucket, key: kv.key, parent: obj });
        } else {
          obj[kv.key] = coerceScalar(kv.value);
          stack.push({ indent, container: obj });
        }
      } else {
        frame.container.push(coerceScalar(item));
      }
      continue;
    }

    const kv = splitKeyValue(line);
    if (!kv) {
      // 无法识别：降级挂字符串，保持容错
      top().container[line] = null;
      continue;
    }
    const { key, value } = kv;
    if (value === '') {
      // 嵌套块：先占位 {}，遇到序列项时原地换成数组
      const bucket = {};
      const parentFrame = top();
      parentFrame.container[key] = bucket;
      stack.push({ indent, container: bucket, key, parent: parentFrame.container });
      pending = null;
    } else if (value === '{}' ) {
      top().container[key] = {};
    } else if (value === '[]') {
      top().container[key] = [];
    } else {
      top().container[key] = coerceScalar(value);
      // 可能是多行标量的第一行——遇到更深缩进的非条目行时拼接
      pending = { key, container: top().container, indent };
    }
  }
  return root;
}

/** 在当前行上按「第一个后随空白的冒号」切分 key/value；行尾裸冒号视为嵌套 key。 */
function splitKeyValue(line) {
  if (line.startsWith('- ')) return null;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ':' && (i + 1 === line.length || /\s/.test(line[i + 1]))) {
      const key = line.slice(0, i).trim();
      if (!key) return null;
      const value = i + 1 === line.length ? '' : line.slice(i + 1).trim();
      return { key, value };
    }
  }
  return null;
}

function coerceScalar(value) {
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

// ================= 探测 =================

function defaultRead(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

/** HERMES_HOME → { profile, root, isNamedProfile } */
export function resolveHome(home) {
  if (!home) return null;
  const resolved = path.resolve(home);
  const parent = path.dirname(resolved);
  const isNamedProfile = path.basename(parent).toLowerCase() === 'profiles';
  return {
    home: resolved,
    profile: isNamedProfile ? path.basename(resolved) : 'default',
    root: isNamedProfile ? path.dirname(parent) : resolved,
    isNamedProfile,
  };
}

function safeGet(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur ?? null;
}

/**
 * 房间 key 规范化：桌面端格式为 `id:<roomId>`（v3）或 `name:<name>`（legacy，无 roomId），
 * 更老的构建可能存裸名字 key（见 group-chat.ts groupChatRoomKey）。
 */
function splitRoomKey(key) {
  if (key.startsWith('id:')) return { roomId: key.slice(3), name: null };
  if (key.startsWith('name:')) return { roomId: null, name: key.slice(5) };
  return { roomId: null, name: key };
}

/** rooms 映射 → 规范化列表 */
function normalizeRooms(roomsMap) {
  if (!roomsMap || typeof roomsMap !== 'object' || Array.isArray(roomsMap)) return [];
  return Object.entries(roomsMap).map(([key, val]) => {
    const v = val && typeof val === 'object' ? val : {};
    const fromKey = splitRoomKey(key);
    const members = Array.isArray(v.members)
      ? v.members
          .map((m) => (m && typeof m === 'object' ? m.profile || m.handle || m.name || null : m))
          .filter((m) => typeof m === 'string' && m)
      : [];
    return {
      key,
      name: typeof v.name === 'string' && v.name ? v.name : fromKey.name,
      roomId: typeof v.roomId === 'string' && v.roomId ? v.roomId : fromKey.roomId,
      members,
    };
  });
}

function normalizeDeleted(deletedMap) {
  if (!deletedMap || typeof deletedMap !== 'object' || Array.isArray(deletedMap)) return [];
  return Object.entries(deletedMap).map(([key, rev]) => {
    const fromKey = splitRoomKey(key);
    return {
      key,
      name: fromKey.name,
      roomId: fromKey.roomId,
      revision: typeof rev === 'number' ? rev : Number(rev) || null,
    };
  });
}

/** config.yaml 中 agent.bot_mode_protocol（仅扫非注释行，缺省按 Hermes 默认 true） */
function readBotModeProtocol(configText) {
  if (typeof configText !== 'string') return { configured: false, value: true, note: 'config.yaml 缺失，按 Hermes 默认 true' };
  for (const rawLine of configText.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^bot_mode_protocol\s*:\s*(\S+)/.exec(line);
    if (m) {
      const v = m[1].toLowerCase();
      if (v === 'true' || v === 'false') return { configured: true, value: v === 'true', note: '' };
      return { configured: true, value: true, note: `非布尔值 ${m[1]}，按 true 处理` };
    }
  }
  return { configured: false, value: true, note: '未显式配置，按 Hermes 默认 true' };
}

/**
 * 主探测入口。所有依赖可注入（env / readText），供单测使用；绝不抛异常。
 */
export function probe({ env = process.env, readText = defaultRead, now = () => new Date().toISOString() } = {}) {
  const signals = [];
  const warnings = [];
  const out = {
    ok: true,
    runtime: 'unknown',
    profile: null,
    hermesHome: null,
    botModeManaged: false,
    botModeProtocol: { configured: false, value: true, note: '未探测（非 Hermes 环境）' },
    section: null,
    group: null,
    rooms: { active: [], deleted: [], source: null },
    signals,
    warnings,
    ts: now(),
  };

  try {
    // 1. runtime 判定
    const home = typeof env.HERMES_HOME === 'string' && env.HERMES_HOME.trim() ? env.HERMES_HOME.trim() : null;
    const agentMarked = env.HERMES_AGENT === 'true' || env.AI_AGENT === 'hermes-agent';
    if (home) {
      out.runtime = 'hermes';
      signals.push(`HERMES_HOME=${home}`);
    } else if (agentMarked) {
      out.runtime = 'hermes';
      warnings.push('检测到 Hermes 进程标记但 HERMES_HOME 缺失');
      signals.push(`HERMES_AGENT=${env.HERMES_AGENT ?? ''} AI_AGENT=${env.AI_AGENT ?? ''}`);
    } else {
      signals.push('HERMES_HOME/HERMES_AGENT/AI_AGENT 均未设置 → 非 Hermes 环境');
    }
    if (env.HERMES_SESSION_ID) signals.push(`HERMES_SESSION_ID 存在`);

    if (out.runtime !== 'hermes') return out;

    // 2. profile 解析
    const info = resolveHome(home);
    if (!info) {
      out.ok = false;
      warnings.push('HERMES_HOME 无法解析为路径');
      return out;
    }
    out.hermesHome = info.home;
    out.profile = info.profile;
    signals.push(`profile=${info.profile}${info.isNamedProfile ? '（named）' : '（default）'}`);

    // 3. profile.yaml → bot mode 托管标记 / section / group
    const profileYamlPath = path.join(info.home, 'profile.yaml');
    const profileText = readText(profileYamlPath);
    if (profileText === null) {
      warnings.push(`profile.yaml 缺失: ${profileYamlPath}`);
    } else {
      const py = parseYamlLite(profileText);
      const bots = safeGet(py, 'ui_meta', 'hermes-bots');
      out.botModeManaged = Boolean(bots && typeof bots === 'object');
      signals.push(out.botModeManaged ? 'ui_meta.hermes-bots 存在 → Bot-Mode managed' : 'ui_meta.hermes-bots 缺失 → 未被 Bot Mode 托管');
      if (out.botModeManaged) {
        out.section = {
          id: safeGet(bots, 'sectionId') ?? null,
          name: safeGet(bots, 'sectionName') ?? null,
        };
        out.group = {
          group: safeGet(bots, 'group') ?? null,
          groups: Array.isArray(safeGet(bots, 'groups')) ? safeGet(bots, 'groups') : [],
        };
      }
      // 本 profile 可能自带 rooms（default profile 即 root）
      const ownRooms = normalizeRooms(safeGet(py, 'ui_meta', 'hermes-bots-groups', 'rooms'));
      const ownDeleted = normalizeDeleted(safeGet(py, 'ui_meta', 'hermes-bots-groups', 'deleted'));
      if (ownRooms.length || ownDeleted.length) {
        out.rooms = { active: ownRooms, deleted: ownDeleted, source: profileYamlPath };
      }
    }

    // 4. rooms：桌面端把 v3 envelope 存在 default profile 的 profile.yaml
    if (!out.rooms.source) {
      const defaultYamlPath = path.join(info.root, 'profile.yaml');
      const defaultText = readText(defaultYamlPath);
      if (defaultText === null) {
        warnings.push(`default profile.yaml 缺失: ${defaultYamlPath}`);
      } else {
        const dy = parseYamlLite(defaultText);
        const active = normalizeRooms(safeGet(dy, 'ui_meta', 'hermes-bots-groups', 'rooms'));
        const deleted = normalizeDeleted(safeGet(dy, 'ui_meta', 'hermes-bots-groups', 'deleted'));
        out.rooms = { active, deleted, source: defaultYamlPath };
        signals.push(`rooms: ${active.length} active / ${deleted.length} deleted (from default profile)`);
      }
    } else {
      signals.push(`rooms: ${out.rooms.active.length} active / ${out.rooms.deleted.length} deleted (from own profile.yaml)`);
    }

    // 5. config.yaml → bot_mode_protocol
    const configText = readText(path.join(info.home, 'config.yaml'));
    out.botModeProtocol = readBotModeProtocol(configText);
    signals.push(`bot_mode_protocol=${out.botModeProtocol.value}${out.botModeProtocol.configured ? '' : '（默认）'}`);
  } catch (e) {
    out.ok = false;
    warnings.push(`探测异常（已降级）: ${e && e.message ? e.message : String(e)}`);
  }
  return out;
}

// ================= CLI =================

/** --expect 判定：返回 { satisfied, reason } */
export function evaluateExpect(expect, report) {
  if (!expect) return { satisfied: true, reason: '' };
  if (expect === 'hermes') {
    return report.runtime === 'hermes'
      ? { satisfied: true, reason: '' }
      : { satisfied: false, reason: `期望 hermes 环境，实际 runtime=${report.runtime}` };
  }
  if (expect === 'bot-mode') {
    return report.botModeManaged
      ? { satisfied: true, reason: '' }
      : { satisfied: false, reason: '期望 Bot-Mode managed profile，但 ui_meta.hermes-bots 缺失' };
  }
  if (expect.startsWith('room:')) {
    const want = expect.slice(5);
    if (!want) return { satisfied: false, reason: '--expect room: 需要房间名' };
    const hit = report.rooms.active.some((r) => r.name === want);
    return hit
      ? { satisfied: true, reason: '' }
      : { satisfied: false, reason: `期望存在活跃房间「${want}」，实际活跃房间: ${report.rooms.active.map((r) => r.name || r.key).join(', ') || '（无）'}` };
  }
  return { satisfied: false, reason: `未知的 --expect 值: ${expect}（可用: hermes / bot-mode / room:<name>）` };
}

function renderHuman(report) {
  const lines = [];
  lines.push(`runtime        ${report.runtime}`);
  lines.push(`profile        ${report.profile ?? '—'}${report.botModeManaged ? '（Bot-Mode managed）' : report.hermesHome ? '（未托管）' : ''}`);
  lines.push(`hermes home    ${report.hermesHome ?? '—'}`);
  lines.push(
    `protocol       bot_mode_protocol=${report.botModeProtocol.value}${report.botModeProtocol.configured ? '' : '（默认）'}${report.botModeProtocol.note ? ` — ${report.botModeProtocol.note}` : ''}`
  );
  if (report.section) lines.push(`section        ${report.section.name ?? '—'}（${report.section.id ?? '—'}）`);
  if (report.group) {
    const g = report.group.group ?? (report.group.groups.length ? report.group.groups.join(', ') : '—');
    lines.push(`group          ${g}`);
  }
  lines.push(`rooms          ${report.rooms.active.length} active / ${report.rooms.deleted.length} deleted`);
  for (const r of report.rooms.active) {
    lines.push(`               - ${r.name ?? r.key}${r.members.length ? `（成员: ${r.members.join(', ')}）` : ''}`);
  }
  for (const w of report.warnings) lines.push(`[warn] ${w}`);
  return lines.join('\n');
}

function usage() {
  return `runtime-probe — Hermes Bot Mode 机械探测

用法:
  runtime-probe [--json] [--expect <value>] [--help]

选项:
  --json                输出 JSON（机器可读）
  --expect <value>      断言环境，不满足时退出码 3:
                          hermes        运行在 Hermes 内
                          bot-mode      profile 被 Bot Mode 托管
                          room:<name>   存在同名活跃群组房间
  --help, -h            显示此帮助

退出码:
  0 成功    1 意外错误    2 用法错误    3 --expect 未满足

说明:
  脚本探测环境级事实（HERMES_HOME / profile.yaml / rooms）；
  群组轮次内的 prompt 层识别（[Group chat: / [Discussion: 前缀）
  见 .opencode/skills/hermes-bot-mode/SKILL.md。
`;
}

/**
 * CLI 入口：返回 { code, stdout, stderr }，不直接退出（可测）。
 */
export function run(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--help') || args.includes('-h')) return { code: 0, stdout: usage(), stderr: '' };

  const jsonOut = args.includes('--json');
  const expectIdx = args.indexOf('--expect');
  let expect = null;
  const unknown = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') continue;
    if (a === '--expect') {
      expect = args[i + 1] ?? null;
      i++;
      if (expect === null) return { code: 2, stdout: '', stderr: '[错误] --expect 缺少取值' };
      continue;
    }
    unknown.push(a);
  }
  if (unknown.length) return { code: 2, stdout: '', stderr: `[错误] 未知参数: ${unknown.join(' ')}（--help 查看用法）` };

  const report = probe();
  const expectResult = evaluateExpect(expect, report);
  if (jsonOut) {
    report.expect = expect ? { wanted: expect, satisfied: expectResult.satisfied, reason: expectResult.reason } : undefined;
    return {
      code: expectResult.satisfied ? 0 : 3,
      stdout: JSON.stringify(report, null, 2) + '\n',
      stderr: expectResult.satisfied ? '' : `[fail] ${expectResult.reason}\n`,
    };
  }
  return {
    code: expectResult.satisfied ? 0 : 3,
    stdout: renderHuman(report) + '\n',
    stderr: expectResult.satisfied ? '' : `[fail] ${expectResult.reason}\n`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, stdout, stderr } = run(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exitCode = code;
}
