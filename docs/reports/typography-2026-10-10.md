# 站点排版与字体体系改造报告（2026-10-10）

> 范围：`men` 官网（`site/`）
> 三项任务：① 移除首页第一板块的圆环动画 ② 全站统一 OPPO Sans + 代码字体 Hack Nerd Font ③ 全站字号 / 行距 / 字距 / 段距 / 对比度 / 层级比例的实测优化
> 验证方式：新增 `site/scripts/typography-audit.mjs`（浏览器实测计算样式，规则集见脚本内注释），配合既有 `check:source` / `check-site` / `font-audit` / `tiny-text-audit` / `overflow-check` / `heading-size-audit` / `p2-11-verify` / `role-token-verify`

---

## 一、移除首页第一板块的圆环动画

| 项 | 处理 |
|---|---|
| `site/src/components/ParticleGate.astro`（六环彩虹粒子，**新增于当日、未提交**） | 删除 |
| `site/src/components/HeroArt.astro`（圆环容器 + 全宽出血定位） | 删除 |
| `site/src/components/AgentFlow.astro`（被圆环替换后已成 0 引用死代码，855 行） | 删除（git 历史可取回） |
| `index.astro` 的 `.ring-stage` 包裹层、`HeroArt` 引入、`.hero-canvas` 相关样式 | 移除 |
| `BackgroundCanvas.astro` 注释（原写「首页动态视觉由 HeroArt/ParticleGate 提供」） | 更正为「全站不再有任何背景动画」 |
| `docs/design/agent-flow-webgl.md` | 顶部补「已下线」状态说明（保留为设计记录） |

结论：首页首屏不再有动画背景，只剩 `BackgroundCanvas` 的静态点阵底纹与内容本身。

---

## 二、字体统一（OPPO Sans + Hack Nerd Font）

* **正文/标题一律 OPPO Sans**，`--font-serif` 令牌删除，字体栈里 OPPO Sans 之后只保留系统黑体（`PingFang SC / Microsoft YaHei / Noto Sans SC / system-ui / sans-serif`）——全站 0 处 `Georgia / serif` 引用。
  * OPPO Sans 只从**官方 CDN** 引用：其授权条款明确「不对字体进行改编或二次开发」「不向他方提供其他下载渠道」，因此**不得自托管、不得子集化**；官方 CDN 仅提供 Regular(400)/Medium(500) 两档 woff2（各约 744KB，覆盖 ~5000 常用字），600/700 由浏览器合成加粗，故层级以「字号 + 颜色 + 字重 500」为主。
* **代码/等宽字体 = Hack Nerd Font（MIT，可自托管）**：自托管**子集** `site/public/fonts/hack-nerd-font-{regular,bold}.woff2`，各 **75KB**（含拉丁 + 标点/箭头/制表符/电力线共 1125 字形）。
  * mono 栈第 2 位放 OPPO Sans：Hack 无中文字形，代码块里的中文注释因此落在同一族字体上，而不是各平台随机系统字体。
  * 若日后需要完整 Nerd 图标集，重新生成命令写在 `global.css` 字体块注释里（体积会从 75KB 涨到约 640KB/字重，按需取舍）。

字体生效核对（浏览器实测，非推断）：

| 断言 | 实测 |
|---|---|
| 四个字面已加载 | `OPPO Sans 400/500 loaded` · `Hack Nerd Font 400/700 loaded` |
| 字体可用性 | `document.fonts.check('16px "OPPO Sans"')` = true · `('14px "Hack Nerd Font"')` = true |
| 真的在用（同串文字量宽不同） | OPPO Sans 129.12px vs 回退 131.13px · Hack 163.76px vs 回退 152.97px |

---

## 三、排版实测优化（本次的主体）

### 3.1 事实审计（改前 → 改后）

| 指标 | 改前 | 改后 |
|---|---|---|
| 规则集命中总数 | **395 处** | **0 处** |
| 中文字号 < 13px 下限 | 46 处（最小 10.4px，导航 10.5px） | 0 |
| 中文负字距（汉字被挤压） | **154 处**（-0.01 ~ -0.03em，31 个选择器） | 0 |
| 小字对比度不足 | 40 处（最差 2.95:1） | 0（`tiny-text-audit` 342 个小字元素全过） |
| 正文行宽超标 | 最宽 **79 汉字/行**（956–1104px 容器） | 全部 ≤ 40 汉字/行 |
| 段落间距过小 | `step-card__desc` 0.29em | 0.86em |
| 标题层级倒挂 | `docs/index` h2 16px < h3 18px；`about` h1 30px = h2 30px；`index` 同页 h2 两种字号（20 / 35.2） | 每页单调：44/30/18、44/21/18 等 |
| 拓扑图标签**实际**渲染字号 | 桌面 **6.7–10.3px**、手机 **4.25–6.5px**（viewBox 1200 被压到 952/600px） | 桌面 ≥13.3px、手机 ≥12px，无溢出 |

