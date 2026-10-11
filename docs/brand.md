# men 品牌规范

> 本文记录**已定**的品牌资产：标识造型、配色令牌、对比度基准。
> 令牌的**唯一真相源**是 `site/src/styles/global.css` 的 `:root`，本文只做索引与依据说明。

## 一、标识（men 标识 v1）

**造型**：有机环 + 中心负形孔。

- 曲线逐点取自设计稿，**未修改任何控制点**
- **正负形**：单条复合路径 + `fill-rule="evenodd"`。孔是**真空**而非叠色，
  因此换任何底色都不会破——这是它比"深色形状上叠一个背景色圆"更稳的原因
- **几何**：外半宽 = 孔半径 × φ²  ⇒  `50 = R × 2.618034`

### 孔径随尺寸切换（同一个 φ 关系，方向相反）

| 适用尺寸 | 孔径 | 值 |
|---------|------|-----|
| ≥ 48 px | 主孔 `R` | `19.0983` |
| < 48 px | 小孔 `R / φ` | `11.8034` |

**为什么必须切换**：下方凹口离孔边只剩 **2.25 单位**实体。用主孔时，22 px 下这处会缩到
约 0.5 px 而断开；换成 `R / φ` 后最薄处回到 **9.54 单位**，小尺寸才不断线。

### 落地文件

| 文件 | 用法 |
|------|------|
| `site/public/favicon.svg` | 固定用小孔（favicon 恒为小尺寸） |
| `site/src/components/GateLogo.astro` | 按 `size` 自动切换主孔/小孔；用于 Header（22px）、Footer、首页 |

## 二、配色令牌

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--color-bg` | `#faf9f5` | 页面底色 · 暖纸 |
| `--color-bg-paper` | `#f5f0e8` | 纸感底色（次级面板） |
| `--color-bg-warm` | `#efe8db` | 暖调面板（hero 区域） |
| `--color-fg` | `#2b2a27` | 正文 / 标题 · **暖墨褐（非纯黑）** |
| `--color-fg-secondary` | `#4a4741` | 次文本 |
| `--color-fg-tertiary` | `#5e5d59` | 三文本 |
| `--color-accent` | `#d77656` | 主强调 · **赤陶** · 图形 / 边框 / 大字号 |
| `--color-accent-dark` | `#8f3d28` | 小字安全强调 |
| `--color-accent-soft` | `#bc513a` | 中等强度 · 文字 / 边框 / hover |
| `--color-line` | `#e6dfd8` | 标准边框 |
| `--color-line-strong` | `#c9bfb0` | 加强边框（hover / focus） |
| `--color-line-ui` | `#847a6d` | UI 控件边界（WCAG 2.2 §1.4.11 ≥ 3:1） |

**用色规则**：`--color-accent` 只用于图形与装饰（纸底 3.01:1，过图形阈值 3:1）；
凡**承载文字**的赤陶填充一律用 `--color-accent-soft`（4.55:1）或 `--color-accent-dark`（6.96:1）。

## 三、对比度基准

两个基准面：**纸底 `#faf9f5`** 与 **暖底 `#f5f0e8`**。

- 前景五级梯度中的前 4 级，在两个基准面上都实测 ≥ 4.5:1
- `--color-fg-decorative`（`#8a877e`）为 3.17–3.41:1，**仅装饰性大写小字**，禁用于正文
- 角色色（`--role-*`）亮色仅够大文本 3:1；小字文本一律用 `--role-*-text` 深色变体

**验证命令**（零依赖、不开浏览器、可进 CI）：

```bash
cd site && npm run check:source
# = contrast-check（令牌级颜色对）
# + token-ratio-check（令牌注释声称值 vs 实测）
# + text-contrast-audit（全规则文本着色扫描）
# + dynamic-el-audit（JS 动态元素 :global 覆盖）
```

改动 `global.css` 或页面样式后**必须先跑通它再提交**。
