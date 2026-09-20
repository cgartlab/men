---
name: yi-imagegen
description: "Use when generating images, concept art, illustrations, or visual assets via SenseNova U1.5 Lite. 触发关键词：生图、生成图片、AI 绘画、概念图、插画、视觉素材、出图、配图。Don't call when the task is UI design/visual design (use yi-design) or when implementing frontend code (use ji)."
---

# yi-imagegen — AI 生图规范

本技能规范 yi（艺）在执行 AI 生图时的操作、提示词结构与产出流程。

## 不要触发

- 用户要求 UI/视觉设计决策（用 yi-design）
- 用户要求前端实现（用 ji）
- 用户要求进行图像编辑/裁剪（当前 API 未确认支持，见下文）

## 引擎规则

- **唯一引擎**：SenseNova U1.5 Lite（`model: "sensenova-u1.5-lite"`）
- **降级备选**：SenseNova U1 Fast（`sensenova-u1-fast`），仅当 U1.5 不可用时使用
- **直连模式必传参数**：`watermark: false`
- 不允许使用其他 AI 生图模型（DALL·E、Midjourney 等）作为替代
- 参数异常（缺失 watermark）视为生图失败

## 生图前必确认

在发起生图请求前，必须确认以下信息：

1. **用途**：该图片用于何处（文章配图、封面、Logo、概念图、UI 素材）
2. **风格**：属于风格体系中的哪一类（复古未来主义 / 柴油朋克 / 模拟科幻 / 超现实主义 / 纪实 / 插画 / 极简宇宙 / 装饰植物）
3. **尺寸**：期望的宽高比（见下方尺寸表）
4. **用途限制**：是否需要用于公开发布（涉及红线第 4 条"外部操作先确认"）

### 尺寸规格（U1.5 Lite 官方校验值，严格匹配）

| 场景 | 尺寸 | 说明 |
|------|------|------|
| 主体突出 + 留白 | 1760×2368（竖） | 单主体、留白占比大 |
| 横向叙事 / 海报 | 3072×1376（横） | 横幅、宽构图 |
| 方形特写 / 头像 | 2048×2048 | 方形、信息图 |
| 极简 / 单元素 | 1536×2752（竖长） | 极高留白 |
| 超宽 | 3072×864 / 2560×720 | Banner、视频封面 |

**标准小尺寸（1024×1024 等）不支持**，必须用上表中的值。

信息不全时，先向用户澄清，不脑补。

## 提示词工程（核心）

### 结构模板

U1.5 Lite 会做"prompt 推理扩展"（input tokens 1500-1900 说明在扩展 prompt），所以**两层结构**最有效：

```
[风格锚点 1-2 句] +
[主体描述 + 位置 + 尺寸占比] +
[关键细节 2-3 个] +
[色调/材质/光] +
[构图/留白] +
[氛围/情绪]
```

### 实测优质案例（2026-09-15 沉淀）

**主题：antique-feminine-cloud**（古典女性 + 云 + 鳞片纹样）：

```
风格锚点: An intricate field of floating cloud fragments emerges through hidden scale patterns, combining curved ornamental lines, restrained crimson accents and aged ivory tones into a mysterious feminine composition with a distinctly antique character.

扩展细节: Ethereal, ornate, vintage illustration, delicate linework, decorative arabesques, soft diffused light, painterly texture, antique porcelain and parchment palette, muted crimson, aged ivory, gold-flecked dust, mysterious feminine silhouette hinted within cloud layers
```

**关键经验：**
- 位置 + 尺寸占比要明确（如 "subject fills roughly one third of the frame"、"single small planet off-center"）
- 色调要给具体颜色名（aged ivory / muted crimson / deep emerald / faded vermilion），不要只说"复古色调"
- 描述主体动作/状态/材质，让 U1.5 推理扩展

### 构图比例描述词（写进 prompt）

| 构图 | 英文描述词 |
|------|-----------|
| 主体占画面 1/3 | `subject fills roughly one third of the frame` |
| 主体占画面 2/3 | `subject spanning nearly two-thirds of frame width` |
| 主体居中 | `subject centered, generous negative space around` |
| 主体偏置 | `subject placed off-center, asymmetric composition` |
| 主体极小 | `subject minuscule, distant, lonely presence` |

### 风格前置关键词库

| 风格 | 前置关键词（英文） |
|------|-------------------|
| 复古未来主义 | retrofuturism, dieselpunk, analog sci-fi |
| 超现实主义 | surrealist, dreamlike, Dali-esque |
| 极简宇宙 | minimalist cosmic illustration, deep void, distant celestial body |
| 装饰植物 | decorative botanical illustration, ornamental hybrid, arabesques |
| 复古天文图 | antique astronomical diagram, vintage scientific engraving, hand-drawn pen-line linework |
| 古典女性 | vintage illustration, ornate, aged porcelain aesthetic |
| 极简插画 | minimalist illustration, flat, geometric, vector |
| 工业风 | industrial, weathered metal, oxidized, worn |
| 纪实摄影 | documentary photography, natural light, candid |

### Negative Prompt 模板

负向提示词要精准排除反例，不要泛泛列。**通用反例模板**（按需裁剪）：

