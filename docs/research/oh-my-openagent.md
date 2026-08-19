# oh-my-openagent 深度调研笔记（M0）

**仓库**：`code-yeongyu/oh-my-openagent`（≈67.9k stars，2026-08-15 更新，`5.0.0-beta.7`）
**本地快照**：`D:\github-repos\men\oh-my-openagent\`（dev 分支浅克隆，51ab1e5b6）
**调研日期**：2026-08-15 ｜ 调研 agent：librarian（lib-1）

---

## 一、项目概览

### 1.1 是什么

一个把 OpenCode 变成"11 个 Agent 协同军团"的 **batteries-included 插件**。作者自述："Debian/Arch = OpenCode，Ubuntu/Omarchy = oh-my-openagent"。

### 1.2 如何安装 / 启用

```bash
bunx oh-my-openagent install                # Ultimate（OpenCode）
bunx lazycodex-ai install                   # Light（Codex CLI）
bunx oh-my-openagent install --platform=both
```

安装器把 npm 包 `dist/` 写入本地，并在 `~/.config/opencode/opencode.json` 的 `plugin` 数组注入 `"oh-my-openagent"`。插件通过 OpenCode 的 **plugin API（`PluginModule`）** 暴露：

- **`pluginModule.server(input, options)`** → 一次性执行 7 步初始化（`packages/omo-opencode/src/index.ts` 中的 `serverPlugin()`）
- **14 个 OpenCode Hook handler**：`config` / `tool` / `tool.definition` / `chat.message` / `chat.params` / `chat.headers` / `command.execute.before` / `event` / `tool.execute.before` / `tool.execute.after` / `experimental.chat.messages.transform` / `experimental.chat.system.transform` / `experimental.session.compacting` / `experimental.compaction.autocontinue`（`packages/omo-opencode/src/plugin-interface.ts`）

### 1.3 包分层（43 个 workspace package）

```
packages/
├── omo-opencode/         ← ★ 主插件（前 src/，git-rename），build 入口 src/index.ts
├── omo-codex/            ← Codex Light 版 adapter
├── omo-senpi/            ← Senpi adapter
├── pi-goal / pi-webfetch ← 独立 Pi adapter
├── senpi-task/           ← Senpi-coupled task engine
├── *-core (20 个)        ← harness-neutral 纯 TS 核心
│   ├─ prompts-core       ← markdown prompt 打包 + variant 路由
│   ├─ rules-engine       ← AGENTS.md walk-up 发现
│   ├─ agents-md-core     ← AGENTS.md 注入（cache + truncate + format）
│   ├─ team-core          ← Team Mode 领域基元（registry/mailbox/tasklist/state/worktree/tmux）
│   ├─ delegate-core / model-core / hashline-core / lsp-core / mcp-stdio-core / mcp-client-core / tmux-core / ...
├── lsp-tools-mcp / git-bash-mcp / lsp-daemon / ast-grep-mcp   ← 4 个 MCP 包
├── shared-skills/        ← 跨 harness 共享 SKILL.md
└── oh-my-opencode-{os}-{arch} × 12  ← 平台 launcher（Node shim）
```

**运行时**：Bun 1.3.12（CI 硬钉）。**语言**：TypeScript strict。测试：`bun test`。

---

## 二、核心机制详解

### 2.1 `ultrawork` 一键启动

**是什么**：一句 `ultrawork` / `ulw`，让 Sisyphus 指挥官接管整条主线，按"100% 完成"协议驱动所有 Agent。

**触发路径**（keyword-detector hook，Transform Tier）：

```
用户输入 "ultrawork XXX"
  → chat.message handler（packages/omo-opencode/src/hooks/keyword-detector/hook.ts）
    → extractPromptText(parts)
    → removeSystemReminders + removeCodeBlocks
    → detectKeywordsWithType(cleanText, agentName, modelID)
       → KEYWORD_DETECTORS（packages/omo-opencode/src/hooks/keyword-detector/constants.ts）
         → { type: "ultrawork", pattern: /\b(ultrawork|ulw)\b/i, message: getUltraworkMessage }
    → 把返回的 markdown prompt 拼到 output.parts[textPartIndex].text 后面
