# Changelog

本项目的所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

每个版本按六大类组织：✨ Added（新增）/ 🔄 Changed（变化）/ 🐛 Fixed（修复）/ 🗑️ Removed（移除）/ ⚠️ Deprecated（弃用）/ 🔒 Security（安全）。
无内容的类别不写小标题。

## [Unreleased]

### Added

### Changed

### Fixed

- **install.mjs readJsonSafe BOM 兼容**：自动剥离 UTF-8 BOM（`\uFEFF`）——修复 PowerShell `Set-Content` 创建的带 BOM 的 `opencode.json` 在 `--global` 合并时解析失败、原始 mcp/provider 配置全部丢失的问题
- **卸载时 tui.json 清理**：`--global-remove` 注销插件后若 plugin 数组为空，直接删除 `tui.json`（不再残留 `{"plugin": []}` 空文件）
- **install.ps1 退出码传播**：直接运行 `./install.ps1` 时传播 node 的退出码（`irm | iex` 管道模式仍 `return` 不关会话）
- **verify.mjs 路径解析修正**：`extractSuccessPaths` 正则跳过 `//` 注释与单字符路径，修复 Windows 上 `verify.mjs men` 将目标解析为驱动器根目录 `D:\`（导致扫描全盘）的问题
- **@opencode-ai/plugin 版本同步**：`.opencode/package.json` 缺失时模板 fallback 版本 1.18.23 → 1.18.25，并补充 `@opentui/core` / `@opentui/solid` 兜底依赖

## [v0.3.7] - 2026-09-02

### Added

### Changed

### Fixed

## [v0.3.6] - 2026-09-02

### Added

- **install.mjs 全局安装/卸载**：新增 `--global` 完整全局安装（部署 agents/commands/skills 到 `~/.config/opencode`，含 opencode.json 与 TUI 注册，任意目录生效）；新增 `--global-remove` 一键卸载（删除部署资产 + 还原 opencode.json + 注销 TUI 插件）——补齐 v0.3.2 侧边栏全局化（仅注册 tui.json）未覆盖的完整全局能力

## [v0.3.5] - 2026-09-02

> 工程化加固 + MCP 归属回归

### Added

- **测试基线**：新增 `test/` 目录（`node:test` 零依赖），覆盖 verify / release / install / event / update-check / learning 六模块 116 项测试；`verify.mjs` / `release.mjs` / `install.mjs` 导出 `main` + 入口守卫，纯函数可单测
- **code-hygiene 扫描防线**：`verify.mjs` 新增空 catch / 无 timeout spawnSync / 裸 console.log 不可回归检查
- **知识沉淀**：`knowledge/patterns` 新增 3 篇 pattern（巡检勘察 / 可测性重构 / 质量扫描），`index.md` 收录

### Changed

- **MCP 归属回归 CC Switch**：`opencode.json` 移除全部 7 个 MCP 配置，回归纯 Agent 定位——MCP 由 CC Switch 统一管理（模型 / 密钥 / MCP 本地托管），修复仓库越权携带过时 MCP 配置导致的 MCP 大面积瘫痪
- **men-update 新增第 4 步**：更新后强制刷新 opencode npm 包缓存（删除 `@cgartlab/men@latest` 缓存），解决侧边栏版本号滞后不更新的问题
- **verify 退出码判定修正**：任何非零退出码一律视为 FAIL（不再误判），JSON 作为失败回退
- 依赖升级：`.opencode` `@opencode-ai/plugin` → 1.18.25；`site` astro → 7.2.9

### Fixed

- 7 个 tech-debt issue 修复：`#63` console.log MEN_DEBUG 门控 / `#66` update-check 超时常量 / `#67` release 超时分支防御 / `#64` 空 catch 分级日志

## [v0.3.4] - 2026-08-31

### Added

- **运行环境检测**：安装器自动检查 `opencode` 命令与模型配置，未配置模型时安装完成即预警（不再"装完显示成功、一启动就报错"）
- **安装进度反馈**：每步显示 `[1/6] → [6/6]` 进度，安装过程不再长时间无输出
- **全局安装**：`npx @cgartlab/men --global` 一键把侧边栏注册到任意目录（重启 OpenCode 生效）
- README 新增"3 秒看懂"快速定位；安装文档补齐全局安装、MCP 联网与密钥要求、`.env` 用途说明

### Changed

