# 架构说明（Architecture）— 假维斯（men Agent 团队）

> 版本：M7 ｜ 日期：2026-08-21
> 关联：`docs/research/00-m0-synthesis.md` 提供上游调研与决策来源

---

## 一、协作拓扑

```mermaid
graph TD
    U[用户] -->|唯一指令入口| men[men 门 / primary<br/>唯一接收 / 唯一 spawner]
    men -->|spawn task| si[si 思 / planner-writer]
    men -->|spawn task| ji[ji 记 / engineer]
    men -->|spawn task| chi[chi 持 / investor + judge]
    men -->|spawn task| yi[yi 艺 / designer]
    men -->|spawn task| xun[xun 寻 / researcher]
    chi -.->|fresh-context judge| ji
    chi -.->|fresh-context judge| yi
    men -->|汇总四段报告| U
```

- **men 唯一 primary**：用户只与 men 对话，所有用户输入先经 men 分诊
- **men 唯一 spawner**：5 个 subagent 之间禁止互相 spawn（无嵌套）
- **chi 双重角色**：既是投资分析角色，又是所有 analyze / team 任务的独立 Judge

## 二、编排流程（ultrawork）

```mermaid
flowchart TD
    A[CERTAINTY<br/>需求确认] --> B{TRIAGE<br/>四类意图判定}
    B -->|search| C1[直接分发 xun]
    B -->|analyze| C2[单专家 + chi judge]
    B -->|team| C3[PLAN: si 规划]
    B -->|hyperplan| C4[hyperplan 访谈式规划]
    C3 --> D[DISPATCH Wave<br/>≤4 并行 / 依赖串行]
    D --> E[COLLECT<br/>收集产物]
    E --> F[EVALUATE<br/>si 回评]
    F --> G{VERIFY 双层}
    G -->|verify.mjs<br/>机械检查| G1{五项全 PASS?}
    G1 -->|否| D
    G1 -->|是| G2[chi judge<br/>fresh-context 语义复核]
    G2 -->|FAIL| D
    G2 -->|PASS| H[REPORT 四段模板]
    C1 --> H
    C2 --> H
    C4 --> C3
    H --> I{LOOP<br/>验证失败?}
    I -->|是, ≤5 次| D
    I -->|超过 5 次| J[GATE_EXHAUSTED<br/>报卡住]
    I -->|否| K[任务完成]
```

9 步协议：`CERTAINTY → TRIAGE → PLAN → DISPATCH → COLLECT → EVALUATE → VERIFY → REPORT → LOOP`

### 10. LEARN（M7 新增）

`/ultrawork` 完成后，men 触发 `node scripts/learn.mjs --sid <sid> --json`：
- 从 events.jsonl 提取经验（type-A/B/C 分类）
- 写入 `knowledge/errors/`（错误模式）和 `knowledge/patterns/`（协作模式）
- best-effort，不阻塞 REPORT

`/verify` 完成后，chi 触发 `node scripts/eval-metrics.mjs --sid <sid> --json`：
- 从 events.jsonl 计算 8 项 KPI（最近 10 次任务窗口）
- 输出通过率、回归率、平均耗时等指标
- best-effort，不阻塞 Judge 报告

## 三、验证体系

```mermaid
flowchart LR
    A[子任务产物<br/>文件/退出码] --> B[verify.mjs<br/>五项机械检查]
    B --> B1[output-exists]
    B --> B2[secrets]
    B --> B3[todo-scan]
    B --> B4[structure]
    B --> B5[gate-exit-code]
    B1 & B2 & B3 & B4 & B5 -->|汇总 JSON<br/>退出码非 0 即 FAIL| C{机械门禁}
    C -->|有 FAIL| D[回到失败点重试]
    C -->|全 PASS| E[chi fresh-context<br/>独立 Judge]
    E -->|PASS| F[gate.passed → event.mjs]
    E -->|FAIL| D
    E -->|BLOCKED<br/>连续 3 次失败| G[blocker.raised → event.mjs<br/>报卡住]
    F & G --> H[events.jsonl<br/>审计留痕]
```

