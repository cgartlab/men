# AGENTS.md — Men Agent 团队

> **仓库用途**：OpenCode Agent 团队配置（6 个角色定义）+ 纯 Node 脚本 + OpenCode 插件。运行时全部靠 `.opencode/` 配置。

## 项目状态

v0.4.0（M0–M7 完成）。npm 包 `@cgartlab/men` 已发布（`npx @cgartlab/men` 一行安装）。GitHub 私有仓库 `cgartlab/men`，MIT 许可证。

## 关键文件

| 路径 | 用途 |
|------|------|
| `opencode.json` | OpenCode 根配置：`default_agent: "men"`，加载 `AGENTS.md`，**不含 MCP**（CC Switch 统一管理） |
| `.opencode/agent/*.md` | **6 个 agent 定义（唯一源代码）**。每次编辑必须先 read 再 edit |
| `.opencode/skills/*/SKILL.md` | 15 个技能包（ji×4/si×2/xun×3/chi×2/yi×2/men×2） |
| `.opencode/command/*.md` | 自定义命令：`ultrawork` / `verify` / `hyperplan` |
| `.opencode/plugins/men-verify.ts` | 产物机械验证自动插件（write/edit 后自动跑 verify.mjs） |
| `.opencode/plugins/men-learn.ts` | 自动学习插件（任务完成后提取经验写入 knowledge/） |
| `.opencode/plugins/men-sidebar/` | TUI 侧边栏插件；`tui.json` 声明入口，`@opentui/*` 为运行时依赖 |
| `scripts/*.mjs` | 验证/门禁/审计/学习/发布脚本，纯 Node 零依赖 |
| `config/models.json` | 模型知识基（providers/roleDefaults/presets），`setup.mjs` 数据源 |
| `knowledge/` | 团队知识库（patterns/decisions）；`errors/` 在根目录 |
| `.opencode/package.json` | `@opencode-ai/plugin` + `@opentui/*` 本地依赖 |

## Agent 团队拓扑

```
用户 → men(门, orchestrator) → si(思, planner/knowledge)
                                ji(记, engineer)
                                chi(持, investor + judge)
                                yi(艺, designer)
                                xun(寻, researcher)
```

- **men** 是 `primary`（用户唯一对话角色），其余 5 个均为 `subagent`
- **chi** 兼任独立 judge（fresh context spawn，机械验证）
- 所有 agent 共享全员红线（见各定义底部），路由/合并/事件/交互规范见 `.opencode/agent/men.md`

## 编辑 agent 定义规则

1. **先 read 再 edit** — OpenCode edit 要求此前已读取过文件
2. **YAML frontmatter 必须保留**：`description`, `mode`, `model`
3. **`CHARTER_CHECK` 字段**：每个 agent 必须有（Clarification level / Task domain / Must NOT do / Success criteria）
4. **`全员红线` 段落**：6 个 agent 必须逐字一致（复制粘贴，不修改）
5. **model 分配**（仓库 `opencode.json` 配置，CC Switch `~/.config/opencode/opencode.json` 会覆盖）：
   - men: `opencode-go/hy3`
   - si: `sensenova/deepseek-v4-flash`
   - ji: `opencode-go/deepseek-v4-flash`
   - chi: `sensenova/glm-5.2`
   - yi/xun: `sensenova/sensenova-6.8-flash-lite`
6. **men 输出规范不得删除或弱化**（决策 D20）：`question` 工具交互、人类阅读优先（代号降噪）、todowrite 跟踪

## 常用命令

```bash
# 验证（五项机械检查：存在性/密钥/TODO/结构/exit code）
node scripts/verify.mjs <角色名或路径> [--json] [--sid <sid>]

# 门禁（白名单 + 强化上限 5 次）
node scripts/gate.mjs lint|test|typecheck --dir <目录> --sid <sid>

# 事件审计
node scripts/event.mjs append --type <kind> --subject <s> --sid <sid> [--detail <json>]

# 学习回路
node scripts/learn.mjs --sid <sid> --json          # L0 经验提取
node scripts/eval-metrics.mjs --sid <sid> --json    # 8 项 KPI

# 发布
npm run release          # SemVer bump + CHANGELOG + tag
npm run release:dry-run  # 预览不执行

# 测试
npm test                 # node --test（所有 *.test.mjs）

# CI 等价命令
for f in scripts/*.mjs test/*.mjs; do node --check "$f"; done
npm ci --ignore-scripts && npm audit --audit-level=high
node scripts/release.mjs --dry-run
node scripts/install.mjs --skip-deps --skip-verify --json
```

## Node 环境

- **Node >= 18**（`@opencode-ai/plugin` engines 要求）
- 依赖在 `.opencode/node_modules/` 下**本地安装**，不共享根目录
- `.opencode/.gitignore` 排除了 `node_modules`、`package-lock.json`、`bun.lock`

## 架构决策（重大变更前必读 `docs/research/00-m0-synthesis.md`）

- **验证哲学**：机械优先（退出码 / 文件存在性），拒绝 LLM 自评
- **角色路由**：关键词判定表 + 低置信时向用户确认，不猜
- **本地优先**：内网数据源（192.168.31.x），SenseNova 生图仅 yi 挂载
- **事件类型归一化**：learn-rules.mjs / eval-metrics.mjs 支持 `men.*` 前缀 → 标准类型映射

## 版本同步缺口（发版后需手动同步）

`scripts/release.mjs` 仅自动同步 JSON 文件与 `site/src/pages/docs/configure.astro`；**以下文档不自动同步**：

- `AGENTS.md`（仓库状态 + CHARTER_CHECK 两处）
- `docs/guide/milestones.md` / `docs/governance.md` / `knowledge/README.md`
- `site/src/pages/docs/releases.astro`（发布历史表 + 当前版本亮点）

先例：v0.3.2 发版后曾漏 6 处版本引用。发版后请按此清单自查。

## 进程管理红线（Windows · 2026-08-24 事故后新增）

> 事故背景：跨 session 存活的僵尸 `astro preview` 占用 4399 端口并按旧 base 路由，导致站点访问异常；OpenCode 在 Windows 上存在已知的 child process leak / orphan 问题。

1. **常驻服务仅限受管形态**：只允许 `astro preview` 守护进程（自带 stop/status/logs）。必须使用仓库配置端口（4399），向用户报告 pid 与停止命令；禁止裸 `Start-Process` / detached / 管道截流。
2. **静态站验证走产物级检查**：一律使用 `node site/scripts/check-site.mjs`（扫描 dist：UTF-8/mojibake/空 slot/base 回归/路由锚点），不依赖活服务器。
3. **确需 HTTP 冒烟时的唯一合法形态**：单个 Node 脚本内 `spawn` 子进程 + `finally { kill }` 自终止，超时上限 60s，禁止脱离本次命令的进程树存活。
4. **会话收尾自查**：结束前运行 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 过滤本仓库路径残留并清理；确认 4399 端口无监听。
