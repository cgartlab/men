# M0 调研笔记：first-fluke/oh-my-agent（v12.3.0）

> 调研目标：为「在 OpenCode 上复刻一个 Agent 团队系统（men/si/ji/chi/yi/xun 六角色，机械验证、本地优先、可审计、防"嘴上说完成了"」提取可借鉴机制。
> 调研日期：2026-08-15 ｜ 调研 agent：librarian（lib-2）｜ 数据源为 GitHub raw 文件与仓库树。

---

## 一、项目概览

### 1.1 它是什么

oh-my-agent 是一个 **vendor-agnostic（供应商无关）的 Agent 团队编排系统 + 机械验证层**。它本身不绑定任何单一 AI 运行时，而是把 **`.agents/` 目录作为"单一事实源"（Single Source of Truth, SSOT）**，再把其中定义**投射（project）**到各运行时原生目录：Claude Code、Codex CLI、Cursor、Antigravity、OpenCode、Qwen Code、Kiro、Grok Build 等。

核心理念（原文）：*"Agents narrate success. oh-my-agent checks the artifacts."* —— 代理负责叙述，系统负责查验产物。

**核心痛点**：并行 spawn 多个代理很容易，难的是"它们真的做了吗"。"测试通过、所有标准已满足"对代理来说零成本，而同一会话内没有任何东西能反驳它。oma 让这种说法**可被证伪（falsifiable）**。

### 1.2 `.agents/` 作为单一事实源如何投射到各运行时

来源：`docs/AGENTS_SPEC.md`

**SSOT 布局**（`.agents/` 是唯一权威）：
```
.agents/
├── agents/                 # 抽象代理定义（供应商无关的 SSOT）
│   └── qa-reviewer.md
├── skills/
│   ├── _shared/            # 共享资源：core/ conditional/ runtime/
│   └── <skill-name>/SKILL.md
├── workflows/              # 多步编排流
├── config/                 # 项目级默认值
└── oma-config.yaml         # 唯一用户拥有、oma update 字节级保留的配置文件
```

**投射机制**（兼容性目录是"投影"，不是独立副本）：
| 运行时 | 投射方式 |
|---|---|
| **Claude Code** | `.claude/agents/*.md` 由 `.agents/agents/` 生成；域技能用**符号链接**指向 `.agents/skills/`；工作流技能是**薄路由 SKILL.md**，只含路由逻辑，委派给 `.agents/workflows/*.md` |
| **Codex CLI** | `.codex/agents/*.toml` 由 `.agents/agents/` 生成 |
| **Gemini / Cursor / GitHub Copilot** | 同理，符号链接或生成视图，**永远指回 `.agents/`** |
| **OpenCode / Antigravity / Qwen / Kiro** | 原生兼容/原生派发 |

**关键不变式**：所有原生文件都引用 `.agents/`，**从不替换或复制**它。换供应商只是改 `.agents/oma-config.yaml` 里的 `model_preset`，而不是迁移内容。

> 对我们的启示：6 个角色定义应只存在于 OpenCode 的 `.agents/` 一份，其他一切（验证脚本、审计日志、角色 charter）都投影/引用它，避免"多份配置漂移"。

---

## 二、核心机制详解

### 2.1 Stop-hook 门禁（会话结束前的机械闸）

来源：`.agents/hooks/core/persistent-mode.ts`（482 行，本仓库最关键文件）

**是什么**：一个 Stop 钩子（Claude Code Stop / Codex Stop 事件触发），在代理试图结束会话时**拦截**，要求先通过一个"门禁脚本"，否则不让停。

**怎么工作**（纯机械，无 LLM 介入）：

1. **激活**：持久化工作流（ultrawork / orchestrate / work / ralph，由 `triggers.json` 的 `persistent: true` 标记）启动时，在 `.agents/state/<workflow>-state-<sessionId>.json` 写入状态（含 `activatedAt`、`goal.completion.gate`、`reinforcementCount`）。

2. **拦截判定**：每次 Stop 事件，钩子读取状态文件：
   - 若工作流**不活跃 / 已过期（>2 小时 stale）/ 强化次数达上限** → 删除状态文件，允许停止。
   - 否则进入门禁流程。

