# Web 质量审查报告 — men 站点（2026-09-19）

> **审查对象**：`@cgartlab/men` v0.5.0 文档站（`site/`，Astro 7.2.9，静态输出）
> **代码基数**：`site/src` 共 31 个源文件（14 `.astro` 页面 + 13 `.astro` 组件 + `global.css` 1340 行 + 3 数据文件）；构建产物 14 页 / 21 个文件
> **审查方式**：产物级机械检查为主（不启动常驻服务器，遵守 `AGENTS.md` 进程红线），源码 `file:line` 定位为辅
> **轮次**：R12 / 维度：交互态（七态 · 触控目标 · alt 与宽高预留 · 缩放）（Lite 单维度循环第 12 项，序列完结）
> **日期**：2026-09-19

---

## 0. 页面清单与抽样规则

### 0.1 全部 14 个路由

| 路由 | 源文件 | 分类 |
|------|--------|------|
| `/` | `site/src/pages/index.astro` | 首页 |
| `/roles` | `site/src/pages/roles.astro` | 列表（6 角色卡片） |
| `/mechanisms` | `site/src/pages/mechanisms.astro` | 列表（机制） |
| `/about` | `site/src/pages/about.astro` | 详情 |
| `/docs` | `site/src/pages/docs/index.astro` | 列表（手册目录，9 章） |
| `/docs/overview` | `site/src/pages/docs/overview.astro` | 详情 |
| `/docs/install` | `site/src/pages/docs/install.astro` | 详情 |
| `/docs/configure` | `site/src/pages/docs/configure.astro` | 详情 |
| `/docs/quickstart` | `site/src/pages/docs/quickstart.astro` | 详情（信息框 + 代码块 + 目录） |
| `/docs/agents` | `site/src/pages/docs/agents.astro` | 详情 |
| `/docs/protocols` | `site/src/pages/docs/protocols.astro` | 详情 |
| `/docs/architecture` | `site/src/pages/docs/architecture.astro` | 详情 |
| `/docs/governance` | `site/src/pages/docs/governance.astro` | 详情 |
| `/docs/releases` | `site/src/pages/docs/releases.astro` | 列表（版本历史） |

### 0.2 抽样规则（14 页 > 5，按「每类取一」）

| 类别 | 抽样页 | 理由 |
|------|--------|------|
| 首页 | `/` | 唯一首页 |
| 列表 | `/docs` | 手册目录，9 章侧栏导航，断链风险最高 |
| 详情 | `/docs/quickstart` | 信息框 + 6 节 + 目录 + 代码块，结构最复杂 |
| 表单 | **无此类别** | 全站点 grep `<form`/`<input`/`<select`/`<textarea` = **0 命中** |
| 404 | **无自定义 404** | `site/src/pages/404.astro` 不存在，走 Astro 默认 |

截图断点：`375`（移动）/ `768`（平板）/ `1440`（桌面）× 明暗主题。

---

## 1. 机械门禁（①）

| 门禁 | 命令 | 退出码 | 结果 |
|------|------|--------|------|
| build | `npm run build`（`site/`） | **0** | 15 page(s) built（R8 补 404 页后由 14 → 15） |
| check-site | `node site/scripts/check-site.mjs` | **0** | UTF-8 / charset / mojibake / base 守卫 / 空 slot / 路由锚点 全通过 |
| test | `node --test` | **0** | 149/149 pass |
| verify | `node scripts/verify.mjs men` | **0** | PASS=9 FAIL=0 WARN=0 |
| audit | `npm audit --audit-level=high` | **0** | 0 vulnerabilities（**R13 重跑确认**：R10/R11 因 npm registry 503 判为 UNKNOWN，R13 registry 恢复后通过，已覆盖新增的 `playwright` devDependency） |
| **lint** | — | — | ⚠️ **缺口**：`package.json` 无 `lint` 脚本，无 `.eslintrc*` / `eslint.config.*` / `biome.json` |
| **typecheck** | — | — | ⚠️ **缺口**：`site/tsconfig.json` 存在（`extends: astro/tsconfigs/strict`），但三个 `package.json` 均无 `typescript` 依赖、无 `tsc` 脚本 |

---

## 2. 自动审查（②）

| 子项 | 工具 | 状态 | 说明 |
|------|------|------|------|
| **断链** | `tmp/link-check.mjs`（自研，纯 Node 零依赖，产物级） | ✅ **已跑** | 内链 292 / 外链 134 / 纯锚点 164；**断链 0 / 锚点缺失 0 / src 缺失 0**；`target=_blank` 缺 `noopener` = 0 |
| **空实现** | `tmp/empty-check.mjs` + `tmp/empty-check2.mjs`（自研，产物级 + 源码扫描） | ✅ **已跑** | `<a>` 462 个：无 href 0 / `href="#"` 0 / `href=""` 0 / `javascript:` 0；`<button>` 12 个全部有处理器；skip-link **14/14 页**且全部指向 `id="main-content"` |
| 可访问性（axe / pa11y） | — | ⚠️ **缺口** | 无 axe-core / pa11y / @axe-core/cli 依赖；新增需经确认 |
| HTML 合法性 | `check-site.mjs`（部分） | ⚠️ **部分** | 仅校验 UTF-8 / charset / mojibake / 空 slot，无标签闭合与结构校验 |
| 样式规则 | — | ⚠️ **缺口** | 无 stylelint |

> **断链工具说明**：站点大量使用 Astro 的 `href={expr}` 表达式语法（模板串、`base +` 拼接、组件 props 透传），静态扫描源码会漏检。工具改为以 **`dist/` 渲染产物**为链接真值来源，再回源码 grep 定位 `file:line`。
> 关键设计：解析规则覆盖 `/x → dist/x/index.html` 与 `/x.html` 两种 Astro 静态输出形态；带 `#fragment` 的内链额外校验目标 HTML 中是否存在同名 `id`/`name`。

---

## 3. 视觉留档（③）

**状态：已完成（R13 · 用户确认 `npm i -D playwright` 后执行）**

R1–R12 期间本节为 UNKNOWN，缺浏览器自动化依赖。R13 用户确认安装 Playwright 后，以**进程内 http server**（`finally` 中 `close()`，不 spawn 子进程、无常驻服务、避开 AGENTS.md 规定的 4399 端口，实测用 4891/4892/4893/4895，全部已释放）渲染 `site/dist` 产物并全页截图。脚本：`site/scripts/shot.mjs`（自写，单文件，零常驻进程）。

**抽样规则**（写入报告 §0.2）：4 类页面 × 3 断点 = 12 张。

| 截图文件 | 页面类型 | 路由 | 断点 | 体积 | 文档高度 | 横向溢出 |
|---|---|---|---|---|---|---|
| `docs/reports/screenshots/home-375.png` | 首页 | `/` | 375×667 | 359 KB | 4990 | 0 |
| `docs/reports/screenshots/home-768.png` | 首页 | `/` | 768×1024 | 648 KB | 4276 | 0 |
| `docs/reports/screenshots/home-1440.png` | 首页 | `/` | 1440×900 | 940 KB | 4212 | 0 |
| `docs/reports/screenshots/roles-375.png` | 列表 | `/roles` | 375×667 | 503 KB | 14419 | 0 |
| `docs/reports/screenshots/roles-768.png` | 列表 | `/roles` | 768×1024 | 780 KB | 9599 | 0 |
| `docs/reports/screenshots/roles-1440.png` | 列表 | `/roles` | 1440×900 | 1037 KB | 8184 | 0 |
| `docs/reports/screenshots/quickstart-375.png` | 详情 | `/docs/quickstart` | 375×667 | 601 KB | 7093 | 0 |
| `docs/reports/screenshots/quickstart-768.png` | 详情 | `/docs/quickstart` | 768×1024 | 818 KB | 4767 | 0 |
| `docs/reports/screenshots/quickstart-1440.png` | 详情 | `/docs/quickstart` | 1440×900 | 1082 KB | 4206 | 0 |
| `docs/reports/screenshots/error404-375.png` | 404 | `/404` | 375×667 | 156 KB | 1296 | 0 |
| `docs/reports/screenshots/error404-768.png` | 404 | `/404` | 768×1024 | 375 KB | 1024 | 0 |
| `docs/reports/screenshots/error404-1440.png` | 404 | `/404` | 1440×900 | 600 KB | 1035 | 0 |

合计 **7891 KB / 12 张**，采集耗时 19.9 s（≤60 s 上限）。

**采集期自动度量（全部 12 张）**：

| 度量项 | 结果 |
|---|---|
| 横向溢出（`scrollWidth > clientWidth`，长文本破版信号） | **0 / 12** |
| 浏览器控制台 `error` | **0** |
| 失败请求（`requestfailed`） | **0** |
| 字体加载状态（`document.fonts.status`） | **`loaded`**（OPPO Sans woff2 全部到位，R9 P2-7 的 `preconnect`+`preload` 生效） |
| 正文字号（body 计算值） | 375px 下 15px / 768px 与 1440px 下 16px |
| 行高（body 计算值） | 25.5–27.2px（正文 1.7–1.72，落在 1.4–1.7 区间上沿） |

**视觉审计副产物**：截图过程中以 `tiny-text-audit.mjs` 对所有 `<16px` 文本元素实测「计算色 + 向上解析的真实背景色 + WCAG 相对亮度」，并把 `font-audit.mjs` 用于字号分布、`heading-size-audit.mjs` 用于标题尺寸。三条脚本各自起进程内 server、`finally` 关闭，端口 4892/4893/4895 均已确认释放。

**该轮修复 3 项 WCAG AA 违规**（详见 §5 P2-3 / P2-10）：小字号对比度不合格从 **21 处降至 6 处**；剩余 6 处为角色色，需设计决策（§5 P2-11）。另发现 1 项标题尺寸失效（§5 P2-12）与 3 项 P3。

### 3.1 R3 补充：明暗维度塌缩（主题不存在）

R3 审查令牌时发现**站点为单主题（仅浅色）**：无 `@media (prefers-color-scheme: dark)`、无 `data-theme` / `.dark` 选择器、`html { color-scheme: light }` 被显式钉死、`--color-accent` 全仓库仅 1 处定义（详见 §5 P3-5）。

- 抽样计划的 `375/768/1440 × 明暗` 因此**塌缩为仅「明」一维**，共 3 张/页而非 6 张/页。R13 已按塌缩后的 12 张执行。
- 所有 `*-dark.png` 标注为 **N/A（主题不存在）**，区别于「工具缺失导致的 UNKNOWN」。此点已复核实证：`grep -r prefers-color-scheme site/src` = 0 命中，`color-scheme: light` 见 `global.css:36`。
- 明暗塌缩为设计现状而非工具缺失，故 ③ 本节按「已完成」结案。

### 3.2 R14 补充：核心网页指标实测（lab · Chromium 153.0.8010.12）

R9 只能做静态风险分析（识别 LCP 候选与阻塞资源、CLS 风险因子、INP 风险因子），**实际 ms 值标 UNKNOWN**（当时无浏览器引擎，无 grep 替代路径）。R13 安装 Playwright 后本轮实测。脚本：`site/scripts/cwv-measure.mjs`（进程内 http server，`finally` 关闭，端口 4896 已确认释放，未 spawn 子进程）。

**可实测项**（4 页 × 3 断点 = 12 组合，每组合 2 次取中位，采集窗口 `load` + 900ms）：

| 页面 | 断点 | FCP | DOM ready | load | 资源体积 | 资源数 | 点击延迟 | 最大资源（名称 · 体积 · 耗时） |
|------|------|-----|-----------|------|---------|--------|---------|------------------------------|
| home | 375 | 196ms ✓ | 178ms | 479ms | 59 KB | 4 | 1ms | `BaseLayout.kcFU6Rad.css` · 33 KB · 5ms |
| home | 768 | 206ms ✓ | 171ms | 498ms | 59 KB | 4 | 1ms | `BaseLayout.kcFU6Rad.css` · 33 KB · 5ms |
| home | 1440 | 206ms ✓ | 166ms | 497ms | 59 KB | 4 | 1ms | `BaseLayout.kcFU6Rad.css` · 33 KB · 5ms |
| roles | 375 | 148ms ✓ | 135ms | **730ms** | 49 KB | 4 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 5ms |
| roles | 768 | 152ms ✓ | 130ms | 532ms | 49 KB | 4 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 4ms |
| roles | 1440 | 162ms ✓ | 129ms | 661ms | 49 KB | 4 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 4ms |
| quickstart | 375 | 132ms ✓ | 108ms | 617ms | 33 KB | 3 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 7ms |
| quickstart | 768 | 140ms ✓ | 108ms | 509ms | 33 KB | 3 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 5ms |
| quickstart | 1440 | 154ms ✓ | 101ms | 525ms | 33 KB | 3 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 4ms |
| error404 | 375 | 134ms ✓ | 61ms | 460ms | 33 KB | 3 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 4ms |
| error404 | 768 | 146ms ✓ | 65ms | 487ms | 33 KB | 3 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 5ms |
| error404 | 1440 | 154ms ✓ | 60ms | 491ms | 33 KB | 3 | — | `BaseLayout.kcFU6Rad.css` · 33 KB · 4ms |

汇总：**12 组合 · FCP 最差 206ms**（阈值 1800ms，全部达标）· DOM ready 最差 178ms · load 最差 730ms · 首屏资源体积 **33–59 KB** · 单资源最大 33 KB（渲染阻塞 CSS，加载 4–7ms）· 点击响应延迟 **1ms**（`first-input` 条目，仅 home 页视口内有按钮，其余页无可见按钮故记 `—`）。

**结论**：R9 识别的 LCP/CLS 风险因子在实测下未构成瓶颈 —— FCP 与点击延迟均远离阈值。R9 已修的 P2-7（字体 `preconnect`+`preload`）生效：字体来自外部 CDN（`code.oppo.com`，实测可达 157ms），且未出现在前 3 大资源中（前 3 均为本地 CSS/HTML）。

#### UNKNOWN 项（LCP / CLS / INP）与证据

| 指标 | 目标 | 结果 |
|------|------|------|
| LCP | ≤ 2500ms | **UNKNOWN** |
| CLS | ≤ 0.1 | **UNKNOWN** |
| INP | ≤ 200ms | **UNKNOWN** |

**缺什么**：headless Chromium 153.0.8010.12 不产出 `largest-contentful-paint` / `layout-shift` / `interaction-contentful-paint` 三类 performance 条目。

**已排除脚本缺陷（命令输出）**：

```
首页 375  docVis=visible  visibility-state 条目=[null]
          LCP条目=0  layout-shift条目=0  interaction-contentful-paint条目=0
PerformanceObserver 注册：无异常（supportedEntryTypes 含 largest-contentful-paint /
  layout-shift / interaction-contentful-paint 全部三类）
启动模式对比（4 种，结果一致）：默认 headless · headless:true · --headless=new ·
  +--enable-features=PaintTimingAfterNavigationCommit
反证：不受影响的 FCP（paint 条目）正常产出（132–206ms）；first-input 条目正常产出
  （说明输入被记录），但 interaction-contentful-paint 不产出 —— 差异点在
  「是否进入合成器绘制路径」而非「是否可见」。
```

**判读**：`document.visibilityState` 实测为 `"visible"`，但 `visibility-state` 性能条目的 `state` 为 `null`，三者条目计数均为 0。根因**未完全隔离**（指向 headless 合成器行为，headed 模式可复现但本环境无显示设备），故不写死机制结论。

**替代路径**：接 `npx lighthouse`（自带可见性仿真）或真机 CrUX 数据。本轮未安装新依赖（受「不新增依赖未经确认」约束），故留 UNKNOWN。R9 的静态风险因子分析结论不变。

---

## 4. 六簇覆盖（④）

