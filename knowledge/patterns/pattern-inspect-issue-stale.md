---
id: pattern-inspect-issue-stale
type: pattern
created: 2026-09-01
status: active
source: W4 tech-debt 修复（branch fix/tech-debt-plan）
---

# 模式：巡检 issue 先勘察现状，防基于旧代码白改

## 问题

自动化巡检/机器人生成的 issue 基于**生成时刻的快照代码**，而仓库迭代快。issue 提交后目标代码可能已被后续修复或演进。若直接照 issue 原样执行修复，会「白改」——改一个已经不存在的问题，或重复别人已做的工作。

## 模式

处理任何来源的 issue（尤其机器人巡检生成）前，**先勘察现状核实**，再决定动作：

1. **读当前代码**：打开 issue 指向的文件/行，看问题是否仍存在
2. **查演进痕迹**：`git log` / `git diff` / 已有机械检查，确认是否被后续提交修复
3. **三态分流**：
   - 已修复/已消除 → **不再按 issue 原样改**，走「增强 + 验收后 close」
   - 部分存在 → 只修仍存在的部分，注明已覆盖项
   - 仍存在 → 正常进入 fix 流程
4. **「增强+验收后 close」**：若现状已满足 issue 意图，只做增量增强（如把魔数抽为常量、补机械检查防回归），跑机械验证 PASS 后 close，close 时标注「已由 xxx 修复」

不勘察就动手 = 把 issue 当成对现状的断言，这是错误前提。

## 示例

W4 巡检的 3 个 open issue 均基于旧代码，勘察现状核实后避免 ji 白改：

| Issue | 状态（gh issue view） | 勘察结论 | 处理 |
|-------|----------------------|----------|------|
| #66 update-check.mjs fetch 无超时 | OPEN | 工作树已加 `FETCH_TIMEOUT_MS = 10_000` + AbortController（`git diff` 证实） | 增强后 close，不重复修 |
| #67 release.mjs spawnSync 无 timeout | OPEN | code-hygiene 扫描已纳入「无 timeout spawnSync」检查，release.mjs 已改 | 机械防线已覆盖，close |
| #62 verify.mjs 依赖存在性检查 | OPEN | future 类 issue，非当前缺陷 | 评估后按需增强，不照单全改 |

关键证据：`git status` 显示 3 个修复相关文件（`update-check.mjs` / `release.mjs` / `verify.mjs`）均在本次工作树已改动，而 issue 仍是 OPEN——**状态标签滞后于代码事实**。

## 验收/应用

- 处理巡检/机器人 issue 前，先产出「现状核实」：目标文件当前内容 + `git log`/`git diff` + 对应 verify check 结果
- issue 已修复时，交付物是「现状说明 + 增强点 + 验收证据」，而不是照 issue 改代码
- close 已修复 issue 时标注修复来源，避免后续重复巡检
- 无法判断现状时，标记存疑，不脑补结论