3. **门禁脚本执行**（关键安全设计）：
   ```ts
   const GATE_KEYWORDS = new Set(["typecheck", "test", "lint"]);
   ```
   - 只允许 **typecheck / test / lint** 三个关键字。
   - 关键字 → 读 `package.json` 对应 script → 用 **`spawnSync` 无 shell、argv 数组**执行（杜绝任意命令注入）。
   - **退出码判定**：`passed = (status === 0) && (!error)`。任何非 0 或 error → 门禁失败。
   - 超时：60 秒硬超时，SIGKILL 终止，计入失败。
   - **安全兜底**：agent 在状态文件里写任意自由字符串（如 `"rm -rf /"`）→ `resolveGateArgv` 返回 null → **永远不会执行**，只会打印 `ignoredGateNote`。这关闭了"agent 写后门命令绕过 PreToolUse 权限层"的路径。

4. **强化次数上限**：`MAX_REINFORCEMENTS = 5`。门禁失败/超时都递增 `reinforcementCount`。达到 5 次或门禁永久红灯 → 自动停用状态文件，**允许停止**，防止"永远红 → 永远卡住"。

5. **预算耗尽的诚实停止**：`isBudgetExhausted()` 检查 `goal.budget.wallClockMinutes`。超时 → 允许停止，并在事件日志记录 `gate.failed`（budget exhausted），**记录部分完成状态而非谎称完成**。

6. **解活方式**：删除状态文件，或在响应里说 "workflow done"（多语言 `keyword-detector.ts` 匹配）。

> 对我们的启示：men/si/ji/chi/yi/xun 任一角色完成任务想"交卷"时，必须通过 typecheck/test/lint 之一退出码=0；用 allowlist 白名单杜绝任意命令注入；强化上限防止死循环。

### 2.2 独立 Judge（fresh-context 评审代理）

来源：`.agents/workflows/ralph.md`（Phase 2）、`.agents/workflows/ralph/resources/judge-protocol.md`

**是什么**：一个**独立于执行者**的评审代理，用**全新的上下文（fresh context）**被 spawn 出来，只拿到验收标准，**拿不到**执行者声称"我修好了什么"的叙述。

**怎么工作**：

1. **结构性独立（不是 prompt 层面的角色扮演）**：
   - 执行者（orchestrator）和执行共享上下文，不能自证 → 必须 spawn 新代理。
   - Claude 原生路径：`Agent(subagent_type="qa-reviewer", prompt="...judge brief...")`
   - 其他：`oma agent:spawn qa-agent "<judge brief>" {sessionId}`
   - **降级记录**：若运行时不支持 spawn，则**内联执行**并记录 `ralph.judge-inline-fallback` 事件（透明度）。

2. **judge brief 只包含**：验收标准表（id/description/verification/previous_status/fail_count）+ 缓存记录 + 输出格式 + 指向 judge-protocol.md。**明确不包含执行叙述**。

3. **逐条核对产物（机械验证，非主观判断）**：每条标准的 verification 类型固定为：
   | 验证类型 | 执行方式 | PASS 条件 |
   |---|---|---|
   | tests pass | Bash 跑测试 | 退出码 0 |
   | build succeeds | Bash 跑构建 | 退出码 0 |
   | file exists | 检查文件路径 | 文件存在 |
   | command output | 跑命令 | 输出匹配预期 |
   | lint/typecheck | Bash | 0 错误 |

4. **每轮复验所有标准（防回归）**：
   > *"verify ALL criteria every iteration (including criteria with previous_status == PASS)"*
   - **原因**：ultrawork 修 C2 时可能悄悄改到公用代码，让上一轮 PASS 的 C1 静默回归。
   - **REGRESSED 状态**：上一轮 PASS → 本轮 FAIL = 标记 `REGRESSED`，并记录 `git diff` 定位是哪个改动引入的。这是**一等公民信号**，不是普通失败。
   - **BLOCKED**：连续 3 次失败（`fail_count >= 3`，通过则重置），停止重试，报告为未解决。

5. **重验证缓存**：>30 秒的验证（e2e/Docker）可按 `affected_paths` 缓存，3 轮或相关文件改动后失效；<30 秒的验证一律重跑。

6. **JUDGE 结果格式**：表格（Criterion/Status/Evidence）+ verdict（PASS 当且仅当所有标准 PASS 或 BLOCKED）。

