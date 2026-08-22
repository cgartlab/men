# Knowledge Patterns Index

> 自动维护，勿手动编辑。由 learn.mjs 生成，route-hint.mjs 消费。
> 最后更新：2026-08-22

## 活跃模式

| ID | 类型 | 创建日期 | 状态 | 文件 |
|----|------|----------|------|------|
| pattern-event-type-inconsistency | 事件类型不一致 | 2026-08-21 | active | [link](pattern-event-type-inconsistency.md) |
| pattern-multitask-wave-parallel | 多任务并行波次 | 2026-08-21 | active | [link](pattern-multitask-wave-parallel.md) |
| pattern-verdict-revision-needed | 判定需修订 | 2026-08-21 | active | [link](pattern-verdict-revision-needed.md) |

## 路由提示摘要

- **事件类型不一致**：men.* 前缀事件与标准类型映射需统一，learn-rules.mjs 和 eval-metrics.mjs 已支持归一化
- **多任务并行波次**：team 意图拆分为 Wave 并行执行时，≤4 并行 / 依赖串行，避免过度并行导致资源竞争
- **判定需修订**：chi judge 判定 REGRESSED 时，需回传具体修订建议而非仅标 FAIL

## 统计

- 活跃模式：3 条
- 总模式数：3 条
- 错误模式：0 条（errors/ 目录独立）
