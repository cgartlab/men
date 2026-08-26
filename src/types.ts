/**
 * opencode-men — 公共类型定义
 */

/** Agent 运行模式 */
export type AgentMode = "primary" | "subagent";

/** Agent 定义（从 .md frontmatter + body 迁移） */
export interface AgentDef {
  id: string;
  name: string;
  description: string;
  mode: AgentMode;
  model?: string;
  prompt: string;
}

/** 命令定义 */
export interface CommandDef {
  name: string;
  description: string;
  agent: string;
  prompt: string;
}

/** 技能定义 */
export interface SkillDef {
  id: string;
  name: string;
  description: string;
  path: string;
}

/** 意图类型 */
export type IntentType = "search" | "analyze" | "team" | "hyperplan" | "unknown";

/** 意图门判定结果 */
export interface TriageResult {
  intent: IntentType;
  confidence: number;
  agents: string[];
  needsJudge: boolean;
}

/** 验证结果 */
export interface VerifyResult {
  pass: boolean;
  checks: CheckResult[];
  timestamp: string;
}

/** 单项检查结果 */
export interface CheckResult {
  name: string;
  pass: boolean;
  message: string;
}

/** 事件类型 */
export type EventKind =
  | "session.created"
  | "session.ended"
  | "boundary"
  | "workflow.phase"
  | "gate.passed"
  | "gate.failed"
  | "blocker.raised"
  | "decision.made"
  | "decision.missing"
  | "verify"
  | "judge"
  | "error"
  | "dispatch"
  | "handoff";

/** 事件记录 */
export interface EventRecord {
  ts: string;
  sid: string;
  type: EventKind;
  subject: string;
  detail: string;
  payload?: Record<string, unknown>;
}

/** men 配置 */
export interface MenConfig {
  preset?: string;
  agents?: Record<string, { model?: string }>;
  verification?: { enabled: boolean };
  learning?: { enabled: boolean; autoApply: boolean };
}
