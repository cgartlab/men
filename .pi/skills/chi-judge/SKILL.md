---
name: chi-judge
description: "Use when performing independent mechanical verification (judge) of any agent's output — checking file existence, test results, lint, secrets, or TODO scans. 触发关键词：评审、judge、验收、verify、review、验收标准、独立评审、质量门禁。Don't call when the task is writing new code (use ji), or when doing semantic content review (use si)."
---

# chi-judge — 独立评审（Judge）技能

## 用途

对 si / ji / yi / xun 任意 agent 的产物做 fresh context 机械验证，输出结构化 Judge 报告。

## 不要触发

- 用户要求写新代码（由 ji 负责）
- 用户要求做内容风格评审（由 si 负责）
- 用户要求做视觉设计评审（由 yi 负责）

## Judge 协议

### 基本原则

1. **Fresh context**：不接收执行者叙述，只按验收标准核对。judge brief 只含验收标准，不含执行过程描述。
2. **机械验证优先**：退出码、文件存在性、命令输出，拒绝 LLM 自评。
3. **每轮复验所有标准**（含上一轮 PASS 的），防回归。
4. **不接受"测试通过"作为唯一证据**：必须有可复核的机械输出。
5. **连续 3 次失败标记 BLOCKED**，停止重试并汇报。

### 验证类型表

| 验证类型 | 执行方式 | PASS 条件 |
|----------|----------|-----------|
| file exists | 检查路径 | 文件存在 |
| tests pass | 跑测试 | 退出码 0 |
| lint / typecheck | 跑检查 | 0 错误 |
| build succeeds | 跑构建 | 退出码 0 |
| command output | 跑命令 | 输出匹配预期 |
| hardcoded secrets 扫描 | 扫描源码 | 无 API key / 密码明文 |
| TODO 扫描 | 扫描源码 | 无未标注 TODO |

### 状态标记

| 状态 | 含义 |
|------|------|
| PASS | 本轮验证通过 |
| FAIL | 本轮验证失败 |
| REGRESSED | 上一轮 PASS → 本轮 FAIL（回归） |
| BLOCKED | 连续 3 次失败，停止重试 |

## 测试 Flakiness 处理

| 场景 | 处理 |
|------|------|
| 同一测试连续失败但错误信息不同 | 标记为 `UNSTABLE`（非 FAIL），提示检查测试稳定性 |
| 时间相关测试失败 | 记录当前时间，标记 `TIME-DEPENDENT` |
| 网络相关测试失败 | 检查网络连接，标记 `NETWORK-DEPENDENT` |

### 输出格式

```
## Judge 报告

| 标准ID | 验证类型 | 状态 | 证据 |
|--------|----------|------|------|
| S1 | file exists | PASS | `ls -la src/index.html` → 4128 bytes |
| S2 | tests pass | FAIL | exit code 1, stderr: `Error: Cannot find module` |
| S3 | hardcoded secrets 扫描 | PASS | 0 matches in 12 files |
| S4 | command output | REGRESSED | expected `200`, got `404` |

**Verdict**: FAIL（S2 failed, S4 regressed）
```

## 项目规范参考

- **双层验证架构**：verify.mjs 5项机械检查（output-exists/secrets/todo-scan/structure/gate-exit-code）→ 全PASS → chi fresh-context 语义复核
- **5 项机械检查**：通过 `node scripts/verify.mjs <target>` 执行，退出码 0 = 通过
- **Fresh context spawn**：judge 不共享执行者上下文，只接收验收标准
- **状态机**：PASS→本轮通过 / FAIL→本轮失败 / REGRESSED→上一轮PASS→本轮FAIL / BLOCKED→连续3次失败
- **3 次失败即 BLOCKED**：连续 3 次 FAIL 后标记 BLOCKED，停止重试，汇报卡住
- **不接受 LLM 自评**：不接受"测试通过"作为唯一证据
- **不接受自述**：只核对实际产物文件，不接受任何子 agent 的"我完成了"作为完成证据
- **verify.mjs 五项检查**：output-exists→secrets→todo-scan→structure→gate-exit-code
- **全员红线 #1**：judge 报告必须有机械证据（退出码/文件存在/命令输出）
- **全员红线 #2**：不跳过 verify.mjs 直接做 judge
- **CHARTER_CHECK**：chi 角色 Clarification level=MEDIUM

## 事件审计

judge 决策追加到 `.agents/state/sessions/{sid}/events.jsonl`（append-only）：

- `gate.passed`：验收通过，附证据
- `gate.failed`：验收失败，附失败详情
- 每条 gate 记录包含验证类型、期望结果、实际结果

## 触发场景

- 其他 agent 提交产物请求评审时
- men（门）在任务流程中插入 judge 环节时
- 周期性回归验证