| 簇 | 已检查范围 | 结论 |
|----|-----------|------|
| 功能稳定 | 断链 / 锚点 / src 可达性（`tmp/link-check.mjs`）+ 空实现 / skip-link / 空跳模式（`tmp/empty-check*.mjs`），产物 14 页全量扫描 | ✅ **断链 0 / 锚点缺失 0 / src 缺失 0 / 空实现 0**（修复前 2 处锚点缺失，见 §5 P1-1）。查了什么：`<a>` 462 个的 href 形态、12 个 `<button>` 的处理器接线、`<form>`/`<input>`/`<select>` 存在性（0 个）、`window.open('')` / `location.href='#'` / `void(0)` / `alert()` 占位、`TODO`/`FIXME` 标记（7 命中全为误报）。表单防重复提交与 error boundary：**不适用**（站点无表单、无客户端路由） |
| 功能稳定 · 错误容错 | `tmp/error-check.mjs`（产物 + 源码双扫）：404 页存在性（源码与产物）、空 `catch{}` / 空 `.catch` 回调静默吞错、错误文案是否含修法指引、`<form>` 存在性、`try`/`catch` 配对、客户端水合与 Error Boundary、空态文案 | ⚠️ **2 项 P2 已修**（§5 P2-5 空 catch 静默吞错、P2-6 无 404 页）。404 页已补（`site/src/pages/404.astro` → 产物 `dist/404.html` 9209 字节，含 h1 / 回站入口 / skip-link）；页面数 14 → 15。**表单防重复提交不适用**（`<form>` 0 个）；**error boundary 不适用**（纯静态 SSR，无 `astro:*` 客户端水合、无客户端路由，构建期错误在 `npm run build` 阶段暴露）；**空态不适用**（文档/角色/机制均为静态数据页，无运行时数据加载）。另更正 R2 记录：copy 按钮实际 **3 个**（`index.astro:158,172,187`），R2 误记为 7 |
| 功能稳定 · 核心网页指标 | R9 `tmp/cwv-check.mjs`（静态风险因子）+ **R14 `site/scripts/cwv-measure.mjs`（lab 实测，12 组合）**：LCP 候选与阻塞资源、CLS 风险因子（无宽高图片 / `font-display` / `100vh`）、INP 风险因子（内联 JS 体积 / rAF / `will-change`）、资源总体积、`preconnect`/`preload`/`modulepreload`/`fetchpriority` 存在性 | ⚠️ **1 项 P2 已修**（§5 P2-7 外部字体 1.47 MB 无 `preconnect`/`preload`）+ 2 项 P3 记录（P3-15 `font-display: swap` 回流、P3-16 单字体 744 KB）。**R14 实测（§3.2）**：FCP **132–206ms**（阈值 1800ms，12/12 达标）、DOM ready 60–178ms、load 460–730ms、首屏资源 33–59 KB、单资源最大 33 KB（渲染阻塞 CSS，4–7ms）、点击延迟 1ms —— **静态风险因子在实测下未构成瓶颈**。**LCP / CLS / INP 值仍 UNKNOWN**：headless Chromium 不产出这三类 performance 条目（4 种启动模式结果一致，PerformanceObserver 注册无异常，不受影响的 FCP 与 first-input 正常产出，根因未完全隔离）。查了什么：`<img>` 0 个、`<canvas>` 1 个、渲染阻塞 CSS 1 个/页、`<head>` 内 `<script>` 0 个（无渲染阻塞 JS）、`100vh` 0 处（无移动端地址栏 CLS）、内联 JS 15 页共 11.3 KB（单页最大 6.7 KB）、`requestAnimationFrame` 16 处、`will-change` 1 处、站点自产资源合计 472.3 KB |
| 样式代码 | `!important` 全量（源码 18 → 产物 10）+ 内联 `style=` 17 处逐条人工判读 + `--color-accent` 令牌定义唯一性 + 双主题令牌存在性 | ✅ 4 项缺陷已修复（§5 P3-1～P3-4）。内联 17 处中 13 处合法（CSS 变量注入逐项动态值：`--delay` / `--wave-delay` / `--card-accent: ${a.color}` / `--sd` / `--dur` / `opacity`，均由循环或数据驱动，无法静态提取为类）。产物 `!important` 10 处**全部位于 `@media (prefers-reduced-motion: reduce)`**，属该场景的正当用法。**新发现：站点为单主题（仅浅色）** → P3-5 |
| 样式代码 · 裸色值 | `tmp/color-check.mjs` 全量分类（BARE / SVG_ATTR / TOKEN_DEF 三类）+ 令牌定义块 `global.css:107-145` 对照 | 源码 166 个色值 → BARE 116 + SVG_ATTR 8 + TOKEN_DEF 31（**令牌定义按规则不报**）；剔除 5 处误报（1 处注释 `BackgroundCanvas.astro:5`、4 处 issue 编号 `releases.astro:144/147/148/149`）后 **119 处属可报告语境**。其中 **10 处主强调色 `#e85d04` 绕过令牌已修复**（P3-7）、**1 处 canvas 兜底值与令牌不符已修复**（P3-6）；**R15 已修 P3-8**：新增 6 个 `--role-*` 令牌建立单一真相源，角色色字面量 **36 处 → 5 处**（全部落在令牌定义块，`index.astro` 残留 0），`role-token-verify.mjs` 27 项断言全过证明零视觉漂移。残留 108 处终端 chrome 配色与 macOS 红绿灯为刻意独立的视觉语言，本轮不改造 |
| 信息排版 · 标题层级 | `tmp/heading-check.mjs` + `tmp/heading-check2.mjs`（产物级 14 页全量）：h1 唯一性、逐级差 ≤1、空标题、标题嵌套、`nav`/`aside` 内 h-tag 误用、标题文本长度 + `heading-size-audit.mjs` 渲染尺寸 | ✅ **DOM 语义完全合规，0 缺陷**（14/14 页各恰好 1 个 h1；跳级 0；空标题 0；嵌套 0）。**渲染尺寸 P2-12 R18 已修**：`--font-size-h5` 令牌原未定义导致 4 处标题退化至继承值（h3→16px=正文字号、infobox 标题→14px=caption），R18 定义 `1rem` 后 3/4 处零变化、1 处 14px→16px 修正 |
| 信息排版 · 对比度 | `tmp/contrast-check.mjs` + `tmp/contrast-fix.mjs`：以 WCAG 相对亮度公式实算全部色令牌，与 `global.css:106-153` 令牌定义逐一对照，并与 `--color-bg` / `--color-surface` / `--color-surface-warm` / `--color-bg-warm` / `--color-accent-tint` / `--color-code-bg` / `--color-meta` 七个背景构成矩阵；再 grep 出 `color: var(--color-*)` 的 94 处文本用法，逐个判定字号与大文本资格（≥24px 或 ≥18.66px 粗体） | ⚠️ **3 项 P2 AA 违规已修**（§5 P2-1 / P2-2 / P2-3，共 15 处；P2-3 由 R13 用真实背景解析定位到 3 个选择器后修复）；**1 项 P2 已修**（P2-10 主强调色底硬编码白字，R13）；**1 项 P2 待设计决策**（P2-11 六个角色色 14px 正文不达 4.5:1，但全部 ≥3:1，可经大文本资格达标）；4 项 P3（P3-10 死令牌 ×2、P3-11 死 CSS、P3-12 令牌注释声称值失准）+ R13 新增 P3-20（注释失准最大案例 3.14）、P3-21（死令牌再 +2）、P3-22（规则重复 ×3）。小字号对比度不合格总数：**21 → 6**（R13 实测）。**R16 已修 P3-12/P3-20**：11 处声称值 8 失准已全部改为实算值，L114 错误组注释已拆分修正，新增 `token-ratio-check.mjs` 防回归（修复中抓到自身一处 #fafafa→#f5f5f5 背景标注错误） |
| 元素一致性 · 焦点可见 | `tmp/focus-check.mjs`（产物 + 源码双扫）：`outline:none` 站点与其替代指示器配对、`:focus-visible` 声明唯一性、`tabindex` 取值合法性、`role="img"` 容器内含交互子元素（ARIA Children Presentational 陷阱）、交互元素 keydown 支持、skip-link | ⚠️ **1 项 P2 已修 + 1 项 P3 已修**（§5 P2-4 / P3-13）。`outline:none` 2 处均有替代指示器（CG 节点 stroke 变化、skip-link 自身外观变化）；正值 `tabindex` 0；skip-link 14/14；CG 节点有 `focus`/`blur`/`keydown(Enter+Space)` 完整处理（`CollaborationGraph.astro:317-331`）。七态 / 目标 ≥24×24 / alt 已在 R12 完成（见 §4 交互态行、§5 P2-9） |
| 交互体验 · 键盘可达 | 同上：焦点陷阱风险扫描（`position:fixed` + `overflow:hidden` 层是否含焦点元素）、模态 / 抽屉焦点归还、Tab 顺序 | ✅ **Tab 无陷阱，模态焦点归还不适用**。焦点陷阱扫描仅命中 `HeroArt.astro:156 .hero-canvas`，该元素 `aria-hidden="true"` 且 `pointer-events:none`，内部无焦点元素 → 非陷阱。全站**无 `<dialog>` / `role="dialog"` / `aria-modal` / modal / drawer**，仅 2 处原生 `<details>/<summary>`（`Footer.astro:32`、`index.astro:497`），键盘可达为浏览器内建行为 → 模态焦点归还不适用。`prefers-reduced-motion`（R3 P3-2 已查）、`user-scalable` 缩放未在本轮检查（属 R12） |
| 元素一致性 · 交互态 | `tmp/state-check.mjs`：七态规则计数（hover / focus-visible / active / disabled / loading / empty / error）+ 每个定义 `:hover` 的按钮选择器是否被 `:disabled` 覆盖 + 触控目标尺寸抽取（WCAG 2.5.8 AA ≥24×24）+ SVG 可访问性（99 个 SVG 的 role / aria-label / aria-hidden 分布）+ viewport 缩放禁用 + 破坏性操作确认 | ⚠️ **1 项 P2 已修 + 2 项 P3 记录**（§5 P2-9 按钮禁用态缺失、P3-18 装饰 SVG 未标 `aria-hidden`、P3-19 `.btn` 无 `:active`）。七态实测：hover 42、focus-visible 3、active 1、**disabled 0→3（已修）**、error 1；**loading / empty 不适用**（静态站无异步数据加载、无数据集合，R8 已确认 0 个 `<form>`）；`prefers-reduced-motion` 11 处覆盖 18 个 `@keyframes`（R3 P3-2）。触控目标全部达标：`button`/`details summary`/`a.btn` 全局 `min-height:44px`、`.terminal__copy` 32×32、`.showcase__arrow` 40px。**viewport 未禁用缩放**（`width=device-width, initial-scale=1.0`，无 `user-scalable=no` / `maximum-scale`，符合 WCAG 1.4.4）。**破坏性操作不适用**：6 个文件含 `remove`/`drop` 关键词，全部为 `classList.remove()` / `removeAttribute()` JS API 调用，无用户可执行的破坏性动作 |
| 前端安全 | 外链 `rel=noopener`（随断链扫描顺带检查，134 条外链） | ✅ `target=_blank` 缺 `noopener` = 0；XSS 危险 API 与 CSP 已在 R10 完成（§5 P2-8 / P3-17）；密钥入产物见下行（R11） |
| 前端安全 · XSS | `tmp/xss-check.mjs`：7 类危险 API 全量扫描（`dangerouslySetInnerHTML` / `.innerHTML=` / `.outerHTML=` / `insertAdjacentHTML` / `document.write` / `eval(` / `new Function(`）+ 每个 sink 的 RHS 输入来源分类（静态字面量 / 内部生成 / 需人工核查）+ 8 类用户输入源存在性（`location.hash/search/href` / `URLSearchParams` / `localStorage` / `sessionStorage` / `document.cookie` / `dataTransfer` / `innerText` / `prompt()`）+ `postMessage`/`message` 事件 + CSP 与安全头 | ⚠️ **1 项 P2 已修 + 1 项 P3 已修**（§5 P2-8 `innerHTML` 未防护 sink、P3-17 无 CSP 与安全头）。**零可执行注入**：`dangerouslySetInnerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval`/`new Function` 均 **0**；`innerHTML` 4 处全部为静态 SVG 字面量或字面量 const，**需人工核查 0**；**用户输入源 0**（营销站，无表单、无状态读取、无 URL 参数解析）；`postMessage` 0（无跨源消息 → `origin` 校验不适用）。**依赖高危 CVE = UNKNOWN**（`npm audit` 端点 503，npm registry 维护中） |
| 前端安全 · 密钥 | `tmp/secret-check.mjs`：18 类密钥正则（AWS `AKIA` / GitHub PAT `gh[pousr]_` / Slack `xox[baprs]-` / Stripe `sk_live_` / Google `AIza` / JWT `eyJ…` / PEM 私钥块 / SendGrid `SG.` / Twilio `SK` / Mailgun `key-` / `Bearer ` / URL 内嵌凭据 `://u:p@` / MongoDB 连接串 / OpenAI-Antropic `sk-` / 通用 `(api_key\|secret\|token\|password)=` 赋值 / 40+ 位十六进制串）分三层扫描：**产物 `site/dist`（22 文件）→ 源码 `site/src` → 仓库其他位置**；另查环境注入面（`import.meta.env` / `process.env`）、`.env*` 文件与 `.gitignore` 覆盖、CI workflow 硬编码密钥 | ✅ **0 缺陷**（详见 §5 无发现记录 R11）。**产物 0 命中 / 源码 0 命中**；**环境注入点 0**（前端不读取任何环境变量，结构性不可能泄露）；`.env` 被 `.gitignore:10` 忽略且未跟踪，`.env.example` 入库仅含占位符；CI workflow 用 `${{ secrets.ANTHROPIC_API_KEY }}` 无任何硬编码；仓库自带 `scripts/verify.mjs:134 checkSecrets()` 门禁且 `test/verify.test.mjs:162` 有其测试。**依赖高危 CVE = UNKNOWN**（R10 与 R11 连续两轮 `npm audit` 均 503，npm registry 维护中） |

---

## 5. 发现（P0 → P3）

### P1

#### P1-1 功能稳定 — quickstart 目录 2/6 死链，且页面 lead 承诺的内容缺失

- **位置**：`site/src/pages/docs/quickstart.astro:21-28`（目录定义）、`:43`（lead）、缺失章节原应位于 `:52-:54` 之间
- **问题**：目录声明 6 个锚点，页面实际只有 4 个 `<section>`，`#clone`（克隆与启动）与 `#first-task`（第一个任务）**无对应 section**，点击目录项无任何滚动效果。同时页面 lead 明确承诺「从克隆仓库到完成第一个任务的完整流程」，信息框列出 `/ultrawork` 为核心命令，但全页无 `/ultrawork` 章节 —— 新用户按此页无法跑通第一个任务。
- **Found（原文逐字，修复前）**：
  ```js
  const toc = [
    { id: 'prerequisites', label: '前置条件' },
    { id: 'clone', label: '克隆与启动' },
    { id: 'first-task', label: '第一个任务' },
    { id: 'verify', label: '验收产物' },
    { id: 'hyperplan', label: '规划复杂项目' },
    { id: 'next', label: '下一步' },
  ];
  ```
  ```html
  lead="本文介绍从克隆仓库到完成第一个任务的完整流程：配置运行环境、启动本地站点，并通过 <code>/ultrawork</code>、<code>/verify</code>、<code>/hyperplan</code> 三个命令驱动 men（门）Agent 团队完成一键编排、独立验收与复杂项目规划。"
  ```
  实际存在的 section id 仅 4 个：`prerequisites` / `verify` / `hyperplan` / `next`
- **Expected**：目录 6 项与 6 个 `<section id>` 一一对应；`/ultrawork`（核心命令）有独立章节；lead 承诺的流程在页内可完成。
- **Fix（已入库，可复制）**：从源码真值 `docs/guide/quickstart.md` 的「一、安装与启动」（L25-69）与「三、三个命令用法表 + 4.1 `/ultrawork`」（L126-158）移植两个章节，插入在 `#prerequisites` 与 `#verify` 之间，沿用既有 `.doc-section` / `.code-block` / `SrcRef` 版式：

  ```html
  <section id="clone" class="doc-section">
    <h2>克隆与启动</h2>
    <p>前置：Node.js ≥ 18、已安装 OpenCode。推荐用 npm 一步安装，无需 clone 仓库：</p>
    <div class="code-block">
      <span class="code-block__lang">bash</span>
      <pre><code>npx @cgartlab/men
  opencode</code></pre>
    </div>
    <ul>
      <li><strong>方式 A：npm 一步安装（首选）</strong> — ……</li>
      <li><strong>方式 B：Git 仓库（备选）</strong> — ……</li>
      <li><strong>任意目录生效</strong> — <code>--global</code> / <code>--global-remove</code> ……</li>
      <li><strong>.env 说明</strong> — 占位符，基础对话不需要填写</li>
    </ul>
    <SrcRef files={['scripts/install.mjs','docs/guide/quickstart.md']} />
  </section>

  <section id="first-task" class="doc-section">
    <h2>第一个任务</h2>
    <p>日常绝大多数任务用 <code>/ultrawork</code> 一键编排，……</p>
    <div class="code-block">
      <span class="code-block__lang">text</span>
      <pre><code>/ultrawork 查一下本周 AI 领域最新发布的开源模型有哪些</code></pre>
    </div>
    <ul>
      <li><strong>search 类（单路执行）</strong> — ……</li>
      <li><strong>analyze 类（需 chi judge）</strong> — ……</li>
      <li><strong>team 类（多路 Wave 并行 + 汇总）</strong> — ……</li>
      <li><strong>三命令速查</strong> — <code>/ultrawork &lt;任务&gt;</code> · <code>/verify &lt;角色或路径&gt;</code> · <code>/hyperplan &lt;项目&gt;</code></li>
    </ul>
    <SrcRef files={['.opencode/command/ultrawork.md','docs/guide/quickstart.md']} />
  </section>
  ```
- **Basis**：`tmp/link-check.mjs` 命令输出（修复前）：
  ```
  [FRAG_MISSING_LOCAL] 渲染页: docs/quickstart/index.html
    href="#clone"        缺 id="clone"
  [FRAG_MISSING_LOCAL] 渲染页: docs/quickstart/index.html
    href="#first-task"   缺 id="first-task"
  结果：0 断链 / 2 锚点缺失 / 0 src 缺失   (exit 1)
  ```
  定级依据：定级表「P1 关键流程受阻」—— 快速上手页是站点主入口的入门流程，`/ultrawork` 作为唯一编排命令在本页无章节，新用户的第一个任务在此页无法完成。
- **Note（验证方式）**：`npm run build`（exit 0）→ `node tmp/link-check.mjs`（exit 0，锚点缺失 2 → 0）→ `node site/scripts/check-site.mjs`（exit 0）。引用的 3 个源路径（`.opencode/command/ultrawork.md`、`docs/guide/quickstart.md`、`scripts/install.mjs`）均已 `Test-Path` 确认存在。

### P2（R6 · 对比度 · WCAG 2.2 AA 1.4.3）

> 判据：WCAG 2.2 §1.4.3 Contrast (Minimum) —— 正文与 UI 文本需 **≥4.5:1**；仅「大文本」（≥18pt / 24px，或 ≥14pt / 18.66px 粗体）可降至 **3:1**。非文本元素（边框 / 图形 / 图标）适用 §1.4.11，阈值 **3:1**。以下实算值均由 `tmp/contrast-check.mjs` 按 WCAG 相对亮度公式计算，非引用注释。

#### P2-1 信息排版 · 对比度 — 常驻小字使用主强调色，AA 不达标（已修复）

