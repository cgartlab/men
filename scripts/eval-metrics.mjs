/*
 * eval-metrics.mjs — 团队评估指标计算（L0 机械，零 LLM）
 *
 * 从 events.jsonl 计算 8 项 KPI，每 10 次任务窗口。
 * 所有指标纯机械计算，不涉及 LLM。
 *
 * CLI:
 *   eval-metrics [--sid <session-id>] [--window <n>] [--json]
 *
 * 导出数据:
 *   computeMetrics(events) — 核心计算函数
 *   main(argv) — CLI 入口
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const EVENTS_DIR = '.agents/state/sessions';

/**
 * 解析 verify/judge 事件的 outcome
 */
function parseOutcome(ev) {
  if (!ev.detail) return 'unknown';
  try {
    const j = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail;
    // 检查 payload.passed/failed（gate.passed/gate.failed 格式）
    if (j.payload && typeof j.payload.passed === 'number' && typeof j.payload.failed === 'number') {
      if (j.payload.failed > 0) return 'FAIL';
      if (j.payload.passed > 0) return 'PASS';
    }
    // 检查 checks 数组中的 PASS/FAIL（verify.mjs 格式）
    if (Array.isArray(j.checks)) {
      const hasFail = j.checks.some(c => c.status === 'FAIL');
      const hasPass = j.checks.some(c => c.status === 'PASS');
      if (hasFail) return 'FAIL';
      if (hasPass) return 'PASS';
    }
    return j.outcome || j.result || j.status || 'unknown';
  } catch {
    // 纯文本 fallback：匹配 PASS/FAIL/REVISION_NEEDED/PARTIAL/通过/失败
    const raw = String(ev.detail).toLowerCase();
    if (raw.includes('revision_needed') || raw.includes('revision needed')) return 'REVISION_NEEDED';
    if (raw.includes('partial')) return 'PARTIAL';
    if (raw.includes('regressed')) return 'REGRESSED';
    if (raw.includes('blocked')) return 'BLOCKED';
    if (raw.includes('fail')) return 'FAIL';
    if (raw.includes('pass') || raw.includes('通过')) return 'PASS';
    return 'unknown';
  }
}

/** 兼容读取事件类型：优先检查 subject 中的 men.* 前缀，再回退到 event/type/kind */
function eventType(e) {
  const subject = e.subject || '';
  const raw = e.event || e.type || e.kind || '';
  const typeMap = {
    'men.verdict-received': 'judge',
    'men.gate-passed': 'gate.passed',
    'men.gate-failed': 'gate.failed',
    'men.report-delivered': 'verify',
    'men.task-dispatched': 'dispatch',
    'men.session-started': 'session.created',
    'men.intent-classified': 'decision.made',
    'men.plan-received': 'workflow.phase',
    'men.collect-wave1': 'workflow.phase',
    'men.collect-wave': 'workflow.phase',
    'men.session-ended': 'session.ended',
    'men.blocker-raised': 'blocker.raised',
    'men.report': 'verify',
  };
  // 优先：subject 中的 men.* 前缀
  if (subject && subject.startsWith('men.')) {
    return typeMap[subject] || subject;
  }
  // 回退：event/type/kind 中的 men.* 前缀
  if (raw && raw.startsWith('men.')) {
    return typeMap[raw] || raw;
  }
  // 标准类型直接返回
  return raw;
}

/**
 * 计算 8 项 KPI
 * @param {Array} events — events.jsonl 中的事件数组
 * @param {Object} opts — { windowSize: 10 }
 */
