# hermes-bot-mode 行为层验证报告 — 2026-10-08

> 验证对象：`.opencode/skills/hermes-bot-mode/SKILL.md` 的职责判定表与 pass 纪律
> 环境：Hermes Agent v0.21.5+8817.gd02f211 · Windows 11 · 各 profile 独立 `HERMES_HOME` 隔离
> 方式：机械层（27 项单测 + 33 项契约断言）+ 行为层（本报告，4 个轮次场景实测）
> 命令模板：`HERMES_HOME=<profile> hermes chat --query-file <round.txt> --oneshot -Q --format text --skills hermes-bot-mode`

## 结论

**4/4 场景通过**（其中场景 2 经一次 skill 强化后通过）。行为层为模型输出验证，非 CI 硬门。

| # | 场景 | 角色 | 期望 | 实际 | 判定 |
|---|------|------|------|------|------|
| 1 | 无 @、men 在场、任务非本域 | xun | `(pass)` | 恰为 `(pass)` | ✅ |
| 2 | 无 @、men 在场、任务**看似本域** | ji | `(pass)` | 首跑**抢接**（违规）→ 强化判定表后重跑恰为 `(pass)` | ✅（修复后） |
| 3 | 无 @、轮到 men | men | 意图分诊 + @点名 + 其余静默 | 【意图】…对口专家 **chi** … @chi 接单，@ji 待命，"其余成员暂无需响应" | ✅ |
| 4 | 被 men @点名 | ji | 必答不得 pass | `@men @user 接单前先卡一步…`（应答并说明缺口） | ✅ |

## 关键发现与修复（场景 2）

首跑中 ji 的表现：

> 用户要"上周的财报数据"但没有附任何数据——我需要先向用户索取原始数据源。作为负责执行的 @ji，这是对口任务，我直接说清楚需要什么。…
> "收到，这个任务我来做表格（@ji）。…"

**问题**：ji 的房间成员列表含 @men，按纪律应首轮 `(pass)` 等 men 分诊；ji 却先判断"任务属于我的职责域"再抢接（且自 @ 自己）——这正是"七嘴八舌"的成因。根因是职责判定表把"职责域"放在了过前的判断位。

**修复**：SKILL.md §3.1 改为**不可跳过的三问顺序**——
1. 我被 @ 了吗？→ 必答；
2. men 在房间成员列表吗？→ 在且没被 @ → **无条件 `(pass)`，先于职责域判断**（"不要判断 men 可能不会回——men 会轮到自己的 turn"）；
3. men 真不在房间 → 才考虑职责域接单。

强化后重跑场景 2 → 恰为 `(pass)`；契约断言 33/33 仍绿（含"men 是默认接单者""其余 5 个角色首轮一律"等原文锚点）。

## 场景原文（节选）

### 场景 1 — xun（期望 pass）
```
[Group chat: "Men Agent Team"] You are @xun, one participant with @men, @ji, @yi and the user.
New messages …: User: 帮我把上周的财报数据整理成表格
Rules: …reply with exactly "(pass)"…
```
输出：`(pass)`（exit 0，21s）

### 场景 3 — men（期望分诊）
输出（节选）：
```
【意图】财务数据整理成表格 → analyze 域（财务/数据 + 表格产出），对口专家是 chi（持）。
…给我这三个信息我就直接 @chi 接单执行。@ji 待命做表格排版…
其余成员暂无需响应。
```

### 场景 4 — ji 被 @（期望必答）
men 的分诊消息含 `@ji 请接单`，ji 输出应答接单并回 `@men @user` 说明数据缺口——非 `(pass)`。

## 环境与前提

- skill 同步路径：仓库 `.opencode/skills/hermes-bot-mode/SKILL.md` → 7 个 Hermes home（default + profiles/{men,si,ji,chi,yi,xun}）的 `skills/men/hermes-bot-mode/`
- 7 个 `SOUL.md` 已加兜底行（§6.3：群组轮次先 `skill_view('hermes-bot-mode')`），**需重启 session 生效**
- 群组房间当前状态：`runtime-probe --json` → `rooms.active: []`（房间被删，墓碑 4 条）；真实群组验证（§7.3）待桌面端重建群组后进行
- 模型输出有随机性：每个场景 n=1；`--skills hermes-bot-mode` 预载以保证 skill 生效（自然触发依赖 available_skills 索引 + SOUL 兜底行，见集成文档 §6.2）

## 机械层佐证

```bash
node --test test/runtime-probe.test.mjs        # 27 项（真机：runtime=hermes, botModeManaged=true）
node --test test/agent-consistency.test.mjs    # 33 项（含 hermes-bot-mode 契约 6 断言）
node scripts/runtime-probe.mjs --expect hermes # exit 0
npm test                                       # 269 项全绿
```
