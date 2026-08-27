# 自主学习与进化架构设计

> **版本**：v0.1 ｜ **日期**：2026-08-21
> **定位**：M5 后增量，6+1 Agent 团队的自我改进系统
> **约束**：纯 Node ESM（.mjs）、零第三方依赖、Windows pwsh 兼容、OpenCode 兼容、不绕过 human gate

---

## 一、总体架构

### 1.1 四层认知模型

```
┌─────────────────────────────────────────────────────────────┐
│                    评估层（Evaluation）                       │
│  测量"团队变好了吗"—— 指标采集、趋势分析、回归报告              │
├─────────────────────────────────────────────────────────────┤
│                    认知层（Cognition）                       │
│  模式提取、行为漂移检测、元学习 —— 谁在退化、哪里可优化          │
├─────────────────────────────────────────────────────────────┤
│                    行为层（Behavior）                        │
│  技能进化、自动学习闭环、知识迁移 —— 具体改什么、怎么改          │
├─────────────────────────────────────────────────────────────┤
│                    记忆层（Memory）                          │
│  Lessons Ledger / Team Memory / events.jsonl  —— 原始数据   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 学习循环时序

```
任务完成（chi judge PASS / FAIL）
  → 事件已写入 events.jsonl（14 种 kind）
    → 学习触发器（L0 机械 / L1 cheap / L2 limited LLM）
      → 三类输出：
        1. 技能描述微调（L0，自动）
        2. 错误模式提取（L1，自动 + 人工确认）
        3. 协作流程改进（L2，human gate）
```

**关键原则**：学习行为本身不阻塞主流程。学习是**后台异步**的，以 `best-effort` 方式运行。

### 1.3 与各 agent 的职责边界

| Agent | 进化中角色 | 说明 |
|-------|-----------|------|
| **men** | 编排触发器 | 任务完成后触发学习评估；不直接参与学习决策 |
| **si** | 学习规划者 | 设计学习方案、提取知识、撰写 lessons/patterns |
| **ji** | 学习执行者 | 实现技能更新脚本、模式提取工具、迁移管道 |
| **chi** | 学习验收者 | 独立评审学习产物的质量（fresh context judge） |
| **yi** | 不参与 | 视觉设计无自动学习需求 |
| **xun** | 知识源 | 研究发现自动同步到知识库 |
| **用户** | 最终 gate | 结构变更必须经过 human gate |

---

## 二、8 个问题的设计方案

### 2.1 自动学习闭环

**问题**：agent 执行完任务后，如何自动从 events.jsonl 中提取经验，决定是否需要更新技能/模式/错误库？

**设计方案**：

**触发条件**：chi judge 完成一轮评审（PASS / FAIL / REGRESSED / BLOCKED）后，men 调用 `learn.mjs` 脚本。

**learn.mjs 三步流程**：

```
Step 1: 事件聚合（L0 机械）
  → 读取最近一次任务的 events.jsonl
  → 提取 task / dispatch / verify / judge / error 事件
  → 统计：失败次数、失败类型、失败 agent、失败技能

Step 2: 经验分类（L1 机械规则）
  → 规则判定表（见下），将失败归入三类：
    - type-A（技能触发词不匹配）：→ 自动微调 skill description
    - type-B（代码模式错误）：→ 写入 errors/pattern.md
    - type-C（协作流程问题）：→ 标记待 human gate

Step 3: 经验落盘（L0/L1 机械）
  → 写入 errors/ 目录（使用 wx 锁）
  → 写入 knowledge/patterns/ 目录
  → 记录 decision.made 事件
```

**规则判定表（L1 机械）**：

| 失败模式 | 判定条件 | 输出 | 自动化程度 |
|----------|---------|------|-----------|
| Skill 描述不匹配 | `chi judge` 报告说"agent 未触发正确 skill" | 更新 skill frontmatter description | **auto** |
| 文件缺少 | `verify.mjs` output-exists FAIL | 记录到 errors/ 作为 lesson | auto |
| 密钥泄露 | `verify.mjs` secrets FAIL | 记录到 errors/ + 阻塞 | auto（仅记录） |
| 代码逻辑错误 | `chi judge` FAIL + 含"未按 plan 实现" | 写入 patterns/ 作为 anti-pattern | auto |
| 协作冲突 | 多 agent 产物冲突，men 汇总时标记 | 写入 errors/ + 标记 human gate | **human-gate** |
| 连续 3 次同一失败 | `gate.mjs` GATE_EXHAUSTED | 标记 BLOCKED，写入 errors/ 高优先级 | human-gate |

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/learn.mjs` | 学习循环主入口（聚合 → 分类 → 落盘） |
| `scripts/learn-rules.mjs` | 规则判定表（L1 分类逻辑，纯函数，无依赖） |
| `.agents/state/learn/queue.json` | 待处理经验队列（best-effort） |
| 事件类型：`decision.made` + subject `learn.extracted` / `learn.skipped` / `learn.gate-required` | 审计留痕 |

