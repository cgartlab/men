# 快速上手指南（Quickstart）— Men Agent 团队

> 适用对象：第一次使用 Men Agent 团队的用户
> 前置条件：已安装 OpenCode 并进入 `men` 项目目录

---

## 〇、使用环境（重要）

**Men（门）Agent 团队是 OpenCode 的一个插件（plugin），不是独立应用。** 所谓"安装"，就是把本仓库作为 OpenCode 项目配置载入——OpenCode 在仓库目录启动时自动读取 `opencode.json`，加载 6 个 agent、15 个技能包、命令与 MCP 服务器。

**前置环境：**
- 已安装 **OpenCode**（插件运行宿主）
- **Node.js ≥ 18** / **npm** / **git**（安装脚本依赖）
- 模型与密钥由 **CC Switch**（或你本机的 OpenCode 全局配置 `~/.config/opencode/opencode.json`）在本地统一托管

**关于模型密钥与联网（澄清）：**
- 插件仓库的 `opencode.json` 只声明各 agent 使用的模型 ID（如 `opencode-go/hy3`、`sensenova/glm-5.2`），**不内置任何 API 密钥**。
- 模型推理所需的密钥与端点，全部由你的 OpenCode 运行环境（CC Switch）在本机提供；**安装流程不需要你提供任何密钥**。
- 因此仓库自带的 `node scripts/setup.mjs` 只是"未使用 CC Switch、需手动把模型分配到 opencode.json"时的可选辅助，**并非必选步骤**。
- 网络方面：插件本体安装（git clone + `npm install`）需一次性联网。**MCP 由 CC Switch 统一管理**，仓库的 `opencode.json` 不含 mcp 配置——需联网的 MCP 服务（如 Exa / Context7 / grep.app / GitHub / memory / sequential-thinking）由你的 OpenCode 运行环境（CC Switch）按需提供并注入。模型调用流量走 CC Switch 本地托管，插件本身不直连外网密钥。

---

## 一、安装与启动

**方式 A：npm 一步安装（首选）** — 前置：Node ≥ 18、已装 OpenCode；模型密钥由 CC Switch 在本地托管，无需提供。

1. 打开终端，在**任意目录**运行：
   ```bash
   npx @cgartlab/men
   ```
   - **首次 npx 会询问 "Ok to proceed? (y)"**，输入 `y` 回车即可（或 `npx -y @cgartlab/men` 跳过确认）。
   - 自动完成：scaffold 运行时资产到当前目录（`opencode.json` / `.opencode/` / `scripts/` / `config/` / `knowledge/`）→ 安装 `.opencode/` 依赖 → 从 `.env.example` 生成 `.env` → 端到端验证。
   - 若当前目录已是 men 仓库根，则幂等跳过复制，直接就地安装。
   - **注意**：scaffold 会把资产复制到**当前目录**，装完后 men 仅对当前目录生效；在已有项目目录运行时，已有 `opencode.json` / `AGENTS.md` 会被备份为 `.men.bak` 并替换。想全局显示侧边栏：`npx @cgartlab/men --global`。
2. 启动 OpenCode（会自动读取 `opencode.json`，将 `men` 设为默认 agent）：
   ```
   opencode
   ```

> **`.env` 是什么？** 安装器会自动生成 `.env`（从模板复制），里面是**占位符**。它只用于**知识检索（Embedding）与内网数据源**，基础对话**不需要填写**；用到相关功能时再按模板注释填入即可。

**全局安装（可选）：任意目录生效** — 若希望安装后**任意目录**都能使用 men，加 `--global` 参数：

```bash
# 完整部署到 ~/.config/opencode/ 并合并 opencode.json（仅 default_agent: men）
npx @cgartlab/men --global

# 卸载全局安装并还原配置（删除部署资产、还原 opencode.json、注销 TUI 插件）
npx @cgartlab/men --global-remove
```

- `--global`：将 agents/commands/skills/plugins 部署到 `~/.config/opencode/`，合并全局 `opencode.json` 仅设置 `default_agent: men`（不触碰 mcp 与 plugin —— 由 CC Switch 统一管理），TUI 插件以相对路径注册（不依赖 opencode npm 缓存）；重启 OpenCode 后任意目录生效（`/ultrawork` `/verify` `/hyperplan` 可用）。
- `--global-remove`：清理上述部署并还原原配置（幂等，重复执行安全）。