- **安装更安全**：在已有项目目录安装时，已有的 `opencode.json` / `AGENTS.md` / `.opencode` 配置自动备份（`.men.bak`），不再静默覆盖
- **错误提示更友好**：验证失败时直接说明哪一项未通过、如何修复；依赖未装好时明确提示"插件可能不可用"与修复命令，不再误报"安装成功"
- **配置更规范**：`opencode.json` 移除不符合官方 schema 的字段，避免首次启动配置告警
- 首次使用但未配置模型的新用户，文档明确引导先配置模型（不再被"可选跳过"误导）

### Fixed

- Windows 一键安装不再误关终端（`irm | iex` 管道下正常保留 PowerShell 窗口）
- 官网修正一处必然报错的 Windows 安装示例（带参数的管道安装）
- 一键脚本网络失败时提供中文修复引导（git clone / curl 场景）

## [v0.3.3] - 2026-08-29

### Added
- men-verify 自动化插件：写产物后自动跑 `verify.mjs` 五项机械验证
- men-learn 自动学习插件：任务完成后自动提取经验写入 knowledge/
- men 内置 `question` 工具启用：下一步建议改为交互式选择题

### Changed
- 全量 rebrand 为「Men Agent 团队」（agent/command 定义 8 处同步）
- 删除手写调度器 `src/`（−1433 行），转向 OpenCode 原生插件架构
- men-verify 从 `output.metadata.filePath` 提取路径（不再依赖 `input.args`）
- 站点文档同步品牌名与协议表述

### Fixed
- 插件 `console.*` 改为文件日志，消除 UI 输入区污染
- README/CHANGELOG/architecture 协议步数 9→10（与实际 `ultrawork.md` 一致）
- 修复 `check-event-kinds.mjs` 硬编码路径死脚本（改相对路径，任意位置可运行）
- `learn.mjs` 事件 type 对齐 14 种 KINDS 枚举（消除坏事件行）
- 站点：10 步编排 SVG 标签、技能包计数 14→15 修正

## [v0.3.2] - 2026-08-28

### Added

### Changed

### Fixed

- 侧边栏全局化：新增 `install.mjs --global`（把 `@cgartlab/men` 注册进全局 `tui.json`）；根 `package.json` 补 `exports["./server"]`/`exports["./tui"]` 与 `@opentui/*` 依赖，使 OpenCode 启动自动安装 npm 包后，**任意目录**都能显示 Men 侧边栏（仅改 tui.json，不触碰 CC Switch 管理的 opencode.json）

## [v0.3.1] - 2026-08-27

### Added

### Changed

### Fixed

- 修复 OpenCode 侧边栏不显示 Men 配置：新增 `.opencode/tui.json` 声明 TUI 插件入口（TUI 插件无目录自动发现，必须在 `tui.json` 显式列出），并补 `@opentui/*` 依赖（`@opencode-ai/plugin` 的 peer deps），安装器 `npm install --prefix .opencode` 自动安装

## [v0.3.0] - 2026-08-27

### Added

- men 插件启动自动检查版本更新（弹窗提示 + men-update / men-status 内置 skill）
- npm 一行安装：发布 `@cgartlab/men`，任意目录 `npx @cgartlab/men` 即完成脚手架+依赖+环境+端到端验证（package.json 加 `bin`/`publishConfig`，install.mjs 新增 scaffold 模式）
- men-status / men-update 内置 skill 纳入文档与技能计数（15 个技能包：ji×4/si×2/xun×3/chi×2/yi×2/men×2）

### Changed

- 文档一致性修正：事件数 9→14、MCP×3→×7、技能 13→15、plugin 版本 1.18.18→1.18.23、配置来源澄清（仓库 opencode.json 即运行时配置，全局仅显式存在时覆盖）、quickstart 硬编码路径通用化

### Fixed

- 安装指令准确性：install.sh/install.ps1 的 `<REPO_URL>`/`<INSTALL_URL>` 占位符硬编码为真实地址；install.astro 的 `rawBase` 由 `cgartlab/main` 修正为 `cgartlab/men/main`
- `.opencode/package.json` 纳入版本控制（移出 .gitignore），手动 `cd .opencode && npm install` 不再因缺 manifest 报错
- MCP 服务器补齐 transport：`fetch`/`memory`/`sequential-thinking` 补 `type:local`+npx 命令；`github-mcp-server` 补 `type:remote`+GitHub MCP 端点+token 头。7 个 MCP 全部可加载（原 4 个仅 `enabled:true` 被 OpenCode 静默忽略）

