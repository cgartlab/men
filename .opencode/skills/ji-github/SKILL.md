---
name: ji-github
description: "Use when creating pull requests, reviewing code, managing issues, or performing GitHub repository operations. 触发关键词：开 PR、创建 PR、提交 PR、看 issue、合并、push、branch、review、代码审查、GitHub。Don't call when doing local git operations without remote push, or when the task is purely local file editing without PR intent."
---

# ji-github — GitHub 工程工作流

当此 skill 激活时，所有 GitHub 仓库操作必须遵循本规范：规范提交、规范 PR、不跳过审查。

## 触发词

- 开 PR / 创建 PR / 提交 PR
- 看 issue / 处理 issue / 列出 issue
- push 代码 / 推到远程 / 切分支
- 代码审查 / review / 合并

## gh CLI 用法

### PR 操作

| 操作 | 命令 |
|------|------|
| 创建 PR | `gh pr create --title "<title>" --body "<body>"` |
| 查看当前 PR | `gh pr view` |
| 列出 PR | `gh pr list` |
| 查看 PR diff | `gh pr diff` |
| 评论 PR | `gh pr comment <number> --body "<message>"` |

### Issue 操作

| 操作 | 命令 |
|------|------|
| 列出 issue | `gh issue list` |
| 创建 issue | `gh issue create --title "<title>" --body "<body>"` |
| 查看 issue | `gh issue view <number>` |
| 关联 issue | PR body 中写 `Closes #<number>` |

### 分支与提交

- `gh branch` — 列出本地/远程分支
- `git push -u origin <branch>` — 推送新分支
- 推前务必 `git status` + `git diff` 确认

## PR 提交规范

### Conventional Commits

提交信息格式：`<type>(<scope>): <description>`

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 |
| `docs` | 文档 |
| `style` | 格式（不影响逻辑） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试 |
| `chore` | 杂项 |
| `ci` | CI 配置 |

豁免格式：`Merge` / `Revert` / `This reverts commit` / `vault backup:`

### PR 标题

PR 标题也使用 Conventional Commits，例如：
- `feat(ui): add dark mode toggle`
- `fix(layout): fix card overflow on mobile`

### PR 描述模板

```markdown
## 变更

- ...

## 验证

- [ ] typecheck 通过
- [ ] lint 通过
- [ ] test 通过

## 截图（如涉及 UI）

...
```

## 不要触发

- 纯本地文件编辑，不涉及 PR/issue/branch 操作
- 本地 git commit 不涉及远程推送
- 非 GitHub 的代码托管平台（Gitee、GitLab 等）

## 工作流（step-by-step）

1. 确定操作类型（PR/issue/branch/review）
2. 检查当前分支状态（`git status` + `git diff`）
3. 确认 Conventional Commits 格式
4. 执行对应 gh CLI 命令
5. 验证操作结果（PR 已创建/issue 已关联等）
6. 输出结构化结果

## 项目规范参考

- **全员红线 #4**：外部操作先确认——PR 创建、合并、发布前必须征得用户同意
- **全员红线 #5**：破坏性操作先询问——`trash > rm`，`git push --force` 绝对禁止
- **全员红线 #1**：git status + git diff 作为机械证据，不信任"我记得我改了"
- **Conventional Commits**：本仓库强制使用 `<type>(<scope>): <description>`，豁免格式见 ji-github skill 定义
- **分支命名**：dev-xxx（开发）/ write-xxx（写作）/ feature/xxx / fix/xxx
- **不跳过 gate**：push 前必须通过 gate.mjs（白名单：typecheck/test/lint）
- **不自己 merge 自己 PR**：chi 独立评审或 human merge gate
- **CHARTER_CHECK**：ji 角色 Clarification level=MEDIUM

## 提交前检查清单

```bash
git status              # 确认无意外文件
git diff                # 逐文件审 diff
git log --oneline -5    # 确认分支提交历史
```

- **不 force push 到 main**
- **不跳过 gate 直接 push** — typecheck/lint/test 必跑
- **不自己 merge 自己的 PR** — 由 chi 独立评审

## 代码审查响应

收到 review 意见后：

1. 逐条回应（`gh pr comment` 或行内 comment）
2. 修改后 push 到同一分支，PR 自动更新
3. 回应格式：`已修复` / `已修改` / `不同意，原因是...`
4. 全部 resolved 后再请求 merge

## Anti-Patterns

- ❌ 不提交多个不相关的改动到同一个 PR
- ❌ 不直接 push 到 main 绕过 review
- ❌ 不用 `git commit --amend` 修改已 push 的 commit
- ❌ 不在 PR 描述里写 `NO` / `随便看看`
