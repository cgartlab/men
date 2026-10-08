# Hermes Bot Mode 集成

> 适用对象：men 团队维护者 / 把 men 部署到 Hermes 的用户
> 形态：机械探针脚本 + skill 协议（prompt 层）
> 状态：v0.7.0 起内置；依据 Hermes 源码 `gateway/hosted_room_discussion.py` 与 `apps/desktop .../group-round-prompt.ts`（访问日期 2026-10-08）

## 1. 背景：为什么需要这个集成

men 的 6 个角色可以作为 **Hermes profile** 部署为独立 Bot，在桌面端 Bot Mode 里共存于一个分组（如 Men Team）。但**群组聊天**带来一个 OpenCode 里不存在的问题：

**七嘴八舌**。Hermes 群组的确定性调度器在 Round 0（用户消息未 @任何人）会让**每个成员都拿到一个发言 turn**——6 个 Bot 每个都会被轮到，若都觉得自己该回一句，群就被刷屏。

本集成提供两层解法：

| 层 | 载体 | 解决什么 |
|----|------|---------|
| **自动识别** | `scripts/runtime-probe.mjs`（机械）+ `hermes-bot-mode` skill（prompt） | 让 agent 知道自己在什么环境、当前轮是不是群组轮 |
| **有序执行** | `hermes-bot-mode` skill 的职责判定表与纪律 | 轮到你时：该说话（men 分诊/专家执行）还是 `(pass)`（其余全员） |

## 2. 环境自动识别（三层信号）

按可靠性从高到低，命中即停：

### L1 — prompt 层（唯一能证明"这一轮我在群里"的信号）

| 信号 | 含义 |
|------|------|
| 本轮消息以 `[Group chat: "…"]` 开头 | 桌面端 Bot 群组轮（`group-round-prompt.ts` 注入） |
| 本轮消息以 `[Discussion: "…"]` 开头 | 网关 hosted-room 讨论轮（`hosted_room_discussion.py` 注入） |
| 系统提示含 `## Messaging other agents` 段 | canonical Bot Chat（1:1 Bot 私聊） |

### L2 — 工具层

- 工具列表含 `message_agent` → Bot Chat 已授权。**该工具只在 canonical Bot Chat 注入**（`tools/bot_mode_dm.py` 的 `_session_title == "Bot Chat"` 门控），群组轮次里没有它——群组内协作靠 @点名，不靠 DM。

### L3 — 机械层（runtime-probe.mjs）

```bash
node scripts/runtime-probe.mjs --json
node scripts/runtime-probe.mjs --expect hermes      # 退出码 0/3
node scripts/runtime-probe.mjs --expect bot-mode
node scripts/runtime-probe.mjs --expect room:Men\ Agent\ Team
```

检测信号与数据源：

| 字段 | 数据源 |
|------|--------|
| `runtime` | 环境变量 `HERMES_HOME` / `HERMES_AGENT` / `AI_AGENT` |
| `profile` | `HERMES_HOME` 路径形态（`.../profiles/<name>` → named，否则 default） |
| `botModeManaged` | profile.yaml 的 `ui_meta['hermes-bots']` 字段 |
| `section` | profile.yaml 的 `sectionId` / `sectionName` |
| `rooms.active` / `rooms.deleted` | **default profile** 的 profile.yaml `ui_meta['hermes-bots-groups']`（v3 envelope，key 为 `id:<roomId>` 或 `name:<name>`） |
| `botModeProtocol` | config.yaml `agent.bot_mode_protocol`（缺省按 Hermes 默认 `true`） |

**边界**：探针只回答环境事实，**不能**证明当前轮是群组轮（那要 L1）。退出码 `0` 成功 / `1` 意外 / `2` 用法错误 / `3` 断言不满足。探针只读不写、任何环境不抛异常。

## 3. 群组调度机制（Hermes 侧事实）

源码：`gateway/hosted_room_discussion.py`（`plan_next_task`）与 `apps/desktop/src/plugins/hermes-bots/group-round-prompt.ts`。

1. **Round 0**：用户消息 @了谁就轮谁；**无 @ = 全体成员轮流各拿一个 turn**（七嘴八舌根源）。
2. **Round 1+**：只有被上一位发言者 **@cite 过**且此后未发言的成员入场（opt-in）。
3. **上限**：3 轮 / 10 条消息 / 6 成员，超限自动 settled。
4. **静默**：回复为空、或整串匹配 `\(?pass?\)?\.?`（即 `pass` / `pass.` / `(pass)` / `(pass).`，大小写不敏感，括号与句点均可选）= 该成员本轮静默，**不产生群内消息**（`message_event_id: null`），会话继续流转。
5. **注入规则**（每轮 prompt）：有增量才说、pass 干净、@ 拉人、不泄露私聊。

