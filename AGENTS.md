# AGENTS.md — Men Agent 团队

> **本仓库用途**：OpenCode Agent 团队配置（6 个角色定义）为主 + 纯 Node 脚本 + OpenCode 插件（验证自动化）；运行时全部靠 `.opencode/` 配置。

## 仓库状态

- **M0–M7 全部完成**（调研/骨架/单兵/编排/机械验证/文档/GitHub 基础设施/自主学习回路），项目 v0.3.5（npm 包 `@cgartlab/men` 已发布，支持 `npx @cgartlab/men` 一行安装）
- **自主学习回路已验证**：learn.mjs 正确识别 ultrawork 事件并写入 errors/，eval-metrics.mjs 计算 8 项 KPI 正常
- **MCP 由 CC Switch 统一管理**：仓库不携带任何 mcp 配置（模型/密钥/MCP 均在本地 CC Switch 托管），Men 定位为纯 Agent + 协作代码
- **GitHub 私有仓库**：`cgartlab/men`（main 分支），MIT 许可证
- **CI + 机械验证**：GitHub Actions（ci.yml）执行脚本语法检查 + verify + release dry-run + installer smoke

## 关键文件

| 路径 | 用途 |
|------|------|
| `opencode.json` | OpenCode 根配置：`default_agent: "men"`，加载 `AGENTS.md`，**不含 MCP 配置**（MCP 由 CC Switch 统一管理） |
| `.opencode/agent/*.md` | **6 个 agent 定义**（唯一源代码）。每次编辑必须先 read 再 edit |
| `.opencode/skills/*/SKILL.md` | 15 个技能包（ji×4/si×2/xun×3/chi×2/yi×2/men×2） |
| `.opencode/command/*.md` | 自定义命令：`ultrawork` / `verify` / `hyperplan` |
| `.opencode/plugins/men-sidebar/` | **TUI 侧边栏插件**：橘黄徽章 + 版本号统一变量 + agents 兜底链（V8）；`tui.json` 声明 TUI 入口，`@opentui/*` 为其运行时依赖 |
| `scripts/*.mjs` | 机械验证三件套：`verify.mjs`（check battery）/ `gate.mjs`（门禁）/ `event.mjs`（事件审计），纯 Node 零依赖 |
| `scripts/learn.mjs` / `scripts/eval-metrics.mjs` | 自主学习回路（L0/L1 经验提取与评估） |
| `scripts/learn-rules.mjs` | 学习规则判定表（L1 机械，men.* 类型归一化） |
| `scripts/learn-budget.mjs` | 学习预算控制 |
| `scripts/eval-report.mjs` | 评估报告生成 |
| `.opencode/plugins/men-verify.ts` | **产物机械验证自动插件**（渐进式非阻塞）：`write`/`edit` 写产物后自动跑 verify.mjs 检查 |
| `.opencode/plugins/men-learn.ts` | 自动学习插件（任务完成后自动提取经验写入 knowledge/） |
| `errors/` | 学习回路自动生成的错误模式（error-*.md） |
| `knowledge/patterns/` | 协作模式库（3 条初始条目） |
| `knowledge/decisions/` | 决策记录（4 条：M0/M6/M7/D20） |
| `scripts/fix-port-4096.ps1` | 修复 OpenCode 端口 4096 占用 |
| `.github/workflows/ci.yml` | CI 工作流（validate/triage） |
| `.github/` | PR/Issue 模板、CODEOWNERS、FUNDING、dependabot |
| `docs/governance.md` | 团队治理（角色/决策/变更/审查/发布） |
| `docs/learning-architecture.md` | 自主学习与进化架构（四层认知模型） |
| `knowledge/` | 团队知识库（patterns/、decisions/；errors/ 在根目录，见上表） |
| `.opencode/package.json` | `@opencode-ai/plugin` 1.18.23 + `@opentui/*`（侧边栏 TUI 运行时依赖），本地安装 |
| `config/models.json` | 模型知识基（providers/roleDefaults/presets），`setup.mjs` 引导式模型配置的数据源 |
| `docs/PRD.md` | 正式 PRD（里程碑 M0–M5） |
| `docs/architecture.md` | 架构说明（拓扑/编排流程/验证体系 mermaid） |
| `docs/guide/` | 使用指南（quickstart / milestones / release） |
| `docs/research/00-m0-synthesis.md` | 架构决策（PRD → 落地映射），重大变更前必读 |