**自动化程度**：**混合**（L0 auto + L1 auto + L2 human-gate）

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 学习循环产生大量无效记录 | 仅当 chi judge 有 FAIL 时触发（无 FAIL 则跳过） |
| 学习循环阻塞主流程 | 学习是后台异步，`event.mjs append` 后 men 即返回 |
| 规则判定表误判 | 所有判定结果写入 events.jsonl，可回放审计 |

---

### 2.2 技能进化

**问题**：`.opencode/skills/{name}/SKILL.md` 是静态 YAML，如何基于执行反馈自动微调？

**设计方案**：

**技能文件结构**（当前）：
```yaml
---
name: ji-content-write
description: "Use when writing blog posts..."
license: Apache-2.0
---
```

**进化后的技能文件结构**（新增字段，纯增量）：
```yaml
---
name: ji-content-write
description: "Use when writing blog posts..."
license: Apache-2.0
stats:
  triggerCount: 47
  passRate: 0.89
  lastTriggered: "2026-08-21T10:00:00Z"
  commonFailures: ["文件缺失", "事实核查遗漏"]
evolvedDescription: "Use when writing blog posts, technical documentation, or weekly digests — especially for content requiring structured formatting with fact-checking annotations"  # auto-tuned
---
```

**进化流程**：

```
触发条件：技能被触发后，chi judge 报告 FAIL 且失败原因与该技能相关

Step 1: 提取失败模式（L0 机械）
  → 从 events.jsonl 中提取该技能最近的 5 次执行记录
  → 统计：触发次数、PASS 率、常见失败原因

Step 2: 更新 description（L0 自动）
  → 如果判定为"描述不匹配"（规则判定表 type-A）
  → 自动追加关键词到 evolvedDescription 字段
  → 跳过 name 和 license 字段（不可变）

Step 3: 更新 stats（L0 自动）
  → 每次触发后递增 triggerCount
  → 每次 chi judge 后更新 passRate
  → 写入 frontmatter

Step 4: 结构变更走 human gate（L2）
  → 如果拟修改 content 正文（非 frontmatter）
  → 写入 learn/queue.json，标记 human-gate
  → 用户通过 men 确认后执行
```

**自动化判定表**：

| 修改类型 | 字段 | 自动化程度 | 理由 |
|----------|------|-----------|------|
| 统计信息更新 | `stats.*` | **auto** | 纯数据，无风险 |
| 描述微调 | `evolvedDescription` | **auto** | 追加关键词，不删除原描述 |
| 描述替换 | `description` | **human-gate** | 可能影响 skill 触发匹配 |
| 新增模板 | content 正文追加示例 | **human-gate** | 结构变更 |
| 删除内容 | content 正文删除 | **human-gate** | 结构变更，高风险 |
| 新增工作流 | 正文新增 step-by-step | **human-gate** | 结构变更 |

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/skill-evolve.mjs` | 技能进化执行器（读/写 SKILL.md frontmatter） |
| `scripts/skill-stats.mjs` | 统计采集（分析 events.jsonl 中 skill 相关事件） |
| `.agents/state/skills/stats.json` | 全技能统计汇总（缓存，快速查询） |
| 事件类型：`decision.made` + subject `skill.evolved` / `skill.evolve-gate` | 审计留痕 |

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 自动修改导致描述劣化 | `evolvedDescription` 是追加模式，不覆盖原描述，原版始终可回滚 |
| 统计信息膨胀 frontmatter | stats 字段 ≤5 行，超过则截断为最近 5 条 |
| 误判触发词优化 | 每次修改前先写 events.jsonl，chi judge 可回放验证 |

---

### 2.3 模式提取

**问题**：从 events.jsonl 中自动发现可复用启发式（如"当 ji 实现后 chi 总是发现 X 类错误"）。

**设计方案**：

**模式提取管道**（L1 机械 + L2 LLM 辅助）：

```
events.jsonl → 模式候选提取（L1 机械） → 模式验证（L2 一行 LLM 调用） → 写入 knowledge/patterns/

L1 机械规则（纯函数，零依赖）：
  规则 1: "同一 agent 连续 3 次 FAIL 且失败原因相同" → 提取"重复失败模式"
  规则 2: "chi judge 报告中同一标准连续 2 次 FAIL" → 提取"验收标准盲区"
  规则 3: "ji 修复后 chi 再次发现同一类错误" → 提取"修复不完整模式"
  规则 4: "Wave 2 任务总是依赖 Wave 1 的错误结果" → 提取"任务依赖断裂模式"
  规则 5: "xun 查询后 si 总是需要补充事实核查" → 提取"知识链缺失模式"