- **gate.mjs**：stop-hook 门禁（白名单 typecheck/test/lint，60s 超时，强化次数上限 5）
- **event.mjs**：append-only events.jsonl（append / list / replay / validate 四子命令）
- **全部纯 Node 零依赖**，Windows pwsh 兼容

### 学习回路（M7）

```mermaid
flowchart LR
    A[任务完成<br/>PASS/FAIL/BLOCKED] --> B[events.jsonl<br/>事件流]
    B --> C{LEARN 触发<br/>men 或 chi}
    C -->|ultrawork| D[learn.mjs<br/>L0 机械聚合<br/>L1 规则分类]
    C -->|verify| E[eval-metrics.mjs<br/>KPI 计算]
    D --> F[knowledge/errors/<br/>错误模式]
    D --> G[knowledge/patterns/<br/>协作模式]
    E --> H[KPI JSON<br/>8 项指标]
```

## 四、目录结构

```
men/
├── AGENTS.md                   ← 项目级共享规则（红线 / Charter / 目录结构）
├── README.md                   ← 项目首页（徽章 / 特性 / 安装 / 角色 / 命令）
├── LICENSE                     ← MIT 许可证
├── CONTRIBUTING.md             ← 贡献指南
├── SECURITY.md                 ← 安全策略
├── CODE_OF_CONDUCT.md          ← 行为准则
├── CHANGELOG.md                ← 变更日志（Keep a Changelog）
├── package.json                ← 包管理（版本 / scripts / files 白名单）
├── .env.example                ← 环境变量模板
├── install.sh                  ← Linux/macOS 一键安装引导
├── install.ps1                 ← Windows 一键安装引导
│
├── opencode.json               ← default_agent: men + MCP×7（exa/context7/grep_app/fetch/github/memory/sequential-thinking）
├── config/
│   └── mcporter.json           ← MCP 配置（Exa 搜索）
│
├── .opencode/
│   ├── agent/                  ← 6 个 agent 定义
│   │   ├── men.md              ← 门 — 编排与路由
│   │   ├── si.md               ← 思 — 规划与写作
│   │   ├── ji.md               ← 记 — 代码与工程
│   │   ├── chi.md              ← 持 — 投资与评审
│   │   ├── yi.md               ← 艺 — 视觉设计
│   │   └── xun.md              ← 寻 — 搜索与研究
│   ├── skills/                 ← 13 个 skill
│   │   ├── chi-invest / chi-judge
│   │   ├── ji-frontend-design / ji-github / ji-l1-verify
│   │   ├── ji-content-write / si-knowledge / si-plan-compose
│   │   ├── xun-factcheck / xun-rss-scan / xun-search
│   │   └── yi-design / yi-imagegen
│   ├── command/                ← 3 个自定义命令
│   │   ├── ultrawork.md        ← 一键编排
│   │   ├── verify.md           ← 验证命令
│   │   └── hyperplan.md        ← 访谈式规划
│   ├── package.json            ← @opencode-ai/plugin 本地依赖
│   └── .gitignore
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml              ← CI 工作流
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── ISSUE_TEMPLATE/         ← bug_report + feature_request（.md + .yml）
│   ├── CODEOWNERS
│   ├── FUNDING.yml
│   ├── dependabot.yml
│   └── projects.json
│
├── scripts/                    ← 纯 Node 零依赖脚本
│   ├── verify.mjs              ← 五项机械检查
│   ├── gate.mjs                ← 门禁
│   ├── event.mjs               ← 事件审计
│   ├── install.mjs             ← 一键安装核心
│   ├── release.mjs             ← 版本发布
│   ├── learn.mjs               ← 自主学习循环入口
│   ├── learn-rules.mjs         ← 学习分类规则
│   ├── learn-budget.mjs        ← 学习预算
│   ├── eval-metrics.mjs        ← 评估指标计算
│   ├── eval-report.mjs         ← 评估报告生成
│   ├── fix-port-4096.ps1       ← 端口修复
│   └── sync-to-opencode.ps1    ← OpenCode 全局同步
│
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── governance.md           ← 团队治理
│   ├── learning-architecture.md ← 自主学习架构
│   ├── guide/
│   │   ├── quickstart.md
│   │   ├── milestones.md
│   │   └── release.md
│   ├── research/
│   │   ├── 00-m0-synthesis.md
│   │   ├── oh-my-agent.md
│   │   ├── oh-my-openagent.md
│   │   └── 05-agents-autonomous-evolution-sota.md
│   ├── m2-acceptance/
│   └── drafts/
│
├── knowledge/                  ← 团队知识库
│   ├── errors/                 ← 错误模式
│   ├── patterns/               ← 模式库
│   └── decisions/              ← 决策记录
│
├── .agents/state/
│   ├── sessions/               ← events.jsonl 事件审计
│   ├── gates/                  ← gate 状态文件
│   └── learn/                  ← 学习队列
```