- **位置**：`site/src/pages/index.astro:572`、`index.astro:590`
- **问题**：`--color-accent`（`#e85d04`）在**所有**浅色背景上都不达 4.5:1（实测 2.84–3.50:1），仅够「大文本 / 非文本」的 3:1。两处将其用于**常驻小字文本**：
  - `:572` `.terminal__ps1` —— `font-size: var(--font-size-body)`（1rem = **16px**）、`font-weight: var(--font-weight-bold)`（**700**）、父容器 `.terminal__cmd-line` 背景 `#fff`（`:570`）。16px/700 **不构成大文本**（粗体需 ≥18.66px）。实测 **3.50:1**。
  - `:590` `.showcase__label` —— `font-size: var(--font-size-eyebrow)`（0.75rem = **12px**）、`font-weight: var(--font-weight-semi)`（600），背景为页面底色 `#fafafa`。实测 **3.35:1**。
- **Found（原文逐字，修复前）**：
  ```css
  .terminal__ps1 { font-family: var(--font-mono); font-size: var(--font-size-body); color: var(--color-accent); flex-shrink: 0; font-weight: var(--font-weight-bold); line-height: 1.5; }
  .showcase__label { font-family: var(--font-mono); font-size: var(--font-size-eyebrow); font-weight: var(--font-weight-semi); letter-spacing: 0.15em; text-transform: uppercase; color: var(--color-accent); margin-bottom: var(--space-3); }
  ```
- **Expected**：小字（<24px 且非 ≥18.66px 粗体）使用强调色时应走 `--color-accent-dark`（`#a03c00`）—— 该令牌的注释用途正是「小字安全橘」，且实测在系统内**全部 7 个背景上都 ≥5.42:1**。
- **Fix（已入库，可复制）**：
  ```css
  .terminal__ps1 { font-family: var(--font-mono); font-size: var(--font-size-body); color: var(--color-accent-dark); flex-shrink: 0; font-weight: var(--font-weight-bold); line-height: 1.5; }
  .showcase__label { font-family: var(--font-mono); font-size: var(--font-size-eyebrow); font-weight: var(--font-weight-semi); letter-spacing: 0.15em; text-transform: uppercase; color: var(--color-accent-dark); margin-bottom: var(--space-3); }
  ```
- **Basis**：WCAG 2.2 §1.4.3。命令输出（`tmp/contrast-fix.mjs`）：
  ```
  --color-accent (#e85d04):  不达标 → #fafafa=3.35:1 | #ffffff=3.50:1 | #f5f5f5=3.21:1 | #f0ebe2=2.95:1 | accent-tint=3.11:1 | #efe7d2=2.84:1
  --color-accent-dark (#a03c00):  全部达标 ✓
  ```
- **Note**：**该缺陷先于本轮存在** —— R4 把 `#e85d04` 字面量收敛为 `var(--color-accent)` 时是等值替换，对比度未变。此处如实记录为先有缺陷，不由 R4 引入。修正后：`.terminal__ps1` 6.69:1（AAA）、`.showcase__label` 6.41:1（AAA）。`npm run build` exit 0（14 页）、`check-site.mjs` exit 0、`link-check` 断链 0、`empty-check` 空实现 0、`heading-check` 合规、`node --test` exit 0、`verify.mjs` PASS=9。

#### P2-2 信息排版 · 对比度 — hover / active 态文本回落到主强调色，降低对比度（已修复）

- **位置**：10 处 —— `index.astro:533,542,583,656,671,765`、`roles.astro:960,999`、`global.css:355,360`
- **问题**：多处交互态把文本色从已达标的 `--color-fg-muted`（4.54:1）或 `--color-fg` 改为 `--color-accent`（3.35:1），**交互时反而降低可读性**。WCAG §1.4.3 对瞬态文本同样适用。涉及：
  - `.hero-cta--ghost:hover`（`:533`，文本落在 `--color-accent-tint` ≈ `#fdefe6` 上，实测 **3.11:1** —— 全部组合中最低）
  - `.install__guide:hover` / `.topo__all:hover` / `.mechanisms__all:hover`（`:542,671,765`，均为 0.76rem ≈ 12.2px 链接）
  - `.terminal__copy:hover`（`:583`，32×32 图标按钮，白底）
  - `.showcase__arrow:hover`（`:656`，accent-tint 底）
  - `.intent-link a:hover` / `.principles-link a:hover`（`roles.astro:960,999`）
  - `pre .copy-btn:hover` / `.copy-btn.copied`（`global.css:355,360`）
- **Found（原文逐字，修复前，取 3 处代表）**：
  ```css
  .hero-cta--ghost:hover { border-color: var(--color-accent); color: var(--color-accent); background: var(--color-accent-tint); text-decoration: none; }
  .install__guide:hover { color: var(--color-accent); text-decoration: none; }
  pre .copy-btn.copied { opacity: 1; color: var(--color-accent); }
  ```
- **Expected**：交互态文本同样使用 `--color-accent-dark`；**边框 / 阴影等非文本元素保持 `--color-accent`**（§1.4.11 阈值 3:1，3.35:1 已达标，无需改）。
- **Fix（已入库，可复制 · 模式）**：仅替换 `color:` 一处，保留 `border-color:`：
  ```css
  .hero-cta--ghost:hover { border-color: var(--color-accent); color: var(--color-accent-dark); background: var(--color-accent-tint); text-decoration: none; }
  .install__guide:hover { color: var(--color-accent-dark); text-decoration: none; }
  pre .copy-btn.copied { opacity: 1; color: var(--color-accent-dark); }
  ```
- **Basis**：WCAG 2.2 §1.4.3（正文）与 §1.4.11（非文本，阈值区分是本轮判断依据）。命令输出：修正后 12 处全部 ≥5.42:1；残留 `color: var(--color-accent)` 文本用法 6 处已逐条核为合规（见 Note）。
- **Note · 残留合规核对**：修复后源码仍存 6 处 `color: var(--color-accent)`，逐条判定均不违规 ——
  1. `global.css:773` `.oc-title em` —— em 位于 h1 内（≥24px 大文本，3.35:1 ≥ 3:1 ✓）
  2. `index.astro:524` `.hero-logo`、`index.astro:643` `.showcase__trait svg` —— SVG 图形，适用 §1.4.11，3:1 ✓
  3. `HeroArt.astro:174,205` `.dither-band` / `.dither-band pre` —— ASCII 装饰艺术，元素层 `aria-hidden="true"`（`HeroArt.astro:20,28`），不纳入对比度判定
  4. `roles.astro:877` `content: '·'` —— 伪元素装饰圆点标记
  另 20 处 `border-color` / `border-bottom-color` / `border-left-color` 属非文本，3:1 阈值下 3.35:1 达标。

#### P2-3 信息排版 · 对比度 — `--color-fg-muted` 在次级背景上低于 4.5:1（R13 已修复）

- **位置**：`site/src/styles/global.css:118`（令牌定义）；R13 实测定位到 **3 个选择器 / 12 处渲染实例**（非早前估计的 50 处 —— 多数使用点实际落在 `#fafafa` 页底或白卡上，达标）
- **问题**：`--color-fg-muted`（`#737373`）在页面底色 `#fafafa` 上为 4.54:1（**勉强达标**），但在站点实际使用的次级背景上跌破阈值：
  | 背景 | 值 | 实测 |
  |------|-----|------|
  | `--color-surface-warm` / `--color-code-bg` | `#f5f5f5` | **4.35:1** ✗ |
  | `--color-accent-tint` | ≈`#fdefe6` | **4.21:1** ✗ |
  | `--color-meta` | `#efe7d2` | **3.85:1** ✗ |
  | `--color-bg-warm` | `#f0ebe2` | **3.99:1** ✗ |
- **Expected**：在浅色次级背景上使用 `--color-fg-tertiary`（`#5c5c5c`，在 `#f5f5f5` 上 6.13:1）。
- **Fix（R13 已入库，3 处）**：不改令牌取值（避免触及语义与波及面），只对**实际落在次级背景上的 3 个选择器**改用 `--color-fg-tertiary`：
  1. `site/src/components/Footer.astro:97` `.site-footer__version-text` —— `#f5f5f5` 上 4.35:1 → **6.13:1**
  2. `site/src/components/Footer.astro:139,142,145` `.site-footer__legal`（三条重复规则，见 P3-22）—— 同上
  3. `site/src/styles/global.css:1155` `.code-block__lang` —— `#f0ebe2` 上 3.99:1 → **5.63:1**
  其余使用点经 R13 全量实测确认落在 `#fafafa` / `#ffffff` 上，本条不涉及。
- **Basis**：WCAG 2.2 §1.4.3。修复前后命令输出（`site/scripts/tiny-text-audit.mjs`，逐元素解析真实背景）：
  ```
  修复前：小字号元素总数 302 | 对比度不合格 21
    4.35:1  14px  #737373 on #f5f5f5  <site-footer__version-text>"v0.5.0"
    4.35:1  14px  #737373 on #f5f5f5  <>"法律许可与隐私声明"
    3.99:1  12px  #737373 on #f0ebe2  <code-block__lang>"bash"
  修复后：roles 2→0 | quickstart 6→0 | 404 2→0 | index 11→9
  ```
  令牌实测（`tmp/ratio-check.mjs`）：`--color-fg-tertiary on #f5f5f5 = 6.13:1`、`on #f0ebe2 = 5.63:1`，均 ≥4.5:1。
- **Note**：定级 P2（WCAG AA 违规不低于 P2）。R6 估的「约 50 处使用点」在 R13 用真实背景解析后收窄为 3 个选择器 —— 原因是 R6 按「令牌 × 背景」做静态矩阵，无法区分每个使用点的真实层叠背景；R13 走 `getComputedStyle` + 向上遍历首个不透明背景，故能精确定位。截图证据：`home-1440.png` / `quickstart-1440.png`（页脚版本串与代码块语言标签）。

#### P2-4 元素一致性 · 键盘焦点 — `role="img"` 容器剪除交互子节点，屏幕阅读器不可达（已修复）

- **位置**：`site/src/components/CollaborationGraph.astro:71`
- **问题**：协作拓扑图 SVG 根节点标为 `role="img"`，但内部有 6 个 `tabindex="0" role="button"` 的角色节点。ARIA 规范中 `img` 角色的 **Children Presentational = true**，即其后代在辅助技术（AT）的无障碍树中被剪除。结果：键盘用户可 Tab 到这些节点（`tabindex="0"` 是 DOM 行为，不受 ARIA 影响），焦点指示器也正常显示，但**屏幕阅读器不会播报按钮的名称与角色** —— 违反 WCAG 2.2 §4.1.2 Name, Role, Value。
- **Found（原文逐字，修复前）**：
  ```html
  <svg
    class="cg__svg"
    viewBox="0 0 800 600"
    role="img"
    aria-label="men 与五个 Agent 的协作拓扑图"
    preserveAspectRatio="xMidYMid meet"
  >
    ...
    <g class="cg__node cg__node--${n.kind}" data-id={n.id} data-role={n.role}
       tabindex="0" role="button" aria-label={`${n.cn} ${n.en}：${n.role}`}>
  ```
- **Expected**：容器角色不得剪除交互后代。`role="group"` 的 Children Presentational 为 false，且可携带 `aria-label` 保留图的描述性名称。
- **Fix（已入库，可复制）**：
  ```html
  <svg class="cg__svg" viewBox="0 0 800 600" role="group"
       aria-label="men 与五个 Agent 的协作拓扑图" preserveAspectRatio="xMidYMid meet">
  ```
- **Basis**：WCAG 2.2 §4.1.2 Name, Role, Value；WAI-ARIA `img` 角色 `Children Presentational: true`。命令输出（`tmp/focus-check.mjs`）：
  ```
  === 1. role="img" 容器内含交互子元素（ARIA Children Presentational 陷阱）===
  合计: 0（0 = 合规）        ← 修复前为 1
  ```
- **Note**：**该组件的键盘支持本身是完备的** —— `CollaborationGraph.astro:317-331` 已实现 `focus` → highlight、`blur` → 取消、`keydown` Enter/Space → `preventDefault` + 显示提示 1.6s；焦点指示器为 stroke 由 `--color-line` 变 `--color-accent` 且 stroke-width 1.5→2.5（含非色彩线索，满足 §1.4.11）。因此本缺陷是**纯粹的 ARIA 语义错误**，不影响鼠标与键盘操作，只影响 AT 播报。同类模式核对：`MechanismSVG.astro` 6 处 `role="img"`（`:13,38,69,88,109,136`）经检为**纯静态示意图**（无 `tabindex` / `role="button"` / `<a>` / `<button>` / `onclick`），`role="img"` 用法合法，无需修改。`npm run build` exit 0，`:focus-visible` 声明数 2→1。

#### P2-5 功能稳定 · 错误容错 — 复制按钮 `catch {}` 静默吞错，失败零反馈（已修复）

- **位置**：`site/src/pages/index.astro:841`（修复前）
- **问题**：3 个 `.terminal__copy` 按钮（`index.astro:158,172,187`）的点击处理器用 `catch {}` 空块吞掉**所有** `navigator.clipboard.writeText()` 失败。成功路径有完整反馈（勾图标 + 绿色 1.5s），**失败路径什么都没有** —— 无错误图标、无错误文案、无 AT 播报。触发场景：剪贴板权限被拒、非安全上下文（`navigator.clipboard` 为 `undefined` 时抛 `TypeError`）、移动端浏览器限制。违反「错误文案指明修法」与「>300ms 必有反馈」。
- **Found（原文逐字，修复前）**：
  ```js
  btn.addEventListener('click', async () => {
    const cmd = (btn as HTMLElement).dataset.cmd;
    if (!cmd) return;
    try {
      await navigator.clipboard.writeText(cmd);
      btn.innerHTML = '<svg ...path d="M20 6L9 17l-5-5"/>';
      (btn as HTMLElement).style.color = '#28c840';
      setTimeout(() => {
        btn.innerHTML = '<svg ...rect.../>';
        (btn as HTMLElement).style.color = '';
      }, 1500);
    } catch {}
  });
  ```
- **Expected**：失败时给出可见错误状态 + 指明替代做法 + 通过 `aria-live` 让 AT 播报（WCAG §4.1.3 Status Messages）。
- **Fix（已入库，可复制）**：按钮加 `aria-live="polite"`，成功/失败均更新 `aria-label`，失败分支给出红叉图标与「请手动选中并复制」：
  ```js
  document.querySelectorAll('.terminal__copy').forEach(btn => {
    const ICON_COPY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const label = btn.getAttribute('aria-label') || '复制命令';
    btn.setAttribute('aria-live', 'polite');
    btn.addEventListener('click', async () => {
      const cmd = (btn as HTMLElement).dataset.cmd;
      if (!cmd) return;
      try {
        await navigator.clipboard.writeText(cmd);
        btn.innerHTML = '<svg ...勾.../>';
        (btn as HTMLElement).style.color = '#28c840';
        btn.setAttribute('aria-label', '已复制');
        setTimeout(() => { btn.innerHTML = ICON_COPY; btn.style.color = ''; btn.setAttribute('aria-label', label); }, 1500);
      } catch {
        /* 剪贴板写入失败（权限被拒 / 非安全上下文）：显式报错并指明替代做法 */
        btn.innerHTML = '<svg ...叉.../>';
        (btn as HTMLElement).style.color = '#cf222e';
        btn.setAttribute('aria-label', '复制失败：请手动选中并复制');
        setTimeout(() => { btn.innerHTML = ICON_COPY; btn.style.color = ''; btn.setAttribute('aria-label', label); }, 1500);
      }
    });
  });
  ```
- **Basis**：WCAG 2.2 §4.1.3 Status Messages；`检查要点 · 交互`（错误文案指明修法）。命令输出（`tmp/error-check.mjs`）：
  ```
  === 2. 静默吞错：空 catch / 空 except ===
    合计空 catch: 0（0 = 合规）          ← 修复前为 1
  === 3. 错误文案是否指明修法 ===
    site/src/pages/index.astro  含 catch: ✓  含修法指引: ✓
  ```
- **Note**：`label` 变量保留各按钮原始 `aria-label`（`复制完整提示词` / `复制 npm i ...`），1.5s 后还原，不破坏 R2 已验证的标签唯一性。`#28c840`（成功绿）与 `#cf222e`（失败红）为 JS 运行时状态色，与 R4 P3-9「JS 动态值合法」同性质，非主题令牌。定级 P2：触发条件在 `https://men.cgartlab.com`（安全上下文）下较少见，但静默吞错属通用反模式，且缺陷在权限受限环境下 100% 可复现。

#### P2-6 功能稳定 · 错误容错 — 无 404 页，错误 URL 无品牌化恢复路径（已修复）

- **位置**：`site/src/pages/404.astro`（修复前不存在）→ 产物 `site/dist/404.html`（修复前不存在）
- **问题**：Astro `output: 'static'` 模式下，未提供 `src/pages/404.astro` 时**不生成** `404.html`。修复前 `dist/` 根目录仅含 `_astro`、`about`、`docs`、`mechanisms`、`roles`、`CNAME`、`favicon.svg`、`index.html` —— 无 `404.html`。用户访问错误地址将得到托管方默认页（如 GitHub Pages 的裸 "404"），无品牌、无站内导航、无 skip-link。违反「空态与边界齐备」。
- **Found（修复前，命令输出）**：
  ```
  === dist 根目录 ===
  _astro  about  docs  mechanisms  roles  CNAME  favicon.svg  index.html
  404.html → MISSING
  ```
