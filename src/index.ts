/**
 * opencode-men — 公共 API
 */

export { allAgents, getAgent } from "./agents/register.js";
export { allCommands, getCommand } from "./commands/register.js";
export type { AgentDef, CommandDef, SkillDef, IntentType, TriageResult } from "./types.js";
export { loadSkills, getSkillPrompt } from "./skills/index.js";
