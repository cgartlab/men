# src/ — Core Engine（Phase 2 产品化探索）

> **状态标注（2026-08-28，决策 D20 关联）**：本目录为 **Phase 2 产品化探索**——Core Engine 状态机与独立 CLI 的实现，**当前未构建、未暴露 bin、未接入实际运行时**。

## 当前状态

- **未构建**：无 `dist/` 输出，TypeScript 源码未编译
- **未暴露 bin**：根 `package.json` 的 `bin` 指向 `scripts/install.mjs`，而非 `src/cli.ts`
- **未接入运行时**：运行时以 `.opencode/` 配置体系为准（agent 定义 / skills / commands），不走 `src/`
- **未被 CI 测试**：`scripts/core-test.mjs` 为独立验证脚本，CI validate job 未调用

## 用途说明

- `src/core/`：状态机骨架（`orchestrator.ts` 编排器 / `triage.ts` 意图门 / `intent.ts` 意图判定表）——`askUser` hook 已预留
- `src/cli.ts`：独立 CLI（install / doctor / version）
- `src/agents/` / `src/commands/` / `src/skills/` / `src/types/`：与 `.opencode/` 平行的注册/类型逻辑

## 维护提示

- **不要**把 `src/` 误当作被消费的主产品；改动前先确认是否在 Phase 2 探索范围内
- 若未来接入产品化（构建 + 暴露 bin + CI 测试），需一并处理 `typecheck`（`src/types/opencode-plugin.d.ts` 可能引用 `@opencode-ai/plugin`）与双套路由表一致性
- 路由表唯一权威：`.opencode/agent/men.md`（men 定义）；`src/core/triage.ts` 已对齐（team 含 yi）