- **Expected**：静态站提供 404 页，含 h1、错误说明、回站入口与 skip-link，样式走设计令牌。
- **Fix（已入库）**：新增 `site/src/pages/404.astro`，使用 `BaseLayout` + 现有 `.btn` / `.btn--primary` / `.btn--ghost` 组件与 `--color-*` / `--space-*` / `--font-*` 令牌；含 HTTP 404 eyebrow、`404` + 「页面不存在」标题、说明文案、4 个回站入口（首页 / 文档 / 角色 / 机制）、GitHub Issues 反馈链接、`@media (max-width: 480px)` 响应式。
- **Basis**：`检查要点 · 功能`（空态与边界齐备）。命令输出（`tmp/error-check.mjs`）：
  ```
  === 1. 404 边界（静态站必须有 404 页）===
    源码 404.astro: ✓
    产物 404.html:  ✓ (9209 字节)
    h1: ✓   回站入口: ✓   skip-link: ✓   标题文本: ✓
  ```
  `npm run build` 输出 `/404.html (+8ms)`，页面数 14 → 15；`tmp/heading-check.mjs` 复核 15 页 15 个 h1，跳级 0。
- **Note**：R1 抽样规则中已把「404 无自定义」记为抽样缺口（③ 视觉留档的采样盲区），R8 将其升级为实际缺陷并修复。新增页面不引入新路由（404 为特殊路由）、不改令牌语义、不重做视觉风格 —— 复用 `BaseLayout` 与 `.btn` 既有组件。

#### P2-7 功能稳定 · 核心网页指标 — 1.47 MB 外部字体无 `preconnect`/`preload`，最低优先级加载（已修复）

- **位置**：`site/src/layouts/BaseLayout.astro:22-24`（修复前 `<head>` 无字体预连接）；字体声明 `site/src/styles/global.css:9-22`
- **问题**：站点自产资源合计仅 **472.3 KB**（15 页 HTML 374.5 + CSS 97.1 + SVG 0.7），但 `@font-face` 从 `https://code.oppo.com` 拉取 **2 个 woff2，各 744,800 字节 = 1.47 MB**，是站点自身体积的 **3.1 倍**。修复前 `<head>` 中 `preconnect`/`preload`/`modulepreload`/`fetchpriority` 均为 0 —— 字体请求要等 CSS 解析完才能发起，且需先完成 DNS + TCP + TLS 三次握手。1 Mbps 链路上 1.47 MB ≈ 11.8 s 传输。
- **Found（修复前，命令输出）**：
  ```
  <head> 内 preconnect: 0
  <head> 内 preload:   0
  <head> 内 modulepreload: 0
  fetchpriority 属性:  0
  ```
  字体可达性实测（`Invoke-WebRequest -Method Head`）：
  ```
  DNS  code.oppo.com → 106.3.18.178 (TTL 1200)
  HTTP Status 200  Length 744800  Type application/octet-stream
  ```
- **Expected**：`preconnect` 提前建立到字体源的连接；LCP 候选字重 `preload` 提升优先级。
- **Fix（已入库，可复制）**：
  ```html
  <!-- 外部字体预连接：OPPO Sans woff2 由 code.oppo.com 提供，每个约 744KB。
       preconnect 提前建立 DNS+TCP+TLS，preload 提升 Regular（正文 LCP 候选）优先级。
       Medium 字重不 preload —— 两者共享同一连接，CSS 解析后即可在既有连接上取回。 -->
  <link rel="preconnect" href="https://code.oppo.com" crossorigin />
  <link
    rel="preload"
    as="font"
    type="font/woff2"
    crossorigin
    href="https://code.oppo.com/content/dam/oppo/common/fonts/font2/new-font/OPPOSansOS2-5000-Regular.woff2"
  />
  ```
- **Basis**：`检查要点 · 功能`（LCP≤2.5s）；web.dev「Preconnect to origin」与「Preload fonts」。命令输出（`tmp/cwv-check.mjs`）：
  ```
  <head> 内 preconnect: 15     ← 修复前 0
  <head> 内 preload:   15      ← 修复前 0
  ```
- **Note**：**实测 LCP/CLS/INP 值仍为 UNKNOWN** —— 需 Playwright + Lighthouse 才能给出 ms 值（见 ③ 待决项）。本轮为静态风险分析：识别并修复风险因子，但无法证明阈值达标。只 preload Regular（400，正文与 LCP 候选字重）而不 preload Medium（500）：两者共享 `preconnect` 建立的同一连接，Medium 在 CSS 解析后即可在既有连接上取回，无需再付连接建立代价；同时避免把 1.47 MB 全部提升为高优先级请求与页面自身资源竞争带宽。`crossorigin` 为 `as="font"` 必需（字体按 CORS 加载）。

#### P2-8 前端安全 · XSS — 符号矩阵 `innerHTML` sink 无结构防护（已修复）

- **位置**：`site/src/components/HeroArt.astro:54-62`（修复前）
- **问题**：Hero 区符号矩阵把 1120 个 `<span>`（`COLS=40` × `ROWS=28`）以字符串拼接后一次性赋给 `matrix.innerHTML`。字符串中混有 `style="..."` 属性，由 `+ delay + 's;--dur:' + dur + 's;opacity:' + opacity + ';'` 拼接而成。**当前无注入路径** —— `GLYPHS` 是硬编码数组，`delay`/`dur`/`opacity` 均为 `Math.random()` 经 `.toFixed()` 得到的纯数字字符串，全站亦无任何用户输入源。但这是 `innerHTML` + 属性字符串拼接的组合，**一旦后续改动把某个数字换成外部字符串（含 CSS 值）即成为注入点**，且当前代码没有任何结构性防线。OWASP 对此类 sink 的态度是「消除 sink」而非「审查输入」。
- **Found（原文逐字，修复前）**：
  ```js
  // 生成 HTML：每个 glyph 用 span，随机 delay
  let html = '';
  for (let i = 0; i < total; i++) {
    const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const delay = (Math.random() * 20).toFixed(2);
    const dur = (8 + Math.random() * 12).toFixed(1);
    const opacity = (0.04 + Math.random() * 0.08).toFixed(2);
    html += '<span data-glyph class="sym" style="--sd:' + delay + 's;--dur:' + dur + 's;opacity:' + opacity + ';">' + ch + '</span>';
  }
  matrix.innerHTML = html;
  ```
- **Expected**：DOM 构造使用结构化 API（`createElement` / `textContent` / `style.setProperty`），文本与样式值不经过 HTML 解析器，`innerHTML` sink 不复存在。
- **Fix（已入库，可复制）**：
  ```js
  // 生成符号矩阵：用 createElement + textContent 构造，避免 innerHTML 解析字符串
  // （GLYPHS 与 delay/dur/opacity 均为字面量与 Math.random().toFixed() 数字，
  //  当前无注入路径；改为结构化 API 后消除该 sink，杜绝后续改动引入回归）
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i++) {
    const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const delay = (Math.random() * 20).toFixed(2);
    const dur = (8 + Math.random() * 12).toFixed(1);
    const opacity = (0.04 + Math.random() * 0.08).toFixed(2);
    const span = document.createElement('span');
    span.dataset.glyph = '';
    span.className = 'sym';
    span.style.setProperty('--sd', delay + 's');
    span.style.setProperty('--dur', dur + 's');
    span.style.setProperty('opacity', opacity);
    span.textContent = ch;
    frag.appendChild(span);
  }
  matrix.appendChild(frag);
  ```
- **Basis**：OWASP XSS Prevention Cheat Sheet（「Use a safe API」优先于「Escape output」）；`检查要点 · 安全`（XSS 危险 API）。命令输出（`tmp/xss-check.mjs`）：
  ```
  === 2. 每个 innerHTML sink 的输入来源分类 ===
  合计：静态/内部生成 4 | 注释 0 | 需人工核查 0
  结果：需人工核查 sink 0 | 用户输入源 0 | postMessage 0
  ```
  产物核验：`dist/index.html` 中 `createElement`/`createDocumentFragment`/`setProperty`/`textContent` 均存在，`matrix.innerHTML` 已消失。
- **Note**：**无 active 漏洞** —— 修复前也无注入路径（`tmp/xss-check.mjs` 第 3 节确认全站用户输入源为 0），定级 P2 的理由是「首页存在未防护 sink + 拼接 CSS 属性值」的组合风险，而非「当前可被利用」。`data-glyph` 属性经 grep 确认为**只写不读**（全仓库仅 1 处命中，即生成处本身），`span.dataset.glyph = ''` 与原始 `<span data-glyph>` 语义等价。保留它以免破坏潜在的 CSS 选择器依赖。`index.astro:838,842,848,852` 的 4 处 `innerHTML` **未改**：均为静态 SVG 字面量或字面量 const（`ICON_COPY`），单元素赋值无性能顾虑，改造属纯重构无安全收益。`npm run build` exit 0（15 页）。

#### P2-9 交互态 · 按钮禁用态缺失（七态之 disabled）

- **位置**：`site/src/styles/global.css:400-459`（`.btn` / `.btn--primary` / `.btn--ghost` 状态块，无 `:disabled`）；触发点 `site/src/components/CollaborationGraph.astro:355`
- **问题**：`.btn` 定义了 `:hover`（accent 边框、accent 文字色、`transform: translateX(2px)` 推门位移）与 `:hover .btn__arrow`（箭头位移），但**全站 `:disabled` 规则数为 0**。CSS 的 `:hover` 会匹配 `disabled` 元素 —— 浏览器不抑制它。演示播放期间 `playBtn!.setAttribute('disabled','true')` 生效后（`CollaborationGraph.astro:355`，持续 `delay + 400ms` ≈ 6 s），鼠标掠过按钮仍会显示 accent 高亮、推门位移与 `cursor: pointer` —— 对一个**当前无法点击**的控件输出「可点击」的视觉反馈。
- **Found**（`global.css:422-458` 原文逐字，全文无 `:disabled`）：
  ```css
  .btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent-on-accent);
    text-decoration: none;
    transform: translateX(2px); /* 推门语义 */
  }
  .btn--primary:hover {
    border-color: var(--color-accent);
    color: var(--color-accent-on-accent);
  }
  .btn:hover .btn__arrow {
    transform: translateX(2px);
  }
  ```
  `tmp/state-check.mjs` 第 1 节：`disabled 0`；第 2 节：`.btn:hover` / `.btn--primary:hover` `:disabled 覆盖 ✗ 缺失`。
- **Expected**：禁用态需显式覆盖 hover 的边框、文字色与位移，并给出不可操作的视觉信号与光标。
- **Fix**（`global.css`，插在 `.btn:hover .btn__arrow` 之后，已入库）：
  ```css
  /* ---------- 按钮禁用态 ----------
     CSS 的 :hover 会匹配 disabled 元素（浏览器不抑制），故必须显式覆盖，
     否则禁用期间仍会显示 accent 边框 / 文字色与 translateX 推门位移，
     给「不可点」的控件输出「可点」的视觉反馈。
     注：WCAG 1.4.3 明确豁免非活动 UI 组件的对比度要求，故 opacity 降弱可接受。 */
  .btn:disabled,
  .btn:disabled:hover {
    cursor: not-allowed;
    opacity: 0.5;
    border-color: var(--color-line-soft);
    color: var(--color-fg-muted);
    transform: none;
  }
  .btn:disabled .btn__arrow {
    transform: none;
  }
  ```
- **Basis**：`检查要点 · 元素`（七态 hover/focus/active/disabled/loading/empty/error）。命令输出（`tmp/state-check.mjs`）：
  ```
  === 1. 七态覆盖（全站 CSS）===
  disabled               0      ← 修复前
  disabled               3      ← 修复后
  ```
  产物核验：`dist/BaseLayout.ry_r1Nzi.css` 含 `:disabled`（修复前 0 命中）。
- **Note**：**唯一受影响的元素是 `#cg-play`** —— `grep setAttribute('disabled' / \bdisabled\b` 全仓库仅 `CollaborationGraph.astro:355,371` 两处，均作用于 `playBtn`（即 `.btn .btn--primary .cg__play`）；标记级 `disabled` 属性 0 处。`tmp/state-check.mjs` 第 2 节另报 `.terminal__copy:hover` / `.showcase__arrow:hover` / `.copy-btn:hover` 缺 `:disabled` 覆盖 —— **均为非缺陷**：这三个元素运行时从不被禁用，加规则属无意义代码。特异性核对：`.btn:disabled:hover` = (0,3,0) 高于 `.btn--primary:hover` (0,2,0) 且位于其后；`.btn:disabled .btn__arrow` (0,3,0) 与 `.btn:hover .btn__arrow` (0,3,0) 并列但位于其后 —— 均正确胜出，无需 `!important`。`opacity: 0.5` 使文字对比度降至约 2:1，但 **WCAG 1.4.3 明确豁免非活动 UI 组件**（"Text that is part of an inactive user interface component does not require a contrast ratio"），故不违反 AA。

#### P2-10 信息排版 · 对比度 — 主强调色底上硬编码白色小字，3.50:1 不达 AA（R13 已修复）

- **位置**：`site/src/pages/index.astro:530`（`.hero-cta--primary`）、`index.astro:535`（`.hero-version-badge`）
- **问题**：两处均为 `color: #fff` 直接写在 `background: var(--color-accent)`（`#e85d04`）之上，字号 12–14px（非大文本）。白字压主橘实测 **3.50:1**，低于 AA 正文阈值 4.5:1。共 3 个渲染实例：`v0.5.0` 徽标（12px）、`阅读文档`（14px）、`认识角色`（14px）。同时这也是**裸色值**（绕过令牌，同类见 P3-7）。
- **Expected**：改用站点既有令牌 `--color-accent-on-accent`（`#0a0a0a`，专为「橘底文字」设计）。
- **Fix（R13 已入库，2 处）**：`color: #fff` → `color: var(--color-accent-on-accent)`，同时消除裸色值。
- **Basis**：WCAG 2.2 §1.4.3。修复前后（`site/scripts/tiny-text-audit.mjs`）：
  ```
  修复前： 3.50:1  12px  #ffffff on #e85d04  <hero-version-badge>"v0.5.0"
           3.50:1  14px  #ffffff on #e85d04  <hero-cta hero-cta--primary>"阅读文档"
           3.50:1  14px  #ffffff on #e85d04  <hero-cta hero-cta--primary>"认识角色"
  修复后：index 9→6，上述 3 条全部消失
  ```
  令牌实测（`tmp/ratio-check.mjs`）：`--color-accent-on-accent #0a0a0a on #e85d04 = 5.66:1`，≥4.5:1 达标。`hover` 态为 `color-mix(--color-accent 85%, #fff)`（更浅底 + 深色字），对比度只升不降。
- **Note**：定级 P2（WCAG AA 违规不低于 P2）。截图证据：`home-1440.png` hero 区徽标与两枚 CTA。本条与 P3-20 有因果关系：令牌注释声称 `#0a0a0a` 在橘底为 8.8:1，实测 5.66:1（失准 3.14）—— 但即便按实测值仍达标，故修复有效。

#### P2-11 信息排版 · 对比度 — 六个角色色在 14px 正文上不达 4.5:1（R20 已修复 · 路径 a 大文本资格）

- **位置**：`site/src/pages/index.astro:618` `.showcase__card-role`（原 14px / weight 600）
- **问题**：六个 Agent 角色标签（14px 常规字重，白卡 `#ffffff` 底）全部低于 AA 正文阈值：
  | 角色色 | 角色 | 实测 |
  |---|---|---|
  | `#bf8700` | chi 评审 | **3.14:1** ✗ |
  | `#4a90d9` | si 思考 | **3.34:1** ✗ |
  | `#a371f7` | yi 设计 | **3.35:1** ✗ |
  | `#2ea043` | ji 工程 | **3.37:1** ✗ |
  | `#e85d04` | men 编排 | **3.50:1** ✗ |
  | `#8b5cf6` | xun 研究 | **4.23:1** ✗ |
- **Fix（R20 已入库，1 行修改 + 1 行删除）**：采用**路径 a（大文本资格）**——`.showcase__card-role` 从 `font-size: var(--font-size-caption)`（14px）+ `font-weight: var(--font-weight-semi)`（600）改为 `font-size: var(--font-size-h3)`（20px）+ `font-weight: var(--font-weight-bold)`（700）。20px ≥ 18.66px 且 700 ≥ 700 → 满足 WCAG 大文本资格 → 3:1 阈值适用 → 六色全过（最低 3.14:1 ≥ 3.0）。同时删除 `.showcase__card--team .showcase__card-role { font-size: var(--font-size-h4); }` 覆盖（原 17px 也不达标，删除后团队卡继承基规则 20px）。
- **Found（修复后实测，`site/scripts/p2-11-verify.mjs`）**：
  ```
  [men]   20px weight=700 largeText=✓ text="编排与路由核心"
  [si]    20px weight=700 largeText=✓ text="思考与知识管理"
  [ji]    20px weight=700 largeText=✓ text="代码与工程"
  [chi]   20px weight=700 largeText=✓ text="数据/投资评审 / Judge"
  [yi]    20px weight=700 largeText=✓ text="文生图与审美"
  [xun]   20px weight=700 largeText=✓ text="搜索与研究"
  [team]  20px weight=700 largeText=✓ text="团队特性"
  ✅ 全部满足大文本资格 → 3:1 阈值适用
  ```
- **Basis**：WCAG 2.2 §1.4.3（正文 4.5:1）与 §1.4.6（大文本 3:1）。六色在 3:1 下全过（3.14–4.23:1）。路径 a 不改任何色值，对拓扑图/卡片图标/其他使用 `--role-*` 的元素零影响。
- **Note**：定级 P2（WCAG AA 违规不低于 P2）。选择路径 a 而非路径 b（加深色值）的理由：(1) 不改色值 → 对拓扑图/卡片图标零影响，最符合「不重做视觉风格」约束；(2) 1 行修改 vs 6 行令牌改动，更小；(3) 角色标签 14→20px 的视觉变化限于标签文字本身，且角色标签本就是子标题性质，增大字重是合理的层级强化。截图证据：`home-1440.png` 展示卡片区（修复前 14px → 修复后 20px+700）。与 P3-8（R15 已修）已解耦：P3-8 建立的单一真相源使本条只需改 1 行 CSS，无需协调两个真相源。