```

**注入内容**（`packages/prompts-core/prompts/ultrawork/default.md`，339 行，外加 gpt/gemini/glm/planner/codex 5 个模型变体）：

1. `MANDATORY CERTAINTY PROTOCOL`：必须先通过 `explore` / `librarian` / `oracle` 探明需求，100% 明确才允许开工
2. **强制调用 plan agent**（`task(subagent_type="plan", ...)`），任何 2+ 步 / 跨文件 / 有架构决策的任务
3. **Plan agent 输出格式**：`<plan>...</plan>` envelope，内含 Task Dependency Graph、Parallel Execution Waves、每任务 `Category: \`...\` + Skills: [...] + QA`，末尾 `TODO List (ADD THESE)` 直接可复制到 TodoWrite
4. Plan agent 返回 `ses_...` continuation ID，后续用 `task(task_id="ses_...", ...)` 继续追问/细化

**Prompt 变体路由**（`packages/omo-opencode/src/hooks/keyword-detector/ultrawork/source-detector.ts`）：
- planner agent → `planner.md`
- GPT 系 → `gpt.md`，Gemini 系 → `gemini.md`，GLM 系 → `glm.md`
- 其余 → `default.md`

### 2.2 三位一体：Sisyphus / Hephaestus / Prometheus

**Sisyphus**（`packages/omo-opencode/src/agents/sisyphus.ts`）
- **Default model**：`claude-opus-5 max`，fallback chain `kimi-k3 → gpt-5.6-sol medium → glm-5.2 → big-pickle`
- **身份**：**主调度器**。它本身**不写代码**，只负责：
  - 收集 `explore`（grep）/ `librarian`（文档）/ `oracle`（架构）的背景
  - 强制调用 `plan agent` 拿 wave 图
  - 按 wave 顺序 `task(category="...", load_skills=[...], run_in_background=false/true, prompt="...")` 分发
  - 每任务完成后用 `task(task_id=...)` 追问或修正

**Hephaestus**（`packages/omo-opencode/src/agents/hephaestus.ts`）
- **Default model**：`gpt-5.6-sol medium`（要求 provider ∈ {openai, github-copilot, opencode, vercel}）
- **身份**：**自主深度工作者**。给目标不给方法，自己探索代码库并从头到尾执行。
- **特殊 hook**：`hephaestusAgentsMdInjector`（Session Tier）注入沿目录向上发现的 AGENTS.md 上下文

**Prometheus**（`packages/omo-opencode/src/plugin-handlers/prometheus-agent-config-builder.ts`，不通过 `createXXXAgent` 工厂）
- **Default model**：`claude-fable-5 xhigh`，fallback `kimi-k3 max`
- **身份**：**战略规划师（interviewer）**。通过 `/start-work` 触发，用**真实主管访谈**风格追问需求直到 100% 明确，才输出计划
- **写约束**：`prometheus-md-only` hook 强制 `.md`-only，禁止改 `packages/*/src/`、`package.json`、config 文件

### 2.3 11 位 Agent 全表

| Agent | Default | Mode | 工具限制 |
|---|---|---|---|
| Sisyphus | claude-opus-5 max | primary | 无 |
| Hephaestus | gpt-5.6-sol medium | primary | 无 |
| Atlas | claude-sonnet-5 | primary | task / call_omo_agent 禁用 |
| Prometheus | claude-fable-5 xhigh | primary | .md-only 写 |
| Oracle | gpt-5.6-sol xhigh | subagent | write / edit / task / call_omo_agent 禁用 |
| Librarian | gpt-5.6-luna-fast | subagent | write / edit / task / call_omo_agent 禁用 |
| Explore | gpt-5.6-luna-fast | subagent | 同上 |
| Multimodal-Looker | gpt-5.6-sol low | subagent | 除 read 外全禁 |
| Metis | claude-opus-5 high | subagent | 无 |
| Momus | gpt-5.6-terra high | subagent | write / edit / task 禁用 |
| Sisyphus-Junior | claude-sonnet-5 | subagent | 无（category 代理入口） |

**canonical order**：`Sisyphus → Hephaestus → Prometheus → Atlas`，通过 `installAgentSortShim()` 打补丁 `Array.prototype.{toSorted, sort}` 强制（`packages/omo-opencode/src/shared/agent-sort-shim.ts`）。

### 2.4 Team Mode：领导 + ≤8 并行成员

