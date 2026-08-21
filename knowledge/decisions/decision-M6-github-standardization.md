---
id: decision-M6-github-standardization
type: decision
created: 2026-08-21
status: active
source: milestone M6
---

# 决策记录：GitHub 标准化（M6）

## 内容

M6 阶段为仓库补齐 GitHub 标准基础设施，替代此前的"无 GitHub 基础设施"状态。

## 决策

### 新增文件

| 文件 | 用途 |
|------|------|
| `LICENSE` | MIT 许可证 |
| `CONTRIBUTING.md` | 贡献指南 |
| `SECURITY.md` | 安全策略 |
| `CODE_OF_CONDUCT.md` | 行为准则 |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 模板 |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug 报告模板 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 功能建议模板 |
| `.github/CODEOWNERS` | 代码所有者 |
| `.github/FUNDING.yml` | 支持渠道 |
| `.github/dependabot.yml` | 依赖自动更新 |
| `.github/workflows/ci.yml` | CI 工作流 |

### 文档更新

| 文件 | 变更 |
|------|------|
| `README.md` | 重写：徽章 + 17 章节 + mermaid 编排图 |
| `docs/governance.md` | 新建：团队治理 |
| `CHANGELOG.md` | 新增 v0.2.0 版本记录 |
| `AGENTS.md` | MCP×3 → MCP×7 |

## 关联

- [架构决策](../../docs/architecture.md) D14
- [团队治理](../../docs/governance.md)
- [README](../../README.md)