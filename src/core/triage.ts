/**
 * opencode-men — 意图门（triage）核心
 *
 * 纯逻辑模块：基于关键词命中做意图判定、置信度计算与歧义检测，零副作用。
 *
 * 实现决策：置信度归一化分母取 2（CONFIDENCE_SCALE），使单关键词命中
 * （score=1）即达到 0.5 置信度阈值；若按 plan 建议的 score/3 归一，
 * 单命中仅 0.33 会被 CONFIDENCE_THRESHOLD 拦截，与验收断言冲突。
 */

import { INTENT_KEYWORD_TABLE, matchIntent } from "./intent.js";
import type { IntentType, TriageResult } from "../types.js";

/** 置信度阈值：低于此值视为意图不确定 */
export const CONFIDENCE_THRESHOLD = 0.5;
/** 歧义阈值：前两名命中差距比例小于此值视为歧义 */
export const AMBIGUITY_THRESHOLD = 0.2;
/** 置信度归一化分母：score=1 → confidence=0.5 */
const CONFIDENCE_SCALE = 2;

/** 意图路由表：agent 集合 + 是否需要独立评审 */
const ROUTES: Record<IntentType, { agents: string[]; needsJudge: boolean }> = {
  search: { agents: ["xun"], needsJudge: false },
  analyze: { agents: ["si", "chi"], needsJudge: true },
  team: { agents: ["si", "ji", "xun", "chi", "yi"], needsJudge: true },
  hyperplan: { agents: ["si"], needsJudge: false },
  unknown: { agents: [], needsJudge: false },
};

/** 统计任务文本命中某组关键词的数量 */
function countHits(task: string, keywords: string[]): number {
  const lowered = task.toLowerCase();
  let hits = 0;
  for (const keyword of keywords) {
    if (lowered.includes(keyword)) {
      hits += 1;
    }
  }
  return hits;
}

/** 计算最高意图之外的最大命中数（用于歧义检测） */
function maxOtherHits(task: string, topIntent: IntentType): number {
  let maxHits = 0;
  for (const entry of INTENT_KEYWORD_TABLE) {
    if (entry.intent === topIntent) {
      continue;
    }
    maxHits = Math.max(maxHits, countHits(task, entry.keywords));
  }
  return maxHits;
}

/** 空意图结果 */
function unknownResult(confidence: number): TriageResult {
  return { intent: "unknown", confidence, agents: [], needsJudge: false };
}

/**
 * 意图门判定。
 * - 无关键词命中 → unknown
 * - 前两名命中差距过小 → unknown（歧义）
 * - 置信度低于阈值 → unknown
 * - 否则返回命中意图及其 agent 路由
 */
export function triage(task: string): TriageResult {
  const matched = matchIntent(task);
  if (matched === null) {
    return unknownResult(0);
  }

  // 置信度：归一化到 [0,1]，单命中（score=1）= 0.5
  const confidence = Math.min(1, matched.score / CONFIDENCE_SCALE);

  // 歧义检测：存在第二名命中且与最高命中差距比例小于阈值
  const secondScore = maxOtherHits(task, matched.intent);
  const ambiguous =
    secondScore > 0 &&
    (matched.score - secondScore) / matched.score < AMBIGUITY_THRESHOLD;
  if (ambiguous) {
    return unknownResult(confidence);
  }

  if (confidence < CONFIDENCE_THRESHOLD) {
    return unknownResult(confidence);
  }

  const route = ROUTES[matched.intent];
  return {
    intent: matched.intent,
    confidence,
    agents: route.agents,
    needsJudge: route.needsJudge,
  };
}