**开关**：`team_mode.enabled: true`（`.omo/omo.jsonc`），重启 OpenCode 后才生效（默认 off）。

**Schema**（`packages/omo-opencode/src/config/schema/team-mode.ts`，11 字段）：
```jsonc
{
  "team_mode": {
    "enabled": true,
    "max_parallel_members": 4,    // 1..8
    "max_members": 8,             // 1..8 硬上限
    "max_messages_per_run": 10000,
    "max_wall_clock_minutes": 120,
    "max_member_turns": 500,
    "message_payload_max_bytes": 32768,
    "recipient_unread_max_bytes": 262144,
    "mailbox_poll_interval_ms": 3000,
    "tmux_visualization": false,
    "base_dir": null
  }
}
```

**12 个 `team_*` 工具**（`packages/omo-opencode/src/features/team-mode/tools/`）：

| 工具 | 文件 | 用途 |
|---|---|---|
| `team_create` | `lifecycle.ts` | 加载 TeamSpec → 校验资格 → spawn 每个成员 session → init mailbox/tasklist/worktree/tmux |
| `team_delete` | `lifecycle.ts` | 清理所有状态文件 |
| `team_shutdown_request` | `lifecycle-shutdown-tools.ts` | 成员/leader 申请停机 |
| `team_approve_shutdown` | 同上 | leader 批准 |
| `team_reject_shutdown` | 同上 | leader 驳回 + reason |
| **`team_send_message`** | `messaging.ts` | 发送到成员名或 `*` broadcast（`to: "*"` 需 isLead） |
| `team_task_create` | `tasks.ts` | 建共享任务 |
| `team_task_list` | `tasks.ts` | 过滤 status / owner |
| `team_task_update` | `tasks.ts` | **原子文件锁** 声明 / 完成 / 删除 |
| `team_task_get` | `tasks.ts` | 单个任务详情 |
| `team_status` | `query.ts` | 全量运行状态 |
| `team_list` | `query.ts` | 声明 + 活跃团队 |

**通信协议**（`team_send_message` 内部流程，`messaging.ts` L44-L113）：
1. 从 `teamRuntime` 解析 senderName、isLead、activeMembers
2. 用 `randomUUID` 生成 messageId，Zod `MessageSchema` 校验
3. 广播仅 lead 可用（`BroadcastNotPermittedError`）
4. 计算 `reservedRecipients`（收件箱需预留的成员）
5. `sendMessage(...)` → 写进 mailbox
6. `deliverLive(...)` → 通过 `messaging-live-delivery` 实时推送到活跃 session；投递失败 catch 住（消息已入箱，可安全忽略）
7. 返回 JSON 结果

**中间产物交换**（`team-core` 领域层，`packages/team-core/src/`）：
- **Mailbox**：`team-mailbox/{to}.jsonl` 每成员一文件；`send.ts` / `poll.ts` / `ack.ts` / `reservation.ts` 处理异步消息、广播门控、投递保留、pending-delivery 恢复
- **Tasklist**：`team-tasklist.jsonl` 共享，含 `blocks` / `blockedBy` 依赖；`claim.ts` 使用原子文件锁
- **State**：`state.json` 通过 `team-state-store/locks.ts` 原子文件锁（tmp + rename）
- **Worktree**：`~/.omo/worktrees/{teamRunId}/{member}/` 每人独立 git worktree
- **Tmux**：`team-layout-tmux/` 可选 focus + grid pane

**存储**：
- 团队 spec：`~/.omo/teams/{name}/config.json`（user）或 `<project>/.omo/teams/{name}/config.json`（project，同名优先）
- 运行时：`~/.omo/runtime/{teamRunId}/`（state.json + mailbox/ + tasklist.jsonl）

**Team 结构示例**：
```jsonc
{
  "version": 1,
  "name": "my-team",
  "leadAgentId": "lead",
  "members": [
    { "kind": "subagent_type", "name": "lead", "subagent_type": "sisyphus" },
    { "kind": "category",       "name": "writer", "category": "writing", "prompt": "Write release notes" },
    { "kind": "subagent_type",  "name": "reviewer", "subagent_type": "sisyphus-junior" }
  ]
}
```