### Removed

- config/mcporter.json：未被 opencode.json 引用的孤儿配置（exa 已由 opencode.json 原生声明），删除并清理全部残留引用

## [v0.2.1] - 2026-08-27

### ✨ Added

_下一版本的新增内容将记录在此。_（当前为占位，保持空）

### 🔄 Changed

- **6 个 agent 角色定位重构**（`.opencode/agent/*.md`）— **是什么**：men 确立为**唯一任务编排与分工核心**（子角色不直接互编、协作经 men 分发）；si 从"规划器"转向**思考者与知识管理者**（深度思考、多角度方案，写作移交 ji）；ji 强化代码与写作执行、**文本绝对精准**；yi 核心转为**文生图提示词工程**（多方案提示词 → 出图，视频列为开发计划）；chi 补充**数据记录/统计/市场分析**；xun 强化**不核实不输出**。**为什么重要**：角色边界与调用关系更清晰，路由不再歧义。**怎么用**：任务分派直接按新定位执行。
- **网站角色信息同步**（`site/`）— **是什么**：9 个站点文件 + README 的角色描述、路由表、协作拓扑图全部同步新定位；协作图**删除 si→ji/yi 直接连线**（协作经 men 分发）。**为什么重要**：站点展示与 agent 定义一致，避免误导。**怎么用**：访问站点角色页即可看到新定位。
- **换行符规范化**：新增 `.gitattributes`（`* text=auto`），Git 自动统一 CRLF/LF，无需手动维护。
- **技能计数修正**：14 → 13 个技能包（`si-content-write` 为历史空壳，移除；实际 si×2 / ji×4 / xun×3 / chi×2 / yi×2），AGENTS.md 与站点配置同步。
- **hyperplan 术语同步**：`.opencode/command/hyperplan.md`、README、men 意图门表的"访谈式规划"统一为"深度思考与方案规划"。

### 🗑️ Removed

- **scripts/sync-to-opencode.ps1** — 删除 OpenCode 全局同步脚本。原因：全局配置由 CC Switch 统一管理，脚本写入会与 CC Switch 冲突（`provider`/`mcp`/`instructions` 等字段被覆盖后又被 CC Switch 回滚）。替代方案：通过 CC Switch UI 手动管理 agent / skills / commands 的全局配置。

## [v0.2.0] - 2026-08-21
<!-- 注：此日期为发布日（CHANGELOG 记录日）；对应 git tag `v0.2.0` 创建于 2026-08-22。 -->

> 🏷️ **发布主题：「从代码仓库到可协作团队」**
> 这一次，men 从"一个能跑的仓库"升级为"有标准、有流程、能自我学习的团队"。
> **是什么**：补齐全部 GitHub 开源基础设施 + 接入自主学习回路。
> **为什么重要**：开源项目要有统一贡献规范（否则别人不知道怎么参与）；团队要有自动学习能力（否则同样的错误会重复犯）。
> **怎么用**：推送到 GitHub 后自动获得 PR 模板、CI 检查、依赖更新提醒；每次 /ultrawork 完成后系统自动沉淀经验到 knowledge/，无需手动整理。

### ✨ Added（新增）

#### M5 文档完善

- **产品需求文档（PRD）**：`docs/PRD.md` — **是什么**：记录 men 团队"做什么、为什么做"的完整规格书，含 6+1 角色定义、四类意图判定、Wave 并行调度、双层验证等所有核心机制。**为什么重要**：这是新人理解"men 团队到底做什么"的第一入口，比翻代码快得多。**怎么用**：想了解团队全貌时直接读这里。
- **架构说明**：`docs/architecture.md` — **是什么**：技术实现层的说明文档，含协作拓扑、10 步编排流程图、验证体系、学习回路 mermaid 图，以及 D1–D17 共 17 条技术决策记录。**为什么重要**：架构图和决策记录能让你看懂"为什么这样设计"，避免重复踩坑。**怎么用**：改代码前先查技术决策表（ADR）。
- **快速上手指南**：`docs/guide/quickstart.md` — **是什么**：从安装到第一次跑 /ultrawork 的完整入门教程。**为什么重要**：新手不用自己摸索，照教程走就能跑通第一个任务。**怎么用**：含命令示例、技能表、事件审计查看方法、M7 使用指南。
- **里程碑进度**：`docs/guide/milestones.md` — **是什么**：M0–M7 每个里程碑的逐条验收详情。**为什么重要**：能看到每个阶段"做了什么、验证结果如何"，如 M2 单兵验收 5/5 通过、M4 机械验证测试记录。**怎么用**：对照它检查当前进度。
- **版本发布方案**：`docs/guide/release.md` — **是什么**：发布流程文档，说明语义化版本（major/minor/patch）怎么定、一键发布怎么操作。**为什么重要**：发布规范明确，版本号才不会乱。**怎么用**：发新版本前按它执行。

