# Pi Harness 安装设计 — men 作为 Pi 插件

> 状态：设计稿（2026-09-06）· 分支：`feat/pi-harness` · 目标：与 `main`（v0.4.0）能力对齐后，将 men 以官方 Pi Package 形态分发，可在任意机器（含另一台测试电脑）一键安装使用。

## 1. 背景与目标

- men 当前在 OpenCode harness 下运行（`.opencode/`），Pi 适配层（`.pi/`）基于远古 base 创建，**落后 main 159 个提交**（skills 13→15、commands 3→4、新增 men.jsonc / gh-flow / plugins / argus 集成等）。
- 目标：**men 作为 Pi 插件**（官方 Pi Package），`pi install` 一条命令在任意项目启用；Pi 下保留 OpenCode 的全部核心能力（6 角色编排、15 skills、机械验证 scripts）。
- 约束：不在本机安装验证，须交付**可在另一台电脑执行**的安装与验收流程。

## 2. 官方机制调研摘要（pi 0.85.1 / pi-subagents 2.2.2）

### 2.1 Pi Packages（`docs/packages.md`）

- 包 = 任意 npm/git 仓库/本地目录，含 `package.json` 的 `pi` manifest 或约定目录（`extensions/` `skills/` `prompts/` `themes/`）。
- manifest 示例：

  ```json
  {
    "name": "my-package",
    "keywords": ["pi-package"],
    "pi": {
      "extensions": ["./extensions"],
      "skills": ["./skills"],
      "prompts": ["./prompts"],
      "themes": ["./themes"]
    }
  }
  ```

- 安装：`pi install npm:@scope/pkg@1.2.3` / `pi install git:github.com/user/repo@v1` / `pi install ./local/path`；`-l` 写项目 `.pi/settings.json`，默认写全局 `~/.pi/agent/settings.json`。
- 用户级包装到 `~/.pi/agent/npm/`，项目级装到 `.pi/npm/`；git 包克隆到 `~/.pi/agent/git/<host>/<path>` 或 `.pi/git/`。
- 依赖：运行时依赖放 `dependencies`（pi 装包后自动 `npm install`，production 模式）；其他 pi 包需 `bundledDependencies` + `node_modules/` 路径引用。

### 2.2 Skills（`docs/skills.md`，Agent Skills 标准）

- 加载位置：全局 `~/.pi/agent/skills/`、项目 `.pi/skills/`、包内 `skills/`（或 `pi.skills`）、settings `skills` 数组、CLI `--skill`。
- 结构：目录含 `SKILL.md`，frontmatter 必须 `name`（小写连字符）+ `description`（非空）；渐进式披露（只注入描述，按需读全文）。
- men 的 `.opencode/skills/*/SKILL.md` 已满足该格式（name+description 齐全）→ **可直接桥接**。

### 2.3 Prompt Templates（`docs/prompt-templates.md`）

- 加载位置：全局 `~/.pi/agent/prompts/`、项目 `.pi/prompts/`、包内 `prompts/`（或 `pi.prompts`）、settings `prompts`。
- 格式：`prompts/<name>.md` → 命令 `/name`；frontmatter 可带 `description`、`argument-hint`；正文支持 `$1`/`$@`/`${@:-default}` 参数。
- men 的 4 个 command（ultrawork/verify/hyperplan/gh-issue）正文用 `$ARGUMENTS`/`$1`，**frontmatter 需适配**（description 已有，可加 argument-hint）。

### 2.4 Extensions（`docs/extensions.md`）

- 加载位置：全局 `~/.pi/agent/extensions/`、项目 `.pi/extensions/`、包内 `extensions/`（或 `pi.extensions`）。
- TS 模块，默认导出工厂：`export default function (pi: ExtensionAPI)`；可注册工具/命令/事件；jiti 加载免编译。
- 运行时依赖放 `dependencies`（`--omit=dev`）。**Pi 自带 subagents 工具需依赖第三方扩展 `@johnnywu/pi-subagents`**（`pi install npm:@johnnywu/pi-subagents`，peer 要求 pi >= 0.83）。