L2 辅助（限 1 次 LLM 调用，≤200 词输出）：
  → 输入：模式候选的 5 条事件记录
  → 输出：一句话启发式 + 置信度（high/medium/low）
  → 置信度 < medium → 丢弃，不写入
```

**模式存储格式**：

```markdown
---
id: pattern-ji-001
type: 重复失败模式
agent: ji
skill: ji-frontend-design
confidence: high
created: 2026-08-21
sources: [sid-abc123, sid-def456]
status: active
---

## 模式

ji 实现 HTML 组件后，chi 总是发现"缺少 dark mode 支持"。

## 启发式

ji 在实现前端组件时，应在第一步就声明 dark mode 变量，而非最后补。

## 反例证据

- sid-abc123: chi judge FAIL — "dark mode 缺失"
- sid-def456: chi judge FAIL — "dark mode 不完整"

## 建议动作

ji-frontend-design SKILL.md 中新增"dark mode 预检"步骤。
```

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/pattern-extract.mjs` | 模式提取主流程（L1 规则 → L2 辅助 → 落盘） |
| `scripts/pattern-rules.mjs` | 5 条机械规则定义（纯函数） |
| `knowledge/patterns/` | 模式存储目录 |
| 事件类型：`decision.made` + subject `pattern.extracted` / `pattern.discarded` | 审计留痕 |

**自动化程度**：**混合**（L1 机械全自动，L2 辅助需 LLM 调用但不超过 200 词）

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 模式提取产生大量噪声 | L1 规则要求连续 3 次或 2 次重复，单次失败不触发 |
| L2 LLM 辅助消耗 token | 限制输入 ≤5 条事件，输出 ≤200 词，单次调用 |
| 模式过时 | 模式文件带 `status: active`，定期检查是否仍适用 |

---

### 2.4 元学习

**问题**：团队如何改进自己的协作流程（men 路由策略优化、Wave 划分优化）？

**设计方案**：

**元学习触发条件**：累计 10 次 team 类任务执行后。

**元学习三步流程**：

```
Step 1: 协作流程审计（L1 机械）
  → 读取最近 10 次 team 任务的 events.jsonl
  → 统计指标：
    - 平均 Wave 数
    - 平均重试次数
    - 平均 chi judge 循环次数
    - 最常见的失败 agent
    - 最常见的失败 Wave

Step 2: 流程优化建议（L2 limited LLM）
  → 输入：上述统计指标 + 最近 5 次 team 任务的关键事件
  → 输出：具体优化建议（≤200 词）
  → 例如："Wave 1 不应同时分发 xun 搜索和 yi 设计，因为 yi 设计依赖 xun 的素材数据"

Step 3: 写入元学习记录（含 human gate 标记）
  → 写入 knowledge/meta-learning/ 目录
  → 标记为 human-gate 待确认
  → 用户通过 men 确认后，更新 men 的 IntentGate 判定表或 Wave 拆分策略
```

**元学习记录格式**：

```markdown
---
id: meta-001
type: Wave 划分优化
triggeredAt: 10 task batch
sources: [sid-xxx, sid-yyy, ...]
status: pending  # pending / applied / rejected
---

## 原始数据

- 平均 Wave 数: 3.2
- 平均重试次数: 2.1
- 最常失败 agent: ji（12 次失败，占 67%）
- 最常失败 Wave: Wave 2（依赖 Wave 1 的数据）

## 建议

将"数据搜索"提前到 Wave 0（预执行），而非在 Wave 1 中。
当前 Wave 1 同时运行 xun 搜索和 ji 实现，导致 ji 等待数据。

## 影响范围

- men 的路由判定表（需修改 team 类任务的 Wave 编排）
- si 的 plan 模板（需新增 Wave 0 占位）

## 人工确认

[ ] 接受此建议
[ ] 拒绝此建议（理由：______）
[ ] 修改后接受（建议：______）
```

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/meta-learn.mjs` | 元学习审计与建议生成 |
| `knowledge/meta-learning/` | 元学习记录存储目录 |
| 事件类型：`decision.made` + subject `meta.audited` / `meta.suggested` / `meta.applied` / `meta.rejected` | 审计留痕 |

**自动化程度**：**human-gate**（所有协作流程变更必须人工确认）

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 元学习建议质量差 | 仅当累计 10 次任务后触发，数据充足 |
| 用户不理睬 | 不阻塞主流程，human-gate 标记不强制 |
| 建议互相矛盾 | 每条建议独立记录，不自动覆盖 |

---

### 2.5 行为漂移检测

**问题**：如何知道某个 agent 的能力在退化？如何自动触发"回滚到上一个版本"？

**设计方案**：

**漂移检测指标**（L0 机械，每次任务后更新）：

| 指标 | 计算方式 | 漂移阈值 |
|------|---------|---------|
| `passRate` | 最近 10 次 chi judge PASS 率 | < 60% 触发警告，< 40% 触发回滚 |
| `regressionRate` | 最近 5 次中 REGRESSED 次数 | ≥ 2 次触发警告 |
| `avgRetries` | 最近 5 次的平均重试次数 | > 3（大于 MAX_REINFORCEMENTS 一半）触发警告 |
| `skillUsageCount` | 最近 10 次任务中该 agent 被调用的次数 | 0 次（完全未使用）触发警告 |
| `errorCount` | 最近 10 次中该 agent 的 error 事件数 | > 5 次触发警告 |

**漂移检测流程**：

```
每次 chi judge 完成后（PASS / FAIL 都触发）