#### P2-12 信息排版 · 标题层级 — `--font-size-h5` 从未定义，4 处使用导致标题退化（R18 已修复 · 定义令牌 `1rem`）

- **位置**：`site/src/styles/global.css:953`（`.wiki-infobox__title`）、`global.css:1035`（`.doc-section h3`）、`site/src/pages/docs/index.astro:95`（`.docs-category__title`）、`site/src/pages/mechanisms.astro:470`（`.step-card__header h3`）
- **问题**：`--font-size-h5` 在全仓库**只有使用、没有定义**（4 处 `var(--font-size-h5)`，令牌定义区只有 display/h1/h2/h3/h4/body/caption/eyebrow）。`var()` 引用未定义自定义属性且无 fallback 时，声明在 computed-value 阶段失效；`font-size` 是可继承属性，故**退化为继承值**。其中 2 处是 `<h3>`，实际渲染为 16px = 正文字号；`.wiki-infobox__title` 因父容器 `.wiki-infobox` 设 `font-size: var(--font-size-caption)`（14px），退化至 14px。
- **Found（修复前实测，`site/scripts/h5-measure.mjs`）**：
  ```
  /mechanisms/   .step-card__header h3    font-size=16px  weight=600  text="CERTAINTY 需求确认"
  /docs/         .docs-category__title    font-size=16px  weight=600  text="入门"
  /docs/overview/ .wiki-infobox__title    font-size=14px  weight=600  text="基本信息"
  基准：body=16px
  ```
- **Fix（R18 已入库，1 行）**：在令牌定义区 h4 之后新增 `--font-size-h5: 1rem;`（16px）。取值依据：标题级 h1(30) > h2(24) > h3(20) > h4(17) > body(16) > caption(14)，h5 自然落在 h4 与 body 之间，但间隙仅 1px，故取 `1rem`（= body）—— 最小标题以字重区分（4 处使用点均配 `font-weight: var(--font-weight-semi)` = 600），符合「最小标题 = 正文字号 + 粗体」的常见模式。R13 原建议 `1.0625rem`（17px = h4）会造成 h5 = h4 重复；`1rem` 更合理。
- **修复后实测（`h5-measure.mjs`）**：
  ```
  /mechanisms/   .step-card__header h3    font-size=16px  ✓ 不变
  /docs/         .docs-category__title    font-size=16px  ✓ 不变
  /docs/overview/ .wiki-infobox__title    font-size=16px  ← 14px→16px（修好退化）
  ```
  4 处中 3 处零视觉变化（继承值 = 令牌值 = 16px）；1 处 `.wiki-infobox__title` 从 14px→16px，修正了标题退化至与信息框正文（14px caption）同大的 bug —— 修复后标题 16px > 正文 14px，层级恢复正确。
- **Basis**：`检查要点 · 排版`（标题层级）。命令输出（`site/scripts/heading-size-audit.mjs`，修复前）：
  ```
  mechanisms/index.html   h3=16px h3=16px h3=16px   ← h3 = 正文 16px（退化）
  ```
  R5 的标题层级检查只校验 DOM 语义级次，不校验渲染尺寸，故 R5 判 0 缺陷与本报告不冲突。
- **Note**：定级 P2（核心内容页视觉层级失效）。非 WCAG 违规（WCAG 2.4.6 只要求标题描述准确，不要求视觉尺寸大于正文）。影响面：`mechanisms/index.html` 的 10 步协议卡（该页核心内容）。修复后 build 0、check-site 0、11/11 检查器 0、token-ratio-check 0 失准、`node --test` 149 pass / 0 fail、verify PASS=9。截图证据：`home-1440.png`（机制区 h3 与正文同大 → 修复后仍为 16px，因 h5=body 是设计取舍）。

### P3（R3 · `!important` 与内联样式滥用）

#### P3-1 样式代码 — `!important` 掩盖特异性债务（已修复）

- **位置**：`site/src/styles/global.css:1201-1202`
- **问题**：720px 断点下的 `.wiki-top` 单栏覆盖靠 `!important` 兜底。根因是 `:952-953` 两条 `:has()` 变体的特异性为 **0,3,1**（class + 两个 `:has` 内含 class），压过基线 `.wiki-top` 的 **0,1,0**，断点规则无法在层叠中胜出。
- **Found（原文逐字，修复前）**：
  ```css
  @media (max-width: 720px) {
    .wiki-top { grid-template-columns: 1fr !important; }
  ```
  竞争规则（同文件）：
  ```css
  .wiki-top { grid-template-columns: minmax(240px, 300px) 1fr; }                                  /* L945-947 · 0,1,0 */
  .wiki-top:has(> .wiki-infobox):not(:has(> .wiki-toc)) { grid-template-columns: minmax(240px, 300px); } /* L952 · 0,3,1 */
  .wiki-top:not(:has(> .wiki-infobox)):has(> .wiki-toc) { grid-template-columns: 1fr; }            /* L953 · 0,3,1 */
  ```
- **Expected**：断点覆盖以「等特异性 + 更靠后的层叠位置」胜出，不依赖 `!important`。
- **Fix（已入库，可复制）**：
  ```css
  @media (max-width: 720px) {
    /* 与 L945/L952/L953 三个竞争选择器对齐特异性（最高 0,3,1），靠层叠顺序胜出，无需 !important */
    .wiki-top,
    .wiki-top:has(> .wiki-infobox):not(:has(> .wiki-toc)),
    .wiki-top:not(:has(> .wiki-infobox)):has(> .wiki-toc) { grid-template-columns: 1fr; }
  ```
- **Basis**：`定级表` — P3 润色（无用户可见影响，纯代码卫生）。命令输出（构建后）：
  ```
  .wiki-top,.wiki-top:has(>.wiki-infobox):not(:has(>.wiki-toc)),.wiki-top:not(:has(>.wiki-infobox)):has(>.wiki-toc){grid-template-columns:1fr}
  !important anywhere in wiki-top rule? → none (good)
  ```
- **Note**：`npm run build` exit 0 → `node tmp/verify-r3.mjs` 断言 A/B/C/D/E/F 全 PASS → `check-site.mjs` exit 0。三条选择器语义均正确（基线双栏 / infobox-only / toc-only 在移动端都应塌缩为单栏）。

#### P3-2 样式代码 — 重复的 `prefers-reduced-motion` 块 + 死代码（已修复）

- **位置**：`site/src/styles/global.css:878-897`（修复前）
- **问题**：文件内存在**第二个** `@media (prefers-reduced-motion: reduce)` 块，把 `:267-276` 已声明过的 `*` / `*::before` / `*::after` 通用规则整段重复了一遍，且数值不一致（`:271` 为 `0ms`，`:886` 为 `0.01ms`；后者靠层叠顺序生效，使前者的 `0ms` 意图失效）。此外该块内的 `.oc-hero-art pre { animation: none !important; }` 是**死代码** —— `.oc-hero-art pre` 规则（`:790-801`）与其唯一实现 `HeroArt.astro:209-218` 的 `.dither-band pre` 均无 `animation` 属性，全仓库无 `pre` + `animation` 组合。
- **Found（原文逐字，修复前）**：
  ```css
  /* ---------- Reduced motion 全面覆盖 ---------- */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }

    .oc-hero-art pre {
      animation: none !important;
    }

    main {
      animation: none !important;
    }
  }
  ```
- **Expected**：通用 `*` 规则只声明一次；无对应动画的选择器不写覆盖；`main { animation: none !important }` 必须保留（`global.css:380-381` 的 `main` 确有 `animation: page-fade-in`）。
- **Fix（已入库，可复制）**：
  ```css
  /* ---------- Reduced motion 补充（全局 * 规则见 L266，避免重复声明与 0ms/0.01ms 不一致） ---------- */
  @media (prefers-reduced-motion: reduce) {
    main {
      animation: none !important;
    }
  }
  ```
- **Basis**：`定级表` — P3 润色（重复声明无用户影响；死代码 `animation: none` 作用于无动画元素为 no-op）。命令输出：
  ```
  === !important 计数（构建产物）===  总计: 10   （全部位于 prefers-reduced-motion）
  B. .oc-hero-art pre { animation:none } 已移除: YES
  C. main { animation:none !important } 保留: YES
  ```
- **Note**：行为变更仅一处 —— `transition-duration` 由实际生效的 `0.01ms` 变为 `0ms`（即 `:271` 的原始意图）。两者对用户均表现为「无过渡」，且 `.reveal` 块的 `transition: none` 更彻底，无回归风险。`npm run build` / `check-site.mjs` / `node --test` 均 exit 0。

#### P3-3 样式代码 — 内联样式硬编码色值绕过令牌（已修复）

- **位置**：`site/src/pages/index.astro:230`
- **问题**：团队特性卡片的强调色以内联字面量写死，绕过了令牌系统。同一文件 `:208` 的其它卡片走 `a.color`（数据驱动），此处单独硬编码，形成不一致。
- **Found（原文逐字，修复前）**：
  ```html
  <article class="showcase__card showcase__card--team" style={`--card-accent: #e85d04`}>
  ```
  该字面量与 `site/src/styles/global.css:122` 的令牌定义完全相同：
  ```css
  --color-accent: #e85d04;                     /* 主强调 · 仅大文本 / 填充 / 边框 · 3.4:1 on #fafafa */
  ```
- **Expected**：自定义属性应引用令牌（`var(--color-accent)`），使未来新增暗色主题时卡片强调色自动跟随，而非永久钉死为浅色系色值。
- **Fix（已入库，可复制）**：
  ```html
  <article class="showcase__card showcase__card--team" style={`--card-accent: var(--color-accent)`}>
  ```
- **Basis**：`检查要点 · 样式`（内联滥用 / 裸色值）。命令输出：
  ```
  E. 内联硬编码 #e85d04 已移除（index.html）: YES
  ```
- **Note**：今日 `--color-accent` 全仓库仅 `global.css:122` 一处定义且值为 `#e85d04`，故本次改动**视觉零差异**；价值在于建立令牌纪律，避免站点未来引入暗色主题时该卡片成为唯一不跟随主题的元素。

#### P3-4 样式代码 — 单属性内联样式（已修复）

- **位置**：`site/src/pages/index.astro:234`
- **问题**：单个 `font-size` 以内联样式覆盖，父元素 `.showcase__card--team` 已有类名可作为选择器前缀，无需内联。
- **Found（原文逐字，修复前）**：
  ```html
  <p class="showcase__card-role" style="font-size: var(--font-size-h4);">团队特性</p>
  ```
  被覆盖的基线（同文件 `:624`）：
  ```css
  .showcase__card-role { font-family: var(--font-mono); font-size: var(--font-size-caption); font-weight: var(--font-weight-semi); color: var(--card-accent); }
  ```
- **Expected**：尺寸差异用修饰类表达，内联样式仅用于无法静态化的逐项动态值。
- **Fix（已入库，可复制，2 行）**：
  ```html
  <p class="showcase__card-role showcase__card-role--team">团队特性</p>
  ```
  ```css
  .showcase__card-role { font-family: var(--font-mono); font-size: var(--font-size-caption); font-weight: var(--font-weight-semi); color: var(--card-accent); }
  .showcase__card--team .showcase__card-role { font-size: var(--font-size-h4); }
  ```
- **Basis**：`检查要点 · 样式`（内联滥用）。命令输出：
  ```
  D. showcase__card-role--team 生效: YES
  F. inline font-size 已移除: YES
  ```
- **Note**：采用「父类 + 子类」后代选择器而非孤立修饰类，特异性 0,2,0 高于基线 0,1,0，无需 `!important`；Astro 作用域编译后为 `.showcase__card--team[data-astro-cid-lcdefpme] .showcase__card-role[data-astro-cid-lcdefpme]`，已在构建产物中确认。

#### P3-5 样式代码 — 站点为单主题（仅浅色），无双主题令牌（未修 · 设计取舍）

- **位置**：`site/src/layouts/BaseLayout.astro:23`、`site/src/styles/global.css:110-127`
- **问题**：全站无暗色主题 —— 无 `prefers-color-scheme` 查询、无 `data-theme` / `.dark` 选择器、无第二套色令牌，`html` 上 `color-scheme: light` 被显式钉死；`theme-color` meta 为静态字面量。用户操作系统处于暗色模式时仍得到浅色页面。
- **Found（原文逐字）**：
  ```html
  <!-- site/src/layouts/BaseLayout.astro:23 -->
  <meta name="theme-color" content="#fafafa" />
  ```
  ```css
  /* site/src/styles/global.css:110 */
  --color-bg: #fafafa;
  /* ... :236 附近 html 规则内 */
  color-scheme: light;
  ```
  全仓库 `--color-accent:` 定义数：**1**（仅 `global.css:122`）；`grep -r "prefers-color-scheme|data-theme|\.dark"` 于 `site/src`：**0 命中**。
- **Expected**：若声明支持双主题，则需第二套令牌 + `@media (prefers-color-scheme: dark)`（或 `data-theme` 开关）+ 动态 `theme-color`。
- **Fix**：**本轮不改**。属视觉风格与令牌语义范畴，受「不重做视觉风格、不改令牌语义」硬约束限制；且 WCAG 2.x 未强制暗色模式，不构成 AA 违规。
- **Basis**：`检查要点 · 样式`（断点与双主题令牌一致）；`定级表` — P3。令牌一致性本身是 **PASS**（单一定义，无冲突）。
- **Note**：**对 ③ 视觉留档的影响** —— 抽样规则要求「明暗主题」，本站无暗色主题，故明暗维度**塌缩为仅「明」**；截图计划中的 `*-dark.png` 全部标注为 N/A（主题不存在），而非 UNKNOWN。此项在 ③ 执行轮需用户确认是否接受该塌缩。

#### P3-6 样式代码 · 裸色值 — canvas 兜底值与令牌定义不符（已修复）

- **位置**：`site/src/components/HeroCanvas.astro:21`
- **问题**：从 CSS 自定义属性读取强调色的**兜底值与令牌实际定义不符**。`--color-accent` 定义为 `#e85d04`（`global.css:122`），兜底却写成了 `#63fe13`（霓虹绿）。一旦 `getPropertyValue` 返回空串，门图 canvas 会画出**错误品牌色**。另两个兜底（`#d9d9d9` / `#fafafa`）与 `--color-line`（`:131`）、`--color-bg`（`:110`）一致，仅此项失配。
- **Found（原文逐字，修复前）**：
  ```js
  const accentColor = cs.getPropertyValue('--color-accent').trim() || '#63fe13';
  const faintColor = cs.getPropertyValue('--color-line').trim() || '#d9d9d9';   // ✓ 与 :131 一致
  const bgColor = cs.getPropertyValue('--color-bg').trim() || '#fafafa';          // ✓ 与 :110 一致
  ```
- **Expected**：兜底值必须与令牌定义逐字一致 —— 兜底的语义就是「令牌缺失时退化为设计系统声明的颜色」，退化成另一个颜色等于静默改设计。
- **Fix（已入库，可复制）**：
  ```js
  const accentColor = cs.getPropertyValue('--color-accent').trim() || '#e85d04';
  ```
- **Basis**：`检查要点 · 样式`（裸色值 / 令牌一致）。命令输出（修复后 `tmp/color-check.mjs`）：
  ```
  site/src/components/HeroCanvas.astro:21  #e85d04  ←  const accentColor = cs.getPropertyValue('--color-accent').trim() || '#e85d04';
  ```
- **Note**：定级 P3 而非 P2 —— `:root` 全局定义了 `--color-accent`，兜底路径实际不会触发，属**潜伏错误**而非当前可见缺陷；但错兜底比无兜底更危险（静默产生错误视觉），故修。`npm run build` exit 0，`check-site.mjs` exit 0。

#### P3-7 样式代码 · 裸色值 — 主强调色绕过令牌（已修复）

- **位置**：`site/src/pages/index.astro` 共 10 处（`:303` SVG 属性、`:557`、`:572`、`:583`×2、`:679`、`:688`、`:700`、`:732`、`:753`）
- **问题**：主强调色 `#e85d04` 在 CSS 与 SVG 中硬编码 10 处，全部等于 `global.css:122` 的 `--color-accent`。终端组件（tab 下划线 / PS1 提示符 / 复制按钮 hover）与拓扑图（分叉贝塞尔线 / 流动圆点 / hub 节点 / hub 脉冲 / 图例点 / 箭头 marker）全部钉死为字面量，与同文件 `:208` 走 `a.color` 令牌引用的写法不一致。
- **Found（原文逐字，修复前，取 3 处代表）**：
  ```css
  .terminal__tab[aria-selected="true"] { color: #1f2328; border-bottom-color: #e85d04; }   /* :557 */
  .terminal__ps1 { ... color: #e85d04; ... }                                                /* :572 */
  .topo-bezier--branch { stroke: #e85d04; stroke-opacity: 0.45; }                           /* :679 */
  ```
  ```html
  <path d="M0,0L10,5L0,10z" fill="#e85d04" />                                              /* :303 · SVG marker 箭头 */
  ```
- **Expected**：已有令牌的颜色一律 `var(--color-accent)`。SVG **表现属性**（`fill=`/`stroke=`）不支持 CSS 自定义属性，必须改用 `style` 属性或 CSS 规则。
- **Fix（已入库，可复制）**：9 处 CSS 直接替换为 `var(--color-accent)`；1 处 SVG 属性改为 `style`：
  ```html
  <path d="M0,0L10,5L0,10z" style="fill: var(--color-accent)" />
  ```