**资格判定**（`AGENT_ELIGIBILITY_REGISTRY`，跨 `packages/team-core/src/types.ts` 与 `packages/omo-opencode/src/features/team-mode/types.ts` 重导出）：
- `eligible`：sisyphus, atlas, sisyphus-junior
- `conditional`：hephaestus（默认缺 `teammate: "allow"` 权限，需 D-36 补丁）
- `hard-reject`：oracle, librarian, explore, multimodal-looker, metis, momus, prometheus（parse-time 直接抛错，指导用 `task` delegate 代替）

**4 个 team-session 事件 handler**（`packages/omo-opencode/src/hooks/team-session-events/*.ts`）：
- `team-idle-wake-hint`：闲置成员唤醒提示
- `team-lead-orphan-handler`：leader 离场 → 成员变孤儿
- `team-member-error-handler`：成员 session 出错时处理
- `team-member-status-handler`：成员状态转换追踪

**3 个 Team Mode 专属 hook**（`team_mode.enabled` 时才构建）：
- Transform Tier：`team-mode-status-injector`（注入 `<team_mode_status>`）、`team-mailbox-injector`（拉取 pending 邮件入上下文）
- Tool Guard Tier：`team-tool-gating`（成员角色 + 权限门控，**嵌套 team 禁止**：成员不能调 `team_create`）

### 2.5 IntentGate 意图门

**是什么**：`keyword-detector` Transform Tier hook，对用户首条消息做**关键词扫描**，命中后把对应 mode prompt 直接拼接到消息末尾，触发下游 agent 的不同行为模式。

**关键词字典**（`packages/omo-opencode/src/hooks/keyword-detector/constants.ts`）：
```typescript
export const KEYWORD_DETECTORS: KeywordDetector[] = [
  { type: "ultrawork",         pattern: /\b(ultrawork|ulw)\b/i, message: getUltraworkMessage },
  { type: "team",              pattern: TEAM_PATTERN,           message: TEAM_MESSAGE },
  { type: "hyperplan",         pattern: HYPERPLAN_PATTERN,      message: HYPERPLAN_MESSAGE },
  { type: "hyperplan-ultrawork", pattern: HYPERPLAN_ULTRAWORK_PATTERN, message: getHyperplanUltraworkMessage },
]
```

**分类依据**：纯正则（非 LLM 分类）；命中即注入。

**防死循环**：多重 gate
- `isSyntheticOrInternalOnlyTextParts` → 跳过合成/内部消息
- `isSystemDirective` → 跳过系统指令
- `looksLikeSlashCommand` → 跳过 `/xxx` 命令
- `isNonOmoAgent` / `isPlannerAgent` → 过滤对 planner agent 的 ultrawork/hyperplan 注入
- `subagentSessions.has(sessionID)` → 后台任务 session 直接 return
- `defaultModeUltraworkInjectedSessions` Set → 每 session 只注入一次
- `filterAlreadyInjectedKeywords` → 消息中已含该 keyword message 文本时跳过
- combo 压制：命中 `hyperplan-ultrawork` 时过滤掉独立的 `hyperplan` 与 `ultrawork` 命中，避免双重注入

### 2.6 类别路由（Category 调度）

**是什么**：`task` 工具不指定 `subagent_type` 时改用 `category` 字段，系统按类别 → 模型 + 变体自动选择（`packages/omo-opencode/src/tools/delegate-task/`）。

**内置 8 个类别**（`packages/omo-opencode/src/tools/AGENTS.md` + `builtin-categories.ts`）：

| Category | 默认模型 | 用途 |
|---|---|---|
| `visual-engineering` | anthropic/claude-opus-5 max | 前端、UI/UX |
| `ultrabrain` | openai/gpt-5.6-sol xhigh | 复杂逻辑、架构决策 |
| `deep` | openai/gpt-5.6-sol medium | 自主多步问题求解 |
| `artistry` | anthropic/claude-fable-5 xhigh | 创意 / 非常规方法 |
| `quick` | kimi-for-coding/kimi-for-coding-highspeed | 单文件小改 / 拼写 |
| `writing` | kimi-for-coding/kimi-k3 low | 文档、散文 |
| `unspecified-low` | openai/gpt-5.6-luna xhigh | 中等努力 fallback |
| `unspecified-high` | kimi-for-coding/kimi-k3 max | 高努力 fallback |