Step 1: 更新 agent 统计（L0 机械）
  → 读取 events.jsonl 中最近 10 条该 agent 的事件
  → 计算 5 项指标
  → 写入 .agents/state/agents/stats.json

Step 2: 漂移判定（L0 机械）
  → 阈值比较表（见上）
  → 无漂移 → 跳过
  → 有漂移警告 → 写入 events.jsonl + 通知 men
  → 有漂移回滚 → 触发回滚流程

Step 3: 回滚流程（L2，human-gate）
  → 回滚前先备份当前版本
  → 从 .agents/state/skills/backups/ 恢复上一版本
  → 记录 decision.made 事件
  → 通知用户确认
```

**回滚不涉及代码**。回滚的是**技能定义**（SKILL.md frontmatter 和 content）。agent 定义本身（`.opencode/agent/*.md`）不自动回滚。

**版本备份机制**：

```
每次技能修改前：
  → 备份当前 SKILL.md 到 .agents/state/skills/backups/{name}/{timestamp}.md
  → 保留最近 3 个版本
  → 超过 3 个版本自动删除最早的
```

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/drift-detect.mjs` | 漂移检测主流程 |
| `.agents/state/agents/stats.json` | 各 agent 统计指标 |
| `.agents/state/skills/backups/` | 技能版本备份目录 |
| 事件类型：`decision.made` + subject `drift.warning` / `drift.rollback` | 审计留痕 |

**自动化程度**：**混合**（检测 auto，回滚 human-gate）

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 回滚造成数据丢失 | 回滚前备份当前版本，保留 3 个历史版本 |
| 短期波动误判为漂移 | 要求连续 10 次任务窗口，单次失败不触发 |
| 技能版本回滚但 agent 定义不变 | 技能回滚不涉及 agent 定义，定义变更走 human gate |

---

### 2.6 团队知识迁移

**问题**：xun 学到的一个事实如何自动同步到 si 的写作上下文？ji 修复的一个 bug 模式如何让其他 agent 也能避免？

**设计方案**：

**知识迁移总线**（完全基于文件系统，零依赖）：

```
xun 研究发现 → 写入 knowledge/topics/
  → si 下次写作时读取 knowledge/topics/ 作为上下文

ji 修复 bug → 写入 errors/ 目录
  → 所有 agent 读取 errors/ 作为 pre-flight 检查

chi 发现模式 → 写入 knowledge/patterns/
  → si 规划时读取 patterns/ 影响 plan 设计
```

**三层迁移机制**：

| 层 | 名称 | 机制 | 触发条件 | 自动化程度 |
|----|------|------|---------|-----------|
| L0 | **免配置** | 文件系统可读，agent 启动时注入 | 每次任务 | auto |
| L1 | **自动引用** | `knowledge/` 目录内容自动注入到 agent prompt 的 system message | 每次任务 | auto |
| L2 | **主动推送** | 知识变更事件通知相关 agent 的下一轮执行 | 知识变更时 | human-gate |

**具体实现**：

**L0 免配置**：agent 任务 prompt 中强制包含：
```
可用知识库目录：
  - knowledge/topics/（主题知识）
  - knowledge/patterns/（模式）
  - errors/（错误教训）
请阅读相关条目后开始执行。
```

**L1 自动引用**：`scripts/knowledge-inject.mjs` 在 men 分发任务前执行：
1. 读取任务的 Category（code / write / design / research / review）
2. 按 Category 映射到知识目录：
   - `code` → `knowledge/patterns/` + `errors/`
   - `write` → `knowledge/topics/` + `knowledge/patterns/`
   - `research` → `knowledge/topics/`
   - `design` → `knowledge/patterns/`（仅视觉相关）
   - `review` → `knowledge/patterns/` + `errors/`
3. 读取最近 3 条相关条目，拼接为 prompt 前缀

**知识变更事件流**：

```
xun 完成研究
  → 写入 knowledge/topics/fact-xxx.md
  → event.mjs append --type decision.made --subject knowledge.added
  → men 下次分发 si 任务时，自动引用该知识
```

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/knowledge-inject.mjs` | 知识注入（根据 Category 读取相关条目） |
| `scripts/knowledge-gossip.mjs` | 知识变更通知（changeset 检测，增量推送） |
| `.agents/state/knowledge/changeset.json` | 知识变更记录（增量，用于 gossip） |
| 事件类型：`decision.made` + subject `knowledge.added` / `knowledge.injected` | 审计留痕 |

**自动化程度**：**auto**（L0/L1 全自动，L2 需 human-gate）

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 知识注入导致 prompt 过长 | 限制注入 ≤3 条，每条 ≤200 词，超出截断 |
| 过时知识污染上下文 | 条目带 `status: active / archived`，只注入 active |
| 知识冲突（xun 和 ji 不同结论） | 两条都注入，由 agent 自行判断优先级 |

---

### 2.7 评估自动化

**问题**：如何定义"团队变好了"？如何自动测量？

**设计方案**：

**指标体系**（纯机械，零 LLM）：

| 指标 | ID | 计算方式 | 数据源 | 频率 |
|------|----|---------|--------|------|
| 任务完成率 | `KPI-task-completion` | PASS 任务数 / 总任务数 | events.jsonl | 每 10 任务 |
| 一次通过率 | `KPI-first-pass` | 首次 chi judge 即 PASS 的任务数 / 总任务数 | events.jsonl | 每 10 任务 |
| 回归率 | `KPI-regression` | REGRESSED 次数 / 总 judge 次数 | events.jsonl | 每 10 任务 |
| 平均重试次数 | `KPI-avg-retries` | 总重试次数 / 总任务数 | events.jsonl | 每 10 任务 |
| 技能使用率 | `KPI-skill-usage` | 各技能被触发的次数分布 | skill stats | 每 10 任务 |
| 知识沉淀率 | `KPI-knowledge` | knowledge/ 目录新增条目数 / 时间 | 文件系统 | 每日 |
| 错误重复率 | `KPI-error-repeat` | 同一错误类型出现次数 / 总错误数 | errors/ index | 每 10 任务 |
| 学习效率 | `KPI-learn-efficiency` | 学习相关 token 消耗 / 总 token 消耗 | 事件类型计数 | 每 10 任务 |

**评估流程**：

```
触发条件：累计 10 次 chi judge 后

Step 1: 采集指标（L0 机械）
  → 读取 events.jsonl 中最近 10 次任务的全部事件
  → 计算 8 项 KPI
  → 写入 .agents/state/eval/report.json

Step 2: 趋势分析（L1 机械）
  → 对比上次报告（前 10 次任务）
  → 标记：improved / degraded / stable
  → 写入 events.jsonl

Step 3: 报告生成（L0 机械）
  → 生成人类可读的评估报告
  → 写入 docs/eval/YYYY-MM-DD.md
  → 标记 degradation 项（如果有）
```

**评估报告格式**：

```markdown
# 团队评估报告 — 2026-08-21

## 概述
评估周期：任务 #11–#20（共 10 次）
整体趋势：✅ 改善（6/8 指标改善，1/8 稳定，1/8 退化）

## 指标详情

| 指标 | 当前值 | 上次值 | 趋势 |
|------|--------|--------|------|
| 任务完成率 | 90% | 80% | ✅ improved |
| 一次通过率 | 70% | 60% | ✅ improved |
| 回归率 | 10% | 20% | ✅ improved |
| 平均重试次数 | 1.5 | 2.0 | ✅ improved |
| 技能使用率 | 均匀分布 | 不均匀 | ✅ improved |
| 知识沉淀率 | 3 条/日 | 1 条/日 | ✅ improved |
| 错误重复率 | 20% | 15% | ❌ degraded |
| 学习效率 | 2.3% | 1.5% | ⚠️ stable |

## 退化项详情

### 错误重复率（20% > 15%）
- 重复错误类型：ji 的 dark mode 遗漏（3 次）
- 建议：检查 pattern-ji-001 是否已应用

## 下周期目标
- 错误重复率降至 < 15%
- 一次通过率提升至 > 75%
```

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/eval-metrics.mjs` | 指标采集与计算 |
| `scripts/eval-report.mjs` | 报告生成（从 metrics 输出 .md） |
| `.agents/state/eval/` | 评估数据存储（metrics.json / report.json / history.json） |
| `docs/eval/` | 人类可读评估报告 |
| 事件类型：`decision.made` + subject `eval.computed` / `eval.report` | 审计留痕 |

**自动化程度**：**auto**（全自动机械，无 LLM 调用）

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 指标波动导致误判 | 每次窗口 10 次任务，短期波动不触发 |
| 评估报告没人看 | 报告写入 docs/eval/，不作为强制动作 |
| 评估本身消耗 token | 纯机械，零 LLM 调用 |

---

### 2.8 学习成本控制

**问题**：3-layer 架构下，如何确保学习过程本身不成为 token 黑洞？

**设计方案**：

**成本控制三原则**：

1. **学习不阻塞主流程** — 所有学习脚本是 `best-effort`，失败不影响任务执行
2. **学习有预算** — 每轮学习循环的 token 消耗上限
3. **学习可审计** — 所有学习步骤写入 events.jsonl

**各层成本预算**：

| 层 | 触发频率 | 每轮 token 预算 | 调用次数上限 |
|----|---------|----------------|-------------|
| L0 机械 | 每次任务后 | 0（纯文件系统） | 无限制 |
| L1 cheap | 每次任务后（仅 FAIL 时） | 0（纯文件系统） | 无限制 |
| L2 limited LLM | 每 10 次任务后 | ≤200 词输出 | 1 次/周期 |

**L2 调用保护机制**：

```
L2 调用前检查：
  1. 距上次 L2 调用是否 ≥ 10 次任务（防高频）
  2. 当天 L2 调用次数是否 ≤ 3 次（防日透支）
  3. 当前是否有未完成的 L2 调用（防并发）

三项全通过 → 允许 L2 调用
任何一项不通过 → 跳过本轮，标记 learn.skipped
```

**总成本上限**（每日）：

| 指标 | 上限 | 超限处理 |
|------|------|---------|
| L2 LLM 调用次数 | 3 次/日 | 跳过，标记 learn.budget-exceeded |
| 学习脚本总执行时间 | 30 秒/日 | 超时 kill，标记 learn.timeout |
| 学习事件写入量 | 100 条 events.jsonl/日 | 超出后静默跳过（best-effort） |

**实现文件**：

| 文件 | 用途 |
|------|------|
| `scripts/learn-budget.mjs` | 预算检查（L2 调用前校验） |
| `.agents/state/learn/budget.json` | 当日预算消耗记录 |
| 事件类型：`decision.made` + subject `learn.budget-exceeded` / `learn.timeout` / `learn.skipped` | 审计留痕 |

**自动化程度**：**auto**（预算控制全自动，无 LLM 参与）

**风险与缓解**：

| 风险 | 缓解 |
|------|------|
| 预算限制导致重要学习被跳过 | 跳过只影响 L2，L0/L1 不受限；跳过有事件留痕 |
| 学习脚本自身超时 | 30s 超时 kill，best-effort 不阻塞主流程 |
| 事件记录过多 | 每日 100 条上限，超出静默跳过 |

---

## 三、自动化 vs 人工门禁判定表

### 3.1 学习操作判定表

| 操作 | 类型 | 自动化程度 | 阈值/条件 |
|------|------|-----------|----------|
| Skill stats 更新 | 修改 frontmatter `stats.*` | **auto** | 每次任务后 |
| Skill `evolvedDescription` 追加 | 修改 frontmatter 新增字段 | **auto** | 仅当"描述不匹配"判定 |
| Skill `description` 替换 | 修改 frontmatter 已有字段 | **human-gate** | 任何情况 |
| Skill content 正文新增示例 | 修改正文 | **human-gate** | 任何情况 |
| Skill content 正文删除 | 修改正文 | **human-gate** | 任何情况 |
| 错误记录写入 errors/ | 新建文件 | **auto** | 每次 chi judge FAIL |
| 模式提取写入 knowledge/patterns/ | 新建文件 | **auto** | L1 规则命中 |
| 模式提取中 L2 辅助 | LLM 调用 | **auto**（有预算控制） | ≤200 词输出 |
| 元学习建议写入 | 新建文件 | **auto** | 累计 10 次 team 任务 |
| 元学习建议应用 | 修改 men 路由规则 | **human-gate** | 任何情况 |
| 漂移检测 | 计算指标 | **auto** | 每次任务后 |
| 漂移回滚 | 恢复技能备份 | **human-gate** | 漂移阈值触发 |
| 知识注入（L0/L1） | 注入 prompt | **auto** | 每次任务分发前 |
| 知识注入（L2 主动推送） | 通知 agent | **human-gate** | 任何情况 |
| 评估指标采集 | 文件读写 | **auto** | 每 10 次任务 |
| 评估报告生成 | 写入 docs/eval/ | **auto** | 每 10 次任务 |
| 学习预算检查 | 文件读写 | **auto** | 每次 L2 调用前 |
| 技能版本备份 | 文件复制 | **auto** | 每次技能修改前 |

### 3.2 判定规则

```
human-gate 条件（任一满足即走 human-gate）：
  1. 修改 agent 定义（.opencode/agent/*.md）
  2. 修改 skill 的结构性内容（非 frontmatter 追加）
  3. 修改 men 的路由规则
  4. 删除任何现有文件
  5. 修改其他 agent 的职责边界
  6. 任何涉及"回滚"的操作
  7. 任何涉及"主动推送"的操作

auto 条件（全部满足才 auto）：
  1. 仅追加新内容（不修改/删除已有内容）
  2. 操作对象是 frontmatter 的新增字段
  3. 操作结果可逆（有备份）
  4. 操作结果有审计留痕（events.jsonl）
  5. 操作不涉及其他 agent 的职责
```

---

## 四、与现有 plan 的衔接

### 4.1 已覆盖（现有）

| 现有机制 | 覆盖范围 | 本设计中的使用 |
|----------|---------|---------------|
| `events.jsonl`（14 种 kind） | 事件审计 | 学习循环的原始数据源 |
| `verify.mjs` 五项检查 | 机械验证 | L0 学习触发器的输入 |
| `gate.mjs` 门禁 | 强化次数上限 | 漂移检测的输入之一 |
| `chi judge` 独立评审 | 语义复核 | 学习循环的触发条件 |
| `si-knowledge` skill | 知识管理 | 知识迁移的写入端 |
| `.agents/state/sessions/` | 会话状态 | 事件读取路径 |

### 4.2 新增（本设计）

| 新增机制 | 文件 | 说明 |
|----------|------|------|
| 学习循环主入口 | `scripts/learn.mjs` | 新增，聚合 → 分类 → 落盘 |
| 规则判定表 | `scripts/learn-rules.mjs` | 新增，L1 分类逻辑 |
| 技能进化 | `scripts/skill-evolve.mjs` | 新增，读写 SKILL.md frontmatter |
| 技能统计 | `scripts/skill-stats.mjs` | 新增，分析 events.jsonl |
| 模式提取 | `scripts/pattern-extract.mjs` | 新增，L1 规则 + L2 辅助 |
| 模式规则 | `scripts/pattern-rules.mjs` | 新增，5 条机械规则 |
| 元学习 | `scripts/meta-learn.mjs` | 新增，协作流程审计 |
| 漂移检测 | `scripts/drift-detect.mjs` | 新增，agent 指标计算 |
| 知识注入 | `scripts/knowledge-inject.mjs` | 新增，按 Category 注入 |
| 知识变更通知 | `scripts/knowledge-gossip.mjs` | 新增，增量推送 |
| 评估指标 | `scripts/eval-metrics.mjs` | 新增，8 项 KPI 计算 |
| 评估报告 | `scripts/eval-report.mjs` | 新增，.md 报告生成 |
| 预算控制 | `scripts/learn-budget.mjs` | 新增，token 预算检查 |

### 4.3 需修改（现有文件）

| 文件 | 修改内容 | 影响 |
|------|---------|------|
| `.opencode/agent/men.md` | 新增"任务完成后触发 learn.mjs"步骤 | 学习循环编排 |
| `.opencode/agent/si.md` | 新增"知识注入"上下文说明 | 知识迁移 |
| `.opencode/agent/ji.md` | 新增"技能版本备份"职责 | 技能进化 |
| `.opencode/agent/chi.md` | 新增"学习产物评审"职责 | 学习验收 |
| `.opencode/command/ultrawork.md` | 新增"学习循环"阶段 | 编排流程 |

### 4.4 新增目录结构

```
.agents/state/
├── learn/
│   ├── queue.json           # 待处理经验队列
│   └── budget.json          # 当日预算消耗
├── agents/
│   └── stats.json           # 各 agent 统计指标
├── skills/
│   ├── stats.json           # 技能统计汇总
│   └── backups/             # 技能版本备份
│       ├── ji-content-write/
│       │   ├── 2026-08-21T10-00-00.md
│       │   └── ...
│       └── ...
├── eval/
│   ├── metrics.json         # 当前评估指标
│   ├── report.json          # 当前评估报告
│   └── history.json         # 历史趋势
└── knowledge/
    └── changeset.json       # 知识变更增量记录

knowledge/
├── topics/                  # 主题知识（已有）
├── references/              # 参考资料（已有）
├── decisions/               # 决策记录（已有）
└── patterns/                # 模式提取（新增）
    └── pattern-ji-001.md

errors/                      # Lessons Ledger
├── index.json               # 索引
├── error-001.md             # 错误记录
├── fix-001.md               # 修复方案
└── lesson-001.md            # 教训总结

docs/eval/                   # 评估报告
└── 2026-08-21.md
```

---

## 五、优先级与里程碑

### 5.1 优先级划分

| 优先级 | 内容 | 理由 |
|--------|------|------|
| **P0** | 自动学习闭环（learn.mjs + 规则判定表） | 一切学习的基础，必须先有学习循环 |
| **P0** | 评估自动化（eval-metrics.mjs + eval-report.mjs） | 必须能测量"是否变好了" |
| **P0** | 学习成本控制（learn-budget.mjs） | 防止学习成为 token 黑洞 |
| **P1** | 知识迁移（knowledge-inject.mjs + knowledge-gossip.mjs） | 团队知识共享的核心机制 |
| **P1** | 技能进化（skill-evolve.mjs + skill-stats.mjs） | 技能自我改进 |
| **P1** | 漂移检测（drift-detect.mjs） | 退化预警，防止团队变差 |
| **P2** | 模式提取（pattern-extract.mjs + pattern-rules.mjs） | 高级能力，可复用启发式 |
| **P2** | 元学习（meta-learn.mjs） | 协作流程优化，依赖长期数据积累 |

### 5.2 里程碑估算

| 阶段 | 内容 | 文件数 | 估算行数 | 依赖 |
|------|------|--------|---------|------|
| **Phase 1**（P0） | learn.mjs + 规则判定表 + eval-metrics + eval-report + learn-budget | 5 个 .mjs + 目录结构 | ~500 行 | 现有 events.jsonl |
| **Phase 2**（P1） | knowledge-inject + knowledge-gossip + skill-evolve + skill-stats + drift-detect | 5 个 .mjs + 备份机制 | ~500 行 | Phase 1 完成 |
| **Phase 3**（P2） | pattern-extract + pattern-rules + meta-learn | 3 个 .mjs + 知识库目录 | ~300 行 | Phase 1 + 2 完成 |

### 5.3 各阶段验收标准

**Phase 1 验收标准**：

| ID | 描述 | 验证方式 | PASS 条件 |
|----|------|----------|-----------|
| V1 | learn.mjs 存在且可执行 | `node scripts/learn.mjs --sid test-001` | 退出码 0，输出 JSON |
| V2 | 学习循环不阻塞主流程 | 在 chi judge FAIL 后触发 learn.mjs | 主流程继续，learn.mjs 异步完成 |
| V3 | 规则判定表正确分类 | 模拟 3 种 FAIL 场景 | 分类结果匹配预期 |
| V4 | eval-metrics 输出 8 项 KPI | `node scripts/eval-metrics.mjs` | 输出包含 8 个指标 |
| V5 | eval-report 生成 .md 文件 | `node scripts/eval-report.mjs` | docs/eval/ 下 .md 文件存在且非空 |
| V6 | learn-budget 拒绝超限调用 | 模拟超过 3 次 L2 调用 | 第 4 次返回 learn.skipped |

**Phase 2 验收标准**：

| ID | 描述 | 验证方式 | PASS 条件 |
|----|------|----------|-----------|
| V7 | knowledge-inject 按 Category 注入 | 输入 code / write / research | 注入不同路径的知识 |
| V8 | knowledge-gossip 检测文件变更 | 修改 knowledge/ 下文件 | 检测到变更并记录 |
| V9 | skill-evolve 更新 frontmatter | 执行 skill-evolve 后读取 SKILL.md | stats 字段更新 |
| V10 | skill-stats 输出正确统计 | 模拟 5 次 skill 调用 | 统计匹配 |
| V11 | drift-detect 检测退化 | 模拟连续 5 次 FAIL | 触发漂移警告 |

**Phase 3 验收标准**：

| ID | 描述 | 验证方式 | PASS 条件 |
|----|------|----------|-----------|
| V12 | pattern-extract 提取重复失败模式 | 模拟 3 次同一错误 | 写入 knowledge/patterns/ |
| V13 | pattern-rules 5 条规则可执行 | 执行 pattern-rules 单元测试 | 全部规则输出正确 |
| V14 | meta-learn 输出优化建议 | 模拟 10 次 team 任务 | 输出建议文件 |

---

## 附录：关键脚本调用关系图

```
men 任务完成
  └─ chi judge 完成（PASS / FAIL）
       └─ learn.mjs（异步触发，不阻塞）
            ├─ 读取 events.jsonl（最近 1 次任务）
            ├─ learn-rules.mjs（L1 分类）
            │    ├─ type-A → skill-evolve.mjs（更新 frontmatter）
            │    ├─ type-B → 写入 errors/（lesson 记录）
            │    └─ type-C → 标记 human-gate（写入 queue.json）
            └─ exit 0（best-effort）

每 10 次任务后（由 learn.mjs 计数触发）
  ├─ eval-metrics.mjs（采集 8 项 KPI）
  ├─ eval-report.mjs（生成 .md 报告）
  └─ meta-learn.mjs（仅 team 类任务 ≥10 次时触发）

每次任务分发前（由 men 调用）
  └─ knowledge-inject.mjs（按 Category 注入知识）
       ├─ 读 knowledge/topics/（research/write）
       ├─ 读 knowledge/patterns/（code/review）
       └─ 读 errors/（code/review）

每次技能修改前（由 skill-evolve.mjs 调用）
  └─ 备份当前版本到 .agents/state/skills/backups/
```

---

*本文档是纯设计文档，不包含实现代码。所有脚本均遵循纯 Node ESM（.mjs）、零第三方依赖、Windows pwsh 兼容的约束。*