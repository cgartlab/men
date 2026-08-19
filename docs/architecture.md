# 架构说明（Architecture）— 假维斯（men Agent 团队）

> 版本：M5 ｜ 日期：2026-08-15
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

## 四、目录结构

```
men/
├── AGENTS.md                   ← 项目级共享规则（红线 / Charter / 目录结构）
├── opencode.json               ← default_agent: men + MCP×3（exa/context7/grep_app）
├── config/
│   └── mcporter.json           ← MCP 配置
├── .opencode/
│   ├── agent/
│   │   ├── men.md              ← 编排核心（primary）
│   │   ├── si.md               ← 规划/写作（subagent）
│   │   ├── ji.md               ← 代码工程（subagent）
│   │   ├── chi.md              ← 投资/评审（subagent + judge）
│   │   ├── yi.md               ← 视觉设计（subagent）
│   │   └── xun.md              ← 搜索研究（subagent）
│   ├── skills/                 ← 13 个 skill（每个含 SKILL.md + frontmatter）
│   │   ├── chi-invest / chi-judge
│   │   ├── ji-frontend-design / ji-github / ji-l1-verify
│   │   ├── si-content-write / si-knowledge / si-plan-compose
│   │   ├── xun-factcheck / xun-rss-scan / xun-search
│   │   └── yi-design / yi-imagegen
│   ├── command/
│   │   ├── ultrawork.md        ← 一键编排（9 步协议）
│   │   ├── verify.md           ← 双层验证（verify.mjs + chi judge）
│   │   └── hyperplan.md        ← 访谈式规划
│   ├── package.json            ← @opencode-ai/plugin 1.18.18（本地安装）
│   └── .gitignore
├── .agents/
│   └── state/
│       └── sessions/           ← events.jsonl 事件审计
│           └── <sid>/events.jsonl
├── scripts/                    ← 纯 Node 零依赖
│   ├── verify.mjs              ← 五项机械检查
│   ├── gate.mjs                ← stop-hook 门禁
│   └── event.mjs               ← events.jsonl 读写
├── docs/
│   ├── PRD.md                  ← 产品需求文档
│   ├── architecture.md         ← 本文档
│   ├── research/               ← M0 调研笔记
│   ├── guide/
│   │   ├── quickstart.md       ← 快速上手
│   │   └── milestones.md       ← 里程碑进度
│   ├── m2-acceptance/          ← M2 验收产物
│   └── drafts/                 ← 任务产物草稿
└── oh-my-openagent/            ← 上游参考 clone
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
