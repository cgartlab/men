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

## 4. 本地验证（非必须，Cloud 为主）

若想在本地跑一遍（需 OpenCode + 模型配置）：

```bash
# 本地手动触发（模拟 GitHub Action 流程）
opencode github run --model opencode-go/hy3 --auto --print-logs "
你是云端执行 agent。处理 men 仓库的 PR #PR_NUMBER。

约束：
- 不 merge PR、不 force push、不删 main
- 只在新建的 feature 分支上开发
- 完成后开 PR，描述含改动清单+验证结果+风险

参考 docs/integrations/argus.md §2-§3 处理。
"
```

## 5. License & 风险

| 项目 | 状态 | 说明 |
|------|------|------|
| **BSL 1.1** | ⚠️ | 本项目（men）使用 MIT，但 argus 项目是 BSL 1.1。集成时**仅内部使用**，请在 docs 中标注警告（见下）。 |
| **商业用途** | ❌ | BSL 1.1 5 年后转 Apache 2.0。若未来对外发布 men 包或在商业产品里使用 argus 评审结果，需推动 argus 改回 MIT/双 license。 |
| **评审结果外传** | ✅ | Argus 输出的评审报告可转发给团队成员，但不得公开到 GitHub 外部（含社区、客户）而不经审查。 |
| **License 追踪** | 📋 | 若 argus v0.5.0 后 License 更新，请检查 docs/integrations/argus.md §5 是否需要修订。 |

### License 警告（在项目 README 顶部或 AGENTS.md 开头加一句）

> 本项目（men）使用 MIT License。但我们依赖 `cgartlab/argus`，其 License 为 **BSL 1.1**（Business Source License 1.1，5 年后转 Apache 2.0），仅限内部使用。若计划对外发布，请自行评估合规风险或推动 argus License 变更。

## 6. 故障排除

| 症状 | 原因 | 解法 |
|------|------|------|
| `Missing secret: ARGUS_FLASH_APP_ID` | 未配置 GitHub App 凭证 | 按 §3 添加 secrets |
| `Missing secret: OPENCODE_API_KEY` | 未配置 OpenCode Zen API key | 按 §3 注册并填入 |
| `429 Too Many Requests` / 模型不可用 | API 速率超限 | 等待 1 分钟重新触发，或设置 fallback models（见 argus config/free-models.yml） |
| `fixture-mode: true 时无法评审 PR` | fixture-mode 只在 Argus 自身 CI 有效 | 删除 workflow 的 `fixture-mode` 输入，或在 CI 里不打该 label |
| PR 没有 Argus 评审评论 | workflow 正在排队 / 超时（30min） | 查看 Actions 日志；打开 issue 重新打 `agent-execute` label（若走 gh-flow 模式）<br>或检查 PR 是否有 `pull_request` 事件触发（本 workflow 用 `pull_request` 类型） |

## 7. 版本同步

| 文档 | 关联版本 |
|------|----------|
| `AGENTS.md` | 本项目 v0.4.0（2026-09-05） |
| `docs/integrations/argus.md` | Sync: 每次发版重审，确认 BSL/license 状态未变 |
| `design-review.yml` | Sync: CI 变更同步至 main 分支（已提交） |
| `.argus.yml` | Sync: 2026-08-31 commit，见 `git log 48f79c8` |

--- 

**相关文件**

- `.argus.yml` —— 本地消费方配置（已在 main，commit 48f79c8）
- `.github/workflows/design-review.yml` —— CI 流程（待升级）
- `AGENTS.md` 项目状态段 --- Argus 集成说明
- `docs/men-integration.md` --- men-api-version: 1 契约定义（外部契约）