# 里程碑进度记录（Milestones）

> 日期：2026-08-21 ｜ 项目：Men Agent 团队
> 总进度：M0–M7 全部完成，项目 v0.3.6 已发布（npm 包 `@cgartlab/men` 支持 `npx @cgartlab/men` 一行安装）

---

## 里程碑总表

| 里程碑 | 主题 | 关键交付物 | 验收结果 | 日期 |
|--------|------|-----------|----------|------|
| M0 | 调研 | `docs/research/oh-my-openagent.md`、`docs/research/oh-my-agent.md`、`docs/research/00-m0-synthesis.md` | ✅ 完成：OmO 12 条 + oma 12 条机制合并去重，映射到 F1–F7 | 2026-08-15 |
| M1 | 骨架 | 6 角色 agent 定义、15 个技能包、3 个 command、3 个脚本 | ✅ 完成：全部按 PRD + M0 决策落地 | 2026-08-15 |
| M2 | 单兵 | 5 角色独立任务产物（si/ji/xi/yi/chi） | ✅ 完成：**5/5 全部通过**，chi judge 报告 13/13 标准 PASS | 2026-08-15 |
| M3 | 编排 | ultrawork 三路并行汇总流程跑通 | ✅ 完成：写文章+查新闻+查金价混合任务，多 Wave 分发 + men 汇总 | 2026-08-15 |
| M4 | 机械验证 | `verify.mjs` / `gate.mjs` / `event.mjs` 三项脚本 + chi 双层复核流程 | ✅ 完成：见下方 M4 验收详情 | 2026-08-15 |
| M5 | 文档 | `docs/PRD.md`、`docs/architecture.md`、`docs/guide/quickstart.md`、`docs/guide/milestones.md` | ✅ 完成：PRD / architecture / quickstart / milestones / governance 五份文档 | 2026-08-21 |
| M6 | GitHub 基础设施 + 团队治理 | PR 模板 / Issue 模板 / CODEOWNERS / FUNDING / dependabot / SECURITY.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md / LICENSE / docs/governance.md | ✅ 完成：GitHub 标准文档与模板全部就位 | 2026-08-21 |
| M7 | 自主学习回路 | learn.mjs / eval-metrics.mjs / knowledge/ 全部验证通过；3 条 patterns + 3 条 decisions + 1 条 errors | ✅ 完成 | 2026-08-21 |

## M2 单兵验收详情（5/5 通过）

| 角色 | 任务 | 产物文件 | chi judge 结果 |
|------|------|----------|---------------|
| si 🖊️ | 撰写团队简介 | `docs/m2-acceptance/si-team-intro.md` | ✅ PASS |
| ji 🛠️ | skill 目录结构审计 | `docs/m2-acceptance/ji-skill-structure.md` | ✅ PASS（13/13 标准 PASS） |
| xun 🔍 | AI 新闻简报（8 月） | `docs/m2-acceptance/xun-ai-news.md` | ✅ PASS（8 条均 ≥2 独立来源） |
| yi 🎨 | Logo 概念方案 | `docs/m2-acceptance/yi-logo-concept.md` | ✅ PASS（3 方案 + 配色 + 可访问性） |
| chi 💹 | 独立 Judge 评审 ji 产物 | `docs/m2-acceptance/chi-judge-report.md` | ✅ PASS（Verdict: PASS，0 问题） |

chi judge 评审 ji-skill-structure 的 13 条验收标准全部 PASS，包括文件存在性、SKILL.md 13/13、frontmatter 合法性、name 与目录名精确匹配、行数与大小全量复核——**ji 自报的 3,789 bytes、13/13、0 问题均经独立复核证实**。

## M4 机械验证验收详情

### 4.1 识破"假完成"

M4 验收过程中，用 verify.mjs 对"声称完成但未产出文件"的场景进行验证：

- `output-exists` 检查发现产物文件不存在 → 判定 `FAIL`
- 成功识破"假完成"（subagent 声称完成但实际未落盘），证明机械验证机制有效

### 4.2 structure 误报修复

初次运行 verify.mjs 对 `docs/` 和 `scripts/` 目录下的 .md 文件做 frontmatter 检查时，出现误报：这些目录不是 `.opencode/` 作用域，不应强制要求 frontmatter。

**修复方式**（verify.mjs `checkStructure` 函数）：

- 引入 `strictFrontmatter` 开关：`abs.startsWith(ROOT + ".opencode")`
- `.opencode/` 作用域下 .md 文件强制要求 `---` frontmatter
- 非 `.opencode/` 作用域（如 `docs/`、`scripts/`、`m2-acceptance/`）跳过 .md frontmatter 检查，标记 `SKIP`
- .json 结构检查不受作用域限制，全部目录强制 JSON.parse

修复后 verify.mjs 对 `docs/m2-acceptance/` 目录重新验证，output-exists / secrets / todo-scan 全部 PASS，structure 对 .md 标记 SKIP（非 .opencode 作用域），符合预期。

### 4.3 脚本清单

| 脚本 | 功能 | 关键机制 |
|------|------|----------|
| `scripts/verify.mjs` | 五项机械检查 | output-exists / secrets / todo-scan / structure / gate-exit-code；`--json` / `--sid` 参数；纯 Node 零依赖 |
| `scripts/gate.mjs` | stop-hook 门禁 | 白名单 typecheck/test/lint；60s 超时；强化次数上限 5；`GATE_SKIP` / `GATE_EXHAUSTED` 状态 |
| `scripts/event.mjs` | events.jsonl 读写 | append / list / replay / validate 四子命令；14 种 kind 枚举；`eventId` uuid |

## 已知决策记录

| # | 决策 | 说明 |
|---|------|------|
| D1 | **命名暂定 men** | 仓库命名为 `men`（门），团队中文别名"Men Agent 团队"为暂定；命名可后续调整，不影响架构 |
| D2 | **adapter 后续适配 Codex / OpenClaw** | 当前仅适配 OpenCode；跨运行时复用（Codex、OpenClaw 等）的 adapter 层设计未进入当前里程碑，规划 M5 后启动 |
| D3 | **M1 先不做插件** | 采用 OpenCode 原生 agent 定义 + command + 脚本；`opencode.json` 中 `plugin: []`，不启用 `@opencode-ai/plugin` |
| D4 | **SenseNova 生图仅 yi 挂载** | 避免其他角色误用外部 API；SenseNova 密钥仅对 yi 暴露 |
| D5 | **全部脚本纯 Node 零依赖** | verify / gate / event 三个脚本不引入任何 npm 依赖，仅用 Node 内置模块（fs / path / crypto / child_process） |
| D6 | **事件审计 best-effort** | event.mjs / gate.mjs 的追加事件在命令失败时不阻塞主流程，仅 stderr 警告 |

## 下一步

## M7 已验证项

- ✅ `/ultrawork` 第 10 步：触发 `learn.mjs --sid <sid> --json`
- ✅ `/verify` 第 5 步：触发 `eval-metrics.mjs --sid <sid> --json`
- ✅ `knowledge/decisions/`：3 条决策记录（M0/M6/M7）
- ✅ `knowledge/patterns/`：3 条初始模式（verdict-revision / wave-parallel / event-type-inconsistency）
- ✅ `errors/`：1 条自动提取错误（verdict-revision-needed）
- ✅ 事件类型归一化：learn-rules + eval-metrics 均支持 men.* 前缀
- 后续规划（M8+）：跨运行时 adapter / 插件化封装 / Agent 团队扩展
