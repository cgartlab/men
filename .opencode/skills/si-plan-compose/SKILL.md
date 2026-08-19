---
name: si-plan-compose
description: 复杂任务规划拆解，产出 plan envelope（目标/依赖图/并行波次/验收标准/TODO），触发关键词：规划、拆解、plan envelope、任务依赖图
---

# si-plan-compose（规划拆解）

适用场景：复杂任务拆解、跨角色协作规划、产出供 ji 执行和 chi 评审的 plan envelope。

## Plan Envelope 格式

```
<plan>
## 目标
{一句话目标}

## 任务依赖图
{任务节点 + 依赖关系，可用 Mermaid 或文本图}

## 并行波次
Wave 1: {可并行任务}
Wave 2: {依赖 Wave 1 的任务}
...

## 验收标准
| ID | 描述 | 验证方式 | PASS 条件 |
|----|------|----------|-----------|
| V1 | ... | ... | ... |

## TODO List
- [ ] {可直接复制的任务，含 Category + Skills + QA}
</plan>
```

## 任务标注

每个任务节点必须标注：
- **Category** — `code` / `write` / `design` / `research` / `review`
- **Skills** — 所需技能/工具
- **QA** — 验证标准，可引用验收标准 ID

## 规划原则

1. **需求不明确先追问**（Clarification level: HIGH）。不脑补需求，模糊即阻塞
2. **验收标准不可缺**。表格必须完整，供 chi judge 消费
3. **依赖图 + 波次明确**。依赖环需指出，波次内任务可并行
4. **TODO 可复制**。每条 TODO 格式统一，ji 可直接取用
