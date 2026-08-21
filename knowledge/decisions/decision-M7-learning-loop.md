---
id: decision-M7-learning-loop
type: decision
created: 2026-08-21
status: active
source: milestone M7
---

# 决策记录：自主学习回路（M7）

## 内容

M7 阶段将自主学习回路接入 /ultrawork 和 /verify 命令，实现每次任务完成后自动提取经验。

## 设计决策

### 四层认知模型

```
评估层（eval-metrics.mjs）→ KPI 计算
认知层（learn-rules.mjs） → 模式识别
行为层（learn.mjs）       → 经验写入
记忆层（knowledge/）       → 持久化存储
```

### 接入点

| 触发点 | 命令 | 执行者 | 时机 |
|--------|------|--------|------|
| /ultrawork 第 10 步 | `learn.mjs --sid <sid> --json` | men | REPORT 完成后 |
| /verify 第 5 步 | `eval-metrics.mjs --sid <sid> --json` | chi | 事件记录完成后 |

### 事件类型归一化

由于 ultrawork 流程使用 `event` 字段 + `subject` 中的 `men.*` 前缀，与 verify 流程使用的 `type` 字段不一致，`learn-rules.mjs` 和 `eval-metrics.mjs` 均实现了类型归一化：

- `normalizeType(type, subject)` — learn-rules 使用
- `eventType(e)` — eval-metrics 使用

两者均支持 `men.*` 前缀到标准事件类型的映射。

## 验证结果

| 测试 | 输入 | 结果 |
|------|------|------|
| learn.mjs ultrawork | ultrawork-20260815-213941 | type: B, 1 action classified, error written |
| eval-metrics verify | verify-1787295186835 | 100% 通过率, 1/1 tasks |
| eval-metrics ultrawork | ultrawork-20260815-213941 | 3 tasks, 5 knowledge events, 50% efficiency |
| learn.mjs --help | — | 正常输出使用帮助 |
| eval-metrics --help | — | 正常输出使用帮助 |

## 关联

- [自主学习架构](../../docs/learning-architecture.md)
- [架构决策](../../docs/architecture.md) D13
- [`scripts/learn.mjs`](../../scripts/learn.mjs)
- [`scripts/eval-metrics.mjs`](../../scripts/eval-metrics.mjs)
- [`scripts/learn-rules.mjs`](../../scripts/learn-rules.mjs)