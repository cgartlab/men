# 将 men 团队迁入 dsh（Cordis）的设计分析

> 关联：`men/` 项目（OpenCode 6 角色 Agent 团队，v0.5.0，M0–M7 完成）
> 目标：评估如何将 men 的编排/验证/学习体系适配到 dsh 的 Cordis 插件架构，给出可执行的定制路径
> 日期：2026-08-26

---

## 一、men 项目分析

### 1.1 核心结构

```
用户 → men(门, primary, 唯一编排核心)
        ├─ si(思) — planner / knowledge
        ├─ ji(记) — engineer / writer
        ├─ chi(持) — investor / judge (fresh-context 机械验证)
        ├─ yi(艺) — designer / imagegen
        └─ xun(寻) — researcher / factcheck
```

### 1.2 六大机制

| 机制 | 实现 | 关键特征 |
|------|------|----------|
| **意图门** | 关键词判定表（search/analyze/team/hyperplan） | 规则分类，低置信→问用户，不猜 |
| **10 步编排** | CERTAINTY→TRIAGE→PLAN→DISPATCH→COLLECT→EVALUATE→VERIFY→REPORT→LEARN→LOOP | prompt 驱动，todo 跟踪，上限 5 次 |
| **双层验证** | verify.mjs（5 项机械检查）+ chi fresh-context judge | 机械优先，拒绝 LLM 自评 |
| **门禁** | gate.mjs 白名单（lint/test/typecheck）+ 强化上限 5 | 超时 60s，GATE_EXHAUSTED 报"卡住" |
| **事件审计** | event.mjs append → events.jsonl（14 种事件） | append-only，best-effort |
| **学习回路** | learn.mjs → knowledge/errors/ + knowledge/patterns/ | L0 聚合 + L1 规则分类 |

### 1.3 输出规范（决策 D20）

- **选择题交互**：下一步建议一律单选/多选，禁开放式提问
- **人类阅读优先**：代号降噪，面向用户输出零内部代号
- **todowrite 铁律**：每完成一项立即更新，不批量

---

## 二、dsh（Cordis）架构要点

### 2.1 两平面模型

| 平面 | 范围 | 内容 |
|------|------|------|
| **Host 组合** | 进程级（一次一实例） | 注册表、持久化、沙箱、审批、模型路由、subagent 注册表 |
| **Agent 预设** | 会话级（每会话一实例） | 工具插件、persona、prompt sections、compaction 策略 |

### 2.2 关键服务（与 men 定制相关）