#### M6 GitHub 基础设施

- **GitHub 标准文档全套** — **是什么**：`LICENSE`（MIT 许可证，别人可以合法使用你的代码）、`CONTRIBUTING.md`（贡献指南，告诉别人怎么改代码）、`SECURITY.md`（安全策略，承诺 72 小时内响应漏洞报告）、`CODE_OF_CONDUCT.md`（行为准则，明确社区沟通规范）。**为什么重要**：开源项目缺了这些，别人不敢用、不敢改、不敢报 bug。**怎么用**：新手照着 CONTRIBUTING.md 就能参与贡献。
- **PR/Issue 模板** — **是什么**：`.github/PULL_REQUEST_TEMPLATE.md`（描述/自审清单/关联 Issue）、`.github/ISSUE_TEMPLATE/bug_report.md`（问题描述/复现步骤/环境信息）、`.github/ISSUE_TEMPLATE/feature_request.md`（功能描述/使用场景/影响角色）。**为什么重要**：模板强制填写关键信息，避免"说不清 bug"的低质量 Issue。**怎么用**：在 GitHub 新建 PR 或 Issue 时自动套用。
- **CODEOWNERS**：`.github/CODEOWNERS` — **是什么**：文件所有权自动分配规则，所有文件默认归属 @cgartlab。**为什么重要**：谁改了哪些文件、该找谁 review，系统自动指派。**怎么用**：无需手动指定 reviewer，GitHub 自动添加。
- **FUNDING.yml**：`.github/FUNDING.yml` — **是什么**：项目支持（打赏/赞助）渠道配置，当前为占位状态。**为什么重要**：这是开源项目可持续运转的经费入口。**怎么用**：正式发布后填入赞助链接即启用。
- **Dependabot 自动更新**：`.github/dependabot.yml` — **是什么**：依赖自动更新机器人，每月检查 `.opencode/` 下的 npm 依赖。**为什么重要**：依赖有安全漏洞或新版本时自动开 PR，不用人工盯着。**怎么用**：看到它开的 PR，跑一遍验证再合并。
- **CI 工作流**：`.github/workflows/ci.yml` — **是什么**：持续集成流水线，每次 push/PR 自动执行脚本语法检查 + verify + release dry-run + installer smoke。**为什么重要**：任何改动合入前自动验证，坏代码进不了主干。**怎么用**：提交代码后看 GitHub Actions 的 run 结果，全绿才算通过。
- **团队治理文档**：`docs/governance.md` — **是什么**：角色权限、决策流程、变更管理、发布策略的完整规范。**为什么重要**：多人协作没有规矩会乱，这份文档定义"谁说了算、怎么变更"。**怎么用**：发生角色/流程争议时以它为准。

#### M7 自主学习回路