```
modern digital look, bright colors, neon, glossy, oversaturated, cartoon, anime,
busy composition, crowded, text, watermark, signature, grid,
sci-fi, hyperrealistic photo, lens flare,
perfect symmetry, geometric shapes, rigid structure
```

**场景化补充**：
- 要"小主体 + 大留白" → 加 `huge subject, dominating subject, subject cut off edge`
- 要"大主体" → 加 `tiny subject, subject too small, tiny dot, speck`
- 要"手绘感" → 加 `hyperrealistic photo, realistic texture, sharp lines`
- 要"低饱和" → 加 `saturated colors, high contrast, bold colors`
- 要"简洁" → 加 `busy composition, crowded, multiple elements`

## 多方案提示词流程（A 阵机制）

**核心原则：一次意图 → 思考中生成 ≥2 个不同方案 → 比对后选定 → 出图**

### 步骤 1：理解意图

从客户/上游 agent 的自然语言意图中抽取：
- 主体（主体是什么、几个）
- 风格（哪种审美倾向）
- 情绪（氛围 / 张力 / 节奏）
- 用途（尺寸 / 是否公开发布）

### 步骤 2：思考中生成 ≥2 个方案

**方案 A（保守方案）**：贴近客户原话，做最小必要扩展，用风格锚点 + 细节扩展两层结构。
**方案 B（发散方案）**：换一种构图 / 色调 / 主体比例，探索视觉可能。

对比维度：
- 意图匹配度（哪个更贴客户原意）
- 视觉张力（哪个更有审美冲击力）
- 技术可行性（U1.5 Lite 是否擅长这种类型）

### 步骤 3：选定并出图

选定后按结构模板写英文 prompt，配置参数，调用 API。

### 步骤 4：构图变体（如需）

选定 prompt 后，**换 2-3 个 seed 跑构图变体**，对比构图后选一交付。

## Seed 策略

| 策略 | 说明 |
|------|------|
| 固定 seed 复现 | 同 seed 同 prompt 得到完全一致结果（复现 / 存档） |
| 换 seed 拿变体 | 同 prompt 不同 seed，构图/笔触/细节都不同 |
| A/B 对比 | 同 prompt 跑 2-3 个 seed，对比构图后选一 |
| 批量生成 | 20+ 个 seed 跑一批，再人工挑选（注意 RPS 限流） |

**Seed 命名建议**：
- 用消息 ID 当 seed（如 `1353`）
- 用主题编号（如 `5588`、`8911`）
- 避免连续小数字（容易混）

## 批量生成的 RPS 限流经验（2026-09-15 教训）

**U1.5 Lite API 有 RPS 限流**，5 路并发会触发 `rps exhausted` 错误。**正确做法**：

- **串行 + 8 秒间隔**（每张约 27 秒 + 8 秒缓冲）
- 20 张预计耗时 10-12 分钟
- 失败重试最多 3 次，每次间隔 15 秒
- 用后台脚本跑，避免 session 超时

## 产出流程（step-by-step）

1. 向用户确认用途、风格、尺寸（信息不全先追问，不脑补）
2. 从风格前置关键词库选择锚点
3. **思考中生成 ≥2 个方案**（A 保守 / B 发散），比对选定
4. 构造提示词：[风格锚点] + [主体+位置+尺寸] + [关键细节] + [色调/材质/光] + [构图/留白] + [氛围/情绪]
5. 配置参数：`model: "sensenova-u1.5-lite"`、`watermark: false`、`size`（严格匹配尺寸表）、`seed`（用于复现/变体）
6. 调用 API：`POST https://token.sensenova.cn/v1/images/generations`
7. 从 `data[0].url` 下载图片（OSS 链接 1 小时过期，立即下载）
8. 落盘为 `.png`，保存到 `/root/hermes-workspace/00-Inbox/`
9. 如需构图变体：换 2-3 个 seed 重跑，对比交付
10. 生图结果经用户确认后方可对外使用

## 项目规范参考

- **全员红线 #1**：生图完成后必须验证图片文件存在且非空（`test -s` 确认）
- **全员红线 #4**：生图结果未经用户确认不得对外发布（邮件/公开发布/商业使用）
- **全员红线 #6**：用途/风格/尺寸信息不全时先追问，不脑补
- **全员红线 #7**：输出格式——粗体关键信息、列表优先、单段 ≤6 行
- **模型**：yi 使用 sensenova/sensenova-6.8-flash-lite（opencode.json agent.yi.model）
- **生图引擎**：唯一引擎 SenseNova U1.5 Lite（降级 U1 Fast），直连必传 `watermark: false`
- **风格体系**：复古未来主义 / 柴油朋克 / 模拟科幻 + 超现实主义，材质做旧、磨损
- **协作边界**：生图由 yi 执行，生图结果供 ji 嵌入文章/页面
- **CHARTER_CHECK**：yi 角色 Clarification level=MEDIUM

## 红线

- 不跳过水印关闭参数
- 不用中文 prompt 期望高精度（英文 prompt 优先）
- 生图结果未经用户确认不得对外发布
- 不使用 SenseNova 之外的生图引擎
- 不脑补用途和风格，信息不足先问
- 不并发超过 1 路（RPS 限流）
- 不用标准小尺寸（1024×1024 等），必须严格匹配尺寸表
