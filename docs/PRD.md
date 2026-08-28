# 产品需求文档（PRD）— Men Agent 团队

> 版本：M7 完成版 ｜ 日期：2026-08-21
> 定位：OpenCode 首发 6+1 Agent 团队，面向一人内容创作与工程协作

---

## 一、项目定位

**围绕一人内容创作与工程协作的 6+1 Agent 团队**（6 角色 + 用户），以 men（门）为唯一编排入口，坚持机械验证优先、拒绝 LLM 自评，全部运行于 OpenCode 原生 agent 定义之上，不做外部插件。

## 二、团队角色

| 角色 | 中文名 | 定位 | 承担职能 | 模式 |
|------|--------|------|----------|------|
| **men** 🚪 | 门 | 编排与路由核心 | 意图分诊、任务分发、结果汇总、事件审计 | **primary**（唯一接收用户指令） |
| **si** 🖊️ | 思 | 规划与写作 | 需求访谈、plan envelope、内容写作、回评 | subagent |
| **ji** 🛠️ | 记 | 代码与工程 | 前端实现、GitHub 操作、L1 机械验证、目录结构审计 | subagent |
| **chi** 💹 | 持 | 投资与评审 | 持仓/财务分析 + **独立 Judge（fresh-context 复核）** | subagent |
| **yi** 🎨 | 艺 | 视觉设计 | 设计决策、Logo 概念、生图（SenseNova 仅 yi 挂载） | subagent |
| **xun** 🔍 | 寻 | 搜索与研究 | 网页搜索、事实核查、RSS 扫描、来源验证 | subagent |

## 三、核心机制

### 3.1 意图门路由（IntentGate）

men 收到任务先走四类意图判定：

| 意图 | 触发场景 | 执行策略 | 是否需 chi judge |
|------|----------|----------|------------------|
| `search` | 查信息/新闻/资料 | 单路 spawn xun | 否 |
| `analyze` | 分析/评估/评审 | 相关专家 + chi judge 独立复核 | 是 |
| `team` | 多领域/跨领域 | si 规划 → 多路 Wave 并行 → chi 终验 | 是 |
| `hyperplan` | 复杂项目启动 | 访谈式规划 → 计划 → 拆解 | 视产出而定 |

低置信时**向用户确认，不猜**。

### 3.2 Wave 并行调度

- 依赖 Wave N-1 结果的子任务进 Wave N
- 并行上限 ≤4 个同时
- 每个子任务 prompt 必须完整自洽（子 agent 无法追问 men）
- men 是唯一 spawner，禁止嵌套 spawn

### 3.3 双层验证（机械 + 语义）

```
verify.mjs 五项机械检查（退出码/文件存在性/secrets/TODO/structure）
     ↓ 全 PASS 才进入
chi fresh-context 独立 Judge 语义复核（只信自己的检查结果，不信自述）
     ↓
判定 PASS / FAIL / REGRESSED / BLOCKED
```

### 3.4 事件审计

- 每次 `/ultrawork` 用独立 sid（`ultrawork-<时间戳>`）
- 通过 `scripts/event.mjs append` 追加到 `.agents/state/sessions/<sid>/events.jsonl`
- 14 种 kind 枚举（session.created/ended、boundary、workflow.phase、gate.passed/failed、blocker.raised、decision.made/missing、verify、judge、error、dispatch、handoff）
- 全部 best-effort，命令失败不阻塞主流程

## 四、里程碑

| 里程碑 | 交付物 | 状态 |
|--------|--------|------|
| M0 调研 | `docs/research/` 三份（OmO + oma + 合成笔记） | ✅ 完成 |
| M1 骨架 | 6 角色 agent 定义 + 15 个技能包 + 3 个 command + 3 个脚本 | ✅ 完成 |
| M2 单兵 | 5 角色独立任务验收（si 团队简介、ji skill 结构、xun AI 新闻、yi Logo 概念、chi judge 报告） | ✅ 完成（5/5） |
| M3 编排 | ultrawork 三路并行汇总跑通（写文章+查新闻+查金价混合任务） | ✅ 完成 |
| M4 机械验证 | verify.mjs / gate.mjs / event.mjs 三项脚本 + chi 双层复核跑通；识破"假完成"（产出文件缺失）、修复 verify.mjs structure 误报（非 `.opencode/` 作用域的 .md 跳过 frontmatter 检查） | ✅ 完成 |
| M5 文档 | PRD / architecture / quickstart / milestones / governance / learning-architecture 六份文档 | ✅ 完成 |
| M6 GitHub 基础设施 | LICENSE (MIT) / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT / PR&Issue 模板 / CODEOWNERS / FUNDING / dependabot / CI workflow / docs/governance | ✅ 完成 |
| M7 自主学习回路 | learn.mjs / eval-metrics.mjs / knowledge/errors/ / knowledge/patterns/ / knowledge/decisions/ | ✅ 完成：已验证 learn.mjs 正确提取 REVISION_NEEDED，eval-metrics.mjs 计算 8 项 KPI |

## 五、验收标准

- **机械验证优先**：验证判定以退出码、文件存在性、JSON 可解析性等机械证据为准，拒绝 LLM 自评
- **不信自述**：chi judge 只核对实际产物文件，不接受任何子 agent 的"我完成了"作为完成证据
- **识破假完成**：verify.mjs `output-exists` 检查文件是否真实存在且非空，缺失即 FAIL
- **超限诚实停止**：强化次数 ≥5 → GATE_EXHAUSTED，报"卡住"，把已完成中间产物交用户
- **事件审计可回溯**：所有关键决策写入 events.jsonl，可用 `node scripts/event.mjs replay --sid <sid>` 回放
- **命名暂定 men**：仓库命名为 `men`（门），团队名 Men Agent 团队为暂定，可调整
- **GitHub 基础设施完备**：LICENSE / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT / PR&Issue 模板 / CODEOWNERS / CI workflow
- **文档可维护**：governance.md 定义角色职责、决策流程、变更管理、发布策略
- **自主学习可触发**：`/ultrawork` 完成后自动调用 `learn.mjs`，`/verify` 完成后自动调用 `eval-metrics.mjs`
- **经验可沉淀**：错误模式写入 `knowledge/errors/`，协作模式写入 `knowledge/patterns/`
- **评估可量化**：`eval-metrics.mjs` 从 events.jsonl 计算 KPI（通过率、回归率、耗时）
- **自主学习验证通过**：learn.mjs 对 ultrawork-20260815-213941 正确输出 type:B，写入 errors/error-*.md
- **评估指标验证通过**：eval-metrics.mjs 对 ultrawork 会话输出 total:3, knowledge:5, efficiency:50%
- **事件类型归一化**：learn-rules.mjs 和 eval-metrics.mjs 均支持 men.* 前缀映射
- **知识库已初始化**：errors/（1 条）+ knowledge/patterns/（3 条）+ knowledge/decisions/（3 条）