- **Basis**：`检查要点 · 样式`（裸色值）。命令输出（构建后）：
  ```
  index.astro total: 96   unique: 22   #e85d04 x1    （仅剩 :42 数据数组）
  <path d="M0,0L10,5L0,10z" style="fill: var(--color-accent)" data-astro-cid-lcdefpme>      ← dist/index.html
  ```
  全量残留核对：`#e85d04` 在源码仅剩 7 处 —— `global.css:122-128`（令牌定义，不报）、`HeroCanvas.astro:21`（兜底，P3-6 已对齐）、`index.astro:42`（数据数组）。
- **Note**：今日视觉零差异（单主题，令牌值即 `#e85d04`）。价值：品牌色收敛到单一来源，未来加暗色主题时终端与拓扑图自动跟随，不会成为漏改点。`npm run build` exit 0、`link-check` 断链 0、`empty-check` 空实现 0、`check-site.mjs` exit 0。

#### P3-8 样式代码 · 裸色值 — 角色色双源真相（R15 已修复 · 单一真相源建立）

- **位置**：`site/src/styles/global.css:131-139`（新增 `--role-*` 令牌）↔ `site/src/pages/index.astro`（卡片数据 + 拓扑图 CSS + SVG marker）
- **问题**：6 个角色色存在**两个真相源**。JS 数组驱动卡片强调色（原 `:208` `style={--card-accent: ${a.color}}`），拓扑图 CSS 又把同一批色值逐一硬编码进 `stroke` / `fill` / `background`，SVG `<marker>` 再写一遍 `fill="#…"`。改一处不动另一处，两张图就会显示不同颜色。
- **R14 补充判读**：拓扑图是**静态 SVG**，颜色按「哪一步由哪个角色完成」编码流向状态（`--return`/`--verdict` 用记的绿、`--fail`/`--judge` 用持的黄、`--learn`/`--knowledge` 用寻的紫），并非逐 Agent 渲染。因此不能按「Agent 身份」理解，但**色值必须与角色色板一致**，故仍需统一真相源。
- **Fix（R15 已入库，2 文件 · 42 增 37 删）**：
  1. `global.css` 新增 6 个 `--role-*` 令牌作为唯一真相源；`--role-men` 写 `var(--color-accent)` 而非字面量，避免与主强调色再次分叉
  2. `index.astro` JS 数据数组**删除 6 处 `color:` 字段**，卡片改为 `style={`--card-accent: var(--role-${a.id})`}` —— JS 不再持有颜色值，只持有角色 id
  3. 拓扑图 CSS 26 处字面量改为 `var(--role-*)`
  4. 3 个 SVG `<marker>` 由 `fill="#…"` 改为 `style="fill: var(--role-*)"`（SVG 表现属性不接受 `var()`，同页 `:303` 的主强调色箭头早已用此写法）
- **角色色字面量：全仓 36 处 → 5 处**（5 处全部为 `global.css:135-139` 的令牌定义，按规则不报）。`index.astro` 内残留 0 处。
- **Basis**：`检查要点 · 样式`（死代码与裸色值 / 令牌一致）。命令输出（`tmp/color-check.mjs`，重构后）：
  ```
  #4a90d9 ×1  site/src/styles/global.css:135
  #2ea043 ×1  site/src/styles/global.css:136
  #bf8700 ×1  site/src/styles/global.css:137
  #a371f7 ×1  site/src/styles/global.css:138
  #8b5cf6 ×1  site/src/styles/global.css:139
  ```
  `index.astro` 内 `Select-String "#(4a90d9|2ea043|bf8700|a371f7|8b5cf6)"` = 0 命中；`var(--role-` 引用 32 处；JS 数组 `color: '#'` = 0 处。
- **Note 验证方式**：`site/scripts/role-token-verify.mjs`（新增）在浏览器中实测 **27 项断言全过**：6 个令牌定义值、6 张卡片的 `--card-accent` 书写值及其消费端（`.showcase__card-icon` / `.showcase__card-role` 的 `color`）、11 个拓扑图元素的 `fill`/`stroke`/`border-color`、4 个 SVG marker 的 `fill` —— 全部解析为重构前的预期 hex，**零视觉漂移**。
  - 脚本踩到一个坑值得留档：`getComputedStyle(el).getPropertyValue('--card-accent')` 返回的是**原样书写值**（`#e85d04`），不是解析后的 `rgb()` —— 自定义属性不做颜色解析。首版断言因此误报 6 处「不一致」，实际消费端 `color` 全部正确。断言已改为比对书写值 + 消费端解析值双轨。
- **P2-11 关联**：本重构**不改变任何颜色值**，故 P2-11（六个角色色 14px 正文 3.14–4.23:1）状态不变，仍是待决项 —— 但修复成本因本重构而下降：现在只需改 `global.css` 的 6 行令牌，卡片与拓扑图同时生效。

#### P3-9 样式代码 · 裸色值 — 合法字面量留档（不修 · 分类说明）

以下残留经逐条判读属**合法字面量**，不构成缺陷，仅留档说明为何不走令牌：

| 类别 | 位置 | 值 | 判据 |
|------|------|-----|------|
| Canvas 绘制色 | `HeroArt.astro:132,144` | `rgba(232, 93, 4, <opacity>)` | `CanvasRenderingContext2D.fillStyle` 不接受 `var()`，必须字面量或经 `getComputedStyle` 读取。此处为逐粒子动态透明度插值，字面量最简。 |
| CSS mask 遮罩 | `HeroArt.astro:176,177,220,221` | `#000` ×6 | `mask-image` 依亮度取 alpha，`#000` / `#fff` 是遮罩惯用语义色，无品牌含义，不应占用设计令牌。 |
| 终端 chrome 配色 | `index.astro:544-583` | `#f6f8fa` ×10、`#d0d7de` ×8、`#1f2328` ×9、`#656d76` ×7、`#8b949e`、`#d8dee4`、`#eaeef2`、`#0969da`、`#fff` ×7 | 刻意复刻 GitHub 设计系统的终端外观，属**独立的视觉语言**，与站点暖白纸感体系并存。并入令牌会破坏「这是终端截图」的拟真度。 |
| macOS 红绿灯 | `index.astro`（terminal chrome） | `#ff5f57` / `#febc2e` / `#28c840` | 系统窗口控件色，必须为字面量。 |
| 阴影 / 叠加 | `index.astro:615,713` | `rgba(0,0,0,0.06)`、`rgba(255,255,255,0.85)`、`rgba(255,255,255,0.75)` | 投影与半透明白叠是常规实现，令牌系统未定义阴影族。 |
| HTML meta | `BaseLayout.astro:23` | `<meta name="theme-color" content="#fafafa">` | `content` 是 HTML 属性，不支持 CSS 变量。见 P3-5。 |
| 误报（已排除） | `BackgroundCanvas.astro:5`、`releases.astro:144,147,148,149` | `#fafafa` 注释、`#109`/`#117`/`#116`/`#117` | 前者为注释文本，后 4 处为 GitHub issue 编号，非颜色。 |

**Basis**：`检查要点 · 样式`（裸色值）；`排除范围`（令牌中的裸值定义不报）。

#### P3-10 样式代码 — 死令牌：定义后从未使用（R19 已处置 · 保留 2 / 删除 2）

- **位置**：`site/src/styles/global.css:121` `--color-fg-decorative`、`global.css:126` `--color-accent-soft`
- **问题**：两个色令牌定义后全仓库零引用。`--color-fg-decorative`（`#8a8a8a`，3.31:1）若被用于正文即为 P2；`--color-accent-soft`（`#c94700`，4.59:1 on #fafafa）为中等强度橘变体。
- **R19 处置**：**保留两枚**。理由：
  - `--color-fg-decorative` 是前景文字 5 级梯度（`--color-fg` → `--color-fg-secondary` → `--color-fg-tertiary` → `--color-fg-muted` → `--color-fg-decorative`）的第 5 级，组注释 L114-116 已文档化该梯度。删除会使文档化的 5 级降为 4 级，破坏设计系统的完整性。该令牌有明确的受限用途（装饰性大写小字），非「无用」而是「待用」。
  - `--color-accent-soft` 是强调色体系（light → soft → dark）的中等强度档，逻辑上填补 `--color-accent`（3.35:1）与 `--color-accent-dark`（6.41:1）之间的间隙。虽零引用，但作为设计系统的中间档保留合理。
- **Basis**：`检查要点 · 样式`（死代码）。R19 复核命令输出：
  ```
  grep 'color-fg-decorative' site/src   → 2 命中（定义 + 组注释，0 处 var() 引用）
  grep 'color-accent-soft' site/src     → 1 命中（定义，0 处 var() 引用）
  ```
- **Note**：定级 P3（死代码 / 设计系统卫生）。保留是设计取舍，非遗漏：删除会破坏文档化的令牌梯度。**另 2 枚死令牌（`--color-accent-on-accent-soft`、`--font-size-eyebrow-rail`）已在 R19 删除**，见 P3-21。

#### P3-11 样式代码 — 死 CSS：`.oc-hero-art` 规则块无对应元素（R17 已修复 · 删除死代码）

- **位置**：`site/src/styles/global.css:804-828`（修复前；含 `.oc-hero-art` 与 `.oc-hero-art pre` 两条规则 + 注释）
- **问题**：`.oc-hero-art` 类名在全部 14 个源文件与 14 个构建产物中**零出现**，对应 CSS 为死代码。其中 `.oc-hero-art pre` 声明 `font-size: 11px; color: var(--color-accent); opacity: 0.35` —— 若真被使用，11px 强调色文本将构成 P2 对比度违规。
- **Found（原文逐字）**：
  ```css
  .oc-hero-art pre {
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.3;
    letter-spacing: 1px;
    color: var(--color-accent);
    opacity: 0.35;
  ```
- **Fix（R17 已入库）**：删除 `global.css:804-828`（注释 `/* ---------- Hero 顶部抖动弧线占位 ---------- */` + `.oc-hero-art { ... }` + `.oc-hero-art pre { ... }`，共 25 行）。R3 已从 reduced-motion 块中删除 `.oc-hero-art pre { animation: none }`，本条删除主规则块，二者合并完成清理。
- **Basis**：`检查要点 · 样式`（死代码）。R17 复核命令输出：
  ```
  Select-String -Path site\src\styles\global.css -Pattern 'oc-hero-art'  → 0 命中 ✓
  Select-String -Path site\dist\_astro\*.css -Pattern 'oc-hero-art'      → 0 残留 ✓
  ```
- **Note**：定级 P3（死代码）。删除后 build 0（15 页）、check-site 0、11/11 检查器 0、`!important` 仍 13、`node --test` 149 pass / 0 fail、verify PASS=9。

#### P3-12 样式代码 — 令牌注释声称的对比度值失准（R16 已修复 · 附防回归检查器）

- **位置**：`site/src/styles/global.css:114-126,148`（11 处声称值 + 1 处组注释）
- **问题**：令牌注释中标注的对比度与 WCAG 公式实算值存在偏差。R16 全量复查发现 **11 项声称值中 8 项偏差 > 0.15**（R13 初查仅覆盖 7 项、判 6 项失准）。方向不一致（既高报也低报），说明数值是估算而非实测，会误导后续开发者对令牌可用范围的判断。
- **Found（R16 全量复查 · 原文逐字 vs 实算）**：
  | 令牌 | 注释声称 | 实算 | 偏差 |
  |------|---------|------|------|
  | `--color-fg` | 17:1 | **16.67:1** | −0.33 ✗ |
  | `--color-fg-secondary` | 9.3:1 | **9.93:1** | +0.63 ✗ |
  | `--color-fg-tertiary` | 5.6:1 | **6.41:1** | +0.81 ✗ |
  | `--color-fg-muted` | 4.6:1 | **4.54:1** | −0.06 ✓ |
  | `--color-fg-decorative` | 3.3:1 | **3.31:1** | +0.01 ✓ |
  | `--color-accent` | 3.4:1 | **3.35:1** | −0.05 ✓ |
  | `--color-accent-dark` | 5.7:1 | **6.41:1** | +0.71 ✗ |
  | `--color-accent-soft` | 4.1:1 | **4.59:1** | +0.49 ✗ |
  | `--color-accent-on-accent` | 8.8:1 | **5.66:1** | **+3.14** ✗（最大） |
  | `--color-accent-on-accent-soft` | 6.5:1 | **4.97:1** | +1.53 ✗ |
  | `--color-code` | 17:1 | **15.96:1**（on `#f5f5f5`） | +1.04 ✗ |
  另有 **L114 组注释**声称「每级都满足 WCAG 2.2 AA 4.5:1 on #fafafa」，但 `--color-fg-decorative` 实测 3.31:1，**组注释为错误概括**。
- **Expected**：注释中的对比度应标注实测值并注明测试背景，组注释不得对含 <4.5 成员的集合声称全部达标。
- **Fix（R16 已入库，1 文件 · 14 增 12 删）**：逐一将 11 处声称值改为 WCAG 相对亮度公式实算值；每处补注 `on #背景`；组注释拆为多行并注明 `--color-fg-decorative` 为 3.31:1、禁用于正文。示例（修复后原文逐字）：
  ```css
  --color-fg: #1a1a1a;                         /* 正文 / 标题 · 16.67:1 on #fafafa */
  --color-fg-muted: #737373;                   /* 弱化文本 · 4.54:1 on #fafafa（仅勉强达标，勿用于浅底面板上的小字） */
  --color-fg-decorative: #8a8a8a;              /* 仅装饰 / 大写小字 · 3.31:1（<4.5，禁用于正文） */
  --color-accent-on-accent: #0a0a0a;           /* 橘底文字 · 5.66:1 on #e85d04（原注释 8.8:1 失准 +3.14，为全块最大失准项） */
  ```
- **Basis**：`检查要点 · 排版`（正文对比 ≥4.5:1）。命令输出（`tmp/ratio-check.mjs`，R16 全量复查）：
  ```
  失准 8 / 11 项，失准绝对值合计 8.78，平均 0.80
  → 1 级不满足 4.5:1，L114 组注释为错误概括
  ```
- **Note（验证方式 + 防回归）**：新增 `site/scripts/token-ratio-check.mjs` 解析 global.css 令牌行注释中的 `N:1 on #rrggbb` 声称值，用 WCAG 相对亮度公式实算并比对，任何 >0.05 的偏差即报错退出 1。该检查器在修复过程中**抓到本条自身的一处错误**：初版把 `--color-code` 的 `15.96:1` 标注为 `on #fafafa`，但 `--color-code` 实际渲染在 `--color-code-bg: #f5f5f5` 上（#1a1a1a on #f5f5f5 = 15.96:1，而 on #fafafa = 16.67:1）—— 已修正为 `15.96:1 on #f5f5f5（--color-code-bg）`。修复后复查输出：`共检查 10 项声称值，失准 0 项 ✅ 全部一致`（`--color-fg-decorative` 注释不含 `on #bg` 格式故不在自动检查范围，由组注释修正覆盖）。
  - 因果关联：`--color-fg-muted` 原 4.6:1 声称掩盖了 P2-3 的实际风险（在 `#f5f5f5` 上仅 4.35:1），两者现已各自标注真实值。

#### P3-13 样式代码 — 重复的 `:focus-visible` 全局块（已修复）

- **位置**：`site/src/styles/global.css:470-475`（修复前）
- **问题**：全局 `:focus-visible` 声明了两次。第一份（`:470-475`）使用 `var(--color-accent)` + `outline-offset: 2px`；第二份（`:872-877`，注释自称「已有 · 此处为保险」）使用 `var(--color-accent-dark)` + `outline-offset: 3px` + `border-radius`。两份选择器特异性完全相同（`0,1,0`），第二份在层叠顺序上胜出，**第一份的三个属性全部被覆盖，为死代码**。与 R3 P3-2（重复 reduced-motion 块）同一反模式：在文件后部加一份「保险」副本，而不修改原声明。
- **Found（原文逐字，修复前）**：
  ```css
  /* ---------- Focus visible ---------- */
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  ```
- **Expected**：全局焦点样式唯一声明。
- **Fix（已入库，可复制）**：删除第一份，保留位置注释说明去向：
  ```css
  /* ---------- Focus visible ----------
     全局唯一声明见下方 L873 的 :focus-visible 块（var(--color-accent-dark) / outline-offset: 3px）。
     此处原有一份使用 var(--color-accent) 的副本，被下方块完全覆盖，R7 已删除。 */
  ```
- **Basis**：`检查要点 · 样式`（死代码）。命令输出：
  ```
  === 3. :focus-visible 声明数（应为 1）===
  site/dist/_astro/BaseLayout.CEJ6rBdT.css: 1        ← 修复前为 2
  ```
- **Note**：保留的第二份使用 `--color-accent-dark`（6.41:1），恰好是 R6 P2-1 确认的正确令牌 —— 焦点指示器作为非文本元素适用 §1.4.11（3:1），两个令牌都达标，但 `accent-dark` 更稳。删掉的死代码若某日因层叠变化被激活，其 `--color-accent` 版本在文本焦点语境下会构成 P2（见 P2-1）。

#### P3-14 元素一致性 · 键盘焦点 — skip-link 用 `outline: none` 关闭默认轮廓（未修 · 合规留档）

- **位置**：`site/src/layouts/BaseLayout.astro:90-94`
- **问题**：skip-link 的 `:focus` 规则显式关闭了 `outline`。硬约束明确禁止「用 `outline:none` 掩盖问题」，故必须逐条判定：此处**不属于掩盖** —— skip-link 未聚焦时位于 `top: -40px`（屏幕外），`:focus` 时 `top: var(--space-4)` 滑入视野，其自身外观（`background: var(--color-accent)` 橘底 + `color: var(--color-accent-on-accent)` 深字）即为焦点指示器，文字对比度 5.66:1（R6 实测）。WCAG §2.4.7 要求「焦点指示器可见」，未规定必须用 outline。
- **Found（原文逐字）**：
  ```css
  .skip-link {
    position: absolute;
    top: -40px;
    ...
    background: var(--color-accent);
    color: var(--color-accent-on-accent);
    ...
  }

  .skip-link:focus {
    top: var(--space-4);
    outline: none;
    text-decoration: none;
  }
  ```
