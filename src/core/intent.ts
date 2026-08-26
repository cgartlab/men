/**
 * opencode-men — 意图识别核心
 *
 * 纯逻辑模块：关键词表 + 意图匹配，零副作用。
 * 所有副作用（网络、进程、文件）由调用方注入。
 */

import type { IntentType } from "../types.js";

/** 意图-关键词映射条目 */
export interface IntentKeywordEntry {
  intent: IntentType;
  keywords: string[];
}

/** 意图关键词表（每个意图 ≥3 条） */
export const INTENT_KEYWORD_TABLE: IntentKeywordEntry[] = [
  {
    intent: "search",
    keywords: ["查信息", "查资料", "查新闻", "搜索", "调研", "事实核查", "资料", "新闻"],
  },
  {
    intent: "analyze",
    keywords: ["分析", "评估", "诊断", "验证", "评审", "判断", "质量"],
  },
  {
    intent: "team",
    keywords: ["综合", "跨领域", "协作", "多路", "混合", "团队"],
  },
  {
    intent: "hyperplan",
    keywords: ["规划项目", "长期路线", "立项", "从零规划", "大任务", "路线图"],
  },
];

/**
 * 匹配任务文本，返回命中数最高的意图与命中数。
 * - 小写匹配（对英文大小写不敏感）
 * - 统计每个意图命中的关键词数，取命中数最高者
 * - 若最高命中数为 0 → 返回 null
 * - score = 命中数
 */
export function matchIntent(task: string): { intent: IntentType; score: number } | null {
  const lowered = task.toLowerCase();
  let best: { intent: IntentType; score: number } | null = null;

  for (const entry of INTENT_KEYWORD_TABLE) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (lowered.includes(keyword)) {
        score += 1;
      }
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = { intent: entry.intent, score };
    }
  }

  return best;
}

/** 返回指定意图的关键词数组（未知意图返回空数组） */
export function getIntentKeywords(intent: IntentType): string[] {
  const entry = INTENT_KEYWORD_TABLE.find((e) => e.intent === intent);
  return entry ? entry.keywords : [];
}
