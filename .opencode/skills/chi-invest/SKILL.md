---
name: chi-invest
description: "Use when analyzing portfolio holdings, calculating investment returns, or tracking market performance for AU9999, Nasdaq, Hong Kong Stock Connect, or CSI Dividend Index. 触发关键词：持仓、收益、投资分析、portfolio、AU9999、港股通、纳斯达克、中证红利、金价、黄金。Don't call when the task is general market research (use xun-search), or when the user wants to write about finance (use ji-content-write)."
---

# chi-invest — 投资分析技能

## 用途

基于 Wealth Tracker 数据做持仓记录、收益计算与跟踪标的市场跟踪。输出客观持仓报告与风险提示。

## 不要触发

- 用户要求一般市场资讯搜索（用 xun-search）
- 用户要求撰写财经文章（用 si-content-write）
- 用户要求产品投资决策（决策权永远在用户）

## 投资分析工作流（step-by-step）

1. 查询持仓数据（GET /api/assets）
2. 获取市场行情（查询跟踪标的最新价格）
3. 计算当前市值 = 持仓数量 × 最新价格
4. 计算收益率 = (当前市值 - 成本) / 成本 × 100%
5. 计算较上期变动
6. 标注估算值（估算）和不确定值（待核实）
7. 输出结构化报告（持仓表 + 收益变动 + 风险提示）

## 数据源

**Wealth Tracker API**：`http://192.168.31.111:8888`

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/assets` | GET | 读取持仓数据 |
| `/api/assets` | PUT | 更新持仓数据 |
| `/api/assets` | POST | 新增持仓数据 |
| `/api/records` | GET | 读取交易记录 |
| `/api/records` | PUT | 更新交易记录 |
| `/api/records` | POST | 新增交易记录 |

## 跟踪标的

- **AU9999**（黄金 T+D）
- **纳斯达克**（Nasdaq 指数）
- **港股通**（港股通标的）
- **中证红利**（中证红利指数）

## API 错误处理

| 场景 | 处理 |
|------|------|
| API 离线（连接超时） | 报告 "数据源不可用"，使用最近一次缓存数据标注 "（缓存）" |
| 返回空数据 | 报告 "无数据"，不编造 |
| 数据格式异常 | 报告原始响应，标记 "数据异常" |
| 部分标的无行情 | 该标的位置标注 "（待核实）" |

## 项目规范参考

- **全员红线 #1**：持仓数据必须来自 Wealth Tracker API 的真实响应，不凭记忆或训练数据"估算"
- **全员红线 #4**：外部操作（发邮件、公开发布持仓报告）前必须征得用户同意
- **内网数据源**：Wealth Tracker API（192.168.31.111:8888），仅在内网可用
- **决策权在用户**：chi 只出分析不出决策（AGENTS.md chi.md）
- **event.mjs 审计**：每次持仓查询用 `event.mjs append --type decision.made` 记录
- **数据标注**：估算值标注（估算），不确定标注（待核实）
- **CHARTER_CHECK**：chi 角色 Clarification level=MEDIUM
- **协作边界**：投资分析由 chi 执行，市场资讯搜索由 xun 执行

## 客观性原则

- 数据是什么就是什么，不美化、不粉饰
- 估算数据必须标注 **（估算）**
- 不确定数据必须标注 **（待核实）**
- **决策权永远在用户**，chi 只出分析不出决策

## 输出格式

1. **持仓表**：标的 / 数量 / 单价 / 市值 / 来源时间戳
2. **收益变动**：收益金额 / 收益率 / 较上期变动 / 数据来源
3. **风险提示**：数据缺失标注、市场波动提醒、估算标注

## 触发场景

- 用户询问持仓、收益、投资收益时
- 周期性持仓快照请求
- 新增/更新交易记录
