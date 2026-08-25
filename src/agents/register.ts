import type { AgentDef } from "../types.js";
import { men } from "./men.js";
import { ji } from "./ji.js";
import { chi } from "./chi.js";
import { si } from "./si.js";
import { xun } from "./xun.js";
import { yi } from "./yi.js";

export const allAgents: AgentDef[] = [men, ji, chi, si, xun, yi];

export function getAgent(id: string): AgentDef | undefined {
  return allAgents.find((a) => a.id === id);
}
