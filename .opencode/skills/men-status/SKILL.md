---
name: men-status
description: "Use when checking the current status of the men agent team — version, last update check, ignored version, agent roster, configuration health. 触发关键词：状态、版本、men-status、status、配置健康、agent 名单。Don't call when the user wants to actually update the repository (use men-update), or when the task is a full mechanical verification of deliverables (use chi-judge)."
---

# men-status — men 状态报告

当此 skill 被调用时（用户输入 `/men-status` 或询问 men 状态/版本/配置健康），agent 用 shell 工具输出以下结构化状态报告。

## 输出项

### ① 当前 men 版本

读仓库根 `package.json` 的 `version` 字段：

```bash
node -e "console.log(require('./package.json').version)"
```

### ② 上次更新检查时间

读取 TUI 插件 `api.kv` 的 `men:lastCheck`（ms 时间戳）。

- 若在 OpenCode 内运行且插件已加载：可通过 `api.kv.get("men:lastCheck", 0)` 读取，转换为可读时间。
- 若插件未运行（无法读取 kv）：如实提示"**需在 OpenCode 内查看**"（kv 由插件进程持有，shell 无法直接读取）。

### ③ 已忽略版本

读取 `api.kv` 的 `men:dismissed`。若为空，提示"无已忽略版本"。

### ④ agent 名单

读 `opencode.json` 的 `agent` 键（项目级 + 全局 `~/.config/opencode/opencode.json` 合并），列出 6 个角色名及各自 model。

### ⑤ 配置健康

- Node 版本：`node --version`（要求 >= 18）
- `.opencode` 依赖是否安装：检查 `.opencode/node_modules/@opencode-ai/plugin` 是否存在
- 机械验证摘要：`node scripts/verify.mjs men`（退出码 + 摘要）

## 输出格式

用结构化 Markdown：

```markdown
## men 状态报告

| 项 | 值 |
|----|----|
| 版本 | v0.2.1 |
| 上次更新检查 | 2026-08-27 10:00（或：需在 OpenCode 内查看） |
| 已忽略版本 | 无（或 v0.3.0） |
| Node | v22.x ✅ |

### Agent 名单
- men → <model>
- si → <model>
- ...

### 配置健康
- `.opencode` 依赖：已安装 ✅ / 缺失 ❌
- verify 摘要：N/N PASS（退出码 0）
```

## 注意

- 状态报告是只读操作，不做任何修改、不拉取。
- 若用户紧接着要求更新，转交 men-update skill。
- 汇报须有机械证据（命令退出码/输出）。