## Agent 团队拓扑

```
用户 → men(门, orchestrator) → si(思, planner/knowledge)
                                ji(记, engineer)
                                chi(持, investor + judge)
                                yi(艺, designer)
                                xun(寻, researcher)
```

- **men** 是 `primary`（用户唯一对话角色），其余 5 个均为 `subagent`
- 所有 agent 共享"全员红线"（7 条，见各定义底部）和 `CHARTER_CHECK` 字段
- **chi** 兼任独立 judge（fresh context spawn，机械验证）

## 编辑 agent 定义时必须遵守

1. **先 read 再 edit** — `edit` 要求此前已读取过文件
2. **YAML frontmatter** 必须保留：`description`, `mode`, `model`
3. **`CHARTER_CHECK` 字段**：每个 agent 必须有，含 Clarification level / Task domain / Must NOT do / Success criteria
4. **`全员红线` 段落**：6 个 agent 必须逐字一致（复制粘贴，不修改）
5. **model**：按角色分配不同模型。在仓库目录内启动 `opencode` 时，OpenCode 自动加载仓库 `opencode.json`（对终端用户而言这就是运行时配置，与 README/quickstart 一致）；若用户或 CC Switch 管理的 `~/.config/opencode/opencode.json` 显式存在，其 `agent` 字段会覆盖仓库配置：
    - men: `opencode-go/hy3`
    - si: `sensenova/deepseek-v4-flash`
    - ji: `opencode-go/deepseek-v4-flash`
   - chi: `sensenova/glm-5.2`
   - yi/xun: `sensenova/sensenova-6.8-flash-lite`
6. **men 输出规范须保留**：`.opencode/agent/men.md` 含「交互提问与下一步建议规范」（下一步建议**必须调用 OpenCode 内置 `question` 工具**——在 frontmatter 以 `permission.question: allow` 启用，仅 TUI 客户端提供；工具不可用时回退文本选择题：数字问题 + 字母答案）与「人类阅读优先（代号降噪）」（面向用户零内部代号）及「任务列表跟踪（todowrite）」，编辑时必须保留，不得删除或弱化（决策 D20）

## 自主学习回路（M7）

所有任务完成后的自动学习触发：

| 触发点 | 命令 | 执行者 |
|--------|------|--------|
| `/ultrawork` 第 10 步 | `node scripts/learn.mjs --sid <sid> --json` | men |
| `/verify` 第 5 步 | `node scripts/eval-metrics.mjs --sid <sid> --json` | chi |

**学习输出**：
- `learn.mjs` → `knowledge/errors/error-*.md`（错误模式）+ `knowledge/patterns/pattern-*.md`（协作模式）
- `eval-metrics.mjs` → JSON KPI（从 events.jsonl 计算最近 10 次任务的通过率、回归率等）

**所有学习操作 best-effort**，不阻塞主流程。

## 全员红线（7 条）

1. **不伪造输出**：完成 = 验证过的完成。声称完成前必须有机械证据（退出码 0 / 产物文件存在）
2. **不跳过验证**：执行后必须确认结果，不接受"应该没问题"
3. **不泄露用户隐私**：用户数据、API key、个人信息不外传
4. **外部操作先确认**：发邮件、公开发布、对外提交前必须征得用户同意
5. **破坏性操作先询问**：trash > rm，不确定时问用户
6. **需求模糊先问清楚**：不脑补需求，澄清优先于行动
7. **输出格式**：粗体关键信息、emoji 标注状态、列表优先于段落、单段 ≤6 行

## 架构决策（来自 M0 调研，重大变更前必读 `docs/research/00-m0-synthesis.md`）

