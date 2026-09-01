---
id: pattern-node-script-testability
type: pattern
created: 2026-09-01
status: active
source: W4 tech-debt 修复（branch fix/tech-debt-plan）
---

# 模式：Node 脚本「导出 + 入口守卫」可测性重构

## 问题

纯 Node CLI 脚本（无框架）天然不可测：逻辑全部耦合在顶层执行流里，测试只能黑盒 `spawn` 子进程，慢、无法断言内部状态、还要处理 CLI 退出码与 stdio。更糟的是，黑盒 spawn 可能触发**递归**——若被测脚本自身会调用测试命令（如 verify 的 checkGate 跑 test 脚本），测试 spawn 它 = 无限递归。

## 模式

把脚本拆成「可导入的纯函数」+「受守卫保护的 CLI 入口」两层：

1. **导出纯函数**：把可测逻辑抽成 `export function ...`（解析、扫描、判断类函数），保持零副作用或副作用可注入
2. **入口守卫**：CLI 运行包在守卫里，仅**直接执行**时触发，被 import 时不运行：
   ```js
   // 入口守卫：仅直接执行时运行 CLI，被 import 时不触发
   if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
     main(process.argv.slice(2));
   }
   ```
3. **测试直接 import 纯函数**，用 Node 内置 `node:test` + `node:assert`，零第三方依赖
4. **绝不黑盒 spawn 被测脚本**，尤其被测脚本会回调测试命令时（递归风险）

### node:test 选择理由

| 维度 | node:test | vitest |
|------|-----------|--------|
| 依赖 | Node 内置，零安装 | 需装依赖 + 配置 |
| 契合哲学 | 纯 Node 脚本仓库零依赖 | 引入构建链 |
| CI/Windows 兼容 | 直接 `node --test` | 需转译/兼容配置 |
| 断言 | 内置 `node:assert` | 自带 expect |

`package.json` test 脚本从 `node scripts/learning.test.mjs` 改为 `node --test`，零成本迁移。

## 示例

- `scripts/verify.mjs` 导出 `parseArgs` / `clipErr` / `checkCodeHygiene` / `scanEmptyCatchesInText` 等纯函数，第 930 行入口守卫
- `scripts/release.mjs`（512 行）/ `scripts/install.mjs`（511 行）同样入口守卫
- `test/verify.test.mjs` 直接 `import { parseArgs, checkCodeHygiene, ... } from '../scripts/verify.mjs'` 测纯函数
- **递归风险实证**：verify.test.mjs 头注释「不 spawn verify.mjs CLI（会触发 checkGate 跑 test 脚本 → 无限递归）」——verify 的 checkGate 会执行 package.json test 脚本，黑盒 spawn verify 会形成 verify→test→verify 死循环

## 验收/应用

- 新增/改造脚本：纯逻辑必须 `export`，CLI 必须入口守卫，守卫模式与现有脚本一致
- 测试一律 import 纯函数 + `node:test`，不 spawn 被测脚本
- 若被测脚本会调用测试/验证命令，显式标注「禁止黑盒 spawn」，防递归
- `node --test` 须在 CI 通过（语法检查已覆盖 `test/*.mjs`）
