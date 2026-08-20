# Changelog

本项目的所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

### Changed

### Fixed

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
