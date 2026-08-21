# 产品需求文档（PRD）— 假维斯（men Agent 团队）

> 版本：M7 归档版 ｜ 日期：2026-08-21
> 定位：双 Harness 兼容 6+1 Agent 团队，面向一人内容创作与工程协作

---

## 一、项目定位

**围绕一人内容创作与工程协作的 6+1 Agent 团队**（6 角色 + 用户），以 men（门）为唯一编排入口，坚持机械验证优先、拒绝 LLM 自评。同时兼容两套 Agent 框架：

- **OpenCode**（主框架）：原生 agent 定义 + 自定义 command
- **Pi Harness**（`@johnnywu/pi-subagents`）：`.pi/` 目录桥接，与 OpenCode 共享 skills 与 scripts

---

## 二、团队角色

| 角色 | 中文名 | 定位 | 承担职能 | 模式 |
|------|--------|------|----------|------|
| **men** 🚪 | 门 | 编排与路由核心 | 意图分诊、任务分发、结果汇总、事件审计 | **primary**（唯一接收用户指令） |
| **si** 🖊️ | 思 | 规划与写作 | 需求访谈、plan envelope、内容写作、回评 | subagent |
| **ji** 🛠️ | 记 | 代码与工程 | 前端实现、GitHub 操作、L1 机械验证、目录结构审计 | subagent |
| **chi** 💹 | 持 | 投资与评审 | 持仓/财务分析 + **独立 Judge（fresh-context 复核）** | subagent |
| **yi** 🎨 | 艺 | 视觉设计 | 设计决策、Logo 概念、生图（SenseNova 仅 yi 挂载） | subagent |
| **xun** 🔍 | 寻 | 搜索与研究 | 网页搜索、事实核查、RSS 扫描、来源验证 | subagent |

---

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
- 9 种 kind 枚举
- 全部 best-effort，命令失败不阻塞主流程

### 3.5 自主学习闭环（M6）

任务完成后自动触发：

```
chi judge（PASS / FAIL）→ learn.mjs（异步，不阻塞）
  → 规则判定表（L1 机械分类）
    → type-A：技能描述微调（auto）
    → type-B：错误模式提取到 errors/（auto）
    → type-C：协作流程问题（human-gate）
  → eval-metrics.mjs（每 10 次任务）采集 8 项 KPI
  → eval-report.mjs 生成评估报告
```

详见 [`docs/learning-architecture.md`](learning-architecture.md)。

### 3.6 双 Harness 兼容（M7）

| 维度 | OpenCode（主框架） | Pi Harness（兼容层） |
|------|--------------------|--------------------|
| Agent 定义 | `.opencode/agent/*.md` | `.pi/agents/*.md` |
| Skills 加载 | `.opencode/skills/` | `.pi/skills/` junction → `.opencode/skills/` |
| 命令模板 | `.opencode/command/` | `prompts/*.md` |
| 根配置 | `opencode.json` | `package.json` → `pi` manifest |
| Skills 共享 | ✅ 同目录 | ✅ junction 桥接 |
| Scripts 共享 | ✅ 纯 Node | ✅ Pi bash 直接调用 |

---

## 四、里程碑

| 里程碑 | 交付物 | 状态 |
|--------|--------|------|
| M0 调研 | `docs/research/` 三份（OmO + oma + 合成笔记） | ✅ 完成 |
| M1 骨架 | 6 角色 agent 定义 + 13 个 skill + 3 个 command + 3 个脚本 | ✅ 完成 |
| M2 单兵 | 5 角色独立任务验收（5/5 全部通过） | ✅ 完成 |
| M3 编排 | ultrawork 三路并行汇总跑通 | ✅ 完成 |
| M4 机械验证 | verify/gate/event 三件套 + chi 双层复核 | ✅ 完成 |
| M5 文档 | PRD / architecture / quickstart / milestones / release 五份文档 | ✅ 完成 |
| M6 自主学习 | learn/eval 五脚本 + 8 项 KPI + 8 问题设计 | ✅ 完成 |
| M7 Pi Harness | `.pi/` 兼容层 + prompts/ + package.json pi manifest | ✅ 完成 |

---

## 五、验收标准

- **机械验证优先**：验证判定以退出码、文件存在性、JSON 可解析性等机械证据为准
- **不信自述**：chi judge 只核对实际产物文件
- **识破假完成**：verify.mjs `output-exists` 检查文件是否真实存在且非空
- **超限诚实停止**：强化次数 ≥5 → GATE_EXHAUSTED
- **事件审计可回溯**：所有关键决策写入 events.jsonl
- **跨 Harness 一致**：OpenCode 与 Pi 使用同一套 skills、scripts、knowledge

---

## 六、附录：决策记录

| # | 决策 | 说明 |
|---|------|------|
| D1 | 命名暂定 men | 仓库 `men`（门），团队名 `fakevis`（假维斯） |
| D2 | 双 Harness 兼容 | 主框架 OpenCode，Pi Harness 为兼容层，共享底层 |
| D3 | adapter 跨运行时复用 | 未进入当前里程碑 |
| D4 | M1 先不做插件 | OpenCode 原生 agent 定义 + command 起步 |
| D5 | SenseNova 生图仅 yi 挂载 | 密钥仅对 yi 暴露 |
| D6 | 全部脚本纯 Node 零依赖 | 仅用 Node 内置模块 |
| D7 | 事件审计 best-effort | 失败不阻塞主流程 |
| D8 | 学习后台异步 | 学习不阻塞任务执行 |
