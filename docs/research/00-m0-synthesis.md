# M0 调研合成决策笔记

> **目的**：合并 oh-my-openagent（OmO）与 oh-my-agent（oma）两套机制的调研结果，映射到 PRD 的功能需求 F1–F7，给出 M1 阶段的落地决策。
> **日期**：2026-08-15 ｜ 上游：docs/research/oh-my-openagent.md、docs/research/oh-my-agent.md

---

## 一、两套系统定位对比

| 维度 | oh-my-openagent（OmO） | oh-my-agent（oma） |
|------|------------------------|--------------------|
| 形态 | OpenCode 官方插件（`@opencode-ai/plugin`），batteries-included | vendor-agnostic harness，`.agents/` SSOT 投影到各运行时 |
| 强项 | **编排体验**：ultrawork 一键、Team Mode 并行、IntentGate、类别路由、Ralph Loop/Goal Hook | **机械验证**：stop-hook 门禁、独立 judge、events.jsonl、verify battery、预算配额 |
| 模型 | 大量绑定 claude/gpt/kimi 付费系（非本地优先） | 模型无关，配置式 model_preset |
| 验证哲学 | completion audit（goal hook prompt 驱动，偏 LLM 自评） | 纯机械：退出码 + 文件存在性 + fresh-context judge（不信自述） |
| 可迁移性 | 核心机制分 `*-core` 包已解耦，但 orchestration 层强耦合 OpenCode API | 5 大核心机制全部 vendor 无关，纯文件系统/退出码约定 |

**关键结论**：
- **编排借鉴 OmO**（ultrawork/IntentGate/Team Mode 的工具形态），**验证借鉴 oma**（机械优先，拒绝 LLM 自评）。
- 我们 PRD 的定位（G5 机械验证、G6 本地优先）与 oma 的哲学更贴近；OmO 提供"体验层"参考。
- 两套系统都验证了同一核心模式：**keyword 触发 → 持久化目标 → 循环推进 → 机械门禁 → 事件审计**。

---

## 二、PRD 功能需求 → 落地机制映射

### F1 一键启动编排（ultrawork 类似物）

| 来源 | 机制 | 落地 |
|------|------|------|
| OmO | keyword-detector：`/\b(ultrawork|ulw)\b/i` 命中 → 注入 ultrawork prompt 到消息尾 | 用 OpenCode `chat.message` hook 或自定义 command 实现 `ultrawork <描述>` |
| OmO | plan agent 强制：`<plan>` envelope 含 dependency graph + waves + QA | men 收到任务先强制 si 拆解出 plan，再按 wave 分发 |
| OmO | prompt 变体路由（default/gpt/gemini/glm） | 可省略（本地模型单一），保留结构备用 |
| oma | Ralph Loop → persistent-mode 状态文件 + Stop 拦截 | 循环推进用 goal 文件（.agents/state/goal-{sid}.json）实现 |
| PRD 要求 | 循环重试 + 最大轮次防死循环 | oma `MAX_REINFORCEMENTS=5` / OmO `max_iterations=100`，取 5 次强化 + wall-clock 预算 |

### F2 IntentGate 意图门

| 来源 | 机制 | 落地 |
|------|------|------|
| OmO | KEYWORD_DETECTORS 正则字典 + combo 压制 | 定义 `men-mode/si-research/xun-search/...` 等触发词 + 压制规则 |
| OmO | 置信度低不猜：不命中静默 / 问用户 | men 判定表三态（search/analyze/team）+ 低置信询问 |
| oma | triggers.json 多语言关键词 + `verify triggers` 度量误触发率 | P1：用标注语料库度量路由准确率 |

**决策**：意图分类用**规则判定表**（PRD §3.1 已有）+ 关键词触发，不用 LLM 分类（机械优先）。

### F3 Team Mode 并行协作

| 来源 | 机制 | 落地 |
|------|------|------|
| OmO | 12 个 team_* 工具（create/send_message/task_*/status） | 我们简化版：team_send_message + team_task_create/update/list |
| OmO | mailbox 每成员 jsonl + 3s poll + 原子文件锁 | `.agents/state/runtime/{runId}/mailbox/{member}.jsonl` |
| OmO | worktree 每人独立 | 单人本地场景可省略 git worktree，用独立工作目录 |
| OmO | AGENT_ELIGIBILITY_REGISTRY 三层资格 | 定义 eligible（men/si/ji/chi/yi/xun 中可入 team 的）与 hard-reject |
| PRD | 成员通信 + 共享工作区 | mailbox + `.agents/state/sessions/{sid}/` 共享产物 |

**决策**：M3 先实现单路 + 简单广播；并行 ≤4 成员，工具只实现 4-5 个必要的。

### F4 机械验证体系（最高优先级借鉴 oma）