**方式 B：Git 仓库（备选）** — 打开终端，进入 `men` 项目目录：

1. 打开终端，进入 `men` 项目目录：
   ```powershell
   cd <men 仓库目录>
   ```
2. 启动 OpenCode（会自动读取 `opencode.json`，将 `men` 设为默认 agent）：
   ```
   opencode
   ```
3. 首次或修改配置后需重启 OpenCode 才能加载：
   - 输入 `/quit` 退出，再重新执行 `opencode`
   - 或关闭终端重开

## 二、引导式模型配置（未配置模型的用户**必读**）

> **先判断**：你的模型与密钥已由 **CC Switch**（或本机 OpenCode 全局配置 `~/.config/opencode/opencode.json`）统一托管了吗？
> - **已配置** ✅ → 跳过本节，直接进入「三、三个命令用法表」。
> - **没配置 / 不确定** ⚠️ → **不要跳过本节**：Men 的 `opencode.json` 声明了各 agent 的模型 ID（如 `opencode-go/hy3`、`sensenova/glm-5.2`），但这些 provider 必须存在于你的 OpenCode 运行环境；未配置时首次启动 `opencode` 会提示"模型不存在"（安装器摘要也会检测并预警）。

仅当**未使用 CC Switch**、且希望本仓库的 `opencode.json` 自行管理各 agent 的模型分配时，才需要运行引导脚本。以下命令均为"未使用 CC Switch"路径下的**可选**操作：

```bash
node scripts/setup.mjs
```

**脚本会做什么**：
1. 检测当前模型配置状态
2. 如果你还没有配置模型，men 会通过对话式交互帮你选择
3. 根据你的订阅情况推荐最适合的模型组合
4. 自动写入 `opencode.json`

**交互流程**（约 2-3 分钟）：

```
👋 men 开场白 → 介绍自己和目的
Q1: 你订阅了哪些 AI 服务的套餐？（多选）
Q2: 有付费套餐还是免费额度？（如果有套餐）
Q3: 让我推荐最佳组合，还是你自己指定？
Q4: 确认分配结果 → 写入 opencode.json
```

**跳过交互（预设）**：

```bash
# 使用默认模型组合（全套餐）
node scripts/setup.mjs --preset default

# 使用免费模型组合
node scripts/setup.mjs --preset free
```

**已配置后的重新配置**：

```bash
# 看到当前配置 + 提示重新配置
node scripts/setup.mjs

# 强制重置
node scripts/setup.mjs --reset
```

**无套餐用户**：

如果你还没有任何 AI 服务套餐，脚本会自动推荐使用免费模型，并给出各平台的注册指引：
- SenseNova（商汤）控制台：https://console.sensenova.cn
- 火山引擎：https://console.volcengine.com
- DeepSeek：https://platform.deepseek.com

## 三、三个命令用法表

| 命令 | 用法 | 场景 | 触发 agent |
|------|------|------|-----------|
| `/ultrawork <任务>` | 一键编排，men 自动完成意图分诊→拆分→分发→验证→汇总 | 日常绝大多数任务 | men（唯一 spawner） |
| `/verify <角色或路径>` | 双层验证：机械检查（verify.mjs）+ 语义复核（chi） | 需要独立验收某个角色的产物 | chi（fresh-context Judge） |
| `/hyperplan <项目>` | 访谈式规划，产出 plan envelope（不执行） | 复杂项目立项、长期规划 | men → si |

## 四、命令示例

### 4.1 `/ultrawork` 一键编排

**单一任务（search 类，单路执行）**：
```
/ultrawork 查一下本周 AI 领域最新发布的开源模型有哪些
```
→ men 判定为 `search` 意图，直接 spawn `xun` 用 Exa MCP 搜索并整理报告。

**分析任务（analyze 类，需 chi judge）**：
```
/ultrawork 评估一下最近 DeepSeek V4 Pro 的定价对行业的影响
```
→ men 判定为 `analyze`，spawn `xun` 搜集资料 → 再 spawn `chi` 做 fresh-context 独立复核 → 输出四段报告。

**混合任务（team 类，多路 Wave 并行 + 汇总）**：
```
/ultrawork 写一篇关于"AI 图像生成最新进展"的周报，需要查最新新闻和配图概念
```
→ men 判定为 `team`，spawn `si` 规划 → 按 plan 拆分：
- Wave 1：`xun` 查新闻 + `yi` 出配图概念（并行）
- Wave 2：`si` 撰写正文（依赖 Wave 1 数据）
- Chi judge 独立复核全部产物
→ 最终四段汇总报告：【结论】【关键信息】【子任务状态】【来源/证据】【未决问题】