> 对我们的启示：chi（持）可作为独立 judge，用 fresh context 对每个角色产物按验收标准机械核对；每轮复验全部（含上一轮通过的），捕获回归；REGRESSED/BLOCKED 作为一等状态。

### 2.3 事件日志（append-only events.jsonl）

来源：`.agents/skills/_shared/runtime/event-spec.md`、`.agents/hooks/core/state-emit.ts`

**是什么**：跨运行时的**事件溯源（event-sourced）状态**。每个 gate 通过/失败/决策都追加一行 JSON 到 `.agents/state/sessions/{sid}/events.jsonl`。

**格式**（每行一个 JSON 对象）：
```json
{"eventId":"01HXZK...","ts":"2026-05-25T00:00:00.000Z","sid":"oma-...",
 "kind":"gate.passed","writerPid":12345,"vendor":"codex","vendorSid":"...",
 "parentEventId":"...","causalityKey":"workflow-gate","payload":{...}}
```

**记录的 10 种事件（枚举）**：
| kind | 含义 | 必需 payload |
|---|---|---|
| `boundary` | 跨 vendor/会话转移 | reason, toVendor, toVendorSid |
| `session.created` | 工作流会话开始 | workflow, category |
| `workflow.phase` | 阶段转移 | phase |
| `gate.passed` | 门禁通过 | gate |
| `gate.failed` | 门禁失败 | gate, reason |
| `blocker.raised` | 阻塞 | summary |
| `decision.made` | 关键决策（跨会话持久） | subject, decision, rationale |
| `decision.missing` | 必需决策缺失（校验器失败） | workflow, checkpoint, missing |
| `session.ended` | 终态 | status(completed/failed) |

**关键设计**：
- **append-only + `appendFileSync`**（POSIX 原子追加，并发安全）。
- **事件由 (ts, eventId) 排序推导状态**，文件原始顺序只是实现细节。
- **`decision.made` 是跨会话持久化的关键**：`subject` 是固定键，`decision/rationale` 必须是真实内容（模板字符串会被审计器质疑）。
- **写入失败不阻断 Stop 决策**：`emitGateEvent` 是 best-effort，事件 I/O 永远不改变门禁判决。
- 写入路径：`state-emit.ts` 的 `eventsPath()` → `.agents/state/sessions/{sid}/events.jsonl`；另有 `meta.json`（派生摘要）。
- **坏行忽略**：读取时坏行静默跳过，交给 `oma doctor` 隔离/修复。

**反规避审计**：`oma ralph:verify --json --session {sid} --newer-than {ts}` 检查 4 个必产产物（ultrawork 阶段记录 A1、plan JSON A2、独立 QA 结果 A3、独立 Refactor 结果 A4），缺任一 → `ok:false` → 判定"EXEC 被精简/规避"，自动 append `gate.failed`。

> 对我们的启示：每个角色每次决策/门禁/阶段都用 `decision.made` 追加到统一 `events.jsonl`，用 `subject` 键（如 `men.task-approved`）做审计锚点；事后可用 (ts,eventId) 排序回放完整决策链。

### 2.4 Per-agent check battery（对每个代理的通用检查）

来源：`cli/commands/verify/command.ts`、`codebase-checks.ts`、`agent-types.ts`、`report.ts`、`.agents/skills/oma-orchestrator/scripts/verify.sh`

**是什么**：`oma verify <agent>` 对每个代理的产出跑一套**通用核心检查 + 类型专属检查**。

**支持代理类型**：`backend | frontend | mobile | qa | debug | pm`（`agent-types.ts`）。不支持的类型在 verify.sh 里明确 `SKIP`。

**通用核心检查**（对所有代理跑）：
| 检查 | 方式 | 结果 |
|---|---|---|
| **Hardcoded Secrets** | `grep -rn` 扫描 `*.py/ts/tsx/js/dart`，正则 `(password|secret|api_key|token)\s*=\s*['"][^'"]{8,}`，排除 test/example/node_modules | 发现 → fail |
| **TODO/FIXME 扫描** | grep `TODO\|FIXME\|HACK\|XXX`，排除 .agents/node_modules | 计数 >0 → warn |
| **Declared outputs**（声明产物存在） | report.ts 中校验代理 charter 声明的产物文件是否落地 | 缺失 → fail/warn |

