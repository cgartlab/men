# Argus Design Review 集成指南

> **目的**：把 `cgartlab/argus` 的前端设计代码评审能力集成到本仓库（men 团队）。协议版本 `men-api-version: 1`（见 `docs/men-integration.md`）。

## 1. 快速上手

**前提**：已安装 OpenCode CLI 并配置 API key。

```bash
# 1. 配置 secrets（GitHub Settings → Secrets and variables → Actions）
# 必填：ARGUS_FLASH_APP_ID / ARGUS_FLASH_PRIVATE_KEY（GitHub App 凭证）
# 必填：OPENCODE_API_KEY（OpenCode Zen 免费模型 API key）

# 2. 第一个 PR 会触发云端 argus 评审
#    push 一个 feature branch → 创建 PR → design-review.yml 会自动跑

# 3. 查看评审结果
#    PR 评论区会出现“Argus Design Review Summary”
#    结构见 §2 输出契约
```

## 2. 输出契约（映射到 men 四段模板）

Argus 的评审结果直接对应 men 的汇总报告模板：

| Men slot | Argus 产物对应 |
|----------|----------------|
| **结论** | `## Argus Design Review Summary` 中的总结头部（总数、核心栈、审查的文件） |
| **关键信息** | 按 **P0 / P1 / P2 / P3** 分组的 issue 块（每个 issue 的 Found / Expected / Fix） |
| **来源/证据** | `Found` / `Expected` 代码片段 + `Reference` 链接（设计 token 映射、硬编码值来源） |
| **未决问题** | 评审时标记的“未解析项”（如 stack 未检测到、特定路径被忽略） |

> 关键规则：核心问题（stack 或目标不清）时**不猜**，列为 unresolved；可由 chi judge 做独立复核。

## 3. secrets 配置（最关键）

在 GitHub 仓库 Settings → Secrets and variables → Actions 添加：

| 变量 | 来源 | 是否必填 | 说明 |
|------|------|----------|------|
| `ARGUS_FLASH_APP_ID` | GitHub App “argus-flash” | ✅ | 在 GitHub 创建 App → Settings → OAuth App 页面获取 |
| `ARGUS_FLASH_PRIVATE_KEY` | GitHub App “argus-flash” | ✅ | Private key（PEM 格式） |
| `OPENCODE_API_KEY` | OpenCode Zen | ✅ | 免费账号注册 → https://opencode.ai/auth 获取 |

### 如何创建 GitHub App “argus-flash”

1. 前往 https://github.com/settings/apps/new
2. **App name**：`argus-flash`（任意，唯一）
3. **Homepage URL**：`https://github.com/cgartlab/men`（或你的站点）
4. **Authorization callback URL**：`https://github.com/login/oauth/callback`（留空即可）
5. **Select repositories**：`Only select repositories` → 勾选本仓库 `cgartlab/men`（或所有需要的）
6. **Permissions**：
   - `Contents` → `Read-only`（用于 checkout）
   - `Pull requests` → `Read-write`（用于开 PR 评论）
   - `Issues` → `Read-write`（用于失败摘要回写）
7. 点击创建 → 记下 **App ID** 和 **Private key**（下载 .pem 文件）

> ⚠️ **重要**：License 警告（见 §5）。

> ℹ️ **App 权限边界**：argus-flash App 只需 `Pull requests: Read-write` + `Issues: Read-write` 用于回写评论。
> 它**不需要** `Contents: write`——argus 评审成功时不需要向消费方仓库推代码（评审产物写 PR 评论，不写仓库文件）。
> 上游 argus 仓库的 weekly 模型刷新 workflow 曾因误用 App token 推送而报 `HTTP 403`，已改用 `GITHUB_TOKEN`（见 argus `3bb224d1`）。
> 若你的 App 报过 403，先确认是不是被误当成了推送凭据。

## 4. 本地验证（非必须，Cloud 为主）

若想在本地跑一遍：

> ⚠️ **版本要求**：argus 依赖 `opencode github run` 命令，**OpenCode 2 已移除该命令**。本地复现必须用 OpenCode **1.x**（CI 侧固定 1.19.3）。用 2.x 会直接报
> `opencode-version must be an OpenCode 1.x release`。

```bash
# 本地手动触发（模拟 GitHub Action 流程）
# 模型用 argus 当前队列的 primary（见 argus 的 config/free-models.yml；
# Zen 目录会漂移，用前先核对，或用本仓库的 OPENCODE_API_KEY 实测）
opencode github run --model opencode/deepseek-v4.1-flash-free --auto --print-logs "
你是云端执行 agent。处理 men 仓库的 PR #PR_NUMBER。

约束：
- 不 merge PR、不 force push、不删 main
- 只在新建的 feature 分支上开发
- 完成后开 PR，描述含改动清单+验证结果+风险

参考 docs/integrations/argus.md §2-§3 处理。
"
```

> **提示**：本地用的 OpenCode CLI 若是 2.x，`opencode models opencode --refresh` 已不被支持——
> argus 生成模型清单时的 CLI 交叉校验会静默空转，导致清单里混入 CLI 无法解析的模型（见 §6.2）。

## 5. License & 风险

| 项目 | 状态 | 说明 |
|------|------|------|
| **BSL 1.1** | ⚠️ | 本项目（men）使用 MIT，但 argus 项目是 BSL 1.1。集成时**仅内部使用**，请在 docs 中标注警告（见下）。 |
| **商业用途** | ❌ | BSL 1.1 5 年后转 Apache 2.0。若未来对外发布 men 包或在商业产品里使用 argus 评审结果，需推动 argus 改回 MIT/双 license。 |
| **评审结果外传** | ✅ | Argus 输出的评审报告可转发给团队成员，但不得公开到 GitHub 外部（含社区、客户）而不经审查。 |
| **License 追踪** | 📋 | 若 argus 的 License 发生变更（其当前版本见 argus 仓库 `VERSION` 文件），请检查 docs/integrations/argus.md §5 是否需要修订。 |

