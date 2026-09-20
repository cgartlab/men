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

- **核心职责**：yi 负责**完善文生图提示词**，不是直接调用生图 API
- **生图模型**：SenseNova U1.5 Lite（`model: "sensenova-u1.5-lite"`），由上游 agent（men/用户/Hermes）通过 image-by-sensenova skill 调用
- **yi 的模型**：`sensenova/sensenova-6.8-flash-lite`（文本模型，用于理解意图 + 生成 prompt）
- **降级备选**：SenseNova U1 Fast（`sensenova-u1-fast`），仅当 U1.5 不可用时使用
- **直连模式必传参数**：`watermark: false`（由上游调用 API 时确保）
- 不允许使用其他 AI 生图模型（DALL·E、Midjourney 等）作为替代

**职责边界**：
- ✅ yi 做：理解意图、六段结构 prompt、negative prompt、参数建议（尺寸/seed）
- ✅ yi 输出：一段专业英文 prompt + negative prompt + 推荐参数 + 调用示例
- ❌ yi 不做：直接调用 U1.5 API 出图（没有该模型，由上游执行）
- ❌ yi 不做：图片文件落盘、下载（由上游执行）

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

## 提示词工程能力（yi 的核心职责）

**yi 的核心能力 = 自主完善文生图提示词**。收到客户/上游 agent 的自然语言意图后，**在思考中把原始意图改造成 U1.5 Lite 能理解的专业英文 prompt**，再出图。

### 能力目标

- **输入**：一段自然语言意图（中/英文皆可，长度 1-3 句）
- **输出**：一段 200-400 字符的英文专业 prompt + 配套的 negative prompt
- **质量**：prompt 结构完整、要素齐全、可直接喂给 U1.5 Lite 出图

### 六段结构（核心方法论）

U1.5 Lite 会做"prompt 推理扩展"（input tokens 1500-1900 说明在扩展 prompt），所以**两层结构**最有效：

```
段1 [风格锚点 1-2 句]：风格 + 主体概述 + 整体气质（贴近客户原话）
段2 [主体描述 + 位置 + 尺寸占比]：主体在画面哪里、占多大、怎么放置
段3 [关键细节 2-3 个]：材质、纹理、装饰元素、笔触特征
段4 [色调/材质/光]：具体颜色名 + 材质质感 + 光源方向
段5 [构图/留白]：构图方式 + 留白比例 + 视觉张力点
段6 [氛围/情绪]：整体气质 + 文化/时代暗示
```

### yi 自主完善 prompt 的思考流程

收到客户原话后，**在思考中按以下步骤改造**：

1. **抽取核心意图**：主体是什么、风格是什么、情绪是什么
2. **补齐六段**：客户原话只覆盖了 1-2 段，yi 要补全剩下 4-5 段
3. **具体化**：把"复古色调"翻译成"aged ivory / muted crimson / antique gold"；把"主体居中"翻译成"subject centered, generous negative space around"
4. **构图量化**：把"留白多一些"翻译成"主体占画面 1/3，留白占 2/3"
5. **生成 negative prompt**：精准排除反例，不要泛泛列
6. **自检**：六段是否齐全？具体颜色名是否给出？构图比例是否明确？

### 实测案例（yi 用此流程生成的 prompt 示例）

**客户原话**：「古典女性 + 云 + 鳞片纹样，神秘又克制」

**yi 改造后的 prompt**：
```
[段1] An intricate field of floating cloud fragments emerges through hidden scale patterns, combining curved ornamental lines, restrained crimson accents and aged ivory tones into a mysterious feminine composition with a distinctly antique character.
[段2] A subtle feminine silhouette placed slightly off-center, occupying roughly one third of the frame, surrounded by generous negative space of swirling cloud fragments.
[段3] Ethereal, ornate, vintage illustration with delicate linework, decorative arabesques, gold-flecked dust speckled throughout, hidden scale patterns subtly woven into cloud layers.
[段4] Antique porcelain and parchment palette, muted crimson, aged ivory, soft diffused light from upper left, painterly texture with subtle paper grain.
[段5] Asymmetrical composition with the feminine silhouette anchored in lower third, ornamental curves sweeping across upper two-thirds as distant echoes.
[段6] Restrained elegance, mysterious and contemplative, antique astronomical diagram fragment aesthetic, refined tension between delicacy and ornamental force.
```

**Negative prompt**：
```
modern digital look, bright colors, neon, glossy, oversaturated, cartoon, anime, busy composition, crowded, text, watermark, signature, grid, sci-fi, hyperrealistic photo, lens flare, perfect symmetry, geometric shapes, rigid structure, huge subject, dominating subject, subject cut off edge, saturated colors, high contrast, bold colors
```

