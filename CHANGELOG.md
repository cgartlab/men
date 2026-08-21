# Changelog

本项目的所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **M6 自主学习闭环**：`learn.mjs` / `learn-rules.mjs` / `learn-budget.mjs` / `eval-metrics.mjs` / `eval-report.mjs` / `learning.test.mjs`
- **M6 评估体系**：8 项 KPI（任务完成率 / 一次通过率 / 回归率 / 平均重试 / 技能使用 / 知识沉淀 / 错误重复 / 学习效率）
- **M6 设计文档**：`docs/learning-architecture.md` 覆盖 8 个问题的完整设计方案
- **M7 Pi Harness 兼容层**：`.pi/settings.json` / `APPEND_SYSTEM.md` / `agents/*.md`（5 个）/ `prompts/*.md`（3 个）
- **M7 Skills 桥接**：`.pi/skills/` Windows Junction → `.opencode/skills/`（13 个 skill 透明跟随）
- **M7 package.json pi manifest**：声明 skills 和 prompts 路径
- **GitHub Actions triage**：按文件路径自动打标签 / 设里程碑 / 分配 assignee / 添加项目看板

### Changed

- `AGENTS.md`：更新仓库状态，新增 Pi Harness 兼容段
- `README.md`：更新安装命令（真实 GitHub URL）、里程碑状态（M0–M7 完成）、新增自主学习与双 Harness 章节
- `docs/PRD.md`：升级至 M7 版，新增自主学习、双 Harness 兼容、附录决策记录
- `docs/architecture.md`：新增双 Harness 兼容层、自主学习架构、更新技术决策（D11–D14）
- `docs/guide/milestones.md`：M0–M7 全部完成，新增 M6/M7 验收详情
- `docs/guide/release.md`：更新发布后 checklist，增加 `.pi/` 和 `prompts/` 覆盖
- `docs/guide/quickstart.md`：保持 OpenCode 快速上手为主文档

### Fixed

- `ci.yml`：`on:` 加引号（YAML 1.1 布尔值问题）
- `ci.yml`：`gh` CLI 添加 `GH_TOKEN`（Actions 中自动认证不可靠）
- `ci.yml`：空 LABELS 提前退出、milestone/assignee 添加 `|| true` 容错
- `ci.yml`：恢复 Auto-project 步骤（`projects: write` → `issues: write`）
- `verify.mjs`：structure 检查引入 `strictFrontmatter` 开关，非 `.opencode/` 作用域跳过 frontmatter
- `AGENTS.md`：修正过时仓库状态描述

## [v0.1.0] - 2026-08-21

### Added

- **6+1 角色团队**：men（门）/ si（思）/ ji（记）/ chi（持）/ yi（艺）/ xun（寻）的 agent 定义与协作拓扑
- **编排协议**：`/ultrawork` 9 步协议、`/hyperplan` 访谈式规划、`/verify` 双层验证命令
- **机械验证三件套**：`scripts/verify.mjs`（check battery 五项检查）/ `gate.mjs`（白名单门禁）/ `event.mjs`（事件审计）
- **事件审计**：`events.jsonl` 记录 9 种事件，支持 replay / list / validate
- **全平台一键安装**：`scripts/install.mjs` + `install.sh`（Linux/macOS）/ `install.ps1`（Windows）
- **版本发布**：`scripts/release.mjs`（patch / minor / major）+ 本 CHANGELOG
- **13 项技能包**：全量重写，含路由描述、negation 规则、执行工作流与模板
- **项目约定**：为全部技能包增加项目约定章节
- **GitHub 基础设施**：CI（syntax check / verify / dry-run / installer smoke）、Issue/PR 模板