- **学习循环入口**：`scripts/learn.mjs` — **是什么**：自动学习脚本，每次 /ultrawork 完成后从 events.jsonl 提取经验。**为什么重要**：这是团队"会成长"的关键——把历史错误和成功模式沉淀下来，下次不再犯。**怎么用**：无需手动调用，/ultrawork 第 10 步自动执行；结果按 type-A/B/C 分类写入 knowledge/errors/ 和 knowledge/patterns/。
- **学习分类规则**：`scripts/learn-rules.mjs` — **是什么**：纯机械规则判定表，决定一条事件属于哪种错误/模式类型。**为什么重要**：用代码规则而非 AI 判断分类，结果可复现、可审计。**怎么用**：支持 men.* 事件类型归一化，兼容 ultrawork 历史事件格式。
- **学习预算控制**：`scripts/learn-budget.mjs` — **是什么**：控制学习触发频率和范围的脚本。**为什么重要**：避免每次任务都做全套学习导致资源浪费，只在需要时触发。**怎么用**：内部被 learn.mjs 调用，无需手动操作。
- **评估指标计算**：`scripts/eval-metrics.mjs` — **是什么**：计算团队 KPI 的脚本，每次 /verify 完成后从 events.jsonl 统计 8 项指标。**为什么重要**：用数据衡量团队是否在进步（任务完成率/一次通过率/回归率/平均重试/技能使用率/知识沉淀率/错误重复率/学习效率）。**怎么用**：/verify 第 5 步自动运行，输出 JSON KPI。
- **评估报告生成**：`scripts/eval-report.mjs` — **是什么**：把 KPI 变成可读报告的工具。**为什么重要**：数字本身无意义，报告让它可理解、可决策。**怎么用**：在 eval-metrics 结果基础上生成 human-readable 报告。
- **团队知识库**：`knowledge/` 目录 — **是什么**：项目记忆中心，含 README.md（结构说明）、decisions/（3 条决策记录：M0/M6/M7）、patterns/（3 条协作模式）、errors/（1 条自动提取错误）。**为什么重要**：决策、模式、错误全部沉淀，新人也能看到团队踩过的坑。**怎么用**：需查"以前为什么这么定"时翻 decisions/。
- **自主学习架构文档**：`docs/learning-architecture.md` — **是什么**：学习系统的设计文档，讲四层认知模型（评估/认知/行为/记忆）、学习循环时序、各 agent 在进化中的角色边界。**为什么重要**：这是理解整个学习回路运转方式的理论基础。**怎么用**：想深入理解 M7 时读这篇。
- **MCP 工具扩充（×3 → ×7）** — **是什么**：新增 fetch / github-mcp-server / memory / sequential-thinking 四个工具。**为什么重要**：工具越多，agent 能做的事越多——抓网页、操作 GitHub、记长期记忆、做复杂推理。**怎么用**：配置在 opencode.json 的 MCP×7 中，角色按需调用。

### 🐛 Fixed（修复）

