---
name: yi-design
description: "Use when making visual design decisions — color palettes, typography, spacing, layout structure, design token definitions, or UI/UX design. 触发关键词：配色、版式、设计、Token、视觉、UI 设计、样式规范、设计决策、色彩、字体。Don't call when the task is implementing code from design specs (use ji), or when the task is generating images (use yi-imagegen)."
---

# yi-design — 视觉设计规范

本技能是 yi（艺）在产出视觉设计方案时的操作手册。所有视觉决策必须落盘为可审查的设计文档（.md / .json），Token 定义交由 ji 落成 CSS 变量。

## 不要触发

- 用户要求根据设计稿写组件代码（由 ji 负责）
- 用户要求生成 AI 图片/插画（用 yi-imagegen）
- 用户要求进行代码审查（由 chi 负责）
- 用户要求进行内容写作（由 si 负责）

## 设计工作流（step-by-step）

1. 需求理解：用户需要什么视觉产出？（配色方案/组件样式/整页布局/Logo）
2. 风格分析：属于风格体系哪一类（复古未来主义/柴油朋克/模拟科幻/超现实主义）
3. 查阅审美体系 Kami（暖米纸 `#F5F4ED` / 油墨蓝 `#1B365D`）
4. 定义 Design Token（颜色/间距/字号/圆角/阴影/动效）
5. 确保每个颜色 Token 有 dark mode override
6. 验证 WCAG AA 对比度
7. 产出设计决策文档（.md 文件）
8. 交付 ji 的备注（哪些 Token 需要实现）

## 风格体系

**复古未来主义 / 柴油朋克 / 模拟科幻** + **超现实主义**。
- 材质倾向做旧、磨损、氧化质感
- 参考 EDIC 设计系统的克制美学：衬线标题 + 无衬线正文、暖纸背景、审慎配色
- 避免霓虹荧光、赛博朋克高饱和、糖果色

## 审美体系 Kami

| 属性 | 值 | 用途 |
|------|------|------|
| 暖米纸 | `#F5F4ED` | 正文背景基底 |
| 油墨蓝 | `#1B365D` | 主色、标题、强调 |
| 字体基调 | 衬线体 | 标题；正文档用无衬线 |
| 圆角 | 8pt | 核心圆角，组件统一 |

## Design Token 规范

### 颜色

- 所有颜色用 `oklch()` 经 CSS 变量声明，**禁止在组件规则中裸用** `oklch()` / `#hex` / `rgb()` / `hsl()`
- 颜色变量命名统一前缀 `--ds-color-*` 或 `--ds-*`
- 推荐 oklch 参数参考 EDIC 体系：
  - 暖米纸：`oklch(97% 0.012 80)`（近似 `#F5F4ED`）
  - 油墨蓝：`oklch(25% 0.09 235)`（近似 `#1B365D`）
- 语义颜色（success / warning / error / info）各声明 `--bg` tint
- **每个颜色 Token 在 `:root` 声明后，必须在 `[data-theme="dark"]` 中提供对应 override**
- Dark mode 背景禁止纯黑 `#000`，使用暖灰 `oklch(15% 0.008 75)`
- Dark mode 强调色比 light mode 提亮约 5–10%

### 字号 / 间距 / 圆角 / 阴影

- 字号、间距、阴影、圆角全部走 Token，**零容忍 magic number**
- 4px 基线间距系统（`--ds-space-1..32` = 4→128px）
- 圆角：sm 2 · md 4 · **lg 8**（核心）· xl 12 · 2xl 16 · full
- 字体 scale：body 1 · h4 1.5 · h3 1.875 · h2 2.25 · h1 3（rem）
- 阴影层：`--ds-shadow-xs..2xl`
- 动效 duration：`--ds-duration-150..500`；ease `cubic-bezier(.16,1,.3,1)`；始终尊重 `prefers-reduced-motion: reduce`

### 对比度

- **WCAG AA 基线必达**：正文与背景 ≥ 4.5:1，大文本（≥18pt）≥ 3:1
- 产出设计决策时附带对比度说明

## 产出物格式

每次设计决策落盘为一个文档，包含：

1. **决策摘要**：本次设计解决什么问题
2. **Token 清单**：新增/修改的 CSS 变量（含 light + dark 值）
3. **使用规则**：何时用哪个 Token，禁止搭配
4. **可访问性验证**：对比度、语义标签、键盘可达
5. **交付 ji 的备注**：哪些 Token 需要 ji 在组件规则中引用

### 设计决策文档示例

```markdown
# 设计决策：首页配色方案

## 决策摘要
解决首页背景色与主色对比度不足的问题。

## Token 清单
| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| --ds-color-bg | oklch(97% 0.012 80) | oklch(15% 0.008 75) | 页面背景 |
| --ds-color-fg | oklch(20% 0.02 60) | oklch(84% 0.008 72) | 正文文本 |

## 使用规则
--ds-color-bg 仅用于 body 背景，不用于卡片表面。

## 对比度验证
正文/背景 = 14.2:1（AA 通过）

## 交付 ji 的备注
ji 需在 :root 和 [data-theme="dark"] 中声明以上两个 Token。
```

## 协作边界

- **yi 产出**：Token 定义、设计决策文档、审美分析
- **ji 执行**：组件 CSS、布局实现（yi 不直接写组件 CSS）
- **chi 评审**：接受 chi 对设计质量的机械审查

## 设计红线（执行时必须遵守）

1. 视觉决策必须有设计依据 — 颜色、间距、字重每一项都说出为什么
2. 所有颜色用 `oklch()` 经 Tokens 声明 — 禁止 bare 颜色值出现在组件规则
3. 每个颜色 Token 必有 dark mode override
4. WCAG AA 对比度基线必达
5. 不直接写组件 CSS（由 ji 执行）
6. 裸值零容忍 — 间距、字号、阴影全部走 Token