| 来源 | 机制 | 落地 |
|------|------|------|
| oma | Stop-hook 门禁：allowlist（typecheck/test/lint）+ spawnSync 无 shell + 退出码判定 + 60s 超时 | OpenCode 侧用 `session.idle` / 结束事件挂 gate 脚本；argv 数组杜绝注入 |
| oma | MAX_REINFORCEMENTS=5 强化上限 + budget exhausted 诚实停止 | 记 reinforcmentCount，5 次不过 → 停止并报"卡住/部分完成" |
| oma | 独立 fresh-context judge：只拿标准不拿叙述；每轮复验全部（含 PASS 项） | chi 作为 judge 角色 spawn fresh session，judge brief = 验收标准表 |
| oma | REGRESSED（PASS→FAIL 附 diff）/ BLOCKED（3 次失败）一等状态 | 验收标准表带 previous_status/fail_count |
| oma | 反规避：必产产物检查，缺 → gate.failed | 每角色定义必产产物清单（.md/.json） |
| oma | Per-agent check battery：核心（密钥/TODO/声明产物）+ 专属（tsc/pytest） | `verify <agent>` CLI，--json + 退出码接 CI |
| oma | events.jsonl append-only，10 种 kind，decision.made subject 锚点 | `.agents/state/sessions/{sid}/events.jsonl`，best-effort 写入 |
| OmO | completion audit prompt（不接 proxy signals） | judge prompt 注入"不接受测试通过作为唯一证据" |

**决策**：M4 核心交付 = gate 脚本 + judge 协议 + events.jsonl + verify CLI。**验证判定全部机械**（退出码/文件存在），不依赖 LLM 自评。

### F5 记忆与上下文管理

| 来源 | 机制 | 落地 |
|------|------|------|
| oma | sessions/{sid}/ 事件日志 + meta.json | `.agents/state/sessions/{sid}/` |
| OmO | AGENTS.md 树 + walk-up 自动注入 + per-session cache | 6 角色各 AGENTS.md；Read 工具后注入目录上下文 |
| OmO | Goal Hook 持久化目标 + TUI mirror | goal JSON + .omo/ulw-loop mirror |
| PRD | 可复用结论写 knowledge/ | `knowledge/` 目录 + decision.made 事件回放 |

**决策**：上下文卫生靠"只注入所需技能/MCP"（PRD F5 原话），成员 agent 定义时白名单技能。

### F6 本地工具与数据集成

| 来源 | 机制 | 落地 |
|------|------|------|
| OmO | 3 层 MCP：内置（createBuiltinMcps）/ Claude 兼容（.mcp.json）/ Skill 嵌入（SKILL.md frontmatter） | 我们全走 Tier 1 内置 + Tier 3 Skill 嵌入 |
| OmO | 运行时注入绕过用户可见列表（ctx.client.mcp.set()） | 按角色注入对应数据源 MCP |
| PRD | SearXNG（.111:8099）/ Miniflux（.111:8025）/ Affine/Blinko/Wealth Tracker（.111:8888）/ SenseNova | 每个数据源封装为独立 MCP 或工具，按角色白名单挂载 |

**决策**：本地优先 → 所有数据源均在内网（192.168.31.x），无需外网付费 API；SenseNova 生图仅 Yi 挂载。

### F7 汇报与产物规范

| 来源 | 机制 | 落地 |
|------|------|------|
| OmO | .omo/evidence/{date}-{slug}/ 四段 QA（WAS TESTED/OBSERVED/WHY ENOUGH/OMITTED） | 每个产物配 evidence 目录 |
| oma | 产物文件不可变（写后只追加）+ 声明产物存在检查 | 产物落盘 + verify 校验 |
| PRD | 统一汇报模板【结论】→【关键信息】→【来源/证据】→【未决问题】 | 汇报模板写入 men 的 rules |

---

## 三、架构决策汇总（M1 输入）

1. **技术栈**：TypeScript + Bun（两系统一致，OpenCode 插件生态）。核心逻辑抽 `*-core` 纯 TS 包（学 OmO 的解耦审计：非 adapter 包禁止 import `@opencode-ai/*`）。
2. **单一事实源**：`.agents/`（oma 模式），6 角色定义 + skills + workflows + rules + hooks + state + shared-schema。OpenCode 侧直接原生消费（OpenCode 天然兼容 `.agents/`）。
3. **编排形态**：OpenCode 插件（学 OmO 的 pluginModule + hooks）或纯 command + 脚本。**M1 先不做插件**——用 OpenCode 原生 agent 定义 + 自定义 command 起步，插件化留到 M5 后（降低初始复杂度）。
4. **验证机制顺序**：先做 verify CLI + events.jsonl（纯文件系统，零 vendor 耦合），再做 gate hook（需接 OpenCode 生命周期），judge 用 fresh subagent spawn。
5. **角色映射**：
   - men = orchestrator/默认 agent + roster/路由表（学 Sisyphus + IntentGate）
   - si = planner（plan agent / Prometheus 访谈式规划）
   - ji = developer（主执行，L1 检查器优先）
   - xun = researcher（学 OmO explore/librarian 只读约束）
   - chi = investor（+ judge 职能候选）
   - yi = designer（视觉 + 生图，prometheus-md-only 式写约束）
6. **资格与红线**：全员注入 PRD §3.7 七条红线 + oma Charter Preflight 字段（Clarification level / Must NOT do / Success criteria）。

---

## 四、对 M0 验收的确认

| PRD M0 验收 | 状态 |
|-------------|------|
| 输出调研笔记 docs/research/ | ✅ 三份文件：oh-my-openagent.md / oh-my-agent.md / 本合成笔记 |
| 提取可借鉴机制 | ✅ OmO 12 条 + oma 12 条，合并去重后映射到 F1–F7 |

**M0 完成。** 下一步 M1（骨架搭建）可直接基于本笔记第三节的架构决策开工。