- **AGENTS.md 仓库状态**：M0–M6 全部完成、CI 描述更新、关键文件表扩充（+8 行）——之前状态停留在旧进度，会误导新人。
- **PRD 里程碑**：M5 状态改为 ✅ 完成，新增 M6 行和验收标准——文档与实际进度对齐。
- **architecture 目录树**：全量重写，新增 .github/、LICENSE、CONTRIBUTING/SECURITY/CODE_OF_CONDUCT、knowledge/、learn/eval 脚本等路径——之前缺失 M6/M7 新增文件。
- **architecture 决策表**：D13 状态改为"已落地"，新增 D16（自主学习已验证）和 D17（事件类型归一化）——决策记录补全。
- **release.md License 引用**：Apache-2.0 → MIT——许可证从 Apache 改为 MIT 后文档引用未同步。
- **milestones 总进度**：M5/M6 已收官，M7 验证清单——进度表与实现同步。
- **quickstart**：新增 M7 使用指南（Learn/Eval/手动查看/知识库）、GitHub 使用指南——入门文档覆盖新功能。
- **package.json**：version 0.1.0 → 0.2.0、license Apache-2.0 → MIT、新增 repository/bugs/homepage 字段、新增 learn/eval scripts——元数据与仓库状态一致。
- **opencode.json**：MCP×4 禁用工具全部启用（fetch/github/memory/sequential-thinking）、新增 version 字段——之前配置导致部分 MCP 工具不可用。
- **Issue 模板去重**：bug_report.yml / feature_request.yml 合并到 .md 版本，.yml 删除——避免两套模板冲突。
- **events.jsonl 格式兼容**：learn-rules.mjs 和 eval-metrics.mjs 均实现 men.* 前缀 → 标准事件类型映射——历史事件与新脚本格式对齐。
- **learn-rules 规则扩充**：新增 4 条规则（B4: REVISION_NEEDED、B5: gate.failed、B6: gate.passed with failures、C3: PARTIAL）——错误分类覆盖更完整。
- **eval-metrics 增强**：parseOutcome() 支持 JSON payload.passed/failed、checks 数组、纯文本关键词匹配——结果解析更鲁棒。
- **knowledge/decisions/** 补全历史决策条目（M0/M6/M7）——决策知识库完整化。
- **knowledge/patterns/** 初始模式库（verdict-revision / wave-parallel / event-type-inconsistency）——协作模式知识库上线。
- **errors/** 自动提取错误（verdict-revision-needed）——第一条自动学习的错误样本。
- **nul 清理**：删除 Windows 保留名文件，.gitignore 追加 nul——修复 Windows 环境下把 `nul`（保留设备名）误当文件名的坑。

### 🧰 工具脚本补充

- **scripts/fix-port-4096.ps1** — **是什么**：一键修复 OpenCode 端口 4096 被占用的脚本。**为什么重要**：端口被占是开发常见问题，手动杀进程易误伤，脚本安全修复。**怎么用**：OpenCode 报端口错误时运行它。
- **scripts/sync-to-opencode.ps1**（已废弃）— **背景**：早期用于把 agent/skills/commands 同步到 OpenCode 全局配置的脚本。**现状**：已删除，因为全局配置由 CC Switch 统一管理，脚本写入会与 CC Switch 冲突。**替代方案**：通过 CC Switch UI 手动管理 agent / skills / commands 的全局配置。

### 📋 验证结果（实际运行数据）

| 脚本 | 测试 | 结果 |
|------|------|------|
| learn.mjs ultrawork | ultrawork-20260815-213941 | type: B，1 action classified，错误写入 errors/error-*.md ✅ |
| eval-metrics ultrawork | ultrawork-20260815-213941 | total: 3，knowledge: 5 条，efficiency: 50% ✅ |
| eval-metrics verify | verify-1787295186835 | 100% pass rate，1/1 tasks ✅ |
| 全部 11 个脚本 | node --check | 全部通过 ✅ |
| ci.yml | 最近 5 次 CI run | 全部 success ✅ |
| chi judge | 7/7 核心文档验收 | 全部 PASS ✅ |

## [v0.1.0] - 2026-08-20
<!-- 注：此日期为发布日（CHANGELOG 记录日）；对应 git tag `v0.1.0` 创建于 2026-08-21。 -->

> 🏷️ **发布主题：「首发：6+1 Agent 团队系统」**
> 从零构建完整的 Agent 协作框架。
> **是什么**：一次性搭建 6 个角色 + 1 个编排者（门/思/记/持/艺/寻）的完整 Agent 团队。
> **为什么重要**：这是 men 的骨架，后续所有版本都在这个框架上长出来的。
> **怎么用**：/ultrawork 让团队并行干活，/verify 机械验证产物，/hyperplan 做深度规划。

### ✨ Added（新增）

#### M0 调研（2026-08-15）

- **OmO 编排机制调研**：`docs/research/oh-my-openagent.md` — **是什么**：对开源项目 OmO 的编排机制调研笔记，覆盖 ultrawork / Team Mode / IntentGate。**为什么重要**：站在巨人肩膀上提取了 12 条可复用设计模式，避免从零发明。**怎么用**：后续编排设计直接引用这 12 条模式。
- **Oma 机械验证调研**：`docs/research/oh-my-agent.md` — **是什么**：对 oma 项目的 gate / judge / events 机制调研笔记，提取 12 条设计模式。**为什么重要**：确立了"机械验证"的设计源头，后面整个验证体系都来自这里。**怎么用**：理解 verify/gate/event 三件套的设计时读它。
- **合成决策笔记**：`docs/research/00-m0-synthesis.md` — **是什么**：将 OmO 12 条 + oma 12 条合并去重，映射到 F1–F7 功能框架。**为什么重要**：这是整个项目的决策原点——验证哲学（机械优先）和角色路由策略都在这里定死。**怎么用**：重大变更前必读。
- **自主学习 SOTA 调研**：`docs/research/05-agents-autonomous-evolution-sota.md` — **是什么**：调研自主学习 Agent 架构的笔记。**为什么重要**：为 M7 学习回路提供了理论基础，说明学习系统不是临时起意。**怎么用**：想理解 M7 设计来源时读它。

#### M1 骨架（2026-08-15）

- **6 角色 Agent 定义**：`.opencode/agent/{men,si,ji,chi,yi,xun}.md` — **是什么**：门/思/记/持/艺/寻 6 个角色的完整定义文件。**为什么重要**：每个角色有 YAML frontmatter、CHARTER_CHECK（权责边界）、7 条全员红线、协作边界——团队分工从此制度化。**怎么用**：改角色定义时必须先 read 再 edit（仓库硬性要求）。
- **13 项技能包**：`.opencode/skills/` — **是什么**：ji×3（frontend-design/github/l1-verify）、si×3（content-write/knowledge/plan-compose）、xun×3（search/factcheck/rss-scan）、chi×2（invest/judge）、yi×2（design/imagegen），每个含 "Use when" 路由描述、反触发约束、分步骤工作流、模板。**为什么重要**：给每个角色配了"专业工具书"，让角色知道什么时候用什么技能。**怎么用**：技能描述自动触发，无需手动加载。
- **3 个自定义命令**：`.opencode/command/{ultrawork,verify,hyperplan}.md` — **是什么**：ultrawork 10 步编排协议、verify 双层验证协议、hyperplan 访谈式规划。**为什么重要**：把"团队协作流程"固化成命令，任何人/任何 agent 调用同一套协议。**怎么用**：在 OpenCode 里直接输入 /ultrawork 等命令。
- **3 个核心脚本**：`scripts/{verify,gate,event}.mjs` — **是什么**：verify.mjs（五项机械检查）、gate.mjs（白名单门禁）、event.mjs（events.jsonl 审计）。**为什么重要**：全部纯 Node 零依赖，环境要求极低，任何机器能跑。**怎么用**：/verify 命令自动串起三件套。

#### M2 单兵验收（2026-08-15）

- **5 角色独立任务全部通过（5/5）** — **是什么**：让 si/ji/xun/yi/chi 各独立完成一个代表性任务并记录产物。**为什么重要**：证明每个角色不是"纸面定义"，而是真的能独立干活。**怎么用**：产物在 docs/m2-acceptance/ 下——si 团队简介、ji skill 结构审计、xun AI 新闻简报、yi Logo 概念、chi 独立 Judge 报告（13/13 标准 PASS）。

#### M3 编排（2026-08-15）

- **Ultrawork 三路并行跑通** — **是什么**：一次任务同时派 3 路工作：si 写 800 字 AI 生图工具系列第二篇 + xun 查 3 条行业新闻 + xun 查黄金价格。**为什么重要**：验证了核心编排能力——多角色并行、互不阻塞，最后由 chi judge 复核。**怎么用**：这是 /ultrawork 工作方式的第一次完整演示。

#### M4 机械验证（2026-08-15）

- **双层验证体系** — **是什么**：verify.mjs 五项机械检查全 PASS 之后，chi 再以 fresh-context（全新上下文）独立 Judge。**为什么重要**：机械检查保证"基础正确"，fresh-context judge 保证"没有自卖自夸"。**怎么用**：/verify 命令自动走完两层。
- **识破"假完成"** — **是什么**：output-exists 检查发现 subagent 声称完成但实际没有产出文件。**为什么重要**：这是「机械优先」哲学的第一个实战战果——机器证据拦截了"嘴上完成"。**怎么用**：现在每次任务都会检查产物文件是否存在。
- **structure 误报修复**：verify.mjs 增加 strictFrontmatter 开关，非 .opencode/ 作用域 .md 跳过 frontmatter 检查。**为什么重要**：修复了把无关文档当 agent 定义检查的误报。**怎么用**：通过配置文件控制开关。
- **Gate 强化上限**：连续 5 次失败 → GATE_EXHAUSTED，报"卡住"。**为什么重要**：避免 agent 无限重试浪费资源，卡住就喊人。**怎么用**：看到 GATE_EXHAUSTED 说明任务需要人工介入。

#### 全平台安装与发布

- **一键安装**：`scripts/install.mjs` + `install.sh`（Linux/macOS）+ `install.ps1`（Windows）— **是什么**：全平台安装脚本，自动检测 Node ≥ 18、拉取仓库、安装依赖、生成 .env。**为什么重要**：环境搭建从"十几步"变成"一条命令"，新手上手门槛极低。**怎么用**：按系统运行对应脚本即可。
- **版本发布脚本**：`scripts/release.mjs` — **是什么**：SemVer bump + CHANGELOG 更新 + git tag 一键发布工具，支持 patch/minor/major/dry-run。**为什么重要**：发版流程标准化，版本号/日志/tag 不会脱节。**怎么用**：如 `node scripts/release.mjs minor`。
- **CHANGELOG.md**：本文件 — **是什么**：Keep a Changelog 格式的变更记录。**为什么重要**：每个版本"改了什么"一目了然，是项目演进的编年史。**怎么用**：每次发布新版本时在此追加条目。
