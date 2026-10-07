# OpenCode V2 兼容性审计

> 审计日期：2026-10-07｜分支：`chore/opencode-v2-compat`（激进清理版）｜依据：[OpenCode V2 官方文档](https://opencode.ai/v2/docs/migrate-v1/)

## 一、审计背景

v0.6.0（2026-10-04，主题「OpenCode V2 迁移」）声明完成 V2 迁移，但实际只迁移了插件 API（V2 三个 breaking change 之一），配置层仍是 V1 legacy。本次审计对照官方 V2 `migrate-v1` / `permissions` / `plugins` / `cli/plugins` / `build/plugins/migrate-v1` 文档逐项核实，并执行**激进清理**：移除全部 V1 legacy 配置，转为 native V2。V1 配置形态保留在 [`v1-compat` 分支](../../)的 `V1-COMPAT.md`。

## 二、V2 的三个 breaking change（官方定义）

| breaking change | 清理前 | 清理后 |
|---|---|---|
| 插件 API（`Plugin.define` + `ctx.*`） | ✅ native V2（v0.6.0） | ✅ 不变 |
| server API / clients | N/A | N/A |
| terminal client 配置（`tui.json` → `cli.json`） | ⚠️ 用 `tui.json` 声明 TUI 插件 | ✅ `tui.json` 已移除，V2 靠自动发现 |

## 三、插件 API：native V2 ✅

3 个插件全部用 V2 API，对照官方 `build/plugins/migrate-v1` 的 V1→V2 映射表全部正确：

| 插件 | V2 API | 对照官方映射 |
|---|---|---|
| `men-verify.ts` | `Plugin.define` + `ctx.tool.hook("execute.after")` | `tool.execute.after` → `ctx.tool.hook` ✅ |
| `men-learn.ts` | `Plugin.define` + `ctx.event.subscribe({ signal })` + cleanup `controller.abort()` | `event` → `ctx.event.subscribe()` ✅ |
| `men-sidebar/tui.js` | `Plugin.define` + `ctx.ui.slot` + `ctx.data.location.agent.list()` | TUI Context（`@opencode/plugin/tui`）✅ |
| `men-sidebar/index.js` | `Plugin.define`（空 setup，server 入口） | server/TUI 双入口分离 ✅ |

V2 运行时特性已处理：`process.execPath` 是 `opencode.exe`（Bun），插件内 `resolveNodeBin()` 显式解析 node 跑 verify.mjs/learn.mjs。

## 四、tui.json：已移除 ✅（激进清理）

**V2 自动发现约定**（[cli/plugins 文档](https://opencode.ai/v2/docs/cli/plugins/)）：`.opencode/plugins/<name>/{index,tui}.js` 自动加载。men-sidebar 结构（`index.js` + `tui.js`）完全符合。

清理动作：
- 删除项目级 `.opencode/tui.json`（V1 TUI 插件声明，V2 已废弃）。
- `install.mjs` `writeTuiPlugin` / `unregisterTuiPlugin` 改 no-op（men-sidebar 目录仍由 `GLOBAL_ASSETS` 部署到 `~/.config/opencode/plugins/men-sidebar/`，V2 自动发现覆盖，无需 tui.json 注册）。
- `scaffoldConflictPaths` 移除 tui.json 引用。

**实测**：`opencode v2.0.24 plugin list` 确认删 tui.json 后 3 插件（men-learn / men-sidebar / men-verify）仍自动加载。

## 五、权限：已转 native V2 ✅（激进清理）

V2 权限模型（[permissions 文档](https://opencode.ai/v2/docs/permissions/)）：`permissions: [{ action, resource, effect }]` 有序数组，**最后匹配胜出**（具体 deny 须在 allow 之后）。action 名变更：`bash`→`shell`、`task`→`subagent`、`write`/`patch`→`edit`。

| 文件 | V1 legacy（清理前） | native V2（清理后） |
|---|---|---|
| `opencode.json` men | `permission: { question: "allow" }` | `permissions: [{ action: "question", resource: "*", effect: "allow" }]` |
| `.opencode/agent/men.md` | `permission: { question: allow, todowrite: allow }` | `permissions: [{ action: "question", resource: "*", effect: "allow" }]` |
| `gh-flow/opencode.gh-flow.json` gh-runner | `permission: { bash: {...}, task: {...} }` | `permissions: [{ shell * allow }, { shell git push --force* deny }, ..., { subagent * allow }]` |

**关于 `todowrite`**：V2 actions 列表无 `todowrite`（V2 actions：read/edit/glob/grep/shell/subagent/skill/question/webfetch/websearch/external_directory/execute）。men.md 的 `todowrite: allow` 已移除——men 作为 primary agent 默认 base policy 是 `{ action: "*", resource: "*", effect": "allow" }`（全允许），无需显式 todowrite。

**gh-flow 安全关键 deny**：V2 last-match-wins 语义下，`shell * allow` 兜底在前，`git push --force*` / `gh pr merge*` / `npm publish*` 等 deny 在后（覆盖 allow），deny 生效。

## 六、V1 类型包 `@opencode-ai/plugin`：已移除 ✅

`@opencode/plugin@2.0.6` 的 `exports` 各子路径自带 `types`（`dist/*.d.ts`），V2 类型完全自足。插件代码不 import V1 包（仅迁移注释提及"对照 V1"）。从 `.opencode/package.json` / `install.mjs` `FALLBACK_OPENCODE_DEPS` / `verify.mjs` `DEP_IMPORT_WHITELIST` / `test/install.test.mjs` 移除。

## 七、`v1-compat` 分支

V1 配置形态（`tui.json` + `permission` V1 + `@opencode-ai/plugin`）保留在 `v1-compat` 分支，供习惯 V1 配置或需逐步迁移的用户。**仍需 V2 OpenCode 运行**（插件 API 已是 V2，V1 OpenCode 无法运行 V2 插件——官方明确"V1 plugin implementations do not run in V2"）。详见 `v1-compat` 分支的 `V1-COMPAT.md`。

## 八、对外声明：README badge ✅

`README.md` badge `OpenCode-v1.18` → `OpenCode-v2`。CHANGELOG / docs/reports / docs/review 中的 `v1.18` 为历史变更记录与快照，保留不改。

## 九、结论

**men 已完全兼容 OpenCode V2（native 形态）**：

| 维度 | 状态 |
|---|---|
| 插件 API | ✅ native V2（Plugin.define + ctx.*） |
| 插件发现 | ✅ V2 自动发现（tui.json 已移除，实测 plugin list 确认） |
| 权限配置 | ✅ native V2 permissions 数组（shell/subagent） |
| V1 类型包 | ✅ 已移除（@opencode/plugin 自带类型） |
| 对外声明 | ✅ README badge v2 |
| V1 配置形态 | ✅ 保留在 v1-compat 分支 |

**剩余可选**（V2 归一化兼容，非阻断）：顶层 `agent`→`agents`、`skills.paths`→`skills` 的 native 化（migrate-v1 文档未警告必须改，且涉及 `install.mjs` `isConfigured` 的 `cfg.agent` 连锁，后续 PR 可做）。

**验证**：
- `npm test` 189 项全绿（含 17 项 V2-compat 形态守护）
- `verify.mjs men` PASS
- `opencode v2.0.24 plugin list` 确认 3 插件 V2 自动发现加载