### 2.5 系统提示注入（`docs/usage.md` + resource-loader 源码）

- `.pi/SYSTEM.md`（项目）/ `~/.pi/agent/SYSTEM.md`（全局）→ **替换**默认 system prompt。
- `.pi/APPEND_SYSTEM.md`（项目）/ `~/.pi/agent/APPEND_SYSTEM.md`（全局）→ **追加**到默认 prompt。**优先级：项目 > 全局**（resource-loader `discoverAppendSystemPromptFile()`）。
- ⚠️ **关键约束**：APPEND_SYSTEM.md 不在包机制内 —— 只能从项目 `.pi/` 或全局 agentDir 发现，**包内文件不会自动加载**，需安装器落位。

### 2.6 上下文文件（`docs/usage.md`）

- `AGENTS.md`/`CLAUDE.md` 从 cwd 向上遍历发现；`AGENTS.override.md` 优先。
- ⚠️ 同样是**目录发现机制，不在包机制内**。

### 2.7 pi-subagents agents 发现机制（源码确认）

- `loadAgentDefinitions()` 只扫**两个固定目录**：
  - 全局：`~/.pi/agent/agents/`
  - 项目：`<cwd>/.pi/agents/`
- **不从 pi 包内加载 agents**；agent 的 `skills:` 字段通过包解析器（`DefaultPackageManager.resolve()`）可解析包内 skill。
- agent frontmatter 契约：`name`(必填)/`description`/`tools`(CSV)/`model`/`thinking`(off|minimal|low|medium|high|xhigh)/`systemPrompt`(append|replace|replace-all)/`skills`(CSV)/`maxDepth`/`debug`/`allowedAgents`。

### 2.8 项目信任（`docs/settings.md`）

- 交互启动时对含 `.pi/settings.json` / `.pi` 资源的目录弹信任确认；信任后加载 `.pi` 资源、自动安装缺失包、执行项目扩展。
- 非交互模式（`-p`/json/rpc）按 `defaultProjectTrust`（ask/always/never）；`-a` 临时信任。

## 3. 资源加载矩阵（men 资产 → Pi 机制）

| men 资产 | Pi 加载机制 | 包内可分发？ | 说明 |
|----------|------------|:---:|------|
| 15 个 skills（`.opencode/skills/`） | 包 `pi.skills` 或 `.pi/skills/` | ✅ | 已满足 SKILL.md 格式；两条路径任选，建议 `pi.skills` 指向源码，避免双份副本 |
| 4 个 prompts（`.opencode/command/`） | 包 `pi.prompts` 或 `prompts/` | ✅ | frontmatter 需加 `argument-hint`；正文 `$ARGUMENTS`/`$1` 兼容 |
| 5 个子 agent（`.pi/agents/`） | pi-subagents 固定目录扫描 | ❌ | **必须落位到项目 `.pi/agents/` 或全局 `~/.pi/agent/agents/`**，安装器负责 |
| men 编排指令（APPEND_SYSTEM.md） | 项目/全局 `.pi/APPEND_SYSTEM.md` | ❌ | **必须落位**，安装器负责 |
| AGENTS.md（团队规则/全员红线） | cwd 向上目录发现 | ❌ | 仓库内已有；作为插件装到别的项目时不自动生效 |
| scripts/（verify/gate/event/learn 等 16 个） | — | ✅ | 包内文件；prompts/agents 中 `node scripts/xxx.mjs` 的相对路径仅在 men 仓库根（或安装器落位 scripts）时有效 |
| events.jsonl / knowledge/ | — | ✅(包) | 运行态写入 `.agents/state/`，best-effort |

**结论**：纯 Pi Package 机制能覆盖 skills/prompts；**agents + APPEND_SYSTEM 必须由安装器落位**（复制/链接到项目或全局固定目录）。scripts 相对路径是最大风险点，见 §6 风险。

## 4. 安装架构设计

### 4.1 双模式