**推论**：无 @ 时你必然会被轮到——秩序不取决于"会不会被轮到"，取决于**轮到你时做什么**。

## 4. 有序执行协议（men 团队纪律）

完整定义见 `.opencode/skills/hermes-bot-mode/SKILL.md`，核心：

1. **men 是默认接单者**：无 @ 任务由 men 分诊（意图门 + 路由判定表，与 OpenCode 完全同一张表），**其余 5 角色首轮一律 `(pass)`**；例外：men 不在群且你是唯一对口专家。
2. **接单靠 @ 不靠抢**：men 分诊回复中 @执行者 → 执行者下一轮入场 → 干完 @下一环节或 @user 汇报 → 群内自然串行。
3. **一次只有一个主发言人**；pass 必须是回复的全部内容；不复述他人结论；Bot Chat 私聊内容永不进群。
4. **通道选择**：任务分诊/结果公示 → 群内回复 + @；私密高频协作 → `message_agent` DM；单 profile 内并行 → `delegate_task`。

## 5. 与 men 既有协议的关系

| 既有协议 | 群组场景下 |
|----------|-----------|
| `/ultrawork` 10 步（task spawn Wave 并行） | 群里无 `task` 工具 → 用 @点名串行替代并行 |
| 四类意图门 + 路由判定表 | **不变**，men 分诊复用 |
| verify.mjs + chi judge 双层验证 | **不变**，接单者在自己 profile 内跑 |
| 事件审计（event.mjs） | **不变**，接单者写入，sid 约定同 ultrawork |
| `message_agent` vs `delegate_task` 分工 | 不变；新增"群组轮次里没有 message_agent"这一事实 |

## 6. 部署

### 6.1 skill 同步到 Hermes profiles

men 在 Hermes 侧的技能包是 **`men/` 目录下的扁平命名目录**（`men/men`、`men/men-chi`、`men/chi-invest` …），不是分类子目录。新增本集成技能应沿用同一路径风格：

```bash
# 仓库 → Hermes 各 profile 的 skills 目录（Windows 实例路径）
HOME_WIN="C:/Users/<user>/AppData/Local/hermes"

# 1) default profile（men 主 agent 所在）
mkdir -p "$HOME_WIN/skills/men/hermes-bot-mode"
cp .opencode/skills/hermes-bot-mode/SKILL.md "$HOME_WIN/skills/men/hermes-bot-mode/"

# 2) 各成员 profile（si / ji / chi / yi / xun）
for slug in si ji chi yi xun; do
  mkdir -p "$HOME_WIN/profiles/$slug/skills/men/hermes-bot-mode"
  cp .opencode/skills/hermes-bot-mode/SKILL.md "$HOME_WIN/profiles/$slug/skills/men/hermes-bot-mode/"
done
```

Linux / macOS 的 home 目录为 `~/.hermes`，结构相同。skill 的 `name` 取目录名，因此必须与目标目录 `hermes-bot-mode` 一致。

### 6.2 让 skill 在群组轮次被加载

Hermes 在**每次 session 建立时**（含群组轮次）把已安装技能的 `name + description` 注入系统提示的 `<available_skills>` 区块（`agent/system_prompt.py` 的 `volatile` 层）——`description` 的**首个 57 字符**必须构成自包含的触发条件。本 skill 已按此写法（`Use when running inside Hermes Bot Mode — a group chat turn, a Bot Chat with teammates…`），并在其中列出中文触发词（群组 / 群聊 / Bot Mode / 七嘴八舌 / 该不该回话 / (pass)），使群组轮次的模型能匹配到它并主动 `skill_view('hermes-bot-mode')`。

**限制**：`available_skills` 只是索引，**不会自动加载正文**。群组轮次里模型看到索引后仍需自行调用 `skill_view`——这是概率性的，不是保证。因此 6.3 的 SOUL.md 引用行是**必需的兜底**，不是可选项。

### 6.3 SOUL.md 兜底引用（每个 profile 一行，必须做）

在每个 profile 的 `SOUL.md` 里加一句无条件指令，让模型在进入群组轮次时**必然**先加载 skill，而不依赖 description 匹配：

```
群组轮次（本轮消息以 [Group chat: 或 [Discussion: 开头）：先 skill_view('hermes-bot-mode')，
按职责判定表决定发言还是 (pass)。
```

改动 SOUL.md 后需重启 session（或 `/reset`）才生效。

### 6.4 群组房间

