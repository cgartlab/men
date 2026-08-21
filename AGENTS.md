# AGENTS.md — men（假维斯 Agent 团队）

> **本仓库用途**：OpenCode Agent 团队配置（6 个角色定义），不是应用代码库。

## 仓库状态

- **main 分支已有提交**，`feat/pi-harness` 分支为 Pi 框架适配开发中
- **M0–M4 已完成**（调研/骨架/单兵/编排/机械验证），M5 文档完善进行中，见 `docs/guide/milestones.md`
- **无 CI / 无测试框架**：验证靠机械脚本（`scripts/verify.mjs` / `gate.mjs` / `event.mjs`）+ agent 定义一致性检查

## 关键文件

| 路径 | 用途 |
|------|------|
| `opencode.json` | OpenCode 根配置：`default_agent: "men"`，加载 `AGENTS.md`，MCP×3（exa/context7/grep_app） |
| `.opencode/agent/*.md` | **6 个 agent 定义**（唯一源代码）。每次编辑必须先 read 再 edit |
| `.opencode/skills/*/SKILL.md` | 13 个技能包（ji×3/si×3/xun×3/chi×2/yi×2） |
| `.opencode/command/*.md` | 自定义命令：`ultrawork` / `verify` / `hyperplan` |
| `scripts/*.mjs` | 机械验证三件套：`verify.mjs`（check battery）/ `gate.mjs`（门禁）/ `event.mjs`（事件审计），纯 Node 零依赖 |
| `.opencode/package.json` | `@opencode-ai/plugin` 1.18.18，本地安装 |
| `config/mcporter.json` | MCP 配置（Exa 搜索） |
| `docs/PRD.md` | 正式 PRD（里程碑 M0–M5） |
| `docs/architecture.md` | 架构说明（拓扑/编排流程/验证体系 mermaid） |
| `docs/guide/` | 使用指南（quickstart / milestones） |
| `docs/research/00-m0-synthesis.md` | 架构决策（PRD → 落地映射），重大变更前必读 |

## Agent 团队拓扑

```
用户 → men(门, orchestrator) → si(思, planner/writer)
                                ji(记, engineer)
                                chi(持, investor + judge)
                                yi(艺, designer)
                                xun(寻, researcher)
```

- **men** 是 `primary`（用户唯一对话角色），其余 5 个均为 `subagent`
- 所有 agent 共享"全员红线"（7 条，见各定义底部）和 `CHARTER_CHECK` 字段
- **chi** 兼任独立 judge（fresh context spawn，机械验证）

## 编辑 agent 定义时必须遵守

1. **先 read 再 edit** — `edit` 要求此前已读取过文件
2. **YAML frontmatter** 必须保留：`description`, `mode`, `model`
3. **`CHARTER_CHECK` 字段**：每个 agent 必须有，含 Clarification level / Task domain / Must NOT do / Success criteria
4. **`全员红线` 段落**：6 个 agent 必须逐字一致（复制粘贴，不修改）
5. **model**：按角色分配不同模型，运行时权威配置以 `opencode.json` 的 `agent` 字段为准：
   - men: `opencode-go/deepseek-v4-flash`
   - si: `sensenova/deepseek-v4-flash`
   - ji: `huoshan/ark-code-latest`
   - chi: `sensenova/glm-5.2`
   - yi/xun: `sensenova/sensenova-6.8-flash-lite`

## 全员红线（7 条）

1. **不伪造输出**：完成 = 验证过的完成。声称完成前必须有机械证据（退出码 0 / 产物文件存在）
2. **不跳过验证**：执行后必须确认结果，不接受"应该没问题"
3. **不泄露用户隐私**：用户数据、API key、个人信息不外传
4. **外部操作先确认**：发邮件、公开发布、对外提交前必须征得用户同意
5. **破坏性操作先询问**：trash > rm，不确定时问用户
6. **需求模糊先问清楚**：不脑补需求，澄清优先于行动
7. **输出格式**：粗体关键信息、emoji 标注状态、列表优先于段落、单段 ≤6 行

## 架构决策（来自 M0 调研，重大变更前必读 `docs/research/00-m0-synthesis.md`）

- **验证哲学**：机械优先（退出码 / 文件存在性），拒绝 LLM 自评
- **角色路由**：关键词判定表 + 低置信时向用户确认，不猜
- **技术栈**：TypeScript + Bun（`oh-my-openagent/` 已提供上游实现参考）
- **本地优先**：内网数据源（192.168.31.x），SenseNova 生图仅 yi 挂载
- **M1 先不做插件**：用 OpenCode 原生 agent 定义 + 自定义 command 起步

## 上游参考

M0 调研期间克隆的参考项目源码（`oh-my-openagent`）已删除（88MB 非产品本体）。参考结论已沉淀在 `docs/research/`，机制来源：

- `docs/research/oh-my-openagent.md` — OmO 编排机制（ultrawork/Team Mode/IntentGate）
- `docs/research/oh-my-agent.md` — oma 机械验证机制（gate/judge/events）
- `docs/research/00-m0-synthesis.md` — 两套机制的合成决策与落地映射

## Node 环境

- **Node >= 18**（`@opencode-ai/plugin` engines 要求）
- 依赖在 `.opencode/node_modules/` 下本地安装，不共享根目录
- `.opencode/.gitignore` 排除了 `node_modules`, `package.json`, `package-lock.json`

## Pi Harness 兼容（feat/pi-harness 分支）

本分支专用于 Pi 编码 Agent 框架（`@johnnywu/pi-subagents`）。

- 主 session 扮演 **men（门）**，编排指令由 `.pi/APPEND_SYSTEM.md` 注入
- 5 个子 agent 定义在 `.pi/agents/`（Pi subagents 格式）
- 13 个 skills 从 `.opencode/skills/` 加载（junction `.pi/skills/` 桥接）
- 3 个命令映射为 `prompts/` 模板（ultrawork / hyperplan / verify）
- 模型由 CC Switch 管理（agent 定义省略 model 字段，继承主 session）
- `package.json` 含 `pi` manifest，声明 skills 和 prompts 路径
- 安装：`pi install npm:@johnnywu/pi-subagents`