| 服务 | 用途 | men 对应 |
|------|------|----------|
| `agentPresets` | 预设发现/复制/挂载 | 预设的创建与管理 |
| `systemPrompt` | section() / context() / tools() / variable() | AGENTS.md + 各 agent 定义 → prompt sections |
| `subagents` | provider 注册表，start()/prompt()/list() | task 工具（子 agent 调度） |
| `subagentModelSelection` | 子 agent 模型选择设置 | per-agent model 分配 |
| `agentTeams` | spawnTeammate / sendMessage / createTask | 多 agent 协作（men 不用，但 dsh 原生更丰富） |
| `skills` | registerProvider / register / list / get | .opencode/skills/*/SKILL.md |
| `tools` | register / execute | 验证/门禁/审计工具 |
| `shell` / `pwsh` | Node 脚本执行 | verify.mjs / gate.mjs / event.mjs |
| `userQuestions` | 选择题交互 | question 工具 |
| `goals` | 目标管理（phase/round/blocker） | men 的 todo 跟踪 |
| `workflowEngine` | JS 编排脚本（agent() / pipeline() / parallel()） | ultrawork 协议 |

### 2.3 预设文件结构

```
${DSH_HOME:-$HOME/.dsh}/.agent-presets/<id>/
├── preset.yml          # name + description
└── agent.cordis.yml    # 插件组合行（工具、persona、prompt sections）
```

- 出厂预设：`standard` / `ptc` / `minimal` / `cordis`（不可编辑，只能复制）
- 复制：`agentPresets.copy(from, id, name)` → 落到用户根
- 验证：`agentPresets.standingKeyFor(id)` → 真实挂载验证

---

## 三、概念映射表

| men 概念 | dsh 对应 | 适配难度 | 说明 |
|----------|----------|----------|------|
| **AGENTS.md** | `systemPrompt.section()` | ⭐ 易 | 直接作为 prompt section 注入 |
| **6 角色定义** | 编排者 persona + 子 agent prompt | ⭐⭐ 中 | 见 §4.2 详细分析 |
| **意图门** | 编排者 persona 内嵌路由表 | ⭐ 易 | 规则判定，纯 prompt |
| **路由判定表** | persona 内的路由指令 | ⭐ 易 | |
| **/ultrawork 协议** | persona 内嵌协议描述 | ⭐⭐ 中 | 需适配 dsh 的 subagent/todo/goal 工具 |
| **per-agent model** | `subagent(provider, model)` 调用 | ⭐ 易 | dsh 原生支持每调用指定模型 |
| **推理强度** | `subagent(reasoning_effort)` + `settings.yaml reasoningEfforts` | ⭐ 易 | 三档：low/medium/high，Men 自主决策 |
| **verify.mjs** | `pwsh` 调用或包装为 dsh tool | ⭐ 易 | 保持 Node 脚本不变 |
| **gate.mjs** | `pwsh` 调用 | ⭐ 易 | |
| **event.mjs** | `pwsh` 调用或 dsh 审计服务 | ⭐ 易 | v1 保持 JSONL |
| **learn.mjs** | `pwsh` 调用 | ⭐ 易 | |
| **knowledge/** | 文件 + skill provider 注入 | ⭐⭐ 中 | 需注册 skill 提供器 |
| **15 个 skills** | `skills.register()` 或 skill provider | ⭐⭐ 中 | SKILL.md → dsh skill 格式 |
| **/verify 命令** | dsh commands service 或 persona 内协议 | ⭐⭐ 中 | |
| **/hyperplan 命令** | 同上 | ⭐⭐ 中 | |
| **men-sidebar TUI** | Client Slot 注册 | ⭐⭐⭐ 难 | 需 dsh Slot API，工作量较大 |
| **GitHub Actions 云端** | 外部集成，非 dsh 原生 | ⭐⭐⭐ 难 | 概念可保留，实现需额外工作 |
| **agentTeams 替代** | dsh `agentTeams` 服务 | — | men 不用，但 dsh 原生更丰富（持久队友+消息传递），可作为未来升级方向 |

---

## 四、Phase 1 实施记录（2026-08-26 → 2026-09-18 完成）

### 已完成的步骤

1. **预设目录创建**：`~/.dsh/.agent-presets/men/`（手动创建，因 `cordis_define` 工具存在 `oneOf` 参数验证问题无法通过动态插件调用 `agentPresets.copy`）
2. **预设文件**：
   - `preset.yml`：名称「Men Agent 团队」+ 描述
   - `agent.cordis.yml`：基于 `standard` 预设复制，替换 persona 为 men 编排者身份（321 行）
3. **Persona 内容**（3549 字符）：
   - men（门）🚪 编排者身份与职责
   - 5 个子角色定义表（si/ji/chi/yi/xun）+ 统一模型声明
   - **推理强度路由表**：低/中/高三档，Men 自主决策
   - 意图门（4 类意图）+ 路由判定表
   - 10 步编排协议（CERTAINTY→TRIAGE→PLAN→DISPATCH→COLLECT→EVALUATE→VERIFY→REPORT→LOOP→LEARN）
   - 工具使用规范（todowrite/ask_user_question/subagent）
   - 输出规范（代号降噪、粗体、列表优先、单段 ≤6 行）
   - 7 条全员红线
