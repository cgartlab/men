---
name: xun-rss-scan
description: "Use when scanning RSS feeds for news tracking, weekly digest material collection, or bulk content aggregation from multiple sources. 触发关键词：RSS、订阅、新闻追踪、周报、素材收集、扫读、feed、订阅源。Don't call when the task is one-off web searching (use xun-search) or fact-checking individual claims (use xun-factcheck)."
---

# xun-rss-scan — RSS 聚合

本 skill 定义 xun 的 RSS 新闻聚合与整理行为，覆盖工具链、获取策略和输出规范。

## 不要触发

- 用户只需要搜索一条特定信息（用 xun-search）
- 用户要求进行事实核查（用 xun-factcheck）
- 用户要求内容写作（用 si-content-write）

## 扫描工作流（step-by-step）

1. 获取订阅列表（Miniflux API / 本地 RSS 配置）
2. 按 3 路策略逐源获取（直连 → jina.ai → feedparser）
3. 解析每条新闻的标题/链接/时间/来源/摘要
4. 按主题分类
5. 去重（URL 相同/标题 >80% 相似）
6. 按时间降序排列
7. 输出结构化结果

## 工具链

| 工具 | 地址 | 说明 |
|------|------|------|
| Miniflux | `http://192.168.31.111:8025` | 本地 RSS 聚合器，API 访问 |
| feedparser | 本地 Python 工具 | 直接解析 RSS XML |
| r.jina.ai | `https://r.jina.ai/{url}` | RSS 抓取代理 |

## RSS 3 路获取策略

参考 `cgartlab/rss_updater.py` 的实现，按顺序尝试：

### 第 1 路：直连

```
直接请求 RSS feed URL
```
- 适用：网络可达、目标站开放
- 超时：10 秒
- 成功即停止，无需后续

### 第 2 路：jina.ai 代理

```
请求 https://r.jina.ai/{原始RSS_URL}
```
- 适用：直连被墙 / 被 CDN 拦截
- jina.ai 会返回纯文本内容
- 解析后提取标题、链接、日期

### 第 3 路：feedparser 直连

```
用 feedparser 库解析原始 RSS
```
- 适用：前两路失败时的最后兜底
- feedparser 容错能力强，可处理格式不规范的 feed

### 策略选择逻辑

```
try 直连 → success? 用结果
            failure → try jina.ai 代理 → success? 用结果
                                           failure → try feedparser → 用结果 / 标记失败
```

## 新闻摘要结构化

对获取到的每条新闻，提取以下字段：

| 字段 | 说明 |
|------|------|
| 标题 | 原始标题，不修改 |
| 链接 | 原文链接 |
| 时间 | 发布时间（原文）+ 访问时间戳 |
| 来源 | 媒体/站点名称 |
| 摘要 | 1-2 句话关键信息提炼 |
| 分类 | 按主题归类（可选） |

## 去重与排序

### 去重规则

- 同一 URL 视为同一文章，只保留第一条
- 标题完全相同视为同一文章
- 标题高度相似（>80% 字符相同）视为重复

### 排序规则

1. **按发布时间降序**（最新优先）
2. 同一时间按来源优先级排序（原始 > 权威 > 行业 > 二手）
3. 同优先级按字母序

## 周报素材模式

在"周报素材收集"场景下：

1. 扫描最近 7 天的所有新增条目
2. 按主题分组（如：AI/开源/设计/硬件）
3. 每组保留 Top 3 最重要条目
4. 输出结构化的周报表格

## 项目规范参考

- **全员红线 #1**：获取失败时明确标记"获取失败"，不跳过不成功的 feed
- **全员红线 #2**：去重后给出最终文章数量统计，作为可验证的结果
- **内网数据源**：Miniflux（192.168.31.111:8025）为本地 RSS 聚合器，API 访问
- **3 路策略**：直连→jina.ai 代理→feedparser 直连，按 cgartlab/rss_updater.py 实现
- **去重规则**：URL相同=重复；标题完全相同=重复；标题>80%字符相同=疑似重复
- **周报素材模式**：最近7天→按主题分组→每组Top 3→结构化周报表格
- **排序规则**：发布时间降序→来源优先级→字母序
- **CHARTER_CHECK**：xun 角色 Clarification level=LOW

## 输出规范

- 所有结果附链接 + 时间戳
- 无法获取的 feed 明确标记为"获取失败"
- 不猜测未读取到的内容
- 去重后给出最终文章数量统计
