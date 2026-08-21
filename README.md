# men（门）Agent 团队

> 围绕一人内容创作与工程协作的 6+1 Agent 团队系统 —— OpenCode 首发 + Pi Harness 兼容，假维斯（fakevis）出品。

---

## ✨ 特性

| 特性 | 说明 |
|------|------|
| **6+1 角色分工** | 门（编排）· 思（规划/写作）· 记（代码/工程）· 持（投资评审/Judge）· 艺（视觉设计）· 寻（搜索研究），各司其职 |
| **一键编排** | `/ultrawork` 9 步协议自动调度，多 Wave 并行分发，用户只需给任务一句话 |
| **双层机械验证** | `verify.mjs` 五项机械检查 + chi 独立 Judge 语义复核，假完成必识破 |
| **安全门禁** | `gate.mjs` 白名单 typecheck/test/lint 防注入，强化上限 5 次防死循环 |
| **全量事件审计** | `events.jsonl` 记录 9 种事件，支持命令行回放，所有决策可追溯 |
| **零依赖脚本** | 纯 Node 运行，验证/门禁/审计/学习/评估五件套无第三方依赖 |
| **自主学习闭环** | learn.mjs 自动从失败中提取经验，eval-metrics.mjs 量化团队进化 |
| **双 Harness 兼容** | OpenCode 原生 agent 定义 + Pi Harness（`@johnnywu/pi-subagents`），同一套 skills 与 scripts 共享 |
| **本地优先** | 内网数据源 + free 模型通道，SenseNova 生图仅艺角色挂载 |
| **单字命名** | 门·思·记·持·艺·寻，古典文人气质，易记好读 |

---

## 🚀 快速开始

### 前置要求

- **Node.js ≥ 18**
- **OpenCode CLI**（[opencode.ai](https://opencode.ai/)）

### 一键安装（推荐）

**Linux / macOS**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/cgartlab/men/main/install.sh)
```

**Windows（PowerShell 7+）**

```powershell
irm https://raw.githubusercontent.com/cgartlab/men/main/install.ps1 | iex
```

### 手动三步

1. **获取项目**
   ```bash
   git clone https://github.com/cgartlab/men.git
   cd men
   ```

2. **安装依赖**
   ```bash
   cd .opencode && npm install && cd ..
   ```

3. **启动使用**
   ```bash
   opencode
   ```

### 三个核心命令

| 命令 | 用法 | 说明 |
|------|------|------|
| `/ultrawork` | `/ultrawork <任务描述>` | 一键编排：9 步协议自动调度多角色协作 |
| `/verify` | `/verify <角色名>` | 运行机械验证 + chi 独立 Judge 复核 |
| `/hyperplan` | `/hyperplan <项目名>` | 访谈式规划：逐层拆解复杂项目为可执行计划 |

---

## 👥 角色表

| 角色 | 中文名 | 模式 | 职责 |
|------|--------|------|------|
| **men** 🚪 | 门 | primary | 意图分诊、任务分发、结果汇总、事件审计 — 唯一接收用户指令 |
| **si** 🖊️ | 思 | subagent | 需求访谈、plan envelope、内容写作、回评 |
| **ji** 🛠️ | 记 | subagent | 前端实现、GitHub 操作、L1 机械验证、目录结构审计 |
| **chi** 💹 | 持 | subagent | 持仓/财务分析 + **独立 Judge**（fresh-context 语义复核） |
| **yi** 🎨 | 艺 | subagent | 设计决策、Logo 概念、生图（SenseNova 仅 yi 挂载） |
| **xun** 🔍 | 寻 | subagent | 网页搜索、事实核查、RSS 扫描、来源验证 |

### 协作拓扑

```
用户 → men(门, orchestrator) → si(思, planner/writer)
                                ji(记, engineer)
                                chi(持, investor + judge)
                                yi(艺, designer)
                                xun(寻, researcher)
```

men 是唯一 spawner，禁止嵌套 spawn。所有子 agent 共享 7 条全员红线。

---

## 🛠️ 命令表

| 命令 | 用法 | 说明 |
|------|------|------|
| **ultrawork** | `/ultrawork <任务>` | 9 步协议一键编排：意图判定 → 规划 → 多路 Wave 并行 → 汇总 → 验证 → 交付 |
| **verify** | `/verify <角色>` | 运行 `scripts/verify.mjs` 五项机械检查，随后 chi 以 fresh context 独立 Judge 语义复核 |
| **hyperplan** | `/hyperplan <项目>` | 访谈式规划：逐层提问澄清需求 → 生成 plan envelope → 拆解为可执行子任务 |
| **release** | `npm run release` | 版本发布：SemVer bump + CHANGELOG + git tag |

---

## 🧠 自主学习闭环

团队支持自我改进系统（详见 [`docs/learning-architecture.md`](docs/learning-architecture.md)）：

```
任务完成（chi judge PASS/FAIL）
  → learn.mjs 自动触发
    → 经验分类（规则判定表）
    → 落盘到 errors/ + knowledge/patterns/
  → eval-metrics.mjs 每 10 次任务采集 8 项 KPI