- **模式 A · 项目内使用（men 仓库即工作目录）**：clone men → `cd men` → 信任项目 → `.pi/settings.json` 的 `packages: ["./"]` 把自身作为本地包加载 skills/prompts；`.pi/agents/` 与 `.pi/APPEND_SYSTEM.md` 就地被发现；scripts 相对路径天然可用。**零复制、最稳，推荐测试首选**。
- **模式 B · 插件安装（在任意项目启用 men）**：`pi install`（npm/git/本地路径）→ 包内 skills/prompts 自动加载；安装器把 agents + APPEND_SYSTEM 落位到目标（项目 `.pi/` 或全局 `~/.pi/agent/`），并把 scripts 链接/复制到项目 `scripts/men-*` 或注入绝对路径。

### 4.2 包 manifest（package.json `pi` 段）

```jsonc
{
  "pi": {
    "skills": ["./.opencode/skills"],   // 15 个 SKILL.md 直接复用
    "prompts": ["./prompts"]            // 4 个模板（适配 frontmatter 后）
  }
}
```

- **不声明 extensions**：men 的机械验证是纯 Node 脚本，无需 pi extension；subagent 能力由 `@johnnywu/pi-subagents` 独立提供（非 men 包依赖，作为前置安装项）。
- `.pi/settings.json` 保持 `{ "packages": ["./"] }`（模式 A 自引用；模式 B 由 `pi install -l` 写入目标项目）。

### 4.3 安装器（新增 `scripts/pi-install.mjs`）

职责（纯 Node 零依赖，与现有 scripts 风格一致）：

1. **前置检查**：`pi --version` 存在且 >= 0.83；Node >= 18。
2. **依赖扩展**：检测/提示安装 `@johnnywu/pi-subagents`（`pi install npm:@johnnywu/pi-subagents`，全局一次即可）。
3. **模式 A**：`cwd` 已是 men 仓库根 → 校验 `.pi/settings.json`、agents 数量（5）、skills 桥接（15）→ 输出就绪报告。
4. **模式 B**：
   - 把 `.pi/agents/*.md` 复制/链接 → 项目 `.pi/agents/`（默认）或全局 `~/.pi/agent/agents/`（`--global`）。
   - 把 `.pi/APPEND_SYSTEM.md` → 项目 `.pi/APPEND_SYSTEM.md`（默认）或全局 `~/.pi/agent/APPEND_SYSTEM.md`（`--global`）。
   - scripts 落位：项目已有 `scripts/` 时以 `men-` 前缀复制（如 `scripts/men-verify.mjs`）并输出路径提示；无 `scripts/` 时整目录链接。
5. **校验**：逐项机械检查（文件存在性 + frontmatter 契约 + skills name 集合 = 15），退出码 0 才报成功。
6. **幂等**：重复安装可覆盖；记录安装清单到目标 `.pi/men-install.json` 便于卸载。

### 4.4 卸载器（`scripts/pi-remove.mjs`，可选）

按 `.pi/men-install.json` 清单删除落位文件，恢复原状。

## 5. 完整安装流程（另一台电脑测试用）

### 5.1 前置

```bash
node -v          # >= 18
pi --version     # >= 0.83
```

### 5.2 模式 A（推荐，先测这条）

```bash
git clone https://github.com/cgartlab/men.git
cd men
git checkout feat/pi-harness          # 测试分支；合入 main 后省略
pi install npm:@johnnywu/pi-subagents # 一次性：subagent 工具
node scripts/pi-install.mjs           # 校验就绪（不装任何东西）
pi                                    # 首次启动信任项目
```

启动后核对（见 §7 验收清单）。

### 5.3 模式 B（插件形态）

```bash
# 方式一：npm（发布后）
pi install npm:@cgartlab/men
# 方式二：git
pi install git:github.com/cgartlab/men@feat/pi-harness
# 方式三：本地路径（测试中推荐，免发布）
pi install /path/to/men

# 激活编排层（agents + APPEND_SYSTEM + scripts 落位）
node ~/.pi/agent/npm/@cgartlab/men/scripts/pi-install.mjs   # 路径以 pi list 显示为准
pi
```

