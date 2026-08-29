#!/usr/bin/env node
/**
 * event.mjs — append-only events.jsonl 规范读写工具
 *
 * 纯 Node（零第三方依赖），用于 M4 及以后所有机械验证共用。
 *
 * 子命令:
 *   append   --type <kind> --subject <s> --sid <sid> [--detail <t>] [--payload <json>]
 *   list     --sid <sid> [--type <kind>] [--since <iso>] [--json]
 *   replay   --sid <sid>
 *   validate --sid <sid>
 *
 * 目标路径: .agents\state\sessions\<sid>\events.jsonl
 *
 * 事件 kind 枚举（14 种）:
 *   session.created / session.ended / boundary
 *   workflow.phase / gate.passed / gate.failed
 *   blocker.raised / decision.made / decision.missing
 *   verify / judge / error / dispatch / handoff
 *
 * Windows PowerShell 提示:
 *   --detail / --payload 含中文或引号时，建议用单引号包裹整个 JSON，
 *   避免双引号被 PowerShell 转义破坏。示例:
 *   node scripts/event.mjs append --type decision.made --subject test --sid x --detail '{"k":"v"}'
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ================= 常量 =================

const ROOT = process.cwd();
const KINDS = [
  'session.created',
  'session.ended',
  'boundary',
  'workflow.phase',
  'gate.passed',
  'gate.failed',
  'blocker.raised',
  'decision.made',
  'decision.missing',
  'verify',
  'judge',
  'error',
  'dispatch',
  'handoff',
];
const KIND_SET = new Set(KINDS);
const REQUIRED_FIELDS = ['eventId', 'ts', 'sid', 'type'];

// ================= 工具函数 =================

/**
 * 获取某 sid 对应的 events.jsonl 文件路径
 */
function eventsPath(sid) {
  return path.join(ROOT, '.agents', 'state', 'sessions', sid, 'events.jsonl');
}

/**
 * 确保目标目录存在
 */
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 解析 CLI 参数，返回 { cmd, args: { key: val } }
 */
function parseArgs(argv) {
  const args = {};
  let cmd = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (cmd === null && !a.startsWith('--') && !a.startsWith('-')) {
      cmd = a;
      continue;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = val;
        i++;
      }
    }
  }
  return { cmd, args };
}

/**
 * 打印帮助
 */
function usage() {
  console.error(`用法:
  node scripts/event.mjs append   --type <kind> --subject <s> --sid <sid> [--detail <t>] [--payload <json>]
  node scripts/event.mjs list     --sid <sid> [--type <kind>] [--since <iso>] [--json]
  node scripts/event.mjs replay   --sid <sid>
  node scripts/event.mjs validate --sid <sid>

支持的 type (kind): ${KINDS.join(', ')}
`);
}

/**
 * 打印完整帮助（help 子命令 / --help），输出到 stdout 并 exit 0
 */
function cmdHelp() {
  console.log(`用法:
  node scripts/event.mjs <子命令> [参数]

子命令:
  node scripts/event.mjs append   --type <kind> --subject <s> --sid <sid> [--detail <t>] [--payload <json>]
  node scripts/event.mjs list     --sid <sid> [--type <kind>] [--since <iso>] [--json]
  node scripts/event.mjs replay   --sid <sid>
  node scripts/event.mjs validate --sid <sid>
  node scripts/event.mjs help

事件 kind 枚举（${KINDS.length} 种）:
${KINDS.map((k) => `  ${k}`).join('\n')}

Windows PowerShell 提示:
  在 PowerShell 下 --detail / --payload 含中文或引号时，建议用单引号包裹整个 JSON，
  避免双引号被 PowerShell 转义破坏。示例:
  node scripts/event.mjs append --type decision.made --subject test --sid x --detail '{"k":"v"}'
`);
  process.exit(0);
}

/**
 * 打印本地化时间（保留 ms）
 */
function formatLocalTs(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }) + `.${String(d.getMilliseconds()).padStart(3, '0')}Z`;
  } catch {
    return ts;
  }
}

// ================= append =================

function cmdAppend(args) {
  const kind = args.type;
  const sid = args.sid;
  const subject = args.subject || '';
  const detail = args.detail || '';
  const payloadRaw = args.payload;

  // 1. 校验 kind
  if (!KIND_SET.has(kind)) {
    console.error(`[错误] 无效的 type "${kind}"，支持的枚举: ${KINDS.join(', ')}`);
    process.exit(2);
  }

  // 2. 校验 payload JSON
  let payload = {};
  if (payloadRaw) {
    try {
      payload = JSON.parse(payloadRaw);
    } catch (e) {
      console.error(`[错误] --payload 不是合法 JSON: ${e.message}`);
      process.exit(2);
    }
  }

  // 3. 生成事件行（字段顺序固定）
  const event = {
    eventId: crypto.randomUUID(),
    ts: new Date().toISOString(),
    sid,
    type: kind,
    subject,
    detail,
    payload,
  };
  const line = JSON.stringify(event);

  // 4. 原子追加（best-effort）
  const fp = eventsPath(sid);
  try {
    ensureDir(fp);
    fs.appendFileSync(fp, line + '\n');
  } catch (e) {
    console.error(`[警告] 事件追加失败（best-effort，不阻断主流程）: ${e.message}`);
    // 仍打印事件行，但告知写入失败
    console.error(`[警告] 未能写入: ${fp}`);
    console.error(line);
    process.exit(0);
  }

  // 5. 成功打印
  console.log(line);
  process.exit(0);
}

