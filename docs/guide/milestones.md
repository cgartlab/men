# 里程碑进度记录（Milestones）

> 日期：2026-08-21 ｜ 项目：假维斯（men Agent 团队）
> 总进度：M0–M7 全部完成，进入维护迭代阶段

---

## 里程碑总表

| 里程碑 | 主题 | 关键交付物 | 验收结果 | 日期 |
|--------|------|-----------|----------|------|
| M0 | 调研 | `docs/research/` 三份（OmO + oma + 合成笔记） | ✅ 完成：12+12 条机制合并去重，映射到 F1–F7 | 2026-08-15 |
| M1 | 骨架 | 6 角色 agent 定义、13 个 skill、3 个 command、3 个脚本 | ✅ 完成：全部按 PRD + M0 决策落地 | 2026-08-15 |
| M2 | 单兵 | 5 角色独立任务产物（si/ji/xun/yi/chi） | ✅ 完成：**5/5 全部通过**，chi judge 13/13 标准 PASS | 2026-08-15 |
| M3 | 编排 | ultrawork 三路并行汇总流程跑通 | ✅ 完成：写文章+查新闻+查金价混合任务 | 2026-08-15 |
| M4 | 机械验证 | verify/gate/event 三件套 + chi 双层复核 | ✅ 完成：识破"假完成" + structure 误报修复 | 2026-08-15 |
| M5 | 文档 | PRD / architecture / quickstart / milestones / release | ✅ 完成：五份文档归档 | 2026-08-21 |
| M6 | 自主学习 | learn.mjs + learn-rules + learn-budget + eval-metrics + eval-report | ✅ 完成：8 项 KPI + 8 问题设计 + 11 个 .mjs 脚本 | 2026-08-21 |
| M7 | Pi Harness | `.pi/` 兼容层 + prompts/ + package.json pi manifest | ✅ 完成：5 agent + 3 prompts + junction bridge | 2026-08-21 |

---

## M2 单兵验收详情（5/5 通过）

| 角色 | 任务 | 产物文件 | chi judge 结果 |
|------|------|----------|---------------|
| si 🖊️ | 撰写团队简介 | `docs/m2-acceptance/si-team-intro.md` | ✅ PASS |
| ji 🛠️ | skill 目录结构审计 | `docs/m2-acceptance/ji-skill-structure.md` | ✅ PASS（13/13 标准 PASS） |
| xun 🔍 | AI 新闻简报 | `docs/m2-acceptance/xun-ai-news.md` | ✅ PASS（8 条均 ≥2 独立来源） |
| yi 🎨 | Logo 概念方案 | `docs/m2-acceptance/yi-logo-concept.md` | ✅ PASS（3 方案 + 配色 + 可访问性） |
| chi 💹 | 独立 Judge 评审 ji 产物 | `docs/m2-acceptance/chi-judge-report.md` | ✅ PASS（Verdict: PASS，0 问题） |

---

## M4 机械验证验收详情

### 4.1 识破"假完成"

`output-exists` 检查发现产物文件不存在 → 判定 FAIL，成功识破 subagent 声称完成但未落盘的场景。

### 4.2 structure 误报修复

引入 `strictFrontmatter` 开关：仅 `.opencode/` 作用域强制 frontmatter 检查，非 `.opencode/` 目录（docs/、scripts/ 等）标记 SKIP。

### 4.3 脚本清单

| 脚本 | 功能 | 关键机制 |
|------|------|----------|
| `scripts/verify.mjs` | 五项机械检查 | output-exists / secrets / todo-scan / structure / gate-exit-code |
| `scripts/gate.mjs` | stop-hook 门禁 | 白名单 typecheck/test/lint；60s 超时；强化上限 5 |
| `scripts/event.mjs` | events.jsonl 读写 | append / list / replay / validate；9 种 kind |

---

## M6 自主学习验收详情

### 6.1 交付物

| 脚本 | 功能 | 行数 |
|------|------|------|
| `scripts/learn.mjs` | 学习循环主入口（聚合→分类→落盘） | ~180 行 |
| `scripts/learn-rules.mjs` | L1 规则判定表（纯函数） | ~140 行 |
| `scripts/learn-budget.mjs` | L2 调用预算检查 | ~90 行 |
| `scripts/eval-metrics.mjs` | 8 项 KPI 采集与计算 | ~170 行 |
| `scripts/eval-report.mjs` | 人类可读评估报告生成 | ~110 行 |
| `scripts/learning.test.mjs` | 学习闭环单元测试 | ~200 行 |

### 6.2 8 项 KPI

| 指标 | ID | 数据来源 |
|------|----|---------|
| 任务完成率 | KPI-task-completion | events.jsonl |
| 一次通过率 | KPI-first-pass | events.jsonl |
| 回归率 | KPI-regression | events.jsonl |
| 平均重试次数 | KPI-avg-retries | events.jsonl |
| 技能使用率 | KPI-skill-usage | skill stats |
| 知识沉淀率 | KPI-knowledge | knowledge/ 目录 |
| 错误重复率 | KPI-error-repeat | errors/ index |
| 学习效率 | KPI-learn-efficiency | 事件类型计数 |

### 6.3 设计文档

`docs/learning-architecture.md` 覆盖 8 个问题的完整设计方案：

1. 自动学习闭环
2. 技能进化
3. 模式提取
4. 元学习
5. 行为漂移检测
6. 团队知识迁移
7. 评估自动化
8. 学习成本控制

---

## M7 Pi Harness 验收详情

### 7.1 交付物

| 文件 | 内容 |
|------|------|
| `.pi/settings.json` | 包声明（packages: ["./"]） |
| `.pi/APPEND_SYSTEM.md` | men 编排指令（0 处 OpenCode 引用） |
| `.pi/agents/si.md` | 规划与写作子 agent |
| `.pi/agents/ji.md` | 工程执行子 agent |
| `.pi/agents/chi.md` | 投资分析与评审子 agent |
| `.pi/agents/yi.md` | 视觉设计子 agent |
| `.pi/agents/xun.md` | 研究助理子 agent |
| `prompts/ultrawork.md` | 一键编排 prompt 模板 |
| `prompts/hyperplan.md` | 访谈式规划 prompt 模板 |
| `prompts/verify.md` | 双层验证 prompt 模板 |
| `.pi/skills/` | junction → `.opencode/skills/`（13 skills 可见） |

### 7.2 兼容性

| 检查项 | 状态 |
|--------|------|
| Agent frontmatter 字段完整 | ✅ 5/5 通过 |
| Skills 路径桥接 | ✅ junction 生效，13 目录可见 |
| 0 处 OpenCode 专有引用 | ✅ APPEND_SYSTEM.md 已适配 |
| scripts 可执行 | ✅ 11 个 .mjs 全部 node --check 通过 |
| 同一套 skills / scripts 共享 | ✅ 底层不变 |

---

## CI 工作流

GitHub Actions（`.github/workflows/ci.yml`）包含两个 job：

| Job | 触发条件 | 步骤 |
|-----|---------|------|
| `validate` | push / pull_request | node --check → verify → release dry-run → install smoke test |
| `triage` | pull_request only | 按文件路径自动打标签 → 自动设里程碑 → 自动分配 assignee → 自动添加到项目看板 |

---

## 下一步

- M7 后规划：跨运行时 adapter（Codex / OpenClaw）+ 插件化封装 + 持续集成自动化
- 持续优化：根据 KPI 数据迭代 agent 定义与 skill 触发描述
- 开源发布准备：替换 install.sh / install.ps1 中的占位 URL → `npm publish`
