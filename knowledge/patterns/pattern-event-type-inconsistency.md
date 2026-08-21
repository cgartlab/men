---
id: pattern-event-type-inconsistency
type: anti-pattern
created: 2026-08-21
status: active
source: M4 mechanical verification
---

# 反模式：事件类型命名不一致

## 模式

在 M4 机械验证开发中发现，不同组件使用的事件类型命名不一致：

| 组件 | 事件字段 | 类型命名 |
|------|---------|---------|
| gate.mjs | `type` | `gate.passed` / `gate.failed` |
| verify.mjs | `type` | `gate.passed` / `gate.failed` |
| ultrawork (event.mjs) | `event` | `session.created` / `decision.made` / `gate.passed` |
| ultrawork (men) | `event` + `subject` | `event="decision.made"` + `subject="men.verdict-received"` |

这导致 `learn-rules.mjs` 和 `eval-metrics.mjs` 需要额外的类型归一化逻辑（normalizeType / eventType）来兼容不同格式。

## 影响

1. learn-rules 初始版本对 ultrawork 事件返回 "no matching rules"（skip），因为不认识 `men.*` 前缀
2. eval-metrics 对 ultrawork 事件返回全 0（total=0），因为 filter 不到 `judge` / `verify` 类型
3. 需要为每个新组件编写类型映射规则

## 根因

- event.mjs 写入时使用 `event` 字段（PRD 定义）
- learn-rules 和 eval-metrics 读取时使用 `type` 字段（脚本习惯）
- ultrawork 流程在 `subject` 中记录 `men.*` 前缀的自定义名称
- 没有统一的事件类型枚举约束

## 修复措施

1. learn-rules.mjs：`normalizeType()` 函数映射 `men.*` → 标准类型
2. eval-metrics.mjs：`eventType()` 函数优先检查 `subject` 字段
3. 建议后续统一使用 `type` 字段 + 标准事件枚举

## 来源

- sid: ultrawork-20260815-213941
- 相关文件: `scripts/learn-rules.mjs` (normalizeType), `scripts/eval-metrics.mjs` (eventType)
- learn.mjs 自动提取