**类型专属检查**（`codebase-checks.ts`）：
| 代理类型 | 专属检查 |
|---|---|
| **TypeScript** | `npx tsc --noEmit` 退出码；`: any` 计数（>3 fail，0-3 warn） |
| **frontend** | vitest 测试、inline `style={{` 扫描（warn） |
| **mobile (Flutter)** | `flutter analyze` / `dart analyze`、`flutter test` |
| **backend (Python)** | `uv run pytest -q`（无 uv/pyproject → skip） |
| **raw SQL** | report.ts 中 SQL 注入扫描 |

**组装方式**：`collectVerifyReport(agentType, workspace)` 汇总 `{summary: {failed, warn, skip}, checks: [...]}`，`--json` 输出，失败数>0 时 `process.exit(1)`，可直接接 CI/门禁。

**角色定义里的 Charter Preflight**（每个 agent 的 `.md` 强制含）：
```
CHARTER_CHECK:
- Clarification level: {LOW|MEDIUM|HIGH}
- Task domain: qa-review
- Review scope: {files/dirs}
- Must NOT do: modify source code, ...
- Success criteria: {all files reviewed, findings with file:line}
```
这提供了 **scope 越界检测** 和 **charter 对齐** 的锚点（HIGH → 必须阻塞并追问）。

> 对我们的启示：6 个角色每个都套一套"核心检查（密钥/TODO/声明产物存在）+ 角色专属检查"，`verify <角色>` 退出码接 CI；charter 里强制 "Must NOT do / Success criteria" 字段做 scope 越界防线。

### 2.5 预算配额（budget quota）机制

来源：`.agents/io/session-cost.ts`、`.agents/oma-config.yaml` 第 4 节、`persistent-mode.ts` 的 `isBudgetExhausted`

**是什么**：双层预算控制 —— **spawn 预算**（`session.quota_cap`，防过度 spawn）+ **wall-clock 预算**（防无限运行）。

**A. Spawn 预算（`session-cost.ts`）**：
```yaml
session:
  quota_cap:
    tokens: 2000000          # 跨所有 vendor 的总 token 预算
    spawn_count: 30          # 每会话最大 spawn 次数
    per_vendor:              # 每个 vendor 的 token 预算
      claude: 1500000
      codex: 500000
```
- **记录**：每次 `oma agent:spawn` 记录 `UsageRecord` 到 `.agents/state/memories/session-cost-{sessionId}.md`（`appendFileSync` 原子追加）。
- **校验顺序**（首次超限即判）：① spawnCount → ② total tokens → ③ perVendor tokens。
- **阻断**：超限 → 编排器拒绝下一次 spawn，直到用户确认或调高限额。

**B. Wall-clock 预算（`persistent-mode.ts`）**：
- 状态文件 `goal.budget.wallClockMinutes`。
- 超时 → Stop 钩子**诚实停止**，记录 `gate.failed`（budget exhausted，部分完成状态），**不谎称完成**。

> 对我们的启示：给 6 角色团队设 spawn 次数/token/wall-clock 三重限额；预算耗尽时如实报"部分完成"并写入事件日志。

### 2.6 附加机制（README 提及）

- **关键词自动派发**（11 语言）：`triggers.json` 里每个工作流/技能都有 `keywords`（多语言）+ `patterns`（正则）。`oma verify triggers` 用标注语料库（171 条 prompt）度量误触发率/漏触发率，**CI 门禁在准确率上**（声称 0% 漏触发、<10% 误触发）。
- **Skill eval harness**：`oma skills eval` 用 held-out 任务度量 utility lift，`oma skills opt` 只保留提升 lift 的编辑。
- **失败重试恢复**：orchestrate 在 2 次重试失败后，**并行 spawn 多个假设变体**，保留最高分结果。
- **Monorepo 感知**：`detectWorkspace` 读 pnpm/nx/turbo/lerna，把每个 agent 路由到正确 workspace。

---

## 三、技术栈与耦合度

**语言/运行时**：
- **TypeScript + Bun**（`engines.node >= 26.0`）。核心钩子（`persistent-mode.ts`、`state-emit.ts`、`session-cost.ts`、verify 模块）全为纯 TS，用 `node:fs`/`node:child_process`（`spawnSync` 无 shell）。
- **CLI**：workspaces `cli/` + `web/`，Commander 框架。
- **包管理**：pnpm。
- **依赖极轻**：`jsonrepair`（运行时）、`@biomejs/biome`（lint）、`@commitlint/*` + `husky`（提交钩子）。验证钩子**无第三方 runtime 依赖**（纯 node:fs）。

