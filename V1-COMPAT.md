# V1-COMPAT 分支

本分支保留 men 的 V1 配置形态，供习惯 V1 配置或需逐步迁移的用户参考。

## 与 main（V2 native）的区别

| 维度 | v1-compat（本分支） | main（V2 native） |
|---|---|---|
| TUI 插件声明 | .opencode/tui.json（V1 显式声明） | V2 自动发现（.opencode/plugins/<name>/{index,tui}.js） |
| 权限配置 | permission: { bash, task, ... }（V1 按工具分组） | permissions: [{ action, resource, effect }]（V2 有序数组） |
| 类型包 | @opencode-ai/plugin（V1 类型） | @opencode/plugin（V2 自带类型） |

## 重要：仍需 V2 OpenCode 运行

men 自 v0.6.0 起插件 API 已迁移到 V2（Plugin.define + ctx.*），V1 OpenCode 无法运行 V2 插件。本分支只保留 V1 配置形态，运行时仍需 OpenCode V2（V2 会归一化兼容 V1 legacy 配置）。

## 迁移到 V2 native

如需迁移到 V2 native 配置，参考 main 分支与 docs/research/opencode-v2-compat-audit.md。