export function computeMetrics(events, opts = {}) {
  const window = opts.windowSize || 10;
  const recent = Array.isArray(events) ? events.slice(-window) : [];

  // 提取 verify/judge 事件
  const judgeEvents = recent.filter(e => {
    const t = eventType(e);
    return t === 'judge' || t === 'verify' || t === 'gate.passed' || t === 'gate.failed';
  });
  const errorEvents = recent.filter(e => eventType(e) === 'error');
  const dispatchEvents = recent.filter(e => eventType(e) === 'dispatch');

  const total = judgeEvents.length;
  const pass = judgeEvents.filter(e => parseOutcome(e) === 'PASS').length;
  const fail = judgeEvents.filter(e => parseOutcome(e) === 'FAIL').length;
  const regressed = judgeEvents.filter(e => parseOutcome(e) === 'REGRESSED').length;
  const firstPass = judgeEvents.filter(e => {
    try {
      const j = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      return j.attempt === 1 && parseOutcome(e) === 'PASS';
    } catch { return false; }
  }).length;

  // 计算重试次数：totalJudge - firstAttempt
  const attempts = judgeEvents.map(e => {
    try {
      const j = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      return j.attempt || 1;
    } catch { return 1; }
  });
  const totalRetries = attempts.reduce((s, a) => s + Math.max(0, a - 1), 0);

  // 技能使用分布
  const skillUsage = {};
  dispatchEvents.forEach(e => {
    const skill = e.subject || 'unknown';
    skillUsage[skill] = (skillUsage[skill] || 0) + 1;
  });

  // 错误重复率
  const errorTypes = errorEvents.map(e => e.subject || 'unknown');
  const errorTypeCounts = {};
  errorTypes.forEach(t => { errorTypeCounts[t] = (errorTypeCounts[t] || 0) + 1; });
  const repeatedErrors = Object.values(errorTypeCounts).filter(c => c > 1).length;
  const errorRepeatRate = errorTypes.length > 0 ? repeatedErrors / Object.keys(errorTypeCounts).length : 0;

  // 知识沉淀（从 dispatch 事件估算）
  const knowledgeEvents = recent.filter(e => eventType(e) === 'decision' || eventType(e) === 'handoff');

  // 学习效率（学习相关事件占比）
  const learnEvents = recent.filter(e => {
    const s = e.subject || '';
    return s.includes('learn') || s.includes('pattern') || s.includes('skill');
  });
  const learnEfficiency = recent.length > 0 ? learnEvents.length / recent.length : 0;

  return {
    'KPI-task-completion': {
      label: '任务完成率',
      value: total > 0 ? Math.round(pass / total * 100) / 100 : 0,
      display: `${Math.round(pass / Math.max(total, 1) * 100)}%`,
      pass,
      total
    },
    'KPI-first-pass': {
      label: '一次通过率',
      value: total > 0 ? Math.round(firstPass / total * 100) / 100 : 0,
      display: `${Math.round(firstPass / Math.max(total, 1) * 100)}%`,
      firstPass,
      total
    },
    'KPI-regression': {
      label: '回归率',
      value: total > 0 ? Math.round(regressed / total * 100) / 100 : 0,
      display: `${Math.round(regressed / Math.max(total, 1) * 100)}%`,
      regressed,
      total
    },
    'KPI-avg-retries': {
      label: '平均重试次数',
      value: total > 0 ? Math.round(totalRetries / total * 100) / 100 : 0,
      display: total > 0 ? (totalRetries / total).toFixed(2) : '0.00',
      totalRetries,
      total
    },
    'KPI-skill-usage': {
      label: '技能使用率',
      value: Object.keys(skillUsage).length,
      display: JSON.stringify(skillUsage),
      distribution: skillUsage
    },
    'KPI-knowledge': {
      label: '知识沉淀率',
      value: knowledgeEvents.length,
      display: `${knowledgeEvents.length} 条`,
      count: knowledgeEvents.length
    },
    'KPI-error-repeat': {
      label: '错误重复率',
      value: errorRepeatRate,
      display: `${Math.round(errorRepeatRate * 100)}%`,
      repeated: repeatedErrors,
      totalTypes: Object.keys(errorTypeCounts).length
    },
    'KPI-learn-efficiency': {
      label: '学习效率',
      value: learnEfficiency,
      display: `${Math.round(learnEfficiency * 100)}%`,
      learnEvents: learnEvents.length,
      totalEvents: recent.length
    }
  };
}

function usage() {
  return `eval-metrics — 团队评估指标计算

用法:
  eval-metrics [--sid <session-id>] [--window <n>] [--json]

选项:
  --sid     会话 ID，从对应 events.jsonl 读取
  --window  滑动窗口大小（默认 10）
  --json    输出 JSON

指标:
  8 项 KPI: 任务完成率 / 一次通过率 / 回归率 / 平均重试 / 技能使用 / 知识沉淀 / 错误重复 / 学习效率
`;
}

/** 读取会话的 events.jsonl */
function readEvents(sid) {
  const file = path.join(EVENTS_DIR, sid, 'events.jsonl');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return events;
}

export function main(argv) {
  const args = argv || [];
  if (args.includes('--help') || args.includes('-h')) return usage();

  const sidIdx = args.indexOf('--sid');
  const sid = sidIdx >= 0 ? args[sidIdx + 1] : null;
  const window = parseInt(args[args.indexOf('--window') + 1] || '10', 10);

  // 有 sid 时从 events.jsonl 读取，否则返回空 metrics（向后兼容）
  const events = sid ? readEvents(sid) : [];
  const metrics = computeMetrics(events, { windowSize: window });
  return JSON.stringify(metrics, null, 2);
}

if (process.argv[1] && process.argv[1].endsWith('eval-metrics.mjs')) {
  console.log(main(process.argv.slice(2)));
}