**解析链路**（`delegate-task/category-resolver.ts`）：
1. 查用户自定义类别（`pluginConfig.categories`）
2. 回退内置类别
3. 解析类别配置中的模型 → `model-selection.ts` 校验可用性 → 不可用则 fallback
4. **provider 分文件**：`openai-categories.ts` / `google-categories.ts` / `anthropic-categories.ts` / `kimi-categories.ts` 各自声明类别 → 聚合到 `builtin-categories.ts`

### 2.7 Ralph Loop → Goal Hook（闭环）

**旧系统 ralph-loop 已被 `goal` hook 替代**（PR #6184，见 `packages/omo-opencode/src/hooks/goal/AGENTS.md`）。

**是什么**：每 session 持久化的目标（objective），只要 `status === "active"`，每次 `session.idle` 都会注入一段 `buildContinuationPrompt` 驱动 agent 继续推进，**且禁止在没有 completion audit 时 mark complete**。

**关键实现**（`packages/omo-opencode/src/hooks/goal/`）：
- `controller.ts`：CRUD + `accountUsage(sessionID, usage, elapsedSeconds)` 累积 token 和时间
- `store.ts`：`.omo/goal/{encodeURIComponent(sessionID)}.json` 原子写（tmp + rename）；`session.deleted` 时清空
- **TUI mirror**：`.omo/ulw-loop/{sessionID}/goals.json`（`TuiLoopSnapshot` v1），每次 mutation 同步写入
- `tools.ts`：3 个工具 `create_goal` / `update_goal` / `get_goal`
- `/goal` 命令行解析器（`command-arguments.ts`）

**循环条件**：`session.idle` 事件触发 → `getGoal()` 非 null 且 status != "complete" → `dispatchInternalPrompt(buildContinuationPrompt(goal))` 异步注入。用 `inFlightContinuations` Set 做再入防护。

**completion audit prompt**（`packages/omo-opencode/src/hooks/goal/prompt.ts` L17-L28）：
```
- 把 objective 重述为具体 deliverables / 验收条件
- 构建 prompt-to-artifact checklist
- 检查实际文件、命令输出、测试结果
- 不接受 proxy signals（通过测试 / 完整 manifest 只是证据，需覆盖所有要求）
- 有不确定即视为未完成，继续工作
- 只有 audit 通过才 update_goal status:complete
```

**最大轮次**：`default_max_iterations`（默认 100）；通过 `goal.enabled: true` 开启（默认 off）。

### 2.8 `/init-deep` 生成 AGENTS.md 树

**入口**：`/init-deep` 是内置 skill（`packages/omo-opencode/src/features/builtin-skills/skills/init-deep.ts`），通过 OpenCode 的 `command.execute.before` + `autoSlashCommand` Skill Tier hook 自动派发。

**底层发现引擎**：`packages/rules-engine/src/agents-md.ts` `findAgentsMdUp()`：
- canonicalizePath → realpathSync 校验
- isSameOrChildPath 防御 path traversal
- while current !== rootDir: 尝试 join(current, "AGENTS.md")，存在则加入 found
- 返回 found.reverse()

**注入**（`packages/agents-md-core/src/injector.ts` `processFilePathForAgentsInjection`）：
1. 用户每调用 `Read` 工具 → `directory-agents-injector` hook 在 `tool.execute.after` 触发
2. `findAgentsMdUp` 从目标文件目录向上发现所有 AGENTS.md
3. 每文件读入 → 通过可注入的 `AgentsMdTruncator` 截断
4. 用 `formatAgentsMdContextBlock` 包成 `[Directory Context: ...]` 追加到工具输出末尾
5. **per-session cache**（`injection-cache.ts`）防止同一目录注入多次

---

## 三、技术栈与耦合度

### 3.1 关键依赖（`package.json`）

| 依赖 | 用途 |
|---|---|
| `@opencode-ai/plugin` | OpenCode 插件 API（Tool/Config/Hook handler 注册），1.15.13 |
| `@opencode-ai/sdk` | OpenCode SDK（AgentConfig 类型、client API），1.15.13 |
| `@modelcontextprotocol/sdk` | MCP 客户端/服务端，1.29.0 |
| `zod` | 全部 config/schema/args 校验，4.4.3 |
| `commander` | CLI（11 个 subcommand），14.0.3 |
| `jsonc-parser` / `js-yaml` / `picomatch` | 配置/SKILL frontmatter/rule 匹配 |
| `@code-yeongyu/comment-checker` | AI-slop 注释拦截（trusted binary） |
| `@opentui/*` + `@xterm/xterm` | TUI sidebar + 内嵌 xterm |
| `posthog-node` | 匿名遥测 |