**耦合度评估（对我们复刻的意义）**：
| 机制 | 与特定 vendor 耦合 | 可解耦复用 |
|---|---|---|
| Stop-hook 门禁 | 高耦合各 vendor Stop 事件格式 | 核心逻辑（allowlist+spawnSync+退出码+强化上限）可抽为纯 TS 模块，OpenCode 接自己的 stop/结束事件 |
| 独立 Judge | 中耦合（Agent spawn 接口） | fresh-context + brief 隔离 + 机械核对协议是纯流程，OpenCode 用子会话/mcp 工具可复现 |
| 事件日志 | 低耦合 | JSONL 约定 + `events.jsonl` 路径是纯文件系统约定，零 vendor 依赖，**直接可抄** |
| Per-agent verify | 低耦合 | 纯 grep/spawnSync 检查 + JSON 报告，OpenCode 直接用 Node/Bun 脚本复现 |
| 预算配额 | 低耦合 | Markdown 记录 + 计数，纯逻辑，直接可抄 |
| Charter Preflight | 低耦合 | 纯 markdown 字段约定，直接可抄 |

**结论**：核心的 **5 大机制**（stop-hook 门禁逻辑、judge 协议、events.jsonl、verify battery、quota）都设计成**供应商无关**，与 OpenCode 的耦合点仅在"如何接入结束事件 / 如何 spawn 子代理"，其余可直接移植。

---

## 四、可借鉴清单（12 条）

> 场景：OpenCode 上 6 角色团队（men 门 / si 思 / ji 记 / chi 持 / yi 艺 / xun 寻），机械验证、本地优先、可审计、防"嘴上说完成了"。

### 1. 门禁白名单 + 退出码判定（Stop-hook 核心）
- **借鉴点**：只允许 `typecheck/test/lint` 三个关键字；`spawnSync` argv 数组（无 shell）；`passed = status===0 && !error`；agent 写任意字符串也不执行。
- **我们的用**：men（门）作为总闸，每个角色交卷前必须跑白名单内的机械检查；argv 数组杜绝命令注入；exit 0 才算"完成"。

### 2. 强化次数上限 + wall-clock 诚实停止
- **借鉴点**：`MAX_REINFORCEMENTS=5` 防死循环；预算耗尽 → 记录 `gate.failed(budget exhausted)` 允许停止，**报部分完成而非谎称完成**。
- **我们的用**：任一角色连续 N 次验证不过 → 停止重试并报"卡住"；wall-clock 超时 → 如实记"部分完成"到日志。

### 3. Append-only events.jsonl + decision.made 审计锚点
- **借鉴点**：每行一个 JSON，10 种 kind 严格枚举，(ts, eventId) 排序推导状态；`decision.made` 用固定 `subject` 键做跨会话审计锚点。
- **我们的用**：6 角色所有决策/门禁/阶段统一追加到 `.agents/state/events.jsonl`；用 `subject` 键（如 `men.gate-passed`、`chi.judge-iterated`）做审计锚点。

### 4. 独立 fresh-context Judge + 每轮全量复验（防回归）
- **借鉴点**：judge 只拿标准不拿执行叙述（结构性独立）；每轮核对**所有**标准（含上一轮 PASS 的）；PASS→FAIL 标 `REGRESSED` 并附 diff。
- **我们的用**：chi（持）作为独立评审角色，每次用新上下文对 ji/xun/yi 等产物按验收标准机械核对；捕获回归信号；BLOCKED（连续 3 次不过）停止重试。

### 5. 反规避产物校验（Anti-Circumvention Gate）
- **借鉴点**：`oma ralph:verify` 不信任叙述，检查必产产物（阶段记录/plan JSON/独立 QA 结果/独立 Refactor 结果），缺任一 → `ok:false` 自动记 `gate.failed`。
- **我们的用**：为每个角色定义"必产产物"（如 yi 的设计文件、xun 的研究笔记），任务结束时机械校验产物存在 + 内容结构，缺则判"未真正执行"。

