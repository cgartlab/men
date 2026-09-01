---
id: pattern-code-hygiene-scan
type: pattern
created: 2026-09-01
status: active
source: W4 tech-debt 修复（branch fix/tech-debt-plan）
---

# 模式：代码质量规则落地为 verify.mjs 机械静态扫描

## 问题

「空 catch / 无 timeout spawnSync / 裸 console.log」这类代码质量规则靠 code review 记忆执行，人审有遗漏、会回归。质量规则停留在口头约定 = 不可验证、不可回归防线。被 #66/#67 等健壮性 issue 反复点名后，应把规则**编码进机械检查**，让 verify 一跑即暴露，违规不可回归。

## 模式

把可机械判定的质量规则做成 verify.mjs 的一个 check（`checkCodeHygiene`），纳入 check battery：

1. **规则即 check**：每条规则独立扫描函数，返回命中的 `{file, type, line, snippet}`，有命中即 FAIL
2. **脱敏后扫描防误报**：先把注释与字符串字面量抹成空格（保留换行/行号/括号），再定位结构、回到原文提取内容——避免注释/字符串里的 `catch`、`spawnSync(`、`console.log(` 字样误报（`maskNonCode`）
3. **区分合规与违规**，只报真违规：
   | 规则 | 违规 | 合规放行 |
   |------|------|----------|
   | 空 catch | 完全空块 `catch {}` / `catch (e) {}` | 块内只有注释（标注意图） |
   | 无 timeout spawnSync | 调用无 `timeout` 键 | 带 `timeout: 30_000` 或常量 |
   | 裸 console.log | 未门控的 `console.log(` | `MEN_DEBUG` 门控内 / `console.error/warn/debug` |
   | 边界 | `.catch()` 方法调用不误报 | 字符串/注释中的字样不报 |
4. **不可回归**：check 进 verify battery，每次验证自动扫描，违规即 FAIL；纯函数另配正反用例测试锁定判定逻辑

## 示例

- `scripts/verify.mjs` 601 行起 code-hygiene 静态扫描：`maskNonCode`（脱敏）→ `scanEmptyCatchesInText` / `scanSpawnNoTimeoutInText` / `scanBareConsoleLogInText` → `checkCodeHygiene`（765 行），扫描 `scripts/*.mjs` + `.opencode/plugins/**`
- 合规判定实证：catch 块内仅 `/* ignore */` 或 `// best-effort` 视为合规（见 verify.mjs 688-692）；`spawnSync(..., { timeout })` 合规；`if (process.env.MEN_DEBUG === "1") { console.log(...) }` 合规
- `test/verify.test.mjs` 286-413 行正反用例：空 catch 命中、注释块放行、`.catch()` 不误报、字符串字样不报；415-420 行对真实仓库 `checkCodeHygiene` 断言 PASS（自检防线）
- #66/#67 正是此类健壮性 issue（无 timeout），code-hygiene check 落地后这些规则不再靠人记

## 验收/应用

- 新增质量规则：先写「违规 vs 合规」判定表，再落地为独立扫描函数 + verify check，并配正反用例
- 规则必须能区分「真违规」与「合规写法」（注释/门控/error 输出），避免误报阻塞正常代码
- 脱敏扫描（注释/字符串抹除）是防误报的前提，不可省略
- 每次 verify 自动执行 code-hygiene，违规 FAIL 即不可回归