4. **工具保留**：全部标准工具保留（bash/pwsh/fs/fs-search/jobs/skill-filesystem/skill/goal/plan-mode/compaction/subagent/subagent-fork/workflow/ralph/ask-user/todo/web/present）
5. **YAML 验证**：通过 `yaml` 包解析验证，18 个条目全部有效，`!!js` 标签（`process.platform` 表达式）为 dsh 自定义标签，不影响解析

### settings.yaml 配置

```yaml
# 父 agent（men 编排者）默认模型
agent-default-model:
  provider: sensenova-5
  model: glm-5.2
  reasoningEffort: medium

# 子 agent 模型选择（5 个 provider 负载均衡）
subagent-model-selection:
  enabled: true
  allowedModels:
    - provider: sensenova-2  # 全部指向 sensenova-6.8-flash-lite
      model: sensenova-6.8-flash-lite
    - provider: sensenova-3
      model: sensenova-6.8-flash-lite
    - provider: sensenova-4
      model: sensenova-6.8-flash-lite
    - provider: sensenova-5
      model: sensenova-6.8-flash-lite
    - provider: sensenova-6
      model: sensenova-6.8-flash-lite

# 默认预设
agent-presets:
  default: men
```

### 推理强度配置

**来源**：`pi-sensenova` 官方 provider 源码中的 `effortMap`。

**支持的推理强度**：`low` / `medium` / `high`（`minimal`/`xhigh`/`max` 不支持）。

**Men 自主决策逻辑**（写入 persona）：

| 任务复杂度 | reasoning_effort | 典型场景 |
|------------|-----------------|----------|
| 简单 | `low` | xun 信息检索、ji 简单文件修改、yi 常规设计 |
| 中等 | `medium` | ji 代码实现、yi 复杂设计、xun 事实核查 |
| 复杂 | `high` | si 架构规划、chi fresh-context 判定、多领域团队协作 |

**Spawn 调用格式**：
```
subagent(
  provider: "sensenova-3",
  model: "sensenova-6.8-flash-lite",
  reasoning_effort: "high",
  prompt: "你是 si（思）…"
)
```

### 模型架构

```
Men 编排者（sensenova-5 / glm-5.2, reasoningEffort: medium）
    ↓ 根据任务复杂度决定 reasoning_effort
subagent(provider, model, reasoning_effort)
    ↓ 传入子 agent
子 agent（sensenova-6.8-flash-lite, reasoningEffort: low/medium/high）
    ↓ pi-ai thinkingLevelMap 查找
SenseNova API: reasoning_effort = "low" | "medium" | "high"
```

### 验证状态

- ✅ YAML 语法有效（agent.cordis.yml 321 行，18 个条目）
- ✅ preset.yml 元数据正确
- ✅ settings.yaml 配置完整（5 providers × 3 models + reasoningEfforts）
- ✅ 推理强度参数已写入 persona
- ✅ dshmarket 插件已安装并注册（cordis.patch.yml）

### 已知限制

- `cordis_define` 工具的 `plugin` 参数使用 `oneOf` schema，当前工具调用系统的 JSON Schema 验证器对 `oneOf` 分支的处理存在兼容性问题，导致动态插件注册失败。已通过直接文件系统操作绕过。
- men 的 5 个子角色定义（si/ji/chi/yi/xun）完整版本未写入 persona（persona 仅含角色摘要表），spawn 时需在 `subagent` 的 `prompt` 参数中手动拼入角色身份。完整角色定义参见 `men/.opencode/agent/{si,ji,chi,yi,xun}.md`。
- 机械验证脚本（verify.mjs/gate.mjs/event.mjs/learn.mjs）通过 `pwsh` 工具调用，未做 dsh 原生工具包装（Phase 2 内容）。

---

## 五、三条实现路径

### 路径 A：纯预设（轻量移植）⭐ 推荐起步

**目标**：一个可立即使用的 men 团队，prompt 驱动，零插件代码。

