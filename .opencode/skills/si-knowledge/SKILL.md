---
name: si-knowledge
description: "Use when organizing project knowledge, conducting PKM (Personal Knowledge Management) reviews, extracting reusable insights from sessions, or archiving decisions. 触发关键词：知识库、PKM、知识沉淀、复盘、总结、归档、知识管理。Don't call when the task is doing real-time web search (use xun-search) or writing new content from scratch (use si-content-write)."
license: Apache-2.0
---

# si-knowledge（知识库管理）

维护 `knowledge/` 目录，沉淀可复用结论，支撑项目记忆。M2 阶段以本地目录为主，接入 Affine / Blinko 后转为日常维护。

## 适用范围

| 场景 | 动作 | 产出 |
|------|------|------|
| 知识沉淀 | 从会话/项目中提取可复用结论 | knowledge/topics/ 条目 |
| 复盘 | 回顾已完成工作，提炼经验教训 | knowledge/decisions/ 条目 |
| 归档 | 标记过期或失效结论 | `[archived]` 标注，不删除 |
| PKM 检索 | 查询历史结论辅助新任务 | 返回相关条目 + 来源 |

本技能负责**知识管理**。实时信息获取、新内容创作由其他角色负责。

## 不要触发

- ❌ **实时搜索** — 查最新新闻、外部资料，用 xun-search / xun-rss-scan
- ❌ **新内容创作** — 写博客、文档、周刊，用 si-content-write
- ❌ **代码实现** — 修改代码、写脚本，交给 ji
- ❌ **判断知识对错** — 事实核查交给 xun-factcheck，本技能只负责组织和归档

## 触发词

中文：知识库、PKM、知识沉淀、复盘、总结、归档、知识管理、沉淀、经验记录、结论保存、查历史结论、知识检索

英文：knowledge base、PKM、knowledge management、note taking、archive、insight extraction、retrospective、lesson learned、knowledge retrieval

## 知识提取工作流（step-by-step）

### 步骤 1：识别可沉淀信息

先判断信息是否值得写入，三个问题：

1. **可复用吗？** — 未来任务还会用到 → 写入；一次性信息 → 不写
2. **有结论吗？** — 有明确结论或决策 → 写入；纯过程记录 → 不写
3. **有来源吗？** — 可追溯到 URL / 文件名 / 摘录 ID → 写入；无来源 → 先补来源

### 步骤 2：提取关键结论

- **归纳**，不复制原文
- 每条条目一句话总结（**结论** 字段）
- 保留 2–5 条细节要点（**详情** 部分）
- 删除冗余叙述，只留可复用信息

### 步骤 3：标注来源

每条条目必须标注来源，三选一：

| 来源类型 | 格式示例 |
|----------|----------|
| URL | `https://example.com/docs/...` |
| 文件名 | `docs/research/00-m0-synthesis.md` |
| 摘录 ID | `blinko:abc123` |

无来源标注的条目视为不完整，不得提交。

### 步骤 4：归类到目录

按内容类型选择目标目录：

- **topics/** — 按主题归类的知识（如 `topics/opencode-agents.md`）
- **references/** — 参考链接、外部资料摘录
- **decisions/** — 架构/流程决策记录（如 `decisions/role-routing.md`）

拿不准归哪类时，优先 topics/，并在文件中标注相关链接。

### 步骤 5：落盘

1. 确认目标路径（`knowledge/<目录>/<主题>.md`）
2. 使用 `write` 工具写入 `.md` 文件
3. **验证文件存在且非空**（read 或 Test-Path 确认）
4. 报告落盘路径 + 条目数

## 知识条目模板

```markdown
## <标题>

**结论**：一句话总结
**来源**：URL / 文件名 / 摘录ID
**日期**：YYYY-MM-DD
**相关**：[link-to-related]
**归档状态**：active / archived

### 详情
- 要点 1
- 要点 2
- 要点 3
```

### 字段说明

- **结论** — 必填，一句话，可独立消费
- **来源** — 必填，URL / 文件名 / 摘录 ID
- **日期** — 必填，写入当天日期
- **相关** — 选填，关联条目链接
- **归档状态** — 默认 `active`，归档时改 `[archived]`

## 目录结构

```
knowledge/
├── topics/       # 按主题归类
├── references/   # 参考链接/摘录
└── decisions/    # 架构/流程决策记录
```

### 数据源

| 来源 | 类型 | 地址/说明 |
|------|------|-----------|
| Affine | 协作白板/文档 | 内网 192.168.31.x |
| Blinko | 阅读/摘录管理 | 内网 192.168.31.x |
| knowledge/ | 项目知识沉淀 | 本地目录，写入可复用结论 |

## 知识分类规范

### topics/ — 主题知识

- 按主题命名文件，kebab-case：`topics/opencode-agents.md`
- 一个主题一个文件，跨主题内容用 **相关** 字段互链
- 内容为归纳后的结论，不是原文堆积

### references/ — 参考资料

- 保留外部链接 + 一句话摘要 + 摘录要点
- 每条必须标注来源 URL
- 不主动改写原文，摘录保持准确

### decisions/ — 决策记录

- 记录**决策 + 理由 + 影响**，不只是结果
- 格式：`decisions/YYYY-MM-DD-<主题>.md` 或 `decisions/<主题>.md`
- 变更决策时更新原条目并标注日期，不另开重复条目

## 归档规则

- **触发条件**：过期 / 被替代 / 不再维护
- **动作**：标题或结论前标记 `[archived]`，**不删除文件**
- **保留来源**：归档后来源与详情保留，供追溯
- **新条目指向**：归档条目在新条目 **相关** 字段中保留链接，注明替代关系

## Pre-Commit Checklist

- [ ] 结论为一句话归纳，非原文复制
- [ ] 来源已标注（URL / 文件名 / 摘录 ID）
- [ ] 日期为写入当天，格式 YYYY-MM-DD
- [ ] 已归类到正确目录（topics / references / decisions）
- [ ] 信息可复用（一次性信息未写入）
- [ ] 归档条目已标记 `[archived]`，未删除
- [ ] 文件名 kebab-case，目录结构符合规范
- [ ] 文件落盘为 `.md`，存在且非空

## Anti-Patterns

- ❌ **写入一次性信息** — 用完即弃的内容占空间，污染检索
- ❌ **无来源标注** — 结论不可追溯，等于没沉淀
- ❌ **复制原文** — 大段复制不如归纳，条目失去可读性
- ❌ **不归档只删除** — 删除丢失历史，标记 `[archived]` 保留追溯
- ❌ **随手乱放** — 不按 topics/references/decisions 归类，检索困难
- ❌ **无结论只有过程** — 记了一堆操作，没提炼"下次怎么做"