- **Expected**：保留替代指示器的前提下可关闭 outline；若想进一步加固（高对比度显示模式），可移除 `outline: none` 让全局 `:focus-visible` 叠加显示。
- **Fix**：**本轮不改** —— 当前实现已合规且是刻意设计的视觉语言，改动属「重做视觉风格」，受硬约束限制。
- **Basis**：WCAG 2.2 §2.4.7 Focus Visible；`检查要点 · 元素`（焦点可见）。命令输出（`tmp/focus-check.mjs`）：
  ```
  site/src/layouts/BaseLayout.astro:92  替代指示器: 视觉属性变化
  ```
- **Note**：`.skip-link:focus` 特异性 `0,1,1` 高于全局 `:focus-visible` 的 `0,1,0`，因此 outline 确实被关闭；替代指示器为元素位移 + 高对比度背景。定级 P3（合规实现，仅留档防未来回归）。

#### P3-15 功能稳定 · 核心网页指标 — `font-display: swap` 字体回流导致 CLS（未修 · 已缓解）

- **位置**：`site/src/styles/global.css:14,21`
- **问题**：两个 `@font-face` 均用 `font-display: swap`。字体加载期间文本用回退栈（`"PingFang SC", "Microsoft YaHei", system-ui, sans-serif`）渲染，字体到达后**整页文本回流** = CLS 来源。单字体 744 KB，在多数链路上几乎必然晚于首屏。
- **Found（原文逐字）**：
  ```css
  @font-face {
    font-family: "OPPO Sans";
    src: url("https://code.oppo.com/.../OPPOSansOS2-5000-Regular.woff2") format("woff2");
    font-weight: 400;
    font-display: swap;
  }
  ```
- **Expected**：将 CLS 控制在 0.1 以内。
- **Fix**：**本轮不改**。`swap` → `optional` 可消除回流，但 `optional` 的语义是「若 100 ms 内未就绪则永不交换」—— 744 KB 字体在 100 ms 内几乎不可能就绪，等于**站点永远用回退字体**，自定义字体形同虚设。已用 P2-7 的 `preconnect` + `preload` 缩短字体到达时间作为缓解手段。
- **Basis**：`检查要点 · 功能`（CLS≤0.1）。命令输出：
  ```
  font-display 分布: {"swap":2}
    swap   → 字体加载后文本回流 = CLS 来源（字体 744KB/个，极可能晚于首屏）
  ```
- **Note**：回退栈为 CJK 字体（PingFang SC / Microsoft YaHei），与 OPPO Sans 同为方块字，字形度量差异有限，故回流幅度有界（远小于西文比例字体换等宽的回流）。但 CJK 字体的字距与行高差异仍会产生可测量 CLS —— **实际幅度需 Playwright 实测才能判定是否超过 0.1**，本轮标记 UNKNOWN。定级 P3：已合规的字体加载策略 + 已有缓解，非当前最优但无更好低成本选项。

#### P3-16 功能稳定 · 核心网页指标 — 单字体文件 744 KB 偏大（未修 · 需设计决策）

- **位置**：`site/src/styles/global.css:11,18`
- **问题**：单个 woff2 文件 744,800 字节，是常规 woff2（10–100 KB）的 **7–74 倍**。注释说明「覆盖约 5000 常用字，生僻字自动降级系统字体」—— 即已做过字符集裁剪，但 5000 字仍导致体积巨大。
- **Found（原文逐字）**：
  ```css
  /* OPPO Sans（免费商用 · 官方 CDN woff2，覆盖约 5000 常用字，生僻字自动降级系统字体） */
  ```
  实测：`HTTP Length 744800`（2 个字重各一份 = 1.47 MB）。
- **Expected**：字体体积应与服务端传输成本相称。
- **Fix（建议，本轮不改）**：
  1. `unicode-range` 分片 —— 将 5000 字按常用度拆为多份 `@font-face`，浏览器只下载当前文本实际用到的分片（Google Fonts 的标准做法）；
  2. 或改用已做子集化的第三方分发（需评估 OPPO Sans 的授权范围是否允许二次分发与子集化）。
- **Basis**：`检查要点 · 功能`（LCP≤2.5s）。命令输出：站点自产 472.3 KB vs 外部字体 1.47 MB，字体占比 75.7%。
- **Note**：定级 P3 —— 体积大但站点自身体积极小（472 KB），且字体有 `font-display: swap` 不阻塞首屏文本；优化需引入子集化工具链或换字体源，属设计/授权决策，超「只改必要行」范围。另注：`--font-mono` 栈（JetBrains Mono / SF Mono / Menlo / Consolas）全为系统字体，**无网络加载成本**，等宽文本不占字体带宽。

#### P3-17 前端安全 · 安全头 — 无任何 CSP 与安全响应头（已修复 · CSP 为务实基线）

- **位置**：`site/public/_headers`（修复前不存在）→ 产物 `site/dist/_headers`
- **问题**：全仓库无 `_headers` / `_redirects` / `netlify.toml` / `vercel.json`，无任何 `Content-Security-Policy` / `X-Frame-Options` / `X-Content-Type-Options` / `Referrer-Policy` 配置。部署目标为 GitHub Pages（`deploy.yml` → `actions/deploy-pages@v4`），原生支持 `_headers`。
- **Found（修复前，命令输出）**：
  ```
  === CSP / 安全头 配置 ===
  （无命中 —— 仅 scripts/setup.mjs 的 CSV 表头与 HTTP Accept 头，均无关）
  === _headers / _redirects / netlify / vercel 配置 ===
  （无输出 = 无托管方头配置文件）
  ```
- **Expected**：静态站至少具备 `nosniff`、`X-Frame-Options`、`Referrer-Policy` 与一条 CSP。
- **Fix（已入库，可复制）**：新增 `site/public/_headers`（Astro 将 `public/` 原样拷入 `dist/` 根，与既有 `CNAME`、`favicon.svg` 同机制）：
  ```
  /*
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' https://code.oppo.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'

  /OPPOSansOS2-*.woff2
    Cache-Control: public, max-age=86400
  ```
- **Basis**：`检查要点 · 安全`（CSP 与安全头）；OWASP Headers Cheat Sheet。命令输出（`tmp/xss-check.mjs`）：
  ```
  源码 public/_headers: ✓
  产物 dist/_headers:   ✓
  X-Content-Type-Options       ✓
  X-Frame-Options              ✓
  Referrer-Policy              ✓
  Permissions-Policy           ✓
  Content-Security-Policy      ✓
  CSP 含 'unsafe-inline': 是 —— 见 Note
  ```
- **Note**：**CSP 是务实基线，不是强约束** —— `script-src` 与 `style-src` 均含 `'unsafe-inline'`，因为 Astro 会把 `.astro` 组件的 `<script>` / `<style>` 内联进 HTML（R9 已确认 `<head>` 内 `<script>` 为 0 但正文内有内联脚本，共 11.3 KB）。收紧 `'unsafe-inline'` 会打断复制按钮、Canvas 粒子与背景动画，需先把内联脚本抽为外部文件（Astro `hoist` / `<script>` 外提）—— 属结构调整，超本轮范围。即便如此，该 CSP 仍封住 `object-src 'none'`（插件内容）、`base-uri 'self'`（`<base>` 注入）、`form-action 'self'`（表单数据外泄）、`img-src`/`connect-src` 限制等攻击面。**无法本地验证响应头实际生效** —— GitHub Pages 才应用 `_headers`，本地 `astro preview` 不读取；受 AGENTS.md「静态站验证走产物级检查、不依赖活服务器」约束，仅验证了文件存在与语法。**`_headers` 不支持注释**（GitHub 文档未记载支持），故文件内无 `#` 注释，本条注释写在报告与提交信息中。

#### P3-18 交互态 · 装饰 SVG 未显式标记 `aria-hidden`

- **位置**：全站 15 页产物，`tmp/state-check.mjs` 第 4 节
- **问题**：SVG 共 **99 个**，其中 `role="img"`/`aria-label` **0 个**、`aria-hidden="true"` **32 个**、**裸标记 67 个**。裸 SVG 未声明可访问性意图。
- **Found**：
  ```
  === 4. SVG 可访问性（role / aria-label / aria-hidden）===
    SVG 总数 99 | role=img/aria-label 0 | aria-hidden 32 | 裸 67
    裸 SVG 中含 <title>/<text> 或裸露文字: 0
    → 裸且无文字 = 67
  ```
- **Expected**：装饰性 SVG 显式 `aria-hidden="true"`，有意义 SVG 用 `role="img"` + `aria-label`。
- **Fix**：**本轮不改**。67 处跨多个文件的批量机械修改，违反「只改必要行」与「≤3 文件」约束。
- **Basis**：`检查要点 · 元素`（alt 与宽高预留）。**无功能性缺陷** —— 67 个裸 SVG 中 **0 个含 `<title>`/`<text>` 或裸露文字**，即纯 `<path>` 装饰图标；浏览器默认将无文本、无 role 的内联 SVG 视为透明节点，不向辅助技术播报。若强行朗读，反而会产生 67 条无名「图形」播报。
- **Note**：定级 P3 的理由是**可访问性意图未显式化**，不是当前行为错误。若后续引入带文字的 SVG（如 `<text>` 标注图），需同步补 `aria-hidden`。建议一次性批量处理（机械替换，可由 CI 脚本化），而非零散改动。

#### P3-19 交互态 · `.btn` 无 `:active` 按压态

- **位置**：`site/src/styles/global.css:400-459`
- **问题**：全站 `:active` 规则仅 **1 条**（`index.astro:657` `.showcase__arrow:active { transform: scale(0.92); }`）。`.btn` 有 `:hover` 位移（`translateX(2px)`）却无 `:active` 加深，鼠标按下与悬停视觉一致，缺少「已按下」反馈。
- **Found**：
  ```
  === 1. 七态覆盖（全站 CSS）===
  active                 1
  ```
  `grep :active` 全仓库唯一命中：`site/src/pages/index.astro:L657: .showcase__arrow:active { transform: scale(0.92); }`
- **Expected**：`:hover` 之后补 `:active` 的按压位移（如 `translateX(4px)`），完成「推门」交互的完整反馈链。
- **Fix**：**本轮不改**（`.btn` 的 `:disabled` 修复已用掉本轮的主要改动；`:active` 属纯视觉润色）。
- **Basis**：`检查要点 · 元素`（七态之 active）。**无 WCAG AA 违规** —— WCAG 2.2 无「按钮须有按压态」的准则；定级 P3 基于交互完整度。
- **Note**：与 P2-9 同区块，若后续补 `:active` 可直接追加在禁用态块之后。`details summary`、`a` 亦无 `:active`，但二者由浏览器 UA 样式提供默认反馈，风险更低。

#### P3-20 样式代码 — 令牌注释声称的对比度值失准（R16 已修复 · P3-12 最大失准项）

- **位置**：`site/src/styles/global.css:125` `--color-accent-on-accent`（及 `:126` `--color-accent-on-accent-soft`）
- **问题**：注释声称 `8.8:1 on #e85d04`，实测 **5.66:1**，失准 **3.14** —— R16 全量复查确认仍为全块最大失准项。`:126` 的 `--color-accent-on-accent-soft` 同步修正：声称 6.5:1 → 实测 4.97:1（失准 1.53）。
  ```
  --color-accent-on-accent: #0a0a0a;  /* 橘底文字 · 8.8:1 on #e85d04 */   ← 声称 8.8
  实测：--color-accent-on-accent #0a0a0a on #e85d04 = 5.66:1
  ```
- **Expected**：注释写实测值 `5.66:1`。
- **Fix（R16 已入库）**：`global.css:125` 改为 `/* 橘底文字 · 5.66:1 on #e85d04（原注释 8.8:1 失准 +3.14，为全块最大失准项） */`；`:126` 改为 `/* 橘底次文本 · 4.97:1 on #e85d04（原注释 6.5:1 失准 +1.53；仍达正文 4.5 阈值） */`。失准方向是「高估」，但 5.66:1 仍 ≥4.5:1，故 P2-10 的修复依然有效 —— 未因注释错误引入新的 AA 违规。
- **Basis**：命令输出（`site/scripts/token-ratio-check.mjs`，R16 防回归检查器）：
  ```
  --color-accent-on-accent       5.66:1   5.66:1  ✓
  --color-accent-on-accent-soft  4.97:1   4.97:1  ✓
  共检查 10 项声称值，失准 0 项 ✅ 全部一致
  ```
- **Note**：定级 P3（文档准确性）。R13 用 `tmp/ratio-check.mjs` 做了声称值 vs 实测值复核；R16 将该工具升级为 `site/scripts/token-ratio-check.mjs`（解析注释、自动比对、退出码驱动），并对全部令牌注释做了统一重算 —— P3-12 的「建议由强模型统一重算」已在 R16 完成，本条随之闭环。

#### P3-21 样式代码 — 死令牌新增 2 例（R19 已修复 · 删除 2 枚冗余令牌）

- **位置**：`site/src/styles/global.css:128` `--color-accent-on-accent-soft`（已删）、`global.css:186` `--font-size-eyebrow-rail`（已删）
- **问题**：两个令牌定义后**全仓库 0 处引用**（仅定义本身 1 处命中）。
- **R19 处置**：**删除两枚**。理由：
  - `--color-accent-on-accent-soft`（`#1a1a1a`）是 `--color-accent-on-accent`（`#0a0a0a`，在用）的**冗余近似重复**：两者都是橘底文字色，#1a1a1a 与 #0a0a0a 在 #e85d04 上的视觉差异可忽略，且「soft」变体对比度更低（4.97:1 vs 5.66:1），无独立存在价值。P2-10 的修复已用 `--color-accent-on-accent` 满足需求。
  - `--font-size-eyebrow-rail`（`0.625rem` = 10px）是 eyebrow 字号系列的第三档（eyebrow 12px 在用 60+ 处、eyebrow-nav 10.5px 在用 2 处、eyebrow-rail 10px **0 处**）。10px 低于 16px 正文下限，是**可访问性陷阱**——若有人使用它会创造子 16px 文本。名称暗示为侧栏（rail）导航预留，但该组件不存在。
- **Basis**：`检查要点 · 样式`（死代码）。R19 复核命令输出：
  ```
  grep 'color-accent-on-accent-soft' site/src   → 0 命中（删除后）✓
  grep 'font-size-eyebrow-rail' site/src         → 0 命中（删除后）✓
  ```
- **Note**：定级 P3（死代码）。删除死令牌与删除死 CSS（P3-11/P3-22，R17）同理：零消费者即零行为影响。P3-10 的两枚令牌（`--color-fg-decorative`、`--color-accent-soft`）保留，因它们属于文档化的令牌梯度。删除后 token-ratio-check 从 10 项降至 9 项、0 失准；build 0、check-site 0、11/11 检查器 0、`node --test` 149 pass / 0 fail、verify PASS=9。

#### P3-22 样式代码 — `.site-footer__legal` 三组规则完全重复（R17 已修复 · 去重）

- **位置**：`site/src/components/Footer.astro:139-141`、`:142-144`、`:145-147`（修复前）
- **问题**：同一组三条规则被**逐字粘贴三次**，共 9 行，其中 6 行为纯重复。第二、三份的 `summary` 行缺失 `letter-spacing: 0.04em`，说明是复制粘贴残留而非刻意三份。
- **Found（原文逐字，修复前）**：
  ```
  139: .site-footer__legal { margin-top: var(--space-6); ... color: var(--color-fg-tertiary); }
  140: .site-footer__legal summary { cursor: pointer; font-family: var(--font-mono); letter-spacing: 0.04em; }  ← 仅此份含 letter-spacing
  141: .site-footer__legal-body p { margin-top: var(--space-2); line-height: 1.7; max-width: 68ch; }
  142-144: （同 139-141，但 summary 行缺 letter-spacing）
  145-147: （同 142-144）
  ```
- **Fix（R17 已入库）**：保留第一份（含 `letter-spacing: 0.04em` 的完整版，L139-141），删除 L142-147（6 行）。R13 已用 `replace_all` 将三份的 `color` 同步改为 `--color-fg-tertiary`，保证去重前行为一致。
- **Basis**：`检查要点 · 样式`（死代码 / 重复）。R17 复核命令输出：
  ```
  Select-String -Path site\src\components\Footer.astro -Pattern 'site-footer__legal \{'  → L139（唯一）
  ```
- **Note**：定级 P3（死代码 / 维护成本）。删除后 build 0、check-site 0、11/11 检查器 0。与 P3-11 同属本轮死 CSS 清理。

### 无发现记录（R2 空实现）

| 检查项 | 范围 | 结果 |
|--------|------|------|
| `<a>` 空 href | 产物 14 页，462 个 `<a>` | 无 href **0** / `href="#"` **0** / `href=""` **0** / `javascript:` **0** |
| `<button>` 无处理器 | 产物 12 个 `<button>` | 全部接线：3 个 `role="tab"`（`index.astro:811-820`）、7 个 `.terminal__copy`（`:828-829`）、2 个 `showcase-prev/next`（`:897-898`） |
| skip-link 可达 | 源码 `BaseLayout.astro:28` | **14/14 页**均输出 skip-link 且目标 `id="main-content"` 存在 |
| 空跳模式 | 源码全量 | `window.open('')` 0 / `location.href='#'` 0 / `void(0)` 0 / `alert()` 占位 0 |
| `disabled` / `aria-disabled` | 源码全量 | 2 命中，均为合法开关：`CollaborationGraph.astro:355` 播放中置 `disabled`、`:371` 播放完移除 |
| `TODO` / `FIXME` | 源码全量 | 7 命中，**全为误报**：`todo-scan` 校验项名（`architecture.astro:104`、`quickstart.astro:95`、`index.astro:433`、`roles.astro:152`）、plan 产物「TODO List」（`quickstart.astro:112`）、`.env`「占位符」描述（`quickstart.astro:66`）、版本历史「占位」说明（`releases.astro:125`） |
| SVG 内部引用 | 产物 96 个 `<use>` / `<mpath>` | 合法，指向同文档 SVG `id`，非导航链接，不计缺陷 |