### 4.2 `/verify` 独立验收

**验证某个角色的产物**：
```
/verify ji docs/m2-acceptance/ji-skill-structure.md
```
→ chi 作为独立 Judge：先跑 `node scripts/verify.mjs` 机械检查 → 全 PASS 后再语义复核。

**附加验收标准**：
```
/verify xun docs/drafts/ai-news.md 每段必须有真实 URL 来源
```
→ chi 按提供的标准表逐条核对，输出 PASS/FAIL/REGRESSED/BLOCKED verdict。

### 4.3 `/hyperplan` 项目规划

```
/hyperplan 为公司搭建一个内部知识库
```
→ men 逐项访谈（目标/范围/阶段/角色/约束/验收），六项全部明确后产出 `<plan>` envelope，包含阶段划分、依赖图、Wave 划分、角色矩阵、验收标准总表。**只规划不执行**，用户确认后下次用 `/ultrawork` 按计划分发。

### 4.4 `npm run learn` 自主学习

```bash
npm run learn -- --sid ultrawork-20260815-213941
```
→ 从 events.jsonl 提取经验，写入 knowledge/errors/ 和 knowledge/patterns/。
验证结果：type: B，1 action classified，错误写入 errors/error-*.md。

### 4.5 `npm run eval` 评估指标

```bash
npm run eval -- --sid verify-1787295186835 --json
```
→ 输出 8 项 KPI JSON。
验证结果：任务完成率 100%，1/1 通过。

## 五、GitHub 使用指南

本仓库已在 GitHub 上托管（`cgartlab/men`），支持 issue、PR、release 等标准协作流程。

### 5.1 报告问题

- Bug 报告：https://github.com/cgartlab/men/issues/new?template=bug_report.md
- 功能建议：https://github.com/cgartlab/men/issues/new?template=feature_request.md

### 5.2 贡献代码

参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)，主要流程：Fork → Branch → Commit → Push → PR

### 5.3 查看发布

参见 https://github.com/cgartlab/men/releases

### 5.4 半自动化云端工作流（本地意图 → 云端执行 → 人工合并）

本地用 `/gh-issue <任务描述>` 把意图转成结构化 issue；issue 带 `agent-execute` label 后触发 `.github/workflows/agent-run.yml`，云端 agent 无头执行并开 PR。**merge 权始终在维护者手中，agent 不会自行合并。**

| 阶段 | 执行方 | 动作 |
|------|--------|------|
| 意图澄清 | 本地 men | `/gh-issue` 六项澄清（目标/验收标准/范围必填）→ 用户确认后 `gh issue create --label agent-execute` |
| 云端执行 | agent-run workflow | 打 `agent-running` label → 读 issue → 建分支 `agent/issue-<编号>` → 开发 → 本地验证 → push |
| 交付 | 云端 agent | 开 PR（Conventional Commits 标题 + `Closes #<编号>`），PR 打 `agent-generated` label，issue 收到就绪评论 |
| 合并 | 维护者 | 人工审查后手动合并；workflow 无 merge 权限 |

**运行边界（写死在 workflow 与规范里）**：

- 权限仅 `contents` / `pull-requests` / `issues` 的 write，**无 merge 权限**；只推 feature 分支，不动 main、不 force push
- 超时护栏 30 分钟，失败自动重试 1 次；两次均失败时把失败摘要与日志尾部回写到 issue
- 重新触发方式：Actions 里 re-run job，或移除后重新添加 `agent-execute` label
- 云端 agent 的行为约束见 [gh-flow/AGENTS.gh-flow.md](../../gh-flow/AGENTS.gh-flow.md)

**CI 前置配置**：需仓库 secret `OPENCODE_API_KEY`（或 `OPENCODE_GO_API_KEY`）提供模型密钥，缺失时 workflow 直接报错退出；模型可用仓库变量 `AGENT_MODEL` 覆盖，默认 `opencode-go/hy3`。

## 六、常用技能提示

