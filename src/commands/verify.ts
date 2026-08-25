import type { CommandDef } from "../types.js";

export const verify: CommandDef = {
  name: "verify",
  description: "双层验证指定角色的产物：机械检查（verify.mjs）+ 语义复核（chi）。",
  agent: "chi",
  prompt: `## Judge 协议

### 第 1 层：机械检查
运行 verify.mjs 检查产物

### 第 2 层：语义复核
chi 用 fresh context 独立复核

### 输出格式
PASS/FAIL + 证据列表`,
};