群组房间由**桌面端**管理，不能只靠 CLI 创建。若房间被删除，`profile.yaml` 的 `ui_meta['hermes-bots-groups']` 会留墓碑（`rooms: {}` 且 `deleted` 里有条目），`runtime-probe --json` 的 `rooms.deleted` 能看到——重建需在桌面端 Bot Mode 界面重新创建分组并把 6 个 profile 拉入。

## 7. 验证方案

### 7.1 机械层（仓库内，CI 可跑）

```bash
node --test test/runtime-probe.test.mjs          # 27 项单测（夹具注入 env/readText，不依赖真机）
node --test test/agent-consistency.test.mjs      # skill 契约 6 项断言
node scripts/runtime-probe.mjs --json            # 真机环境事实
node scripts/runtime-probe.mjs --expect hermes   # 退出码 0=满足 / 3=不满足
node scripts/verify.mjs .opencode/skills/hermes-bot-mode --json
```

### 7.2 行为层（模拟群组轮，单 profile 隔离实测）

> ⚠️ hermes CLI **没有 `-p <profile>` 参数**（已核对 `hermes chat --help`）。切换 profile 只能靠把 `HERMES_HOME` 指向该 profile 的目录，或用 `-s`/`--skills` 预载 skill。

用 `HERMES_HOME` 隔离各 profile，把带 L1 前缀的轮次 prompt 分别喂给不同角色：

```bash
# 轮次 prompt（写到文件，避免 shell 引号/反引号/`$(...)` 被解释）
cat > /tmp/round.txt <<'EOF'
[Group chat: "Men Agent Team"] You are @xun, one participant with @men, @ji, @yi and the user.

New messages in this room since your last turn (oldest first):
  User (user): 帮我把上周的财报数据整理成表格

Rules for this room:
- Reply with ONE conversational message ONLY if you have something new worth adding.
- If you have nothing new to add, reply with exactly "(pass)".
- Mention a teammate as @name to pull them in.
EOF

BASE="C:/Users/<user>/AppData/Local/hermes"

HERMES_HOME="$BASE/profiles/xun" hermes chat --query-file /tmp/round.txt --oneshot -Q \
  --skills hermes-bot-mode --format text    # 期望: (pass)（xun 非对口、men 在场）
HERMES_HOME="$BASE"         hermes chat --query-file /tmp/round.txt --oneshot -Q \
  --skills hermes-bot-mode --format text    # 期望: 分诊回复 + @ji
HERMES_HOME="$BASE/profiles/ji" hermes chat --query-file /tmp/round.txt --oneshot -Q \
  --skills hermes-bot-mode --format text    # 期望: (pass)（未被 @，等 men 分诊）
```

**判定**：非对口角色输出恰为 `(pass)`（或 `pass` / `(pass).` 等 `is_pass_text` 变体）；men 输出含意图分类与 @点名；被 @ 的专家才产出。行为验证非 CI 硬门（模型输出有随机性），结果须记录到验证报告而非仅口头声明。

### 7.3 真实群组验证（可选，需桌面端）

桌面端重建群组 → 发一条无 @ 的任务 → 观察：men 分诊 + @点名 + 其余静默 → 执行者入场 → 汇报。对照 `runtime-probe --json` 的 `rooms.active` 应出现该房间。

## 8. 故障排查

| 症状 | 检查 |
|------|------|
| 群里仍多人抢答 | 各 profile 是否装了 skill（`skills/men/hermes-bot-mode/SKILL.md` 是否存在）；SOUL.md 是否加了 6.3 的兜底行且已重启 session |
| 探针报 `runtime: unknown` | 探针读的是环境变量——交互 shell 里 `HERMES_HOME` 通常未设置，**不是环境有问题**；在 agent 进程内（`execute_code` / `terminal`）运行才有值 |
| `--expect room:X` 总失败 | 房间可能已删除（`rooms.active: []` 且 `rooms.deleted` 有条目）→ 需在桌面端重建，见 6.4 |
| 群组轮里没有 message_agent | **预期行为**——该工具只在 canonical Bot Chat 注入，群组用 @点名 |
| skill 不被加载 | description 关键词与本轮不匹配时模型不会自动 `skill_view`；靠 SOUL.md 兜底行（6.3）保证 |

## 9. 相关文件

| 文件 | 作用 |
|------|------|
| `scripts/runtime-probe.mjs` | 机械探针（L3） |
| `.opencode/skills/hermes-bot-mode/SKILL.md` | 识别 + 有序执行协议（L1/L2 + 行为） |
| `test/runtime-probe.test.mjs` | 探针 27 项单测 |
| `test/agent-consistency.test.mjs` | skill 契约断言 |
| `docs/guide/quickstart.md` | 快速上手（含 Hermes 部署入口） |
| `docs/reports/audit-verify-chain-2026-10-08.md` | 验证链路审计报告（本轮修复依据） |
