/*
 * learn-rules.mjs — 学习规则判定表（L1 机械，纯函数，零依赖）
 *
 * classify(events): 将 events.jsonl 中的失败事件归入 4 类：
 *   A — 技能触发不匹配（自动微调 skill description）
 *   B — 产出问题（写入 errors/）
 *   C — 协作/结构问题（标记 human-gate）
 *   BLOCKED — 连续同一失败（gate exhausted）
 *
 * 零 LLM 参与，纯文件系统。输出可审计。
 */

/**
 * 判断事件是否包含某个关键字（不区分大小写）
 */
function hasKeyword(detail, keyword) {
  if (!detail) return false;
  const lower = String(detail).toLowerCase();
  return lower.includes(keyword.toLowerCase());
}

/**
 * 从 verify 事件的 detail JSON 中提取 outcome
 */
function parseVerifyOutcome(detail) {
  if (!detail) return null;
  try {
    const j = typeof detail === 'string' ? JSON.parse(detail) : detail;
    return j.outcome || j.result || j.status || null;
  } catch {
    return null;
  }
}

/**
 * 规则判定表
 * 返回值：{ type, actions: [{type, target, detail}], reason }
 */
export function classify(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { type: 'skip', actions: [], reason: 'no events' };
  }

  // ── 1. 连续失败检测（BLOCKED）─────────────────────────
  const verifyEvents = events.filter(e => e.kind === 'verify');
  if (verifyEvents.length >= 3) {
    const lastThree = verifyEvents.slice(-3);
    const outcomes = lastThree.map(e => parseVerifyOutcome(e.detail));
    const agents = lastThree.map(e => {
      try {
        const j = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
        return j.agent || e.subject;
      } catch { return e.subject; }
    });
    const allFail = outcomes.every(o => o === 'FAIL');
    const sameAgent = agents.length === 3 && agents[0] === agents[1] && agents[1] === agents[2];
    if (allFail && sameAgent) {
      return {
        type: 'BLOCKED',
        actions: [{ type: 'blocked', agent: agents[0], count: verifyEvents.length }],
        reason: `${agents[0]} consecutive FAIL (${verifyEvents.length} attempts)`
      };
    }
  }

  // ── 2. 分类规则 ──────────────────────────────────────
  const actions = [];

  for (const ev of events) {
    const detail = String(ev.detail || '');
    const kind = ev.kind || '';
    const subject = ev.subject || '';

    // Rule A: 技能触发不匹配
    // 信号：judge 报告中提到 "skill" + "not triggered" / "wrong skill" / "should use"
    if (kind === 'judge' || kind === 'verify') {
      if (hasKeyword(detail, 'skill') && (
        hasKeyword(detail, 'not triggered') ||
        hasKeyword(detail, 'wrong skill') ||
        hasKeyword(detail, 'should use') ||
        hasKeyword(detail, '未触发') ||
        hasKeyword(detail, '错误 skill')
      )) {
        actions.push({ type: 'A', target: 'skill-description', detail: ev.detail });
        continue;
      }
    }

    // Rule B1: 文件缺少 → errors/ lesson
    if (kind === 'verify' && (
      hasKeyword(detail, 'file not found') ||
      hasKeyword(detail, 'missing file') ||
      hasKeyword(detail, 'output missing') ||
      hasKeyword(detail, '文件缺失') ||
      hasKeyword(detail, '未生成')
    )) {
      actions.push({ type: 'B', target: 'errors', lesson: 'output-missing', detail });
      continue;
    }

    // Rule B2: 密钥泄露 → errors/ + block
    if (kind === 'verify' && (
      hasKeyword(detail, 'secret') ||
      hasKeyword(detail, 'api key') ||
      hasKeyword(detail, 'token leak') ||
      hasKeyword(detail, '密钥泄露')
    )) {
      actions.push({ type: 'B', target: 'errors', lesson: 'secret-leak', detail });
      continue;
    }

    // Rule B3: 一般错误事件 → errors/ lesson
    if (kind === 'error') {
      actions.push({ type: 'B', target: 'errors', lesson: 'runtime-error', detail });
      continue;
    }

    // Rule C1: 代码逻辑错误 → patterns/
    if ((kind === 'judge' || kind === 'verify') && (
      hasKeyword(detail, 'logic') ||
      hasKeyword(detail, 'incorrect implementation') ||
      hasKeyword(detail, '未按 plan') ||
      hasKeyword(detail, '逻辑错误')
    )) {
      actions.push({ type: 'C', target: 'patterns', pattern: 'code-logic', detail });
      continue;
    }

    // Rule C2: 协作冲突 → human-gate
    if ((kind === 'judge' || kind === 'handoff') && (
      hasKeyword(detail, 'conflict') ||
      hasKeyword(detail, 'collision') ||
      hasKeyword(detail, '冲突') ||
      hasKeyword(detail, '不兼容')
    )) {
      actions.push({ type: 'C', target: 'human-gate', gate: 'collaboration-conflict', detail });
      continue;
    }
  }

  if (actions.length === 0) {
    return { type: 'skip', actions: [], reason: 'no matching rules' };
  }

  // 如果有 human-gate 项，整体标记为 C
  const hasGate = actions.some(a => a.target === 'human-gate');
  const type = hasGate ? 'C' : (actions[0].type);

  return { type, actions, reason: `${actions.length} action(s) classified` };
}