### License 警告（在项目 README 顶部或 AGENTS.md 开头加一句）

> 本项目（men）使用 MIT License。但我们依赖 `cgartlab/argus`，其 License 为 **BSL 1.1**（Business Source License 1.1，5 年后转 Apache 2.0），仅限内部使用。若计划对外发布，请自行评估合规风险或推动 argus License 变更。

## 6. 故障排除

### 6.1 配置类

| 症状 | 原因 | 解法 |
|------|------|------|
| `Missing secret: ARGUS_FLASH_APP_ID` | 未配置 GitHub App 凭证 | 按 §3 添加 secrets |
| `Missing secret: OPENCODE_API_KEY` | 未配置 OpenCode Zen API key | 按 §3 注册并填入 |
| `429 Too Many Requests` / 模型不可用 | API 速率超限 | 等待 1 分钟重新触发，或设置 fallback models（见 argus config/free-models.yml） |
| `fixture-mode: true 时无法评审 PR` | fixture-mode 只在 Argus 自身 CI 有效 | 删除 workflow 的 `fixture-mode` 输入，或在 CI 里不打该 label |
| dependabot PR 上 argus 检查报「缺少 secrets」 | dependabot 触发的 run 拿不到仓库 secrets（GitHub 安全模型，只认 Dependabot secrets），fail-fast 假红 | 已修：`design-review.yml` 按 `github.actor` 跳过 dependabot（lockfile bump 无设计可评审）；若确实想评，另配 `gh secret set --app dependabot` |
| PR 没有 Argus 评审评论 | workflow 正在排队 / 超时（30min） | 查看 Actions 日志；打开 issue 重新打 `agent-execute` label（若走 gh-flow 模式）<br>或检查 PR 是否有 `pull_request` 事件触发（本 workflow 用 `pull_request` 类型） |

### 6.2 模型队列类（argus-review 红灯但配置看起来正常）

**核心认知：Zen 目录里存在 ≠ 本账号/本地区可调用。** argus 的自动刷新清单按「模型是否出现在 `GET /zen/v1/models`」生成，因此会周期性失效。三种失效模式：

| 症状（argus 日志） | 原因 | 修法（在上游 argus 仓库操作） |
|------|------|------|
| `Model not found: opencode/xxx` / `Model unavailable` | 模型已改名或下线，目录仍列出旧 ID | 在 `config/model-scores.yml` 给该 ID 加 `deprecated: true` |
| `RegionError: This model is not available in your country` | 目录列出，但本账号所在地区被封锁 | 在 `config/model-scores.yml` 给该 ID 加 `regions: []` |
| `APIError: Model access is disabled` | 账号/模型访问被禁用 | 换模型；若是账号级问题则检查 API key 权限 |

**判定流程**（不要凭日志猜）：

1. 看 argus-review 日志里**具体哪个模型**报什么错——不同报错对应不同修法
2. 用本仓库的 `OPENCODE_API_KEY` 逐个实测候选模型（每个连跑 2 次）：

   ```bash
   opencode run -m opencode/<model-id> "reply ok"
   ```

3. 拉当前目录确认模型是否还在：`curl -s https://opencode.ai/zen/v1/models` —— 目录会漂移（实测 `space-bunny-free` 于 2026-10-20 前后下架）
4. 在 argus 仓库的 `config/model-scores.yml` 补标记 → 上游 weekly workflow 会自动生成正确的清单 PR

**本仓库不 pin 模型**：`design-review.yml` 不传 `model` / `fallback-models`，直接使用 argus 自动刷新的队列（`config/free-models.yml`）——**单一事实源**，上游更新时本仓库自动跟随。

> **为什么不 pin**：2026-10-19 ~ 10-20 期间，men 曾显式 pin 模型（PR #173），当时上游队列机制尚未修好，pin 是临时止血。该止血完成后两份清单内容已完全相同，保留 pin 反而制造了「两份要同步、各自漂移、无告警」的问题。已于 PR #175 移除。
>
> **上游队列的 3 层防护**：`refresh()` 过滤 `deprecated` / `regions: []` 标记 → `--check` 拦截非法队列 → 上游 CI 每次 push 跑 `Model Config Change Tests`。模型可用性问题在上游修（改 `model-scores.yml`），本仓库无需改动。

## 7. 版本同步

| 文档 | 关联版本 |
|------|----------|
| `AGENTS.md` | 本项目 v0.6.1（版本号由 `release.mjs` 发版时同步，不手写日期） |
| `docs/integrations/argus.md` | Sync: 每次发版重审，确认 BSL/license 状态未变；§6.2 模型队列条目随上游 argus 队列机制变化复核 |
| `design-review.yml` | Sync: CI 变更同步至 main 分支；**不 pin 模型**——模型队列由上游 argus 自动刷新维护（见 §6.2） |
| `.argus.yml` | Sync: 2026-08-31 commit，见 `git log 48f79c8` |

--- 

**相关文件**

- `.argus.yml` —— 本地消费方配置（已在 main，commit 48f79c8）
- `.github/workflows/design-review.yml` —— CI 流程（已升级：secrets fail-fast；模型用上游自动队列）
- `AGENTS.md` 项目状态段 --- Argus 集成说明
- `docs/men-integration.md` --- men-api-version: 1 契约定义（外部契约）