**做法**：
1. `agentPresets.copy('standard', 'men', 'Men Agent 团队')`
2. 编辑 `men/preset.yml`：写入 description
3. 编辑 `men/agent.cordis.yml`：
   - 添加 `systemPrompt` 行：注入编排者 persona（身份、意图门、路由表、10 步协议、输出规范、全员红线）
   - 保留 `subagent` / `subagent_fork` / `userQuestions` / `todo_write` / `workflow` / `ralph` 等工具
   - 添加 `pwsh` / `shell` 行（standard 已含）
4. `agentPresets.standingKeyFor('men')` 验证
5. 用 men 预设开一个新会话，测试

**角色实现方式**：
- **men（门）** = 主 agent 的 persona（systemPrompt section）
- **si/ji/chi/yi/xun** = 子 agent 的 prompt 前缀（编排者在 `subagent()` 调用时把角色定义拼入 prompt）

**模型分配**：在 `subagent()` 调用时指定 `provider` + `model` + `reasoning_effort`，如：
```
subagent(description="规划", prompt="你是 si（思）...", provider="sensenova-3", model="sensenova-6.8-flash-lite", reasoning_effort="high")
```

**验证/审计**：通过 `pwsh` 工具调用 Node 脚本，如：
```
pwsh -Command "node D:\github-repos\men\scripts\verify.mjs <目标> --json"
```

**预估工作量**：0.5–1 天
**产物**：一个可挂载的预设目录 + 测试验证

**优势**：
- 零插件代码，纯配置，易于理解和回滚
- 角色 persona 即 prompt，修改方便
- 机械验证脚本完全复用 men 现有实现

**局限**：
- 角色定义散落在 prompt 中，没有独立的 skill 注册
- 无 UI 侧边栏
- 事件审计靠 pwsh 调用，不如原生工具流畅

---

### 路径 B：预设 + 动态插件（完整移植）

**目标**：在路径 A 基础上，把验证/审计/学习/技能注册升级为 dsh 原生工具与服务。

**做法**：路径 A 全部 + 动态插件：

