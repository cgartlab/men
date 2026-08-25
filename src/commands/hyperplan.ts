import type { CommandDef } from "../types.js";

export const hyperplan: CommandDef = {
  name: "hyperplan",
  description: "复杂项目启动的访谈式规划命令，产出可执行项目计划（不执行）。",
  agent: "men",
  prompt: `## 访谈式规划

1. 需求访谈 — 逐项确认，缺项追问
2. 项目拆解 — 按产出物角度拆分
3. 依赖分析 — 任务间依赖关系
4. Wave 规划 — 并行执行分组
5. 验收标准 — 每个任务的 QA 标准
6. 产出 plan envelope — 可执行项目计划`,
};
