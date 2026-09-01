# 团队知识库（Knowledge）— Men Agent 团队

> 版本：v0.3.5 ｜ 日期：2026-08-28
> 定位：自主学习回路产生的经验、模式、决策记录

---

## 目录结构

```
knowledge/
├── README.md        ← 本文件
├── errors/          ← 错误模式记录（learn.mjs type-B 自动写入）
│   └── error-*.md   ← 每次 agent 失败生成的错误条目
├── patterns/        ← 协作模式库（learn.mjs type-C 自动写入）
│   └── pattern-*.md ← 提取的协作/反协作模式
└── decisions/       ← 决策记录（手动 + 自动归档）
    └── decision-*.md
```

## 用途

- **errors/**：记录团队在执行任务过程中出现的失败模式，用于后续避免重复犯错
- **patterns/**：记录团队协作中发现的有效/无效模式，提炼为可复用的行为规则
- **decisions/**：记录架构决策、技术选型、治理规则变更，替代散落在各处的决策碎片

## 当前内容（v0.3.5）

| 目录 | 条目数 | 说明 |
|------|--------|------|
| `errors/` | 1 | learn.mjs 自动提取（verdict-revision-needed） |
| `patterns/` | 3 | verdict-revision / wave-parallel / event-type-inconsistency |
| `decisions/` | 4 | M0 / M6 / M7 / D20（men 输出规范）决策记录 |

## 写入方式

### 自动写入（learn.mjs）

当 `/ultrawork` 或 `/verify` 执行完成后，`scripts/learn.mjs` 从 `events.jsonl` 中提取经验：

| 分类 | 写入位置 | 触发条件 |
|------|---------|---------|
| type-B 错误模式 | `knowledge/errors/error-*.md` | agent 执行失败或 gate 失败 |
| type-C 协作模式 | `knowledge/patterns/pattern-*.md` | 非 gate 的协作行为 |

### 手动写入

架构决策或治理规则变更时，维护者手动创建 `knowledge/decisions/decision-*.md`。

## 格式规范

每个知识条目包含 YAML frontmatter + Markdown 正文：

```yaml
---
id: <唯一标识>
type: <error|pattern|decision>
created: <YYYY-MM-DD>
status: <active|archived>
---
```

## 归档规则

- 过期/被替代的条目标记 `status: archived`
- 不直接删除文件，保留审计历史

## 写入规范

- **errors/**：由 learn.mjs 自动写入，无需手动编辑
- **patterns/**：可由 learn.mjs 自动写入，也可手动补充（从项目经验中提取）
- **decisions/**：手动写入，对应 `docs/architecture.md` 中的 D 编号
- 所有条目必须包含 YAML frontmatter（id / type / created / status）

## 相关文档

- [自主学习架构](../../docs/learning-architecture.md)
- [团队治理](../../docs/governance.md)
- [`scripts/learn.mjs`](../../scripts/learn.mjs)