```

### 8 项 KPI 指标

| 指标 | ID | 含义 |
|------|----|------|
| 任务完成率 | KPI-task-completion | PASS / 总任务数 |
| 一次通过率 | KPI-first-pass | 首次即 PASS 的任务占比 |
| 回归率 | KPI-regression | REGRESSED / 总 judge 次数 |
| 平均重试次数 | KPI-avg-retries | 总重试 / 总任务 |
| 技能使用率 | KPI-skill-usage | 各技能触发分布 |
| 知识沉淀率 | KPI-knowledge | knowledge/ 新增条目 / 日 |
| 错误重复率 | KPI-error-repeat | 同类错误重复占比 |
| 学习效率 | KPI-learn-efficiency | 学习 token / 总 token |

---

## 🔧 双 Harness 兼容

本项目同时兼容两套 Agent 框架：

| 框架 | 配置入口 | Agent 定义 | Skills |
|------|---------|-----------|--------|
| **OpenCode** | `opencode.json` | `.opencode/agent/*.md` | `.opencode/skills/*/SKILL.md` |
| **Pi** | `package.json` → `pi` 字段 | `.pi/agents/*.md` | 通过 `.pi/skills/` junction 桥接到 `.opencode/skills/` |

Pi 安装：

```bash
pi install npm:@johnnywu/pi-subagents
```

---

## 📁 项目结构

```
men/
├── opencode.json              # OpenCode 根配置
├── AGENTS.md                  # 项目级共享规则
├── package.json               # 根配置（含 pi manifest）
├── README.md                  # 本文件
├── LICENSE                    # Apache-2.0
├── CHANGELOG.md               # 变更日志
├── .env.example               # 环境变量模板
├── .gitignore                 # Git 忽略规则
├── install.sh / install.ps1   # 一键安装引导
│
├── .opencode/                 # OpenCode 原生配置
│   ├── agent/                 # 6 个 agent 定义
│   ├── skills/                # 13 个技能包
│   ├── command/               # 3 个自定义命令
│   └── package.json           # @opencode-ai/plugin 本地依赖
│
├── .pi/                       # Pi Harness 兼容层
│   ├── settings.json          # 包声明
│   ├── APPEND_SYSTEM.md       # men 编排指令
│   ├── agents/                # 5 个子 agent 定义
│   └── skills/                # junction → .opencode/skills/
│
├── prompts/                   # Pi prompt 模板
│   ├── ultrawork.md
│   ├── hyperplan.md
│   └── verify.md
│
├── scripts/                   # 纯 Node 零依赖
│   ├── verify.mjs             # 五项机械检查
│   ├── gate.mjs               # 白名单门禁
│   ├── event.mjs              # 事件审计
│   ├── learn.mjs              # 学习闭环
│   ├── learn-rules.mjs        # L1 规则判定
│   ├── learn-budget.mjs       # 学习成本控制
│   ├── eval-metrics.mjs       # KPI 采集
│   ├── eval-report.mjs        # 评估报告
│   ├── install.mjs            # 一键安装
│   └── release.mjs            # 版本发布
│
├── knowledge/                 # 团队知识库
├── .agents/state/             # 事件审计 + 学习状态
├── config/                    # MCP 配置
└── docs/                      # 项目文档
```

---

## 📚 文档导航

| 文档 | 路径 | 内容 |
|------|------|------|
| **PRD** | `docs/PRD.md` | 产品需求文档 |
| **架构说明** | `docs/architecture.md` | 系统架构（含 mermaid 流程图） |
| **快速上手** | `docs/guide/quickstart.md` | 新用户入门 |
| **里程碑** | `docs/guide/milestones.md` | M0–M7 进度记录 |
| **发布方案** | `docs/guide/release.md` | SemVer 发布流程 |
| **学习架构** | `docs/learning-architecture.md` | 自主学习与进化系统设计 |
| **调研合成** | `docs/research/00-m0-synthesis.md` | 架构决策来源 |

---

## 🏁 里程碑状态

| M0 调研 | M1 骨架 | M2 单兵 | M3 编排 | M4 验证 | M5 文档 | M6 学习 | M7 Pi Harness |
|---------|---------|---------|---------|---------|---------|---------|---------------|
| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| Agent 框架 | OpenCode 原生 agent 定义 + 自定义 command + Pi Harness 兼容 |
| 运行时 | Node.js ≥ 18（纯 Node ESM，零第三方依赖） |
| 验证体系 | 纯 Node 脚本（verify/gate/event/learn/eval），零依赖 |
| MCP 工具 | Exa 搜索、Context7、grep.app |
| 设计理念 | 机械验证优先 · 不信自述 · 低置信确认 · 事件可回溯 |

---

## 📄 许可证

本项目采用 **Apache License 2.0**。详见 [LICENSE](LICENSE)。

Apache 2.0 允许自由使用、修改、商用，包含专利授权保护与商标条款。

版权所有 © 2026 fakevis（假维斯）。