### 6. Per-agent check battery（核心 + 专属）
- **借鉴点**：通用核心（硬编码密钥 grep / TODO 扫描 / 声明产物存在）+ 类型专属（TS strict / flutter analyze / pytest）；`--json` 输出 + 退出码接 CI。
- **我们的用**：给 6 角色各配"核心检查 + 角色专属检查"（men 管门禁脚本/chi 管验收标准/ji 管笔记完整性/yi 管设计产物/xun 管引用来源/si 管方案文档）；`verify <角色>` 退出码接自动化。

### 7. Charter Preflight 强制字段（scope 越界防线）
- **借鉴点**：每个 agent 的 `.md` 强制含 `Clarification level / Must NOT do / Success criteria`；HIGH 澄清级别 → 必须阻塞并追问。
- **我们的用**：6 角色定义文件里强制 `Must NOT do`（防越权）+ `Success criteria`（机械可验证），越界即阻塞。

### 8. 单一事实源 `.agents/` + 投影模式
- **借鉴点**：`.agents/` 是唯一权威，各运行时目录是符号链接/生成视图，永远指回 `.agents/`；换供应商只改一处配置。
- **我们的用**：6 角色定义 + 技能 + 工作流只存在于 OpenCode `.agents/` 一份，杜绝多份配置漂移。

### 9. 预算配额（spawn/token/wall-clock 三重）
- **借鉴点**：`session.quota_cap`（tokens/spawn_count/per_vendor）+ wall-clock 分钟；超限 → 编排器拒绝下一次 spawn。
- **我们的用**：给 6 角色团队设总 spawn 次数/token/运行时长限额；超限阻断下一次派发；本地优先 → 优先 local/Ollama 模型计入 per_vendor。

### 10. 事件写入失败不阻断决策（best-effort）
- **借鉴点**：`emitGateEvent` 用 try/catch，事件 I/O 永远不改变 Stop 判决。
- **我们的用**：审计日志写入同样 best-effort，磁盘/权限故障不阻塞角色正常收工。

### 11. 重验证缓存（>30s 才缓存，affected_paths 失效）
- **借鉴点**：<30s 验证一律重跑；>30s 按 `affected_paths` 缓存，3 轮或相关改动后失效；`file exists` 永远不缓存。
- **我们的用**：慢验证（e2e、全量构建）按受影响路径缓存，快验证（产物存在、grep 扫描）每次重跑。

### 12. 跨会话持久决策（decision.made + verify checkpoint）
- **借鉴点**：关键决策（如 `ultrawork.plan-approved`、`ralph.exec-delegated`）必须 emit `decision.made` + verify checkpoint，缺失则报 `decision.missing`。
- **我们的用**：6 角色间的关键交接（"si 方案已批准"、"men 已放行"）必须落 `decision.made` 事件，缺失即视为"未真正批准"。

---

## 关键文件路径索引

| 文件 | 用途 |
|---|---|
| `.agents/hooks/core/persistent-mode.ts` | Stop-hook 门禁核心（白名单/退出码/强化上限/预算） |
| `.agents/skills/_shared/runtime/event-spec.md` | L1 事件规范（10 种 kind + schema） |
| `.agents/hooks/core/state-emit.ts` | events.jsonl 写入/读取/派生 meta |
| `.agents/workflows/ralph.md` | ralph 循环（EXEC→JUDGE→REPLAN + 反规避 gate） |
| `.agents/workflows/ralph/resources/judge-protocol.md` | 独立 judge 协议（状态机/回归/缓存） |
| `cli/commands/verify/command.ts` | verify 命令入口 |
| `cli/commands/verify/codebase-checks.ts` | 各语言专属检查 |
| `cli/commands/verify/agent-types.ts` | 支持的代理类型枚举 |
| `cli/io/session-cost.ts` | spawn/token 预算配额 |
| `.agents/oma-config.yaml` | 唯一用户配置（quota_cap 等） |
| `.agents/hooks/core/triggers.json` | 11 语言关键词 + persistent 标记 |
| `docs/AGENTS_SPEC.md` | `.agents/` SSOT 布局与投影模型 |
| `.agents/agents/qa-reviewer.md` | 角色定义模板（含 Charter Preflight） |
| `.agents/skills/oma-orchestrator/scripts/verify.sh` | 工作流内嵌 verify 包装器 |
