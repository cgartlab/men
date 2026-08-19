---
name: si-plan-compose
description: "Use when planning complex multi-step tasks that need decomposition into subtasks with dependencies, parallel waves, and acceptance criteria. 触发关键词：规划、拆解、plan envelope、任务依赖图、项目管理、分解任务。Don't call when the task is simple enough to execute directly without decomposition, or when the user only wants to search for information (use xun-search)."
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

## 触发词

- 帮我规划一个项目 / 怎么开始
- 把这个任务拆成几个步骤
- 写一个 plan / 做任务分解
- 这些任务怎么排期

## 不要触发

- 用户要求直接执行一个明确的任务（无需规划）
- 用户要求进行信息搜索（由 xun 负责）
- 用户要求进行视觉设计（由 yi 负责）

## 规划工作流（step-by-step）

1. 访谈式需求澄清（Clarification level: HIGH）
   - 目标：用户要什么最终产出？
   - 范围：包含哪些、排除哪些？
   - 约束：时间/资源/格式限制？
2. 产出验收标准（供 chi judge 消费）
3. 拆解任务节点
4. 绘制依赖关系图
5. 编排并行波次（Wave 1 = 无依赖任务）
6. 标注每个任务的 Category / Skills / QA
7. 产出 `<plan>` envelope

## Plan Envelope 完整示例

```markdown
<plan>
## 目标
构建一个待办事项 Web 应用

## 任务依赖图
UI 设计 → 组件开发 → 样式实现
（UI 设计无依赖，组件开发和样式实现依赖 UI 设计）

## 并行波次
Wave 1: UI 设计（yi）
Wave 2: 组件开发（ji）+ 样式实现（ji）

## 验收标准
| ID | 描述 | 验证方式 | PASS 条件 |
|----|------|----------|-----------|
| V1 | 组件文件存在 | file exists | .tsx 文件非空 |

## TODO List
- [ ] Category:design Skills:yi-design QA:V1
- [ ] Category:code Skills:ji-frontend-design QA:V1
</plan>
```
