---
name: hermes-bot-mode
description: "Use when running inside Hermes Bot Mode — a group chat turn, a Bot Chat with teammates, or when you must detect the runtime environment and decide whether to speak or stay silent in a multi-bot room. 触发关键词：Bot Mode、群组、群聊、group、Discussion、七嘴八舌、有序执行、该不该回话、(pass)、message_agent、Hermes 环境识别。Don't call when the task is a plain single-user session with no bot teammates involved (normal role skills apply), or when you only need OpenCode orchestration (use /ultrawork)."
---

# hermes-bot-mode — Hermes Bot Mode 环境识别与群组有序执行

本 skill 解决两个问题：**我现在跑在什么环境里**（自动识别），以及**在多 Bot 群组里什么时候该说话、什么时候该闭嘴**（有序执行）。

## 一、三层环境识别（先识别，后行为）

按可靠性从高到低依次判断，命中即停：

| 层 | 信号 | 判定 | 取证方式 |
|----|------|------|---------|
| **L1 prompt 层** | 当前轮 prompt 以 `[Group chat: "…"]` 或 `[Discussion: "…"]` 开头 | **正处在群组发言轮** | 读本轮用户消息首行，无需工具 |
| **L1 prompt 层** | 系统提示含 `## Messaging other agents` 段 | 处于 canonical **Bot Chat**（有 `message_agent` 工具） | 读系统提示 |
| **L2 工具层** | 工具列表里存在 `message_agent` | Bot Chat 已授权（仅 Bot Chat 注入该工具） | 查看可用工具 |
| **L3 机械层** | `node scripts/runtime-probe.mjs --json` | 环境事实：runtime / profile / 托管状态 / 群组房间 | 运行探针脚本 |

**规则**：
- **L1 优先**——prompt 前缀是唯一能证明"这一轮我在群里"的信号；L2/L3 只能证明环境存在，不能证明当前轮是群组轮。
- L1 未命中但 L3 显示有活跃房间 → 你只是**可能**会被拉入群组，当前仍是普通会话，按角色正常行为。
- 三层都拿不准 → 视为普通单用户会话，按角色定义行为；**不要**因为怀疑在群里就擅自 `(pass)`。

### runtime-probe 用法

```bash
node scripts/runtime-probe.mjs --json              # 完整环境事实
node scripts/runtime-probe.mjs --expect hermes      # 断言在 Hermes 内（退出码 0/3）
node scripts/runtime-probe.mjs --expect bot-mode    # 断言 profile 被 Bot Mode 托管
node scripts/runtime-probe.mjs --expect room:Men\ Agent\ Team   # 断言存在某群组房间
```

退出码：`0` 满足 / `1` 意外错误 / `2` 用法错误 / `3` 断言不满足。探针只读不写，任何环境都不会抛异常。

## 二、群组轮次机制（Hermes 如何防止无人应答）

群组由 Hermes 的确定性调度器驱动，**一轮只有一个 Bot 拿到 turn**：

1. **Round 0**：用户消息里 @了谁就轮谁；**没有 @ = 所有成员轮流各拿一个 turn**（这正是"七嘴八舌"的来源——每个人都会被轮到）。
2. **Round 1+**：只有被上一位发言者 **@cite 过**的成员才进下一轮（opt-in）。
3. **上限**：3 轮 / 10 条消息 / 6 成员，超限自动 settled。
4. **静默**：回复为空、或整串匹配 `\(?pass?\)?\.?`（即 `pass` / `pass.` / `(pass)` / `(pass).`，大小写不敏感）= 该成员本轮静默，**不产生群内消息**，会话继续流转。注意：任何附加文字（`(pass) 我先看看`）都会被视为真实发言发布。
5. **无强制应答**：Hermes 没有"被点名却 pass 就 nudge 你"的机制——静默就是静默。所以 `men` 必须自己确保被点名时一定产出，不要指望运行时替你兜底。

**关键推论**：Round 0 无 @ 时你**必然**会拿到一个 turn——有序执行不取决于"会不会被轮到"，而取决于**轮到你时你做什么**。

## 三、有序执行协议（men 团队群组纪律）

### 3.1 职责判定表