// ================= list =================

function cmdList(args) {
  const sid = args.sid;
  const filterType = args.type || null;
  const since = args.since || null;
  const jsonOutput = args['json'] === true;

  const fp = eventsPath(sid);
  if (!fs.existsSync(fp)) {
    console.error(`[错误] 事件文件不存在: ${fp}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fp, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  let good = 0;
  let bad = 0;
  const results = [];
  const badReport = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch (e) {
      bad++;
      badReport.push({ line: lineNo, reason: `JSON 解析失败: ${e.message}` });
      continue;
    }
    good++;

    // 过滤 --type
    if (filterType && obj.type !== filterType) continue;
    // 过滤 --since
    if (since && obj.ts < since) continue;

    results.push(obj);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`=== 会话 ${sid} 事件列表 (${results.length} 条) ===`);
    if (results.length === 0) {
      console.log('（无匹配事件）');
    } else {
      for (const ev of results) {
        const tsLocal = formatLocalTs(ev.ts);
        const detail = (ev.detail || '').toString().slice(0, 80);
        console.log(`  [${tsLocal}] ${ev.type.padEnd(22)} subject=${ev.subject}  detail=${detail}`);
      }
    }
  }

  if (bad > 0) {
    console.log(`\n(跳过 ${bad} 行坏数据)`);
  }
  process.exit(0);
}

// ================= replay =================

function cmdReplay(args) {
  const sid = args.sid;
  const fp = eventsPath(sid);
  if (!fs.existsSync(fp)) {
    console.error(`[错误] 事件文件不存在: ${fp}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fp, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  const events = [];
  const badReport = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch (e) {
      badReport.push({ line: lineNo, reason: `JSON 解析失败: ${e.message}` });
      continue;
    }
    events.push(obj);
  }

  // 按 (ts, eventId) 排序
  events.sort((a, b) => {
    const tc = a.ts.localeCompare(b.ts);
    if (tc !== 0) return tc;
    return (a.eventId || '').localeCompare(b.eventId || '');
  });

  console.log(`=== 会话 ${sid} 决策链回放 (${events.length} 条) ===`);
  for (const ev of events) {
    const tsLocal = formatLocalTs(ev.ts);
    const detail = ev.detail ? ` detail=${(ev.detail).toString().slice(0, 80)}` : '';
    const payload = JSON.stringify(ev.payload);
    console.log(`  [${tsLocal}] ${ev.type.padEnd(22)} eventId=${ev.eventId} subject=${ev.subject}${detail} payload=${payload}`);
  }

  if (badReport.length > 0) {
    console.log(`\n(跳过 ${badReport.length} 行坏数据)`);
  }

  // 统计：按 type 分组计数
  const counts = {};
  for (const ev of events) {
    const t = ev.type || '(未知)';
    counts[t] = (counts[t] || 0) + 1;
  }
  console.log('\n--- 按 type 统计 ---');
  console.log(`事件总数: ${events.length}`);
  for (const k of Object.keys(counts).sort()) {
    console.log(`  ${k}: ${counts[k]}`);
  }
  process.exit(0);
}

// ================= validate =================

function cmdValidate(args) {
  const sid = args.sid;
  const fp = eventsPath(sid);
  if (!fs.existsSync(fp)) {
    console.error(`[错误] 事件文件不存在: ${fp}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fp, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  let good = 0;
  let bad = 0;
  const badReport = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch (e) {
      bad++;
      badReport.push({ line: lineNo, reason: `JSON 解析失败: ${e.message}` });
      continue;
    }
    // 校验必填字段
    const missing = REQUIRED_FIELDS.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
    if (missing.length > 0) {
      bad++;
      badReport.push({ line: lineNo, reason: `缺少必填字段: ${missing.join(', ')}` });
      continue;
    }
    // 校验 type 在枚举内
    if (!KIND_SET.has(obj.type)) {
      bad++;
      badReport.push({ line: lineNo, reason: `type "${obj.type}" 不在允许的枚举内` });
      continue;
    }
    good++;
  }

  console.log(`=== 事件文件校验报告 (${sid}) ===`);
  console.log(`  合法行: ${good}`);
  console.log(`  坏行数: ${bad}`);

  if (bad > 0) {
    console.log('\n坏行详情:');
    for (const r of badReport) {
      console.log(`  第 ${r.line} 行: ${r.reason}`);
    }
    process.exit(1);
  }

  console.log('\n校验通过。');
  process.exit(0);
}

// ================= 入口 =================

const { cmd, args } = parseArgs(process.argv.slice(2));

// help 子命令 与 --help flag 均走完整帮助，exit 0
if (cmd === 'help' || (!cmd && args.help)) {
  cmdHelp();
}

if (!cmd) {
  usage();
  process.exit(2);
}

switch (cmd) {
  case 'help':
    cmdHelp();
    break;
  case 'append':
    cmdAppend(args);
    break;
  case 'list':
    cmdList(args);
    break;
  case 'replay':
    cmdReplay(args);
    break;
  case 'validate':
    cmdValidate(args);
    break;
  default:
    console.error(`[错误] 未知子命令 "${cmd}"`);
    usage();
    process.exit(2);
}
