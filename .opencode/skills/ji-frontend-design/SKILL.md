---
name: ji-frontend-design
description: "Use when implementing UI in pure HTML/CSS/JS — user asks to build a component, page, layout, or any visual interface. 触发关键词：写组件、实现设计、布局、CSS、dark mode、前端、UI、页面、样式。Don't call when the user wants to write backend code, configure build tools, or work with a framework like React/Vue/Angular without explicit request."
---

# ji-frontend-design — 前端实现规范

当此 skill 激活时，所有 UI 产出必须遵循本规范：纯 HTML/CSS/JS，Token 驱动，无框架锁定，可访问性内置。

## 触发词

- 帮我写一个卡片组件 / 写一个页面
- 实现这个设计 / 还原这个 UI
- 布局在手机上乱了
- 帮我做 dark mode / 暗色模式
- CSS 怎么写更优雅
- 这个间距看起来不对

## 核心原则

1. **禁止框架锁定** — 纯 HTML/CSS/JS，除非任务明确要求 React/Vue/Angular 等框架
2. **Design before code** — 先理解设计意图，再写任何代码
3. **Tokens over magic numbers** — 每个视觉值来自设计 Token；不裸写 `oklch()`、hex、`rgb()` 或硬编码数字
4. **颜色必须用 oklch()** — 颜色 Token 用 `oklch()` 声明，组件 CSS 中用 `var(--ds-*)` 引用
5. **禁止 inline `style=`** — 除非是真正动态的值（如运行时计算的坐标）
6. **WCAG AA 对比度基线** — 所有前景/背景对满足 AA 级对比度
7. **每个颜色 Token 必须有 dark mode 覆盖** — `:root` 声明的每个颜色必须在 `[data-theme="dark"]` 中有覆写
8. **尊重现有代码风格** — 改动前先读现有代码，不擅自引入新范式

## Design Token 结构

### 颜色 Token

```css
/* Light mode (:root) */
--ds-color-bg:         oklch(97% 0.012 80);
--ds-color-surface:    oklch(99% 0.005 80);
--ds-color-border:     oklch(89% 0.012 80);
--ds-color-fg:         oklch(20% 0.02 60);
--ds-color-accent:     oklch(52% 0.08 115);

/* Dark mode ([data-theme="dark"]) — 每个颜色 Token 都必须有覆写 */
[data-theme="dark"] {
  --ds-color-bg:       oklch(15% 0.008 75);
  --ds-color-surface:  oklch(20% 0.008 75);
  --ds-color-border:   oklch(28% 0.01 75);
  --ds-color-fg:       oklch(84% 0.008 72);
  --ds-color-accent:   oklch(57% 0.065 115);
}
```

### 间距 Scale

Base: 4px。`--ds-space-1` (4px) → `--ds-space-32` (128px)。

### 圆角 Scale

sm: 2px · md: 4px · lg: 8px · xl: 12px · 2xl: 16px

### 字号 Scale

caption .75rem · body 1rem · h4 1.5rem · h3 1.875rem · h2 2.25rem · h1 3rem

## 组件模式

### Button

```html
<button class="ds-btn ds-btn--primary" type="button">
  <span class="ds-btn__label">Label</span>
</button>
```

Icon-only button 必须有 `aria-label`。

### Card

Base class + modifier pattern。禁止嵌套 modifier 链（如 `.parent .child--active`）。

### Stack / Cluster 布局

使用布局辅助类。禁止用 ad-hoc margin trick。

## 不要触发

- 用户要求用 React/Vue/Angular 写组件（除非明确要求纯 HTML/CSS/JS）
- 用户要求写后端 API 或数据库操作
- 用户要求配置 webpack/vite/esbuild 等构建工具
- 用户要求进行视觉设计决策（由 yi 负责，非 ji）
- 用户要求进行设计 Token 定义（由 yi 负责）

## 工作流（step-by-step）

1. 读取设计依据（设计稿/Token 定义/现有代码）
2. 确认 Token 可用性（查 `--ds-*` 变量，不存在则报告缺失）
3. 选择组件模式（Button/Card/Stack 等）
4. 编写 HTML 结构（语义化，aria 属性完整）
5. 编写 CSS（仅用 Token，无 bare value）
6. 添加 dark mode 覆盖（`[data-theme="dark"]` 块）
7. 执行 Pre-Commit Checklist
8. 落盘并验证文件存在

## 可访问性检查

- 每个交互元素有可感知名称（`<button>` 有文本或 `aria-label`）
- 图片有 `alt` 文本（装饰图用空字符串 `alt=""`）
- 语义化 HTML（不用 `<div>` 代替 `<button>` / `<a>`）
- 键盘可操作（tab 顺序正确，focus 可见）
- 颜色对比度满足 WCAG AA（正文 ≥4.5:1，大文本 ≥3:1）

## Dark Mode 规则

- 禁止使用纯黑 `#000` — 使用暖灰 `oklch(15% 0.008 75)`
- Dark mode accent 比 light mode 亮约 5-10%
- 每个 `:root` 声明的颜色 Token 必须在 `[data-theme="dark"]` 中有覆写

## Anti-Patterns

| 错误 | 正确 |
|------|------|
| `color: oklch(52% 0.08 115)` | `color: var(--ds-color-accent)` |
| `padding: 16px` | `padding: var(--ds-space-4)` |
| `background: #fff` | `background: var(--ds-color-surface)` |
| `<button>icon</button>` | `<button aria-label="提交表单">icon</button>` |
| `<div style="color: #fff">` | class + CSS Token |
| 无 `[data-theme="dark"]` 覆写 | 每个颜色 Token 都有 dark 覆写 |
| 直接用 `<a>` 包裹 `<button>` | 语义正确：`<button>` 做动作，`<a>` 做导航 |

## Pre-Commit Checklist

完成 UI 任务后逐条核对：

- [ ] 所有颜色使用 `var(--ds-*)` Token，组件 CSS 无 bare oklch/hex/rgb
- [ ] 所有间距使用 `--ds-space-*` Token，无 magic number
- [ ] 每个颜色 Token 都有 `[data-theme="dark"]` 覆写
- [ ] Icon-only button 有 `aria-label`
- [ ] 图片有 `alt` 文本
- [ ] 语义化 HTML（无 `<a>` 缺少 href 的奇怪用法）
- [ ] 无 `inline style=`（动态值除外）
- [ ] 组件在 375px 宽度下可用（响应式）
- [ ] 审美质量：间距节奏、字号层级、色彩和谐已检查
- [ ] 组件可在无 JS 下基本工作（渐进增强）