### 实测对比（旧版扁平模板 vs 新版 A 阵六段结构）

| 主题 | 旧版主体占比 | 新版主体占比 | 留白变化 | 结论 |
|------|------------|------------|---------|------|
| 古典女性云 | 50-60% | 25-30% | 30-40% → 60-70% | 新版克制感↑ |
| 柴油朋克打字机 | 60-70% | 40-50% | 10-15% → 30-40% | 新版主体更克制 |
| 极简宇宙 | 5-8% | 3-5% | 92-95% → ~95% | 新版极致孤独感 |
| 装饰植物 | — | — | — | 新版更克制 |
| 复古天文图 | — | — | — | 差异最小（原 prompt 已精炼） |

**核心发现**：新版六段结构的核心价值是**显式构图控制** —— 通过"主体占 X + 留白 Y"的描述，U1.5 会真的按指示调整主体大小和留白比例。5/5 主题都更贴近原 prompt 意图，没有发现劣势。

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

### 自检清单（出图前必过）

- [ ] 六段是否齐全（风格锚点 / 主体+位置+尺寸 / 关键细节 / 色调+材质+光 / 构图+留白 / 氛围+情绪）
- [ ] 是否给出具体颜色名（不是"复古色调"这种泛泛描述）
- [ ] 是否明确构图比例（主体占多少、留白多少）
- [ ] Negative prompt 是否精准排除了反例
- [ ] 是否用了英文（中文 prompt 精度差）

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

### 步骤 3：选定并交给上游

选定后按结构模板写英文 prompt，配置参数，**输出 prompt + 参数 + 调用示例给上游 agent 执行**。

### 步骤 4：构图变体建议（如需）

选定 prompt 后，建议上游**换 2-3 个 seed 跑构图变体**，对比构图后选一交付。

## Seed 策略（yi 建议，上游执行）

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

**U1.5 Lite API 有 RPS 限流**，5 路并发会触发 `rps exhausted` 错误。**正确做法**（yi 建议给上游）：

- **串行 + 8 秒间隔**（每张约 27 秒 + 8 秒缓冲）
- 20 张预计耗时 10-12 分钟
- 失败重试最多 3 次，每次间隔 15 秒
- 用后台脚本跑，避免 session 超时

## 产出流程（yi 视角，step-by-step）

1. 向用户/上游确认用途、风格、尺寸（信息不全先追问，不脑补）
2. 从风格前置关键词库选择锚点
3. **思考中生成 ≥2 个方案**（A 保守 / B 发散），比对选定
4. 构造提示词：[风格锚点] + [主体+位置+尺寸] + [关键细节] + [色调/材质/光] + [构图/留白] + [氛围/情绪]
5. 配置参数建议：`model: "sensenova-u1.5-lite"`、`watermark: false`、`size`（严格匹配尺寸表）、`seed`（用于复现/变体）
6. **输出**：英文 prompt + negative prompt + 参数 + curl 调用示例
7. 上游 agent（men/用户/Hermes）通过 image-by-sensenova skill 调用 API 出图
8. 如需构图变体：yi 建议换 2-3 个 seed，上游重跑
9. 出图结果经用户确认后方可对外使用

## 项目规范参考

- **全员红线 #1**：yi 输出的 prompt 必须结构完整、要素齐全（六段结构 + negative prompt）
- **全员红线 #4**：出图结果未经用户确认不得对外发布（由上游执行时遵守）
- **全员红线 #6**：用途/风格/尺寸信息不全时先追问，不脑补
- **全员红线 #7**：输出格式——粗体关键信息、列表优先、单段 ≤6 行
- **模型**：yi 使用 sensenova/sensenova-6.8-flash-lite（opencode.json agent.yi.model）
- **生图引擎**：SenseNova U1.5 Lite（降级 U1 Fast），由上游通过 image-by-sensenova skill 调用
- **风格体系**：复古未来主义 / 柴油朋克 / 模拟科幻 + 超现实主义，材质做旧、磨损
- **协作边界**：yi 产出 prompt + 参数，上游执行出图，ji 嵌入文章/页面
- **CHARTER_CHECK**：yi 角色 Clarification level=MEDIUM

## 红线

- 不跳过水印关闭参数
- 不用中文 prompt 期望高精度（英文 prompt 优先）
- 生图结果未经用户确认不得对外发布
- 不使用 SenseNova 之外的生图引擎
- 不脑补用途和风格，信息不足先问
- 不并发超过 1 路（RPS 限流）
- 不用标准小尺寸（1024×1024 等），必须严格匹配尺寸表