| 技能包 | 所属角色 | 触发场景 |
|--------|----------|----------|
| `xun-search` | xun | 搜索新闻/资料/网页 |
| `xun-factcheck` | xun | 多源对比、逐条事实核查 |
| `xun-rss-scan` | xun | RSS feed 扫描（Miniflux 等本地源） |
| `chi-judge` | chi | 独立 Judge 复核流程 |
| `chi-invest` | chi | 持仓/收益/市场跟踪（Wealth Tracker API） |
| `si-plan-compose` | si | 规划产出、plan envelope 撰写 |
| `ji-content-write` | ji | 内容写作 |
| `si-knowledge` | si | 知识条目撰写 |
| `ji-frontend-design` | ji | 前端实现、UI 组件 |
| `ji-github` | ji | GitHub 仓库操作 |
| `ji-l1-verify` | ji | L1 机械验证（文件结构/退出码） |
| `yi-design` | yi | 设计决策、设计文档 |
| `yi-imagegen` | yi | SenseNova U1 Fast 生图 |
| `men-status` | men | 查看团队当前状态 / 版本 / 配置健康 |
| `men-update` | men | 更新 men 仓库到最新版本 |

## 七、事件审计查看

每次 `/ultrawork` 执行会生成一个独立 sid（格式 `ultrawork-<时间戳>`），事件写入 `.agents/state/sessions/<sid>/events.jsonl`。

```bash
# 回放某次编排的完整决策链
node scripts/event.mjs replay --sid ultrawork-20260815T103000

# 查看某次执行的某一类事件（如 gate 通过）
node scripts/event.mjs list --sid ultrawork-20260815T103000 --type gate.passed

# 验证事件文件格式完整
node scripts/event.mjs validate --sid ultrawork-20260815T103000
```

replay 输出按时间排序，展示每步 `type` / `eventId` / `subject` / `detail` / `payload`，可用于回溯编排过程。

## 八、自主学习回路（M7）

每次 `/ultrawork` 和 `/verify` 完成后，系统会自动触发自主学习：

### 8.1 Learn（经验提取）

`/ultrawork` 完成后自动执行：

```bash
node scripts/learn.mjs --sid <sid> --json
```

输出写入 `knowledge/errors/` 和 `knowledge/patterns/`，格式为带 YAML frontmatter 的 .md 文件。

### 8.2 Eval（指标计算）

`/verify` 完成后自动执行：

```bash
node scripts/eval-metrics.mjs --sid <sid> --json
```

输出 8 项 KPI（通过率、回归率、平均耗时等），覆盖最近 10 次任务窗口。

### 8.2.1 实际验证结果

**learn.mjs**（ultrawork-20260815-213941）：
```json
{"ok":true,"type":"B","reason":"1 action(s) classified","eventsRead":15}
```
→ 正确识别 REVISION_NEEDED，写入 `errors/error-*.md`

**eval-metrics.mjs**（ultrawork-20260815-213941）：
```json
{"KPI-task-completion":{"display":"0%","total":3},"KPI-knowledge":{"display":"5 条"},"KPI-learn-efficiency":{"display":"50%"}}
```
→ 3 次任务，5 条知识事件，50% 学习效率

**eval-metrics.mjs**（verify-1787295186835）：
```json
{"KPI-task-completion":{"display":"100%","pass":1,"total":1}}
```
→ 100% 通过率

`/verify` 完成后自动执行：

```bash
node scripts/eval-metrics.mjs --sid <sid> --json
```

输出 8 项 KPI（通过率、回归率、平均耗时等），覆盖最近 10 次任务窗口。

### 8.3 手动查看

```bash
# 查看最近一次学习结果
node scripts/learn.mjs --sid ultrawork-20260815T103000 --json

# 查看最近一次评估指标
node scripts/eval-metrics.mjs --sid verify-1787043854820 --json
```

### 8.4 知识库

- `knowledge/errors/` — 错误模式记录（自动写入）
- `knowledge/patterns/` — 协作模式库（自动写入）
- `knowledge/decisions/` — 决策记录（手动 + 自动归档）

## 九、红线提醒

团队所有 agent 共享 7 条红线（在 agent 定义底部逐字一致）：

1. **不伪造输出**：完成 = 验证过的完成
2. **不跳过验证**：执行后必须确认结果
3. **不泄露用户隐私**
4. **外部操作先确认**（发邮件/公开发布）
5. **破坏性操作先询问**（trash > rm）
6. **需求模糊先问清楚**
7. **输出格式**：粗体关键信息、emoji 标注、列表优先、单段 ≤6 行
