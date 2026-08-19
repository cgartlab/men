---
name: chi-judge
description: 对任意 agent 产物做机械验证（file exists / tests pass / lint / command output / secrets 扫描 / TODO 扫描），触发关键词：评审、judge、验收、verify、review。
---

# chi-judge — 独立评审（Judge）技能

## 用途

对 si / ji / yi / xun 任意 agent 的产物做 fresh context 机械验证，输出结构化 Judge 报告。

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

### 输出格式

```
## Judge 报告

| 标准ID | 验证类型 | 状态 | 证据 |
|--------|----------|------|------|
| S1 | file exists | PASS | ls output |
| S2 | tests pass | FAIL | exit code 1, stderr: ... |
| S3 | hardcoded secrets 扫描 | REGRESSED | found API_KEY in xxx.ts |

**Verdict**: PASS / FAIL / BLOCKED
```

## 事件审计

judge 决策追加到 `.agents/state/sessions/{sid}/events.jsonl`（append-only）：

- `gate.passed`：验收通过，附证据
- `gate.failed`：验收失败，附失败详情
- 每条 gate 记录包含验证类型、期望结果、实际结果

## 触发场景

- 其他 agent 提交产物请求评审时
- men（门）在任务流程中插入 judge 环节时
- 周期性回归验证