### 3.2 关键判断（为什么这么改）

1. **中文行高比西文高一档**：汉字字身框占满，行距不足会「糊成一块」。正文 1.7→**1.75**，长文（≥100 字）**1.9**，大标题 1.2→**1.3**，区块标题 **1.35**，小标题 **1.4**。
2. **中文禁负字距**：`-0.01em ~ -0.03em` 的标题字距是照搬西文习惯，汉字占满字身框，负值直接挤压笔画。全站改为 **+0.01em**（标题）/ **+0.02em**（小字密集处）。
3. **小字档下限 13px**：原 `--font-size-eyebrow` 12px、`--font-size-eyebrow-nav` 10.5px —— 导航是中文（首页/角色/机制…），10.5px 的汉字属「看不清」级别，且它是全站出现次数最多的小字（62 处）。改为 13px 并保留旧令牌名作别名（不改 40 余处引用）。
4. **字号的模数级数**：`display 40–56 / h1 32–44 / h2 24–30 / h3 21 / h4 18 / h5 16 / body 16 / body-lg 17 / caption 14 / small(=eyebrow) 13`，相邻级比 ≈1.17–1.47，同页不出现后级大于前级。
5. **行宽用 em 不用 ch**：`ch` 按西文「0」宽度算，中文里 1 汉字 ≈ 1em。新增 `--measure-prose: 40em` 专管正文块（p/li/note/引用），**代码块与表格仍可用满宽**（它们有横向滚动/自身布局）。
6. **暖底上的弱化色**：`--color-fg-muted`(#737373) 在暖底 `#f0ebe2` 上只有 3.99:1（小字不达标）→ 暖底处一律换 `--color-fg-tertiary`(6.1:1) 或在暖底卡片上换同色相压暗版 `--role-*-text`（如「团队特性」2.95:1 → `--role-men-text` 4.4:1）。
7. **不用合成斜体**：中文没有真斜体字形，浏览器是剪切变形（糊笔画）。全站 `font-style: italic` 对中文内容一律取消。
8. **SVG 内文字按缩放折算**：拓扑图 viewBox 1200 单位被渲染成 ~1184px（桌面 0.99×）/ 1000px（手机 0.83×），`font-size` 必须乘这个系数才是实际字号。据此把容器放宽到 `--container-max`、`min-width: 1080px`，并把节点小字抬到 13.5px（实际 ≥13.3px），同时缩短过长标签（`si · 思考/知识管理` → `si · 思考`、`fresh-context 语义复核` → `fresh-context 复核`）、放大「兼 Judge」胶囊、窄屏隐藏最密两行。

### 3.3 逐页层级实测（改后）

```
index.html       h1:56  h2:30  h3:18
roles            h1:44  h2:30  h3:18  h4:13
mechanisms       h1:44  h2:30
about            h1:44  h2:30  h3:18
docs/index       h1:44  h2:21  h3:18
docs/*（章节页）  h1:44  h2:21  h3:18
```

---

## 四、验证与回归

| 检查 | 结果 |
|---|---|
| `node scripts/typography-audit.mjs` | **0 命中**（16 页 × 2 视口，1679 条文本元素观测） |
| `npm run check:source`（对比度 / 令牌声称值 / 全规则文本着色 / 动态元素） | 全部 PASS |
| `node scripts/check-site.mjs` | 全部 PASS（16 页产物级检查） |
| `node scripts/tiny-text-audit.mjs` | 342 个小字元素，对比度不合格 **0** |
| `node scripts/overflow-check.mjs` | 7 页 × 3 断点，无横向溢出 |
| `node scripts/heading-size-audit.mjs` | 层级单调，无倒挂 |
| `node scripts/p2-11-verify.mjs` / `role-token-verify.mjs` | PASS（角色标签大文本资格、SVG 令牌无漂移） |
| 视觉复核（截图 + 视觉模型逐张评估） | 首屏 / 文档页 / 拓扑图 / 手机版均确认「文字无重叠、无裁切、无溢出」；据此又修了信息卡行距、目录行距、来源行对比度、拓扑标签密度 |

---

## 五、遗留与取舍（明确记录，非静默忽略）

1. **OPPO Sans 无真 Bold**：官方 CDN 只给 400/500，600/700 是浏览器合成加粗。若日后拿到官方 Bold woff2（受授权限制不可自托管），可再加一个字面。
2. **拓扑图在窄屏仍有 0.83× 缩放**：图本身是 1200 单位的密集矢量图，已在 `min-width: 1080px`（横向可滚动）与「隐藏最密两行」之间取舍；审计脚本对该情形做了**显式例外**并写在规则注释里。
3. **`--letter-spacing-nav` 仍为 0.1em**：中文导航 2 字标签配 0.1em 字距是有意为之的版式选择（非负值，不影响可读性）。
4. **`site/public/fonts/*.woff2`（150KB）入库**：Hack Nerd Font 为 MIT，允许自托管；OPPO Sans 未入库（授权禁止转供下载渠道）。
