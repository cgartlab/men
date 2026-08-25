# Changelog

本项目的所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

每个版本按六大类组织：✨ Added（新增）/ 🔄 Changed（变化）/ 🐛 Fixed（修复）/ 🗑️ Removed（移除）/ ⚠️ Deprecated（弃用）/ 🔒 Security（安全）。
无内容的类别不写小标题。

## [Unreleased]

### ✨ Added

_下一版本的新增内容将记录在此。_（当前为占位，保持空）

### 🗑️ Removed

- **scripts/sync-to-opencode.ps1** — 删除 OpenCode 全局同步脚本。原因：全局配置由 CC Switch 统一管理，脚本写入会与 CC Switch 冲突（`provider`/`mcp`/`instructions` 等字段被覆盖后又被 CC Switch 回滚）。替代方案：通过 CC Switch UI 手动管理 agent / skills / commands 的全局配置。

## [v0.2.0] - 2026-08-21

> 🏷️ **发布主题：「从代码仓库到可协作团队」**
> 这一次，men 从"一个能跑的仓库"升级为"有标准、有流程、能自我学习的团队"。
> **是什么**：补齐全部 GitHub 开源基础设施 + 接入自主学习回路。
> **为什么重要**：开源项目要有统一贡献规范（否则别人不知道怎么参与）；团队要有自动学习能力（否则同样的错误会重复犯）。
> **怎么用**：推送到 GitHub 后自动获得 PR 模板、CI 检查、依赖更新提醒；每次 /ultrawork 完成后系统自动沉淀经验到 knowledge/，无需手动整理。

### ✨ Added（新增）

#### M5 文档完善

- **产品需求文档（PRD）**：`docs/PRD.md` — **是什么**：记录 men 团队"做什么、为什么做"的完整规格书，含 6+1 角色定义、四类意图判定、Wave 并行调度、双层验证等所有核心机制。**为什么重要**：这是新人理解"men 团队到底做什么"的第一入口，比翻代码快得多。**怎么用**：想了解团队全貌时直接读这里。
- **架构说明**：`docs/architecture.md` — **是什么**：技术实现层的说明文档，含协作拓扑、9 步编排流程图、验证体系、学习回路 mermaid 图，以及 D1–D17 共 17 条技术决策记录。**为什么重要**：架构图和决策记录能让你看懂"为什么这样设计"，避免重复踩坑。**怎么用**：改代码前先查技术决策表（ADR）。
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
- **3 个自定义命令**：`.opencode/command/{ultrawork,verify,hyperplan}.md` — **是什么**：ultrawork 9 步编排协议、verify 双层验证协议、hyperplan 访谈式规划。**为什么重要**：把"团队协作流程"固化成命令，任何人/任何 agent 调用同一套协议。**怎么用**：在 OpenCode 里直接输入 /ultrawork 等命令。
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