**Basis**：`node tmp/empty-check.mjs` → `结果：空实现 0`（exit 0）；`node tmp/empty-check2.mjs` → `含 skip-link 的页面: 14/14`、`合计: 7`（全误报，exit 0）。

> **工具修正留痕**：初版检查器把 `<script>` 内 JS 的比较运算符（`i<a`）误判为 `<a>` 标签，产出 2 条假阳性（`A_NO_HREF`，href 显示为 `undefined`）。已加 `<script>` / `<style>` 块剥离后重跑，462 个 `<a>` 全部具备合法 href。

---

### 无发现记录（R5 标题层级）

**标题层级 — 0 缺陷**

| 检查项 | 范围 | 结果 |
|--------|------|------|
| h1 唯一性 | 产物 14 页 | **14/14 页各恰好 1 个 h1**；h1 总数 14 |
| 不跳级 | 产物 14 页，相邻标题级差 ≤1 | **跳级 0** |
| 空标题 | 产物 14 页 | 空 `<hN></hN>` **0** |
| 标题嵌套 | 产物 14 页 | `<hN>` 内嵌 `<hM>` **0** |
| 目录误用 | 产物 14 页，`nav` / `aside` 容器 | 容器内 h-tag **0**（TOC 未误用标题元素） |
| 标题长度 | 产物 14 页 | 超 60 字符标题 **0** |

**h1 来源核对**：5 个页面在源文件中直接写 `<h1>`（`index.astro:112`、`about.astro:32`、`roles.astro:180`、`mechanisms.astro:31`、`docs/index.astro:18`）；8 个文档页通过组件 prop 注入 —— `WikiDoc.astro:35` 的 `<h1 id="page-title" class="doc-title">{title}</h1>`（agents / architecture / configure / governance / install / overview / protocols / quickstart），`WikiManual`（releases）。1 页（docs/index）自身写 `<h1>`。合计 14。

**最深层级**：`roles/index.html` 达 h4（`h1:1 h2:5 h3:14 h4:30`，共 50 个标题）—— 各 Agent 下「职责 / 技能 / 约束 / 输入 / 输出」用 h4，层级递进合理，无跳级。

**Basis**：`检查要点 · 排版`（h1 唯一不跳级）；WCAG 2.2 §2.4.6 Headings and Labels。命令输出：
```
页面 14 | h1 总数 14 | 无 h1 0 | 多 h1 0 | 跳级 0
结果：标题层级合规
合计：空标题 0 | 嵌套标题 0 | nav/aside 内 h-tag 0
```

> **工具留痕**：首轮用源码 `Select-String '<h1'` 统计，8 个文档页显示 0 个 h1，一度疑似缺 h1。改以 **dist 渲染产物**为真相源后确认 h1 由组件注入 —— 与 R1 断链检查同源的教训：Astro 的 `href={expr}` / `{title}` 表达式语法会让源码扫描失真，产物才是真相。

### 无发现记录（R11 密钥泄露）

**密钥不入前端产物 — 0 缺陷**

| 检查项 | 范围 | 结果 |
|--------|------|------|
| 密钥正则命中 · 产物 | `site/dist` 22 个文本文件，18 类模式 | **0 命中** |
| 密钥正则命中 · 源码 | `site/src` 全部 `.astro`/`.css`/`.ts`/`.js` | **0 命中** |
| 环境注入点 | `import.meta.env.*` / `process.env.*` | **0**（前端不读任何环境变量 → 结构性不可能把密钥打进产物） |
| `.env` 跟踪状态 | 仓库根 `.env` | **未跟踪**，`.gitignore:10` 命中（`git check-ignore -v .env` exit 0）；键为 `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL`，属本地 embedding 管线，与站点无关 |
| `.env.example` 入库内容 | 跟踪文件中 | 全占位符：`[your_embedding_api_key_here]` / `[https://your-embedding-service.example.com/v1]` 等，**无真实值** |
| `site/.gitignore` | — | 不存在；根 `.gitignore` 递归覆盖（`git check-ignore -v site/.env` exit 0）→ 无纵深缺口 |
| CI workflow 密钥 | 7 个 `.github/workflows/*.yml` | `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` 走 GitHub Secrets；`sk-` / `ghp_` / `ghs_` / `AKIA` / `xox` / `SG.` 硬编码 **0 命中** |
| 仓库自带门禁 | `scripts/verify.mjs:134` `checkSecrets()` | `secrets PASS 未发现硬编码密钥`；`test/verify.test.mjs:158-166` 有其单元测试 |
| 测试夹具排除 | `test/verify.test.mjs:162` | `const apiKey = "supersecretvalue123456789"` 系**故意写入临时目录**以断言 `checkSecrets()` 返回 FAIL —— 是扫描器的测试数据，非泄露 |

**Basis**：`检查要点 · 安全`（密钥不入前端产物）。命令输出：
```
=== 1. 前端产物 dist/ 密钥扫描（最关键：实际部署内容）===
  扫描文件数: 22
  合计 dist 命中: 0（✓ 前端产物无密钥）
=== 2. 前端源码 site/src/ 密钥扫描 ===
  合计 src 命中: 0
=== 3. 环境注入面（密钥如何进入前端）===
  → 环境注入点文件数: 0（✓ 前端不读取任何环境变量）
结果：dist 命中 0 | src 命中 0 | 环境注入点 0 | .env 文件 2
结论：前端产物无密钥泄露。
```
仓库自带门禁：`node scripts/verify.mjs men --json` → `secrets PASS 未发现硬编码密钥`。

> **两条误报排除**：(1) `.env:8` 命中「OpenAI/Anthropic Key」模式（值 `sk-t…`，51 字符）—— 位于**未跟踪且被忽略**的本地文件，key 名是 `EMBEDDING_API_KEY`（本地 embedding 服务），不属前端产物；(2) `test/verify.test.mjs:162` 命中「通用密钥赋值」—— 是 `checkSecrets()` 的**测试夹具**（写入临时目录后断言 FAIL），属合法测试数据。另 `.argus.yml` 中 4 处 `token` 字样全部是**设计 token**（`token-prefix: "--color-"`、`show-token-names: true`），非密钥。

> **UNKNOWN 已解除（R13）**：R10 与 R11 连续两轮 `npm audit --audit-level=high` 均返回 `503 Service Unavailable ... We are currently performing maintenance`（`https://status.npmjs.org`），当时判为 UNKNOWN。R13 重跑同一命令，npm registry 已恢复：
> ```
> npm audit --audit-level=high
> found 0 vulnerabilities
> （exit 0）
> ```
> 注：R13 已新增 `playwright` 为 devDependency，本次 audit 已覆盖该新增依赖，仍为 0 高危。

---

### R20 复审：换簇后新维度扫描（无新发现）

R15–R19 集中在样式/排版簇修复 P2/P3。R20 按规则「连续两轮无新发现即换簇」切换到元素一致性/功能稳定/前端安全簇，做以下新增检查（此前十二轮未显式覆盖）：

| 检查项 | 范围 | 方法 | 结果 |
|--------|------|------|------|
| 页内重复 `id`（WCAG 4.1.1 Parsing） | 产物 15 页 × 逐页 | 解析每页全部 `id="..."`，检测同页重复 | ✅ 0 处（`main-content` / `page-title` / `seealso-title` 等布局级 id 各页唯一，跨页同名不违规） |
| `target="_blank"` 缺 `rel`（WCAG 2.1.32 / 安全） | 产物 15 页 | grep `target="_blank"` 逐条检查 `rel` 属性 | ✅ 全部有 `rel`（含 `noopener`） |
| 内联事件处理器（XSS 面） | 产物 15 页 | grep `on(click|load|error|...)="` | ✅ 0 处 |
| `<html lang>` 缺失（WCAG 3.1.1 Language of Page） | 产物 15 页 | 正则 `<html(?!.*lang=)` | ✅ 全部有 `lang="zh-CN"` |
| 每页 h1 唯一性（WCAG 1.3.1） | 产物 15 页 | 逐页数 `<h1` 标签数 | ✅ 全部恰好 1 个 |
| 横向溢出 / 长文本破版（样式检查要点） | 7 页 × 3 断点（375/768/1440） | `site/scripts/overflow-check.mjs`：Playwright 测 `scrollWidth > clientWidth`，溢出时列出 culrpit 元素 | ✅ 0 处溢出 |

**结论**：R20 换簇扫描 6 项均无新发现。站点在元素一致性、功能稳定、前端安全三个簇无遗漏缺陷。新增 `site/scripts/overflow-check.mjs` 作为横溢防回归工具入库。

---

## 6. 提交与合并（⑥）

| 项 | 状态 |
|----|------|
| 分支 | `fix/web-quality-2026-09-19`（已 push 到 `origin`） |
| 提交规范 | `fix(web): …` / `docs(reports): …`（Conventional Commits）—— 13 轮全部按维度拆分为「代码 + 报告」两笔，共 25 提交 |
| PR | ✅ **#126** 已开：https://github.com/cgartlab/men/pull/126（`gh pr create`，base `main`，30 文件 +1940 / −57） |
| CI 状态 | ✅ **4/4 实质门禁全绿**：`Build site (site/**)` pass · `CodeQL` pass · `Validate scripts & toolkit` pass · `Auto triage PR` pass。`argus-review`（第三方云端设计评审，写 PR 评论而非门禁）开 PR 后 6 分钟仍 `pending`，历史单次可达 15 分钟且可结束为 `action_required` / `cancelled`，故不视为阻塞 |
| Squash merge | ⏳ **待办**：需由用户在 GitHub 上执行（本会话未做外部合并动作） |
| `git status` 干净 | ✅ 每轮提交后复查均 clean（`git status --porcelain=v1` 无输出） |

---

## 7. 待办与阻塞

| 维度 | 轮次 | 状态 |
|------|------|------|
| 断链 | R1 | ✅ 完成（P1-1 已修复） |
| 空实现（`href="#"`） | R2 | ✅ 完成（0 缺陷） |
| `!important` 与内联滥用 | R3 | ✅ 完成（P3-1～P3-4 已修复；P3-5 单主题为设计取舍不改） |
| 裸色值 | R4 / R15 | ✅ 完成（P3-6/P3-7 已修 11 处；**P3-8 双源真相 R15 已重构**：新增 `--role-*` 令牌，角色色字面量 36→5，27 项浏览器断言零漂移；P3-9 合法字面量留档） |
| 标题层级 | R5 / R18 | ✅ 完成（DOM 语义 0 缺陷；**P2-12 `--font-size-h5` 未定义 R18 已修**：定义 `1rem`，4 处标题退化修正，3/4 零变化、1 处 14px→16px） |
| 对比度 | R6 / R13 / R16 / R17 / R19 / R20 | ✅ 完成（P2-1/P2-2 共 12 处 + P2-3 三选择器已修；P2-10 主强调色底白字已修；**P2-11 六个角色色 R20 已修**：路径 a 大文本资格——`.showcase__card-role` 从 14px/600 改为 20px/700，六色 3.14–4.23:1 全过 3:1 阈值，不改任何色值；P3-10 死令牌保留 2 枚。**P3-12/P3-20 令牌注释失准 R16 已修** + `token-ratio-check.mjs` 防回归。**P3-11/P3-22 死 CSS R17 已修**。**P3-21 死令牌 R19 已修**：删除 2 枚冗余。**P2-12 `--font-size-h5` R18 已修**：定义 `1rem`。小字号对比度不合格总数：**21 → 6 → 0**（R13 实测 6 处全为 P2-11 角色色，R20 修复后归零） |
| 键盘焦点 | R7 | ✅ 完成（P2-4 已修；P3-13 已修；P3-14 skip-link 合规留档） |
| 错误容错（含 404 / 空态） | R8 | ✅ 完成（P2-5 空 catch 已修；P2-6 补 404 页；表单 / error boundary / 空态均不适用） |
| 核心网页指标（LCP/INP/CLS） | R9 / R14 | ✅ 完成（P2-7 字体 preconnect+preload 已修；P3-15/P3-16 记录）。**R14 已装 Playwright 并实测（§3.2）**：FCP 132–206ms（12/12 达标）、DOM ready 60–178ms、load 460–730ms、首屏 33–59 KB、点击延迟 1ms —— 静态风险因子未构成瓶颈。**LCP/CLS/INP 仍 UNKNOWN**：headless Chromium 不产出这三类 performance 条目（已排除脚本缺陷，4 种启动模式一致；根因未完全隔离）；接 `npx lighthouse` 或 CrUX 可解除，属新增依赖待确认 |
| XSS 危险 API | R10 / R13 | ✅ 完成（P2-8 消除 `innerHTML` sink；P3-17 补 CSP 与安全头；零可执行注入；**依赖 CVE 已由 UNKNOWN 转为 0** —— R13 `npm audit --audit-level=high` exit 0，npm registry 恢复，已覆盖新增的 `playwright` 依赖） |
| 密钥泄露 | R11 | ✅ 完成（0 缺陷：产物 0 命中 / 源码 0 命中 / 环境注入点 0 / `.env` 未跟踪 / CI 无硬编码 / 自带 `checkSecrets()` 门禁） |
| 交互态（七态） | R12 | ✅ 完成（P2-9 按钮 `:disabled` 缺失已修；P3-18 SVG aria、P3-19 `:active` 记录；触控目标 / 缩放 / 破坏性操作全达标） |
| 视觉留档（③ 截图） | R13 | ✅ **完成**（用户确认 `npm i -D playwright` 后执行）。4 类页面 × 3 断点 = **12 张**，见 `docs/reports/screenshots/`，合计 7891 KB，见 §3 清单。采集期自动度量：横向溢出 0/12、控制台 error 0、失败请求 0、`document.fonts.status = loaded`。**明暗维度经实证确认为 N/A 而非 UNKNOWN**：`global.css:36` 钉死 `color-scheme: light`，全站 `prefers-color-scheme` 媒体查询 0 处 → 暗色截图将与浅色逐字节相同，产出重复图无信息量 |
| 视觉审计（③ 副产物） | R13 | ✅ 完成。`tiny-text-audit.mjs` 实测全部 `<16px` 文本的计算色与真实背景 → 21 处 AA 不合格，修复后 6 处；`font-audit.mjs` 字号分布；`heading-size-audit.mjs` 标题尺寸 → 发现 P2-12（`--font-size-h5` 未定义，h3 退化为 16px） |
| axe / pa11y（②） | — | ⛔ **缺口**：无依赖，待确认 |

### 需用户确认

1. ~~**是否允许 `npm i -D playwright`**~~ → **R13 已确认并已执行**：`npm i -D playwright` 已入库（`site/package.json` / `site/package-lock.json`），Chromium 经 `npx playwright install chromium` 装到 `C:\Users\cgart\AppData\Local\ms-playwright`（不进仓库）。12 张截图已产出。**明暗维度按实证判为 N/A**（`global.css:36 color-scheme: light`、`prefers-color-scheme` 媒体查询 0 处），未产出重复图。
2. **是否允许新增 `axe-core` / `stylelint`** 以补齐 ② 的可访问性与样式规则自动化？否则沿用 grep + 自研脚本并标注（13 轮已全程如此，六簇覆盖无缺口）。R13 已用 Playwright 实测替代了部分 axe 能力（对比度、字号、标题尺寸、横向溢出），但**语义层规则**（表单 label 关联、`aria-*` 完整性、地标角色）仍无自动化覆盖。
3. ~~**新增（R13）：P2-11 六个角色色的修复路径**~~ → **R20 已修复（路径 a）**：`.showcase__card-role` 从 `font-size: var(--font-size-caption)`（14px）+ `font-weight: 600` 改为 `font-size: var(--font-size-h3)`（20px）+ `font-weight: 700` → 大文本资格 → 3:1 阈值 → 六色全过。不改任何色值，对拓扑图/卡片图标零影响。`p2-11-verify.mjs` 实测 7 张卡全部 20px/700 大文本 ✓。
4. ~~**新增（R13）：P2-12 `--font-size-h5` 未定义**~~ → **R18 已修复**：定义 `--font-size-h5: 1rem`（16px）。取值依据：标题级 h1(30) > h2(24) > h3(20) > h4(17) > body(16) > caption(14)，h5 自然落在 h4 与 body 之间，间隙仅 1px，取 `1rem`（= body）—— 最小标题以字重区分。4 处使用点中 3 处零视觉变化（继承值 = 令牌值 = 16px），1 处 `.wiki-infobox__title` 从 14px→16px（修正了退化至 caption 字号的 bug）。R13 原建议 `1.0625rem`（17px）会造成 h5 = h4 重复，`1rem` 更合理。`h5-measure.mjs` 实测验证。
5. **新增（R14）：是否允许 `npx lighthouse`（不入库依赖）以解除 LCP/CLS/INP 的 UNKNOWN？** R14 已实测 FCP 132–206ms、DOM ready 60–178ms、load 460–730ms、首屏资源 33–59 KB、点击延迟 1ms —— 全部远离阈值，故 UNKNOWN 不影响当前结论，但 LCP/CLS/INP 三项仍是空白。Lighthouse 自带可见性仿真，能绕过 headless 不产出这三类条目的限制（`npx` 临时拉取，不落 `package.json`）。不安装则维持 UNKNOWN 留档。
