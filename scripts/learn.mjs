/*
 * learn.mjs — 学习循环主入口（L0 机械聚合 + L1 规则分类）
 *
 * 从 events.jsonl 中提取经验，通过 learn-rules 分类，
 * 将结果写入 errors/、knowledge/patterns/ 或标记 human-gate。
 *
 * 触发条件：chi judge 完成（PASS/FAIL）后由 men 调用。
 * 所有学习操作 best-effort，不阻塞主流程。
 *
 * CLI:
 *   learn [--sid <session-id>] [--dry-run] [--json]
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { classify } from './learn-rules.mjs';
import { main as budgetMain } from './learn-budget.mjs';

const EVENTS_DIR = '.agents/state/sessions';
const ERRORS_DIR = 'errors';
const PATTERNS_DIR = 'knowledge/patterns';
const QUEUE_FILE = '.agents/state/learn/queue.json';

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/** 读取会话的 events.jsonl */
function readEvents(sid) {
  const file = `${EVENTS_DIR}/${sid}/events.jsonl`;
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return events;
}

/** 写事件到 events.jsonl（best-effort，event.mjs 标准格式） */
function appendEvent(sid, event) {
  const file = `${EVENTS_DIR}/${sid}/events.jsonl`;
  ensureDir(`${EVENTS_DIR}/${sid}`);
  try {
    const fullEvent = {
      eventId: crypto.randomUUID(),
      ts: new Date().toISOString(),
      sid,
      type: event.type || event.kind || 'decision',
      subject: event.subject || '',
      detail: event.detail || '',
      payload: event.payload || {},
    };
    fs.appendFileSync(file, JSON.stringify(fullEvent) + '\n');
  } catch { /* best-effort, silent */ }
}

/** 写入 errors/ lesson（type-B） */
function writeError(action, sid) {
  ensureDir(ERRORS_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `error-${ts}`;
  const content = `---\nid: ${id}\nagent: ${action.agent || 'unknown'}\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n\n## 错误\n\n${action.lesson || 'runtime-error'}\n\n## 详情\n\n${String(action.detail || '')}\n\n## 来源\n\nsid: ${sid}\n`;
  const file = `${ERRORS_DIR}/${id}.md`;
  fs.writeFileSync(file, content, 'utf8');
  return { ok: true, file, id };
}

/** 写入 knowledge/patterns/ 模式（type-C 非 gate） */
function writePattern(action, sid) {
  ensureDir(PATTERNS_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `pattern-${ts}`;
  const content = `---\nid: ${id}\ntype: ${action.pattern || 'anti-pattern'}\ncreated: ${new Date().toISOString().slice(0, 10)}\nstatus: active\n---\n\n## 模式\n\n${String(action.detail || '')}\n\n## 来源\n\nsid: ${sid}\n`;
  const file = `${PATTERNS_DIR}/${id}.md`;
  fs.writeFileSync(file, content, 'utf8');
  return { ok: true, file, id };
}

/** 标记 human-gate 待确认 */
function queueGate(action, sid) {
  ensureDir('.agents/state/learn');
  let queue = [];
  if (fs.existsSync(QUEUE_FILE)) {
    try { queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch { queue = []; }
  }
  queue.push({
    id: `gate-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    type: 'human-gate',
    reason: action.gate || 'collaboration-conflict',
    detail: String(action.detail || ''),
    sid,
    status: 'pending',
    created: new Date().toISOString()
  });
  const tmp = QUEUE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(queue, null, 2));
  fs.renameSync(tmp, QUEUE_FILE);
  return { ok: true, queued: true, pending: queue.length };
}

function usage() {
  return `learn — 学习循环主入口

用法:
  learn [--sid <session-id>] [--dry-run] [--json]

选项:
  --sid      会话 ID，从对应 events.jsonl 读取
  --dry-run  预览学习结果但不写入文件
  --json     输出 JSON
  --help     显示此帮助

流程:
  1. 读取 events.jsonl（最近 1 次任务）
  2. 通过 learn-rules 分类（A/B/C/BLOCKED）
  3. 按分类执行：errors/ / patterns/ / human-gate / skip
  4. 所有操作 best-effort，不阻塞主流程
`;
}

export function main(argv) {
  const args = argv || [];
  if (args.includes('--help') || args.includes('-h')) return usage();

  const sidIdx = args.indexOf('--sid');
  const sid = sidIdx >= 0 ? args[sidIdx + 1] : 'unknown';
  const dryRun = args.includes('--dry-run');
  const jsonOut = args.includes('--json');

  // Step 1: 读取事件
  const events = readEvents(sid);

  // Step 2: 分类
  const result = classify(events);

  // Step 3: 执行
  const actions = [];
  for (const action of result.actions) {
    if (dryRun) {
      actions.push({ ...action, executed: false });
      continue;
    }
    let outcome;
    switch (action.type) {
      case 'A': // skill description — 标记待处理（P1 实现 skill-evolve）
        actions.push({ ...action, executed: true, note: 'deferred to skill-evolve (P1)' });
        break;
      case 'B':
        outcome = writeError(action, sid);
        actions.push({ ...action, executed: true, ...outcome });
        break;
      case 'C':
        if (action.target === 'human-gate') {
          outcome = queueGate(action, sid);
          actions.push({ ...action, executed: true, ...outcome });
        } else {
          outcome = writePattern(action, sid);
          actions.push({ ...action, executed: true, ...outcome });
        }
        break;
      case 'blocked':
        actions.push({ ...action, executed: true, note: 'BLOCKED recorded' });
        break;
      default:
        actions.push({ ...action, executed: false });
    }
  }

  // 记录决策事件
  appendEvent(sid, {
    type: 'decision',
    subject: `learn.${result.type === 'skip' ? 'skipped' : 'extracted'}`,
    detail: JSON.stringify({ type: result.type, actions: actions.length, dryRun }),
  });

  const output = {
    ok: true,
    sid,
    dryRun,
    type: result.type,
    reason: result.reason,
    actions,
    eventsRead: events.length
  };

  return JSON.stringify(output, null, 2);
}

if (process.argv[1] && process.argv[1].endsWith('learn.mjs')) {
  console.log(main(process.argv.slice(2)));
}
