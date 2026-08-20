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

const STATE_DIR = '.agents/state/learn';
const BUDGET_FILE = `${STATE_DIR}/budget.json`;
const MAX_DAILY_LLM = 3;
const MAX_DAILY_EVENTS = 100;

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(BUDGET_FILE)) return defaultBudget();
  try {
    const raw = fs.readFileSync(BUDGET_FILE, 'utf8');
    return JSON.parse(raw);
  } catch { return defaultBudget(); }
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
function check() {
  const b = load();
  if (!isSameDay(b.date)) return { ok: true, reason: 'new day, budget reset' };
  if (b.dailyLlmCalls >= MAX_DAILY_LLM) {
    return { ok: false, reason: `daily LLM limit reached (${b.dailyLlmCalls}/${MAX_DAILY_LLM})` };
  }
  return { ok: true, reason: 'within budget' };
}

/** 消耗一次 L2 预算 */
function consume() {
  const b = load();
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

/** 显示当前预算状态 */
function status() {
  const b = load();
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

/** 重置当日预算（手动） */
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

if (process.argv[1] && process.argv[1].endsWith('learn-budget.mjs')) {
  console.log(main(process.argv.slice(2)));
}
