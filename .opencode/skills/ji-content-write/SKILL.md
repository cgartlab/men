---
name: ji-content-write
description: "Use when writing blog posts, technical documentation, weekly digests, or any structured content creation task. 触发关键词：写作、博客、文档、weekly、文章、周报、写作任务。Don't call when the task is searching for information (use xun-search) or planning a project structure (use si-plan-compose)."
---

# ji-content-write — 写作规范技能

## 用途

承接 si 分派的写作任务（博客、文档、weekly 等），产出结构化内容。ji 同时对代码和文字负责。

## 不要触发

- 用户需要搜索信息（由 xun 负责）
- 用户需要规划项目结构（由 si 负责）
- 用户需要视觉设计（由 yi 负责）

## 写作规范

### 风格约束

- **口语节奏**，短句为主，不写长段落
- **关键信息加粗**，列表优先于段落
- **单段 ≤6 行**
- 不写水文，不堆砌形容词
- emoji 用于状态标注，不加语气词

### 事实核查输出

核查外部信息时使用三级标注：

| 标记 | 含义 | 处理 |
|------|------|------|
| ✅ | 准确，有来源 | 可直接引用 |
| ❌ | 错误/不实 | 标注错误原因，不引用 |
| ⚠️ | 不确定/存疑 | 标注不确定性，标注可能的替代来源 |

每个标注**必须附来源超链接**，无来源视为 ⚠️ 不确定。

### 写作任务类型

| 类型 | 产出格式 | 注意事项 |
|------|----------|----------|
| 博客文章 | `.md`，含标题/正文/来源 | 口语节奏，事实核查三级标注 |
| 技术文档 | `.md`，含目录/章节/代码块 | 精确、简洁、可操作 |
| Weekly 周报 | `.md`，含摘要/要点/来源 | 每条 ≤3 行，来源链接必附 |
| 项目文档 | `.md`，含背景/方案/验收 | 按 plan envelope 结构产出 |

## 项目规范参考

- **事实核查**：每条事实独立验证，≥2 独立来源才标 ✅，单来源标 ⚠️
- **来源优先级**：原始 > 权威媒体 > 行业报告 > 二手
- **低置信时明确标注**，不猜测、不补全、不推测
- **全员红线 #1**：声称完成前必须有机械证据（文件存在且非空）
- **全员红线 #6**：需求模糊先问清楚，不脑补需求

## 事件审计

写作任务完成后，写入 verify 事件到 `events.jsonl`（best-effort）：

```bash
node scripts/event.mjs append \
  --type verify \
  --subject ji \
  --sid $sid \
  --detail '{"outcome":"PASS","agent":"ji","attempt":1,"skill":"ji-content-write","reason":"写作任务完成，文件存在且非空，事实核查标注完整"}'
```

## 触发场景

- men 分派写作任务时
- si 的 plan envelope 中标注 Category=write 的任务
