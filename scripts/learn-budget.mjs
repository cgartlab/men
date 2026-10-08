/*
 * learn-budget.mjs — 学习成本控制（L0 机械，零 LLM）
 *
 * 保护 L2 LLM 调用不成为 token 黑洞。
 * 规则：L2 ≤ 3 次/日，距上次 L2 ≥ 10 次任务，每日事件 ≤ 100 条
 *
 * CLI:
 *   learn-budget check     — 检查是否允许 L2 调用
 *   learn-budget consume   — 消耗一次 L2 预算
 *   learn-budget status    — 显示当前预算
 *   learn-budget reset     — 重置当日预算（手动）
 *
 * 零第三方依赖，纯文件系统。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 与 event.mjs / gate.mjs / learn.mjs / eval-metrics.mjs 同一基准：按脚本所在
// 项目解析。此前相对 cwd，cd 到别处即另建一份 .agents/state/learn，
// 当日预算因而被拆成多份、各自独立计数。
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(PROJECT_ROOT, '.agents', 'state', 'learn');
const BUDGET_FILE = path.join(STATE_DIR, 'budget.json');
const MAX_DAILY_LLM = 3;
const MAX_DAILY_EVENTS = 100;

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

// F21：fail-closed 加载——预算文件存在但损坏（语法错 / 形状不符）时
// 不再静默当成「新一天」重开预算（旧行为：b.date undefined → isSameDay 恒 false
// → check 返回 'new day, budget reset'，当日上限被绕开）。
// 返回 { state, corrupt }：corrupt=true 时 check/consume 拒绝执行，
// status 如实报告，由人工 `learn-budget reset` 自愈。
function loadState() {
  ensureDir();
  if (!fs.existsSync(BUDGET_FILE)) return { state: defaultBudget(), corrupt: false };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  } catch {
    return { state: defaultBudget(), corrupt: true };
  }
  const valid =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
    typeof parsed.date === 'string' && Number.isFinite(parsed.dailyLlmCalls);
  if (!valid) return { state: defaultBudget(), corrupt: true };
  return { state: parsed, corrupt: false };
}

function save(b) {
  ensureDir();
  const tmp = BUDGET_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(b, null, 2));
  fs.renameSync(tmp, BUDGET_FILE);
}

function defaultBudget() {
  return {
    date: new Date().toISOString().slice(0, 10),
    dailyLlmCalls: 0,
    dailyEvents: 0,
    lastLlmCall: null,
    lastTaskCount: 0
  };
}

function isSameDay(d) {
  const today = new Date().toISOString().slice(0, 10);
  return d === today;
}

/** 检查是否允许 L2 调用 */
/** 检查是否允许 L2 调用（预算文件损坏时 fail-closed 拒绝） */
function check() {
  const { state: b, corrupt } = loadState();
  if (corrupt) {
    return { ok: false, reason: 'budget state corrupt — run learn-budget reset to heal' };
  }
  if (!isSameDay(b.date)) return { ok: true, reason: 'new day, budget reset' };
  if (b.dailyLlmCalls >= MAX_DAILY_LLM) {
    return { ok: false, reason: `daily LLM limit reached (${b.dailyLlmCalls}/${MAX_DAILY_LLM})` };
  }
  return { ok: true, reason: 'within budget' };
}

/** 消耗一次 L2 预算（预算文件损坏时拒绝消耗，不隐式重置） */
function consume() {
  const { state: b, corrupt } = loadState();
  if (corrupt) {
    return { ok: false, reason: 'budget state corrupt — run learn-budget reset to heal' };
  }
  if (!isSameDay(b.date)) {
    b.date = new Date().toISOString().slice(0, 10);
    b.dailyLlmCalls = 0;
    b.dailyEvents = 0;
  }
  b.dailyLlmCalls++;
  b.lastLlmCall = new Date().toISOString();
  b.lastTaskCount = (b.lastTaskCount || 0) + 1;
  save(b);
  return { ok: true, dailyLlmCalls: b.dailyLlmCalls, limit: MAX_DAILY_LLM };
}

/** 显示当前预算状态（损坏时如实报告） */
function status() {
  const { state: b, corrupt } = loadState();
  if (corrupt) {
    return { ok: false, corrupt: true, error: 'budget state corrupt — run learn-budget reset to heal' };
  }
  return {
    ok: true,
    date: b.date,
    dailyLlmCalls: b.dailyLlmCalls,
    dailyEvents: b.dailyEvents,
    limit: MAX_DAILY_LLM,
    remaining: Math.max(0, MAX_DAILY_LLM - b.dailyLlmCalls),
    lastLlmCall: b.lastLlmCall || null
  };
}

function reset() {
  const b = defaultBudget();
  save(b);
  return { ok: true, message: 'budget reset' };
}

function usage() {
  return `learn-budget — L2 学习预算控制

用法:
  learn-budget check       检查是否允许 L2 调用
  learn-budget consume     消耗一次 L2 预算
  learn-budget status      显示当前预算
  learn-budget reset       重置当日预算

预算规则:
  - L2 LLM 调用 ≤ ${MAX_DAILY_LLM} 次/日
  - 超出后标记 learn.budget-exceeded，跳过本轮
`;
}

export function main(argv) {
  const args = argv || [];
  if (args.includes('--help') || args.includes('-h')) return usage();

  const cmd = args[0] || 'status';
  switch (cmd) {
    case 'check': return JSON.stringify(check(), null, 2);
    case 'consume': return JSON.stringify(consume(), null, 2);
    case 'status': return JSON.stringify(status(), null, 2);
    case 'reset': return JSON.stringify(reset(), null, 2);
    default: return usage();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(main(process.argv.slice(2)));
}
