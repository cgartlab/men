# OpenCode V2 兼容性审计

> 审计日期：2026-10-07｜分支：`chore/opencode-v2-compat`｜依据：[OpenCode V2 官方文档](https://opencode.ai/v2/docs/migrate-v1/)

## 一、审计背景

v0.6.0（2026-10-04，主题「OpenCode V2 迁移」）声明完成 V2 迁移。本次审计对照 OpenCode V2 官方 `migrate-v1` / `permissions` / `plugins` / `cli/plugins` / `build/plugins/migrate-v1` 文档，逐项核实 men 的真实兼容状态，区分「native V2」「V1 legacy（V2 归一化兼容）」「不兼容」三类。

## 二、V2 的三个 breaking change（官方定义）

| breaking change | men 状态 |
|---|---|
| 插件 API（`Plugin.define` + `ctx.*`） | ✅ 已 native V2（v0.6.0 迁移 3 插件） |
| server API / clients | N/A（men 未直接调 server API） |
| terminal client 配置（`tui.json` → `cli.json`） | ⚠️ men 用 `tui.json` 声明 TUI 插件（见 §4） |

## 三、插件 API：已 native V2 ✅

3 个插件全部用 V2 API，对照官方 `build/plugins/migrate-v1` 的 V1→V2 映射表全部正确：

| 插件 | V2 API | 对照官方映射 |
|---|---|---|
| `men-verify.ts` | `Plugin.define` + `ctx.tool.hook("execute.after")` | `tool.execute.after` → `ctx.tool.hook` ✅ |
| `men-learn.ts` | `Plugin.define` + `ctx.event.subscribe({ signal })` + cleanup `controller.abort()` | `event` → `ctx.event.subscribe()` ✅ |
| `men-sidebar/tui.js` | `Plugin.define` + `ctx.ui.slot` + `ctx.data.location.agent.list()` | TUI Context（`@opencode/plugin/tui`）✅ |
| `men-sidebar/index.js` | `Plugin.define`（空 setup，server 入口） | server/TUI 双入口分离 ✅ |

V2 运行时特性已处理：`process.execPath` 是 `opencode.exe`（Bun），插件内 `resolveNodeBin()` 显式解析 node 跑 verify.mjs/learn.mjs。

## 四、插件配置 / 发现：V2 自动发现覆盖，tui.json 是 V1 遗留

**V2 自动发现约定**（[cli/plugins 文档](https://opencode.ai/v2/docs/cli/plugins/)）：

```
<project>/.opencode/plugins/<name>/index.ts   ← server 入口
<project>/.opencode/plugins/<name>/tui.ts     ← TUI 入口
```

men-sidebar 结构完全符合：`.opencode/plugins/men-sidebar/index.js` + `tui.js`。**V2 自动发现会加载 men-sidebar，侧边栏在 V2 下应能显示，不依赖 tui.json。**

`.opencode/tui.json`（`{ "$schema": "https://opencode.ai/tui.json", "plugin": [...] }`）是 V1 的 TUI 插件声明机制。V2 用 `cli.json`（全局）取代 `tui.json`（终端客户端配置），且插件声明靠 `opencode.json` 的 `plugins` 字段 + 自动发现。**tui.json 在 V2 被忽略，但自动发现仍工作——属 V1 遗留死配置，无害但应清理。**

> 清理建议（后续 PR）：`install.mjs --global` 的 tui.json 写入逻辑应迁移到 `~/.config/opencode/plugins/` 自动发现形态；项目级 tui.json 可删（V2 不读）。本分支未改，因涉及 `--global` 部署链路，需单独验证。

## 五、权限配置：V1 legacy（V2 归一化兼容，native 化为可选）

V2 权限模型重构（[permissions 文档](https://opencode.ai/v2/docs/permissions/)）：

- V1：`permission: { bash: {...}, task: {...}, edit: "allow" }`（按工具分组）
- V2：`permissions: [{ action, resource, effect }]`（有序数组，最后匹配胜出）
- action 名变更：`bash` → `shell`、`task` → `subagent`、`write`/`patch` → `edit`

men 当前配置：

| 文件 | 当前（V1 legacy） | V2 native 应为 |
|---|---|---|
| `opencode.json` men | `permission: { question: "allow" }` | `permissions: [{ action: "question", resource: "*", effect: "allow" }]` |
| `.opencode/agent/men.md` | `permission: { question: allow, todowrite: allow }` | `permissions: [{ action: "question", ... }, ...]`（`todowrite` 待确认，见下） |
| `gh-flow/opencode.gh-flow.json` gh-runner | `permission: { bash: {...}, task: {...} }` | `permissions: [{ action: "shell", ... }, { action: "subagent", ... }]` |

**V2 承诺**（migrate-v1）："V2 reads existing... configuration... It normalizes supported V1 and native V2 fields in memory without rewriting the source file. Existing supported V1 configuration is intended to keep working."

**待实测确认**：
- `men.md` 的 `todowrite` **不在 V2 actions 列表**（V2 actions：read/edit/glob/grep/shell/subagent/skill/question/webfetch/websearch/external_directory/execute）。`todowrite` 是 V1 工具名，V2 的 todo 工具权限 action 可能是 `edit` 或 `execute`。若 V2 不识别 `todowrite`，该权限被忽略（默认 `ask`，不阻断但权限不精确）。
- `gh-flow` 的 `bash`/`task`：V2 文档警告"use `permissions`, `shell`, `subagent` instead of `permission`, `bash`, `task`"，但承诺归一化 legacy。若归一化覆盖 action 名翻译，`git push --force*` deny 仍生效；若不覆盖，**安全关键 deny 可能失效**。

**建议**（后续 PR）：`gh-flow` 安全权限转 native V2（`bash`→`shell`、`task`→`subagent`）确保 deny 生效；`men.md` 的 `todowrite` 实测确认 V2 action 后调整。本分支未改，因权限改动有安全风险且 V2 legacy 归一化使其仍工作，需 E 组实测后决定。

## 六、V1 类型包 `@opencode-ai/plugin`：已移除 ✅（本分支）

`@opencode/plugin@2.0.6` 的 `exports` 每个子路径自带 `types`（`dist/*.d.ts`），**V2 类型完全自足**。插件代码不 import V1 包（仅迁移注释提及"对照 V1"）。本分支已从 `.opencode/package.json` / `install.mjs` `FALLBACK_OPENCODE_DEPS` / `verify.mjs` `DEP_IMPORT_WHITELIST` / `test/install.test.mjs` 移除，`npm test` 173 项全绿。

## 七、对外声明：README badge 已修正 ✅（本分支）

`README.md` badge `OpenCode-v1.18` → `OpenCode-v2`。CHANGELOG / docs/reports / docs/review 中的 `v1.18` 均为历史变更记录与快照，保留不改（改即篡改历史，v0.6.0 已有先例警告）。

## 八、结论

**men 已达成 OpenCode V2 核心兼容**：插件 API native V2、插件靠自动发现加载（侧边栏应能显示）、V1 类型包已清理、对外声明已对齐。

**剩余为 V1 legacy 清理项**（V2 归一化兼容，非功能阻断）：
1. `tui.json` → 自动发现形态（涉及 `--global` 部署，后续 PR）
2. 权限 `permission` → `permissions` native V2（安全关键，需 E 组实测后改）
3. `men.md` `todowrite` action 名确认（需实测）

**E 组实测待办**：
- [ ] 真实 opencode v2.0.6 下 men-sidebar 侧边栏是否显示
- [ ] `permission.question` / `todowrite` 在 V2 是否生效
- [ ] `gh-flow` `bash`/`task` deny 是否被 V2 归一化为 `shell`/`subagent`
