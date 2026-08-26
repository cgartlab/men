/**
 * opencode-men — Agent 注册器
 *
 * 唯一 agent 定义源为 .opencode/agent/*.md（项目级 agent 定义）。
 * 此处动态读取 .md 的 YAML frontmatter（description/mode/model）+ body（prompt），
 * 避免硬编码 TS 对象与 .md 双源漂移。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDef } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/agents/register.js → 向上两级到项目根，再进 .opencode/agent/
// （源码形态 src/agents/ 同样向上两级命中项目根，路径在编译前后一致）
const AGENTS_DIR = join(__dirname, "..", "..", ".opencode", "agent");

/**
 * 解析单个 .md agent 定义：frontmatter（description/mode/model）+ body 作为 prompt
 */
function parseAgentMd(filePath: string): AgentDef | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return null;
    const fm = fmMatch[1];
    const body = raw.slice(fmMatch[0].length).trim();

    const descMatch = fm.match(/^description:\s*(.+)$/m);
    const modeMatch = fm.match(/^mode:\s*(.+)$/m);
    const modelMatch = fm.match(/^model:\s*(.+)$/m);

    const id = filePath.match(/([^/\\]+)\.md$/)?.[1] ?? "unknown";

    return {
      id,
      name: id,
      description: descMatch?.[1]?.trim() ?? "",
      mode: (modeMatch?.[1]?.trim() as "primary" | "subagent") ?? "subagent",
      model: modelMatch?.[1]?.trim(),
      prompt: body,
    };
  } catch {
    return null;
  }
}

/**
 * 扫描 .opencode/agent/ 加载所有 agent 定义
 */
function loadAgents(): AgentDef[] {
  if (!existsSync(AGENTS_DIR)) return [];
  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  const agents: AgentDef[] = [];
  for (const f of files) {
    const agent = parseAgentMd(join(AGENTS_DIR, f));
    if (agent) agents.push(agent);
  }
  // men 必须排第一（primary agent）
  const menIdx = agents.findIndex((a) => a.id === "men");
  if (menIdx > 0) {
    const [men] = agents.splice(menIdx, 1);
    agents.unshift(men);
  }
  return agents;
}

export const allAgents: AgentDef[] = loadAgents();

export function getAgent(id: string): AgentDef | undefined {
  return allAgents.find((a) => a.id === id);
}