## 五、技术决策记录

| # | 决策 | 依据 | 状态 |
|---|------|------|------|
| D1 | **men 唯一 primary**，用户只与 men 对话 | PRD 编排要求 + OmO orchestrator 模式 | 已落地 |
| D2 | **men 唯一 spawner**，subagent 禁止嵌套 spawn | 降低复杂度、避免递归失控 | 已落地 |
| D3 | **机械验证优先**，拒绝 LLM 自评 | oma 机械门禁哲学 + M0 调研结论 | 已落地 |
| D4 | **双层验证**：verify.mjs 机械 + chi fresh-context 语义 | F4 机械验证体系映射 | 已落地 |
| D5 | **M1 先不做插件**，OpenCode 原生 agent 定义 + command 起步 | 降低初始复杂度；插件化留到 M5 后 | 已落地 |
| D6 | **本地优先**：数据源内网（192.168.31.x），SenseNova 生图仅 yi 挂载 | PRD G6 + omO 3 层 MCP 分层 | 已落地 |
| D7 | **意图分类用规则判定表**，不用 LLM 分类 | 机械优先 + PRD §3.1 | 已落地 |
| D8 | **强化次数上限 5 次**，超限诚实报"卡住" | oma MAX_REINFORCEMENTS=5 | 已落地 |
| D9 | **事件审计 best-effort**，命令失败不阻塞主流程 | oma events.jsonl 规范 | 已落地 |
| D10 | **命名暂定 men（门）**，团队名暂定 fakevis（假维斯） | 命名可后续调整 | 已落地 |
| D11 | **adapter 后续适配 Codex / OpenClaw** | 跨运行时复用，未进入当前里程碑 | 待 M5 后 |
| D12 | **技术栈 TypeScript + Bun** | 两上游一致，OpenCode 插件生态 | 已落地（脚本侧用纯 Node） |
| D13 | **自主学习回路**（M5+ 增量） | 四层认知模型（评估/认知/行为/记忆），L0/L1/L2 三级触发，events.jsonl → learn.mjs → errors/ + patterns/ | 已落地 |
| D14 | **GitHub 标准化**（M6） | LICENSE/CONTRIBUTING/SECURITY/CODE_OF_CONDUCT/PR&Issue 模板/CODEOWNERS/dependabot/CI workflow | 已落地 |
| D15 | **MIT 许可证** | 替代 Apache-2.0，简化贡献流程 | 已落地 |
| D16 | **自主学习已验证** | learn.mjs 对历史 ultrawork 会话正确提取 REVISION_NEEDED 错误模式；eval-metrics 8 项 KPI 全部计算 | 已落地 |
| D17 | **事件类型归一化** | learn-rules.mjs 和 eval-metrics.mjs 均支持 men.* 前缀映射，兼容 ultrawork 事件格式 | 已落地 |
| D18 | **Ji 承担写作职责** | 用户确认 Ji 原始设计含写作，写作从 si 移交 ji（ji-content-write skill），si 专注规划与知识管理 | 已落地 |
| D19 | **学习回流闭环**（R1-R5） | men 路由前读 knowledge/patterns + route-hint.mjs；learn.mjs --apply 转门禁；chi plan review 类型；KPI 落盘 | 已落地 |