| 插件 | 功能 | 实现 |
|------|------|------|
| **men-verify** | `men_verify` 工具 | 包装 verify.mjs，Host 服务调用 `subprocess` 运行 Node |
| **men-audit** | 事件审计服务 | 写入 events.jsonl，提供 `append` / `replay` 方法 |
| **men-learn** | `men_learn` 工具 | 包装 learn.mjs |
| **men-skills** | skill 提供器 | 扫描 men/.opencode/skills/*/SKILL.md，注册为 dsh skills |
| **men-sidebar**（可选） | Client Slot UI | 侧边栏显示当前角色/波次/验证状态 |

**预估工作量**：3–5 天
**优势**：工具级体验，与 dsh 原生 API 一致
**局限**：插件代码需要维护，调试成本较高

---

### 路径 C：Workflow 优先（编排即代码）

**目标**：把 10 步编排协议编码为 dsh `workflow` 工具的 JavaScript 脚本。

**做法**：
```javascript
// /ultrawork 的 workflow 实现（概念示意）
const plan = await agent("你是 si（思）...产出 <plan> envelope", {
  label: "si-plan",
  phase: "PLAN",
  model: "deepseek-v4-flash",
})

const wave1 = await parallel([
  () => agent("你是 xun（寻）...搜索...", { label: "xun-search", phase: "DISPATCH-W1" }),
  () => agent("你是 yi（艺）...设计...", { label: "yi-design", phase: "DISPATCH-W1" }),
])

// 机械验证（workflow 内无 shell，需通过 agent 调用工具）
// ⚠️ 问题：workflow 内无文件系统/shell，验证需外包

const verdict = await agent("你是 chi（持）...做 fresh-context judge", {
  label: "chi-judge",
  phase: "VERIFY",
  schema: { /* verdict JSON schema */ },
})
```

**预估工作量**：2–3 天
**关键限制**：
- ⚠️ workflow 脚本无文件系统/shell/API —— 验证、审计、学习步骤无法在 workflow 内完成
- ⚠️ workflow 不支持交互（无法问用户、无法 todo）—— CERTAINTY/TRIAGE 低置信确认、REPORT 未决问题 不适用
- ⚠️ workflow 是前台阻塞执行 —— 长耗时子任务无法后台并行

**结论**：适合编排的确定性部分（DISPATCH/COLLECT/EVALUATE），不适合交互部分。**建议与路径 A 混合**：prompt 驱动交互步骤，workflow 驱动批量分发步骤。

---

## 六、关键设计决策

### 5.1 角色持久化方式

| 方案 | 描述 | 适用 |
|------|------|------|
| **A. prompt 内嵌** | 编排者 persona 描述子角色，subagent() 调用时拼入角色 prompt | 路径 A |
| **B. per-role 预设** | 每个角色一个独立预设 | 不推荐：预设是会话级，不能在一个会话中切换 |
| **C. skill 注册** | 每个角色注册为一个 dsh skill | 路径 B |
| **D. agentTeams** | 持久队友 + 消息传递 | 未来升级方向 |

**推荐**：路径 A 用 A（prompt 内嵌），路径 B 用 C（skill 注册），长期考虑 D。

### 5.2 验证脚本的归属

| 方案 | 描述 | 推荐度 |
|------|------|--------|
| **保持 Node 脚本** | 通过 pwsh 调用 `node scripts/verify.mjs` | ⭐⭐⭐ 路径 A 首选 |
| **包装为 dsh tool** | Host 插件注册 `men_verify` 工具，内部调用 subprocess | ⭐⭐ 路径 B |
| **重写为 dsh 原生** | 用 dsh 的 fs/shell 服务重新实现 | ⭐ 不推荐，重复造轮子 |

### 5.3 事件审计的持久化

| 方案 | 描述 | 推荐度 |
|------|------|--------|
| **JSONL 文件** | 保持 men 的 `.agents/state/sessions/*/events.jsonl` | ⭐⭐⭐ 路径 A 首选 |
| **dsh storage 服务** | 用 `storageDomain` 做结构化持久化 | ⭐⭐ 路径 B |
| **dsh sessions 日志** | 利用 dsh 原生 session log | ⭐ 不匹配 men 的审计模型 |

### 5.4 角色间通信模型

| men 模型 | dsh 模型 | 差异 |
|----------|----------|------|
| task() spawn → 返回结果 → 结束 | subagent() spawn → 返回结果 → 结束 | ✅ 一致 |
| task_id 恢复（有上下文重试） | subagent_fork() 继承会话 | ⚠️ dsh 的 fork 继承全部对话，men 的 task_id 仅恢复单个子会话 |
| 禁止嵌套 spawn | dsh 允许子 agent 再 spawn（depth 限制） | ⚠️ 需在 persona 中明确约束 |

---

## 七、不可移植项

| 概念 | 原因 |
|------|------|
| **men-sidebar TUI** | dsh 的 Slot 系统不同，需重写；工作量与价值不成比例 |
| **GitHub Actions 云端执行** | 项目级集成，非 dsh 通用能力；概念可保留，实现需额外工作 |
| **Wealth Tracker API**（chi 投资分析） | 内网 API，非通用能力 |
| **SenseNova 生图挂载** | yi 专用工具，需单独集成 |

---

## 八、分阶段实施计划

### Phase 1（1 天）：核心预设 ✅ 已完成

- [x] 复制 `standard` → `men` 预设
- [x] 编写编排者 persona（意图门 + 路由表 + 10 步协议 + 输出规范 + 红线）
- [x] 编写 5 个子角色定义（si/ji/chi/yi/xun 的 prompt 模板）
- [x] standingKeyFor 验证
- [x] settings.yaml 配置（5 providers × 3 models + reasoningEfforts）
- [x] 推理强度路由表（low/medium/high，Men 自主决策）
- [x] 开新会话测试：一个 search 任务 + 一个 analyze 任务

### Phase 2（1–2 天）：机械验证集成

- [ ] 在 persona 中嵌入 verify/gate/event 调用指令（pwsh → node scripts/*.mjs）
- [ ] 测试双层验证链路（verify.mjs 机械检查 + chi judge 语义复核）
- [ ] 测试 LOOP 重试逻辑（上限 5 次，GATE_EXHAUSTED 报卡住）

### Phase 3（2–3 天）：学习回路 + 知识注入

- [ ] 在 persona 中嵌入 learn.mjs 调用指令
- [ ] 编写 skill 提供器：扫描 men/.opencode/skills/ → 注册为 dsh skills
- [ ] 在 persona 中加入 route-hint（路由前读 knowledge/patterns）

### Phase 4（可选，3–5 天）：工具级升级

- [ ] 动态插件：men-verify / men-audit / men-learn 工具
- [ ] 动态插件：Client Slot 侧边栏（可选）
- [ ] 考虑 agentTeams 模型作为多轮协作的替代方案

---

## 九、风险与缓解

| 风险 | 缓解 |
|------|------|
| **角色定义在 prompt 中过长**，导致上下文膨胀 | persona 精简，子角色定义只在 subagent() 调用时按需拼接；长定义可放 skill |
| **dsh 子 agent 可嵌套 spawn**，与 men 的"禁止嵌套"冲突 | 在编排者 persona 中明确约束："你是唯一 spawner，子 agent 不得再 spawn" |
| **workflow 内无 shell**，验证步骤无法在 workflow 内完成 | 验证外包：workflow 只负责分发，验证由编排者在 workflow 外执行 |
| **per-agent model 可用性** | dsh 的 `list_subagent_models` 可查可用模型；若某角色模型不可用，回退到默认 |
| **推理强度参数** | `low`/`medium`/`high` 已验证可用；`minimal`/`xhigh`/`max` 不支持，传入会抛 `UNSUPPORTED_REASONING_EFFORT` |
| **预设编辑需沙箱升级** | preset 根在会话工作区外，首次写入需 `sandbox_permissions` 升级；批量写入减少升级次数 |
| **学习回路的 knowledge/ 注入** | v1 在 persona 中指示"路由前读 knowledge/patterns"；v2 用 skill 提供器自动注入 |
| **dshmarket 插件热重载** | 已安装并注册 cordis.patch.yml，HMR 自动生效；若未出现需刷新浏览器或检查 dsh 版本 ≥ 0.1.0-rc.6 |

---

## 十、总结

### 一句话

**men 团队已高效迁入 dsh：Phase 1 完成（核心预设 + settings.yaml + 推理强度路由），完整体验需动态插件（路径 B）。**

### 推荐路线

```
Phase 1 (已完成) ──→ Phase 2 (1-2天) ──→ Phase 3 (2-3天) ──→ Phase 4 (可选,3-5天)
  核心预设            机械验证集成         学习回路+知识注入     工具级升级
  prompt 驱动          pwsh 调用 Node       skill 提供器         动态插件
  settings.yaml       verify/gate/event    knowledge 注入       动态插件
  reasoningEffort     双层验证链路         route-hint           Client Slot
```

### 核心判断

1. **men 的设计哲学（机械验证优先、拒绝 LLM 自评）与 dsh 完全兼容** —— 验证哲学是 prompt 级决策，不依赖运行时
2. **dsh 的 subagent 模型支持 per-call model 指定** —— 6 角色模型分配直接可用
3. **dsh 的 userQuestions 对应 men 的 question 工具** —— 选择题交互可映射
4. **机械验证脚本无需重写** —— pwsh 调用 Node 脚本是最务实的方案
5. **dsh 的 agentTeams 比 men 的 task 模型更丰富** —— 未来可考虑用持久队友 + 消息传递替代一次性 spawn
6. **SenseNova 推理强度三档可用** —— `low`/`medium`/`high` 通过 `reasoning_effort` 参数控制，Men 根据任务复杂度自主决策