轮到你发言时，按顺序判定：

| 情形 | 你若… | 动作 |
|------|-------|------|
| 用户 @了你 | 任何角色 | **必须回答**（不得 pass），直接产出 |
| 用户 @了别人（没 @你） | 任何角色 | `(pass)` |
| 无 @，任务属于**你的职责域**，且你是 men | men | 接单：意图门分诊 → 回复中 @点名下一步执行者 |
| 无 @，任务属于**你的职责域**，men 不在群/未响应 | 对应专家 | 接单执行（首次发言声明"我来"） |
| 无 @，任务**不属于**你的职责域 | 非 men / 非对应专家 | `(pass)` |
| 无 @，men 已经接单并 @了别人 | 任何非被点名者 | `(pass)` |
| 你被 men @点名 | 对应专家 | 执行并汇报（此为 Round 1+ 你入场的唯一正常方式） |

### 3.2 核心纪律（防七嘴八舌）

1. **men 是默认接单者**：无 @ 的任务由 men 分诊，**其余 5 个角色首轮一律 `(pass)`**——除非 men 明确不在场且你按路由判定表是唯一对口专家。
2. **一次只有一个主发言人**：任何时候，正在产出的成员是唯一"说话的"；其他人不是 `(pass)` 就是等被 @。
3. **接单靠 @，不靠抢**：men 分诊后在回复里 @执行者 → 该执行者下一轮入场干活 → 干完在回复里 @下一个环节（或 @user 汇报结果）→ 群内自然串行。
4. **pass 要干净**：`(pass)` 必须是回复的**全部内容**——加任何前缀说明都会被当成真发言发布到群里。
5. **绝不重复**：上一位已说过的结论不复述、不"我补充一下"；有增量才说话（Hermes 群规则同样要求）。
6. **不泄露私聊**：Bot Chat 里的 1:1 内容永不带进群组回复。

### 3.3 men 的分诊回复模板

```
【意图】<一句话分类>
【路由】@<执行者> 请负责 <具体子任务>，验收标准 <可机械验证的条件>
（其他成员无需响应，等 @）
```

### 3.4 执行者的汇报模板

```
✅ <任务> 完成
- 产物：<路径/链接>
- 证据：<退出码/验证结果>
@men 已交付，请复核  （或：@user 结果如下 …）
```

### 3.5 何时用 message_agent 而不是群聊

| 场景 | 通道 |
|------|------|
| 任务分诊、结果公示、需要用户看到进度 | **群组内回复**（+ @ 点名） |
| 与某成员的私密/高频/长上下文协作 | `message_agent` DM（仅 Bot Chat 可用） |
| 单 profile 内部并行子任务 | `delegate_task` |

## 四、与 men 编排协议的关系

- `/ultrawork` 10 步协议面向 **OpenCode 内 task spawn**；群组里没有 `task` 工具，用**本 skill 的 @ 点名串行**替代 Wave 并行。
- 意图门（search/analyze/team/hyperplan）与路由判定表**不变**——men 在群里分诊用的是同一张表。
- 验证链路不变：群里交付仍须过 `scripts/verify.mjs` + chi judge（可由被点名者在自己的 profile 里跑）。
- 事件审计：群组任务的 `event.mjs append` 由**接单者**在自己 profile 内写入，sid 约定同 `/ultrawork`。

## 五、不要触发

- 单用户普通会话（无群组 prompt 前缀、无 Bot Chat 协议段）→ 按角色定义正常行为
- 只做 OpenCode 内编排 → 用 `/ultrawork`
- 只查环境不涉及行为决策 → 直接跑 `runtime-probe.mjs`，无需加载本 skill

## 六、机械验证（对本 skill 生效的检查）

```bash
node scripts/runtime-probe.mjs --expect hermes        # 环境层
node scripts/verify.mjs .opencode/skills/hermes-bot-mode --json   # 结构层
```

行为层验证：构造 `[Group chat: "…"]` 开头的轮次 prompt 分别喂给各 profile，断言非对口角色输出 `(pass)`、men 输出分诊+@（见 test/ 与 docs/integrations/hermes-bot-mode.md 的验证方案）。
