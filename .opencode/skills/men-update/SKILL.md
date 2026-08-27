---
name: men-update
description: "Use when updating the men agent team repository to the latest version — pulling latest code, reinstalling plugin dependencies, upgrading plugins. 触发关键词：更新、升级、拉取最新、更新插件、update men、men-update。Don't call when the user only wants to check the current status/version without changing anything (use men-status), or when the task is about updating dependencies inside the .opencode folder via npm (use manual review)."
---

# men-update — 自动更新 men 仓库

当此 skill 被调用时（通常由侧边栏弹窗的"更新"按钮或用户输入 `/men-update` 触发），agent 用其 shell/bash 工具执行以下**自动化**更新流程。全程无需用户手动操作 git，但涉及分叉合并等决策时必须征得用户同意。

## 更新流程

### 1. 定位 men 仓库根目录

从本 skill 文件所在目录向上遍历，找到同时含 `scripts/install.mjs` 与 `package.json` 的目录即为仓库根 `<ROOT>`：

- 优先用 shell：`git -C <本文件所在仓库> rev-parse --show-toplevel`（本 skill 在仓库内，必然可定位）
- 或写一段 Node 脚本用 `node:fs` 向上遍历校验（`.opencode/skills/men-update` → `.opencode/skills` → `.opencode` → 根）
- 找不到则**向用户询问路径**，不猜测。

### 2. 确认工作区干净 + 快进拉取

```bash
git -C <ROOT> status
```

- 确认无未提交的重要改动（有改动则先向用户确认，见下）。
- 拉取（仅快进，安全）：

```bash
git -C <ROOT> pull --ff-only
```

- 若 pull 失败（本地有分叉/改动），**不要 force**，向用户报告并建议 `git stash` 或 `git pull --rebase`，**征得其同意后再做**。

### 3. 重装依赖与配置

```bash
node <ROOT>/scripts/install.mjs
```

重装 `.opencode` 依赖与配置。

### 4. 报告新版本号

读取 `<ROOT>/package.json` 的 `version` 字段，向用户报告。

### 5. 提示重启

提示用户：**重启 OpenCode** 才能让新插件加载生效。

### 6. 全程遵循全员红线

- 破坏性/外部操作（pull 改写本地状态、rebase、stash）需用户已通过"调用本 skill"授权；分叉处置必须再征得同意。
- 汇报须有机械证据：命令退出码 / 输出。

## invokeMenUpdate 触发路径说明

`men-sidebar` 插件弹窗确认更新后，通过以下路径触发本 skill（详见 `update-check.mjs` 中 `invokeMenUpdate` 的实现注释）：

1. **首选**：`api.keymap.dispatchCommand("command.palette.show")` 打开命令面板 + toast 提示选择 men-update。
2. **兜底**：`api.ui.toast` 提示用户在聊天输入 `/men-update`。

**为什么不用 `api.client.session.prompt` 直接发 `/men-update`**（基于实际 SDK 类型 `@opencode-ai/sdk@1.18.23` 调研）：该类型上存在，但 slash command 由 TUI 输入层解析展开，经 HTTP API 直发 prompt 不会被服务端当作 command 处理（只会作为普通文本发给模型）；且 prompt 是流式请求，会在当前会话立即产生 AI 回复、打断用户；还需要 sessionID（插件加载时可能不在 session 路由）。`dispatchCommand("command.palette.show")` 是 `tui.d.ts` 中 `api.command` 的 deprecation 注释明确推荐的路径，无副作用、不依赖 sessionID，因此作为首选。

## 完成后

- 汇报：新版本号、git pull 结果（退出码）、install 结果（退出码）。
- 若拉取失败或 install 失败，如实报告错误输出，不掩盖。