## 6. 风险与对策

| # | 风险 | 对策 |
|---|------|------|
| R1 | **APPEND_SYSTEM.md 不在包机制内**，模式 B 不落位则 men 编排指令不注入 | 安装器强制落位 + 校验；`pi list`/启动头核对 |
| R2 | **agents 不在包机制内**（pi-subagents 只扫固定目录） | 安装器复制/链接到项目或全局 agents 目录 |
| R3 | prompts/agents 中 `node scripts/verify.mjs` 相对路径在模式 B 失效 | 安装器落位 scripts（`men-` 前缀或整目录链接）；prompts 中命令改为 `node <MEN_DIR>/scripts/...` 或安装后回写 |
| R4 | skills 双份副本漂移（`.opencode/skills` vs `.pi/skills`） | 模式 A 只经 `pi.skills` 指向 `.opencode/skills`，`.pi/skills` 删除或改 junction；`verify.mjs` 增加一致性检查 |
| R5 | pi-subagents 版本漂移（2.2.2 契约可能变） | 安装器检查 frontmatter 契约；README 固定版本 |
| R6 | 项目信任弹窗阻断非交互测试 | 文档说明 `/trust`；CI/脚本用 `-a` |

## 7. 验收清单（另一台电脑执行）

```bash
# 1. 启动头：确认加载 men skills(15) / prompts(4) / subagent 扩展
# 2. 技能可用性
/skill:ji-github
/skill:xun-search
# 3. 命令模板
/ultrawork "写一个 3 行示例任务"
/verify men
/hyperplan "示例项目"
/gh-issue "示例意图"
# 4. 子 agent 编排（pi-subagents）
#    对 pi 说："用 xun agent 查一下今天新闻" → 应出现 subagent 工具调用
# 5. 机械验证（在 men 仓库根）
node scripts/verify.mjs men
# 6. 编排注入
#    启动头或 /debug 应看到 APPEND_SYSTEM.md 内容（men 编排指令）
```

## 8. 与 main 对齐的重建清单（feat/pi-harness 待办）

| 项 | main (v0.4.0) | 当前 pi 层 | 动作 |
|----|--------------|-----------|------|
| skills | 15（ji×4/si×2/xun×3/chi×2/yi×2/men×2） | 13（含过时 si-content-write） | 按 main 集合重建桥接；新增 ji-content-write/men-status/men-update |
| prompts | 4（+gh-issue） | 3 | 补 gh-issue.md；frontmatter 加 argument-hint |
| agents | 6 定义（men 角色定位已变：si=知识管理、ji=代码+写作、chi=评审+投资） | 5（旧定位） | 基于 main 的 `.opencode/agent/*.md` 重新生成 `.pi/agents/*.md`，frontmatter 转 pi-subagents 契约 |
| APPEND_SYSTEM.md | —（无 pi 层） | 旧编排指令 | 按 main 的 men.md + AGENTS.md 重写（意图门/路由表/汇总模板/命令引用） |
| package.json | v0.4.0，无 pi manifest | 旧 @fakevis/men | 对齐 @cgartlab/men v0.4.0，加 `pi` manifest（skills/prompts 指向源码） |
| scripts | 16 个 | 旧 11 个 | 跟随 main；补 pi-install.mjs / pi-remove.mjs |
| AGENTS.md | v0.4.0 | 旧 | 更新 Pi Harness 段（15 skills/4 prompts/新安装流程） |
| .pi/settings.json | — | `{packages:["./"]}` | 保留（模式 A 自引用） |

## 9. 参考

- Pi 官方文档（本机）：`/root/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/docs/`
  - `packages.md` / `skills.md` / `prompt-templates.md` / `extensions.md` / `settings.md` / `usage.md`
- pi-subagents 源码：`/tmp/pi-subagents-inspect/package/extensions/`（agent-loader.ts / skill-resolver.ts / index.ts）
- men 现状：`AGENTS.md` §Pi Harness 兼容、`docs/architecture.md`、`CHANGELOG.md`