- **验证哲学**：机械优先（退出码 / 文件存在性），拒绝 LLM 自评
- **角色路由**：关键词判定表 + 低置信时向用户确认，不猜
- **技术栈**：TypeScript + Bun（`oh-my-openagent/` 已提供上游实现参考）
- **本地优先**：内网数据源（192.168.31.x），SenseNova 生图仅 yi 挂载
- **M1 先不做插件**：用 OpenCode 原生 agent 定义 + 自定义 command 起步

## 上游参考

M0 调研期间克隆的参考项目源码（`oh-my-openagent`）已删除（88MB 非产品本体）。参考结论已沉淀在 `docs/research/`，机制来源：

- `docs/research/oh-my-openagent.md` — OmO 编排机制（ultrawork/Team Mode/IntentGate）
- `docs/research/oh-my-agent.md` — oma 机械验证机制（gate/judge/events）
- `docs/research/00-m0-synthesis.md` — 两套机制的合成决策与落地映射
- `docs/research/05-agents-autonomous-evolution-sota.md` — 自主学习 agent 架构调研（M0 补充）

## Node 环境

- **Node >= 18**（`@opencode-ai/plugin` engines 要求）
- 依赖在 `.opencode/node_modules/` 下本地安装，不共享根目录
- `.opencode/.gitignore` 排除了 `node_modules`, `package-lock.json`, `bun.lock`（`package.json` 已纳入版本控制）
- **事件类型归一化**：learn-rules.mjs 和 eval-metrics.mjs 均支持 men.* 前缀 → 标准类型映射（subject-first 策略）

## 版本同步缺口（发版后需手动同步）

`scripts/release.mjs` 仅自动同步 JSON 文件与 `site/src/pages/docs/configure.astro` 的版本号；**以下文档不自动同步**，发版后需手动更新版本号：

- `AGENTS.md`（仓库状态 + CHARTER_CHECK 两处）
- `docs/guide/milestones.md` / `docs/governance.md` / `knowledge/README.md`
- `site/src/pages/docs/releases.astro`（发布历史表 + 当前版本亮点，内容性更新）

先例：v0.3.2 发版后曾漏 6 处版本引用，全靠手动补齐。改版后请按此清单自查。

## CHARTER_CHECK

- **项目状态**：v0.3.5（M0–M7 完成；npm 包 `@cgartlab/men` 已发布）
- **许可证**：MIT
- **远程仓库**：https://github.com/cgartlab/men
- **CI 状态**：GitHub Actions validate/triage 自动运行
- **学习回路**：learn.mjs + eval-metrics.mjs 均已验证运行正常
- **事件审计**：14 种 kind 枚举，events.jsonl 可回放
- **依赖管理**：.opencode/node_modules/ 本地安装，不共享根目录
- **事件类型**：统一使用 event.mjs 标准格式（ts/event/subject/detail/payload）

## 进程管理红线（Windows · 2026-08-24 事故后新增）

> 事故背景：跨 session 存活的僵尸 `astro preview` 占用 4399 端口并按旧 base 路由，导致站点访问异常；OpenCode 在 Windows 上存在已知的 child process leak / orphan 问题。

1. **常驻服务仅限受管形态**：只允许 `astro preview` 守护进程（自带 stop/status/logs 生命周期）。必须使用仓库配置端口（4399），并向用户报告 pid 与停止命令；禁止裸 `Start-Process` / detached / 管道截流等不可追踪形态。
2. **静态站验证走产物级检查**：一律使用 `node site/scripts/check-site.mjs`（扫描 dist：UTF-8 解码 / charset / mojibake / 空 slot 守卫 / base 回归 / 路由锚点），不依赖任何活服务器。
3. **确需 HTTP 冒烟时的唯一合法形态**：单个 Node 脚本内 `spawn` 子进程 + `finally { kill }` 自终止包装，超时上限 60s，禁止脱离本次命令的进程树存活。
4. **会话收尾自查**：结束前运行 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 过滤本仓库路径残留并清理；确认 4399/4399 无监听。
