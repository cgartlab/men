import type { CommandDef } from "../types.js";
import { ultrawork } from "./ultrawork.js";
import { verify } from "./verify.js";
import { hyperplan } from "./hyperplan.js";

export const allCommands: CommandDef[] = [ultrawork, verify, hyperplan];

export function getCommand(name: string): CommandDef | undefined {
  return allCommands.find((c) => c.name === name);
}
