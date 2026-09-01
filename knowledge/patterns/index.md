# Knowledge Patterns Index

> 自动维护，勿手动编辑。由 learn.mjs 生成，route-hint.mjs 消费。
> 最后更新：2026-09-01

## 活跃模式

| ID | 类型 | 创建日期 | 状态 | 文件 |
|----|------|----------|------|------|
| pattern-event-type-inconsistency | 事件类型不一致 | 2026-08-21 | active | [link](pattern-event-type-inconsistency.md) |
| pattern-multitask-wave-parallel | 多任务并行波次 | 2026-08-21 | active | [link](pattern-multitask-wave-parallel.md) |
| pattern-verdict-revision-needed | 判定需修订 | 2026-08-21 | active | [link](pattern-verdict-revision-needed.md) |
| pattern-inspect-issue-stale | 巡检 issue 先勘察现状 | 2026-09-01 | active | [link](pattern-inspect-issue-stale.md) |
| pattern-node-script-testability | 导出+入口守卫可测性 | 2026-09-01 | active | [link](pattern-node-script-testability.md) |
| pattern-code-hygiene-scan | 质量规则机械扫描 | 2026-09-01 | active | [link](pattern-code-hygiene-scan.md) |

## 路由提示摘要

- **事件类型不一致**：men.* 前缀事件与标准类型映射需统一，learn-rules.mjs 和 eval-metrics.mjs 已支持归一化
- **多任务并行波次**：team 意图拆分为 Wave 并行执行时，≤4 并行 / 依赖串行，避免过度并行导致资源竞争
- **判定需修订**：chi judge 判定 REGRESSED 时，需回传具体修订建议而非仅标 FAIL
- **巡检 issue 先勘察现状**：自动化/巡检 issue 可能基于旧代码生成，处理前必须勘察现状核实（git show 历史、读当前文件）；已修复的走「增强+验收后 close」，避免重写旧代码
- **导出+入口守卫可测性**：Node 脚本「导出 main + 入口守卫」让纯函数可测、CLI 行为不变；测试用 node:test 零依赖；黑盒测试勿 spawn verify（checkGate 跑 test 会递归）
- **质量规则机械扫描**：把空 catch/无 timeout/裸 console.log 做成 verify.mjs 静态扫描 check，不可回归；区分合规与违规（带注释 catch/带 timeout/门控 console.log 放行）

## 统计

- 活跃模式：6 条
- 总模式数：6 条
- 错误模式：0 条（errors/ 目录独立）