### 3.2 与 OpenCode 强耦合点

1. `@opencode-ai/plugin` `tool()`：12 个 `team_*` 工具 + 12 个 always-on 工具
2. 14 个 OpenCode Hook handlers
3. `ctx.client.tui.showToast()`：ultrawork / hyperplan 激活提示
4. `session.promptAsync` / `session.prompt`：内部消息注入（作者自述多 hook 同时注入同一 session 会互相打架）
5. `@opencode-ai/sdk` AgentConfig：11 个 agent 全部声明为 `AgentConfig`
6. OpenCode 的 `disabled_tools` / `disabled_agents`
7. `ctx.client.tui` sidebar 渲染

### 3.3 已解耦（harness-neutral，可迁移）

| 包 | 说明 |
|---|---|
| `prompts-core` | 纯 markdown prompt + `resolveVariant(modelID)`；审计测试禁止 `@opencode-ai/*` import |
| `agents-md-core` | AGENTS.md walk-up + 注入，纯 TS |
| `rules-engine` | 发现 + 匹配，纯 TS |
| `team-core` | Team Mode 领域层（registry / mailbox / tasklist / state / worktree / tmux），78 个 TS 文件，纯 TS |
| `delegate-core` / `model-core` / `hashline-core` | task 选择重试 / 模型解析 / 内容哈希编辑 |
| `mcp-stdio-core` / `mcp-client-core` | JSON-RPC 帧 + 客户端生命周期（OAuth PKCE + DCR） |
| `tmux-core` / `boulder-state` / `memory-core` / `telemetry-core` | tmux 基元 / 状态机 / Letta-Code 兼容记忆 / PostHog |
| `claude-code-compat-core` / `openclaw-core` | Claude Code 兼容层 / Discord/Telegram/HTTP 双向集成 |

### 3.4 内置 MCP（Tier 1）

`packages/omo-opencode/src/mcp/index.ts` `createBuiltinMcps(...)`：

| MCP | 类型 | 端点 | 鉴权 |
|---|---|---|---|
| **websearch** | remote HTTP | `mcp.exa.ai`（默认）或 `mcp.tavily.com` | `EXA_API_KEY` / `TAVILY_API_KEY`（可选） |
| **context7** | remote HTTP | `mcp.context7.com/mcp` | `CONTEXT7_API_KEY`（可选） |
| **grep_app** | remote HTTP | `mcp.grep.app` | 无 |
| **lsp** | local stdio | `node packages/lsp-tools-mcp/dist/cli.js mcp` | 无 |
| **codegraph** | local stdio | `codegraph serve --mcp` | 无 |

**3 层 MCP 系统**：
- Tier 1：内置（`createBuiltinMcps()`）
- Tier 2：Claude Code 兼容（`.mcp.json`，`${VAR}` 展开，`mcp_env_allowlist` 白名单）
- Tier 3：Skill 嵌入（SKILL.md YAML frontmatter → `SkillMcpManager` 每 session 生命周期，支持 OAuth 2.0 + PKCE + DCR step-up）

### 3.5 Hashline 编辑（关键反脆弱机制）

**Read 增强**（`packages/omo-opencode/src/hooks/hashline-read-enhancer/hook.ts`）：每次 `Read` 输出在每行前追加内容哈希标签 `LINE#ID|`（2 位 base-32）。

**Edit 校验**（`packages/omo-opencode/src/tools/hashline-edit/`）：编辑时必须引用正确的 `LINE#ID`，hash 不匹配 → 拒绝 → 用户必须重新 Read。

**效果**（作者原话）：Grok Code Fast 1 上修改成功率从 **6.7% → 68.3%**。灵感来自 `can1357/oh-my-pi`。

---

## 四、可借鉴清单（12 条）

> 场景：OpenCode 上 6 个角色 men 门/si 思/ji 记/chi 持/yi 艺/xun 寻 团队，要求机械验证、本地优先、可审计。

| # | 借鉴点 | 我们的场景落地 |
|---|---|---|
| 1 | **意图门关键词注入 + combo 压制**（keyword-detector） | 6 位 Agent 各配置专属触发词，关键词注入替代手写长 prompt；combo 压制防叠加 |
| 2 | **AGENT_ELIGIBILITY_REGISTRY 三层资格判定** | 6 位 Agent 定义 eligible / conditional / hard-reject 三级，parse-time 拒绝错误派发 |
| 3 | **12 个 team_* 工具族 + 共享 mailbox/tasklist + 原子文件锁** | team_send_message 广播（仅 lead）、team_task_update 原子锁声明、mailbox poll 3s |
| 4 | **category → model 自动映射** | 6 个 Agent 映射 6 个 category，每 category 配默认模型 + fallback 链 |
| 5 | **Goal Hook 闭环 + completion audit prompt** | 任务启动 create_goal；session.idle 强制注入 completion-audit；audit 通过才 complete |
| 6 | **Hashline 编辑 + read 增强** | 修改前 LINE#ID hash 校验，0 错误修改率 |
| 7 | **AGENTS.md 目录树 + walk-up 自动注入** | 每 Agent 独立 AGENTS.md 目录；directory-agents-injector hook 自动拼接 |
| 8 | **内置 MCP 运行时注入 + 3 层 MCP 系统** | Exa/Context7/Grep.app 照搬；Tier 3 让每个 Agent 的 SKILL.md 声明自己的 MCP |
| 9 | **Prometheus 访谈式规划 + plan agent 强制** | 复杂任务先跑访谈，产出 `<plan>` envelope：dependency graph + wave 图 + QA |
| 10 | **Prompt 变体路由 + 独立 markdown 库** | 6 位 Agent 的 system prompt 存 prompts/{agent-name}/{variant}.md |
| 11 | **5-tier Hook Composition + prompt-async-gate** | 跨 Agent 副作用走单点 prompt-async-gate + inFlightContinuations 防并发打架 |
| 12 | **证据驱动的 QA 协议**（.omo/evidence/ 目录） | 任何改动必须产出 .omo/evidence/<date>-<slug>/：WHAT WAS TESTED / OBSERVED / WHY ENOUGH / OMITTED 四段 |

---

## 附录：关键文件索引

| 主题 | 路径 |
|---|---|
| 插件入口 | `packages/omo-opencode/src/index.ts` |
| 14 个 hook handler | `packages/omo-opencode/src/plugin-interface.ts` |
| Ultrawork 关键词检测 | `packages/omo-opencode/src/hooks/keyword-detector/hook.ts` |
| Ultrawork 关键词字典 | `packages/omo-opencode/src/hooks/keyword-detector/constants.ts` |
| Ultrawork 默认 prompt | `packages/prompts-core/prompts/ultrawork/default.md` |
| 11 位 Agent 注册 | `packages/omo-opencode/src/agents/builtin-agents.ts` |
| Sisyphus 工厂 | `packages/omo-opencode/src/agents/sisyphus-agent-factory.ts` |
| Team Mode 总纲 | `packages/omo-opencode/src/features/team-mode/AGENTS.md` |
| Team Spec Schema | `packages/team-core/src/types.ts`（L56-L90） |
| Agent 资格判定 | `packages/team-core/src/types.ts`（末尾 AGENT_ELIGIBILITY_REGISTRY） |
| team_send_message | `packages/omo-opencode/src/features/team-mode/tools/messaging.ts` |
| 3 层 MCP | `packages/omo-opencode/src/mcp/index.ts` |
| Category 内置定义 | `packages/omo-opencode/src/tools/delegate-task/builtin-categories.ts` |
| Goal Hook 控制器 | `packages/omo-opencode/src/hooks/goal/controller.ts` |
| Goal completion audit prompt | `packages/omo-opencode/src/hooks/goal/prompt.ts` |
| AGENTS.md walk-up 发现 | `packages/rules-engine/src/agents-md.ts` |
| AGENTS.md 注入 | `packages/agents-md-core/src/injector.ts` |
| /init-deep skill | `packages/omo-opencode/src/features/builtin-skills/skills/init-deep.ts` |
| Hashline 读增强 | `packages/omo-opencode/src/hooks/hashline-read-enhancer/` |
| Hashline 编辑工具 | `packages/omo-opencode/src/tools/hashline-edit/` |
| Prompt-async gate | `packages/omo-opencode/src/shared/prompt-async-gate.ts` |
