# Web 质量审查报告 — men 站点（2026-09-19）

> **审查对象**：`@cgartlab/men` v0.5.0 文档站（`site/`，Astro 7.2.9，静态输出）
> **代码基数**：`site/src` 共 31 个源文件（14 `.astro` 页面 + 13 `.astro` 组件 + `global.css` 1340 行 + 3 数据文件）；构建产物 14 页 / 21 个文件
> **审查方式**：产物级机械检查为主（不启动常驻服务器，遵守 `AGENTS.md` 进程红线），源码 `file:line` 定位为辅
> **轮次**：R5 / 维度：标题层级（h1 唯一 · 不跳级）（Lite 单维度循环第 5 项）
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
| build | `npm run build`（`site/`） | **0** | 14 page(s) built |
| check-site | `node site/scripts/check-site.mjs` | **0** | UTF-8 / charset / mojibake / base 守卫 / 空 slot / 路由锚点 全通过 |
| test | `node --test` | **0** | 149/149 pass |
| verify | `node scripts/verify.mjs men` | **0** | PASS=9 FAIL=0 |
| audit | `npm audit --audit-level=high` | **0** | 0 vulnerabilities |
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

**状态：UNKNOWN（R1 未执行）**

缺什么：**截图工具链**。375/768/1440 × 明暗主题的截图需要浏览器自动化（Playwright / Puppeteer），属新增依赖，受「不新增依赖未经确认」硬约束限制，未经确认不安装。

- 可行的替代路径（需确认其一）：
  1. `npm i -D playwright` 后以 `channel: chrome` 驱动本机已装 Chrome（不再依赖仓库常驻服务，遵守进程红线：单脚本内 spawn + finally kill，≤60s）；
  2. 由用户在本地浏览器手动截图后放入 `docs/reports/screenshots/`，我据此写视觉结论。
- 因此：**本轮所有视觉类结论一律标注 UNKNOWN**，不编造截图名。

### 3.1 R3 补充：明暗维度塌缩（主题不存在）

R3 审查令牌时发现**站点为单主题（仅浅色）**：无 `@media (prefers-color-scheme: dark)`、无 `data-theme` / `.dark` 选择器、`html { color-scheme: light }` 被显式钉死、`--color-accent` 全仓库仅 1 处定义（详见 §5 P3-5）。

- 抽样计划的 `375/768/1440 × 明暗` 因此**塌缩为仅「明」一维**，共 3 张/页而非 6 张/页。
- 所有 `*-dark.png` 标注为 **N/A（主题不存在）**，区别于「工具缺失导致的 UNKNOWN」。
- 该塌缩是否可接受，需在 ③ 执行轮由用户确认（是否先补暗色主题再截图）。

---

## 4. 六簇覆盖（④）

| 簇 | 已检查范围 | 结论 |
|----|-----------|------|
| 功能稳定 | 断链 / 锚点 / src 可达性（`tmp/link-check.mjs`）+ 空实现 / skip-link / 空跳模式（`tmp/empty-check*.mjs`），产物 14 页全量扫描 | ✅ **断链 0 / 锚点缺失 0 / src 缺失 0 / 空实现 0**（修复前 2 处锚点缺失，见 §5 P1-1）。查了什么：`<a>` 462 个的 href 形态、12 个 `<button>` 的处理器接线、`<form>`/`<input>`/`<select>` 存在性（0 个）、`window.open('')` / `location.href='#'` / `void(0)` / `alert()` 占位、`TODO`/`FIXME` 标记（7 命中全为误报）。表单防重复提交与 error boundary：**不适用**（站点无表单、无客户端路由） |
| 样式代码 | `!important` 全量（源码 18 → 产物 10）+ 内联 `style=` 17 处逐条人工判读 + `--color-accent` 令牌定义唯一性 + 双主题令牌存在性 | ✅ 4 项缺陷已修复（§5 P3-1～P3-4）。内联 17 处中 13 处合法（CSS 变量注入逐项动态值：`--delay` / `--wave-delay` / `--card-accent: ${a.color}` / `--sd` / `--dur` / `opacity`，均由循环或数据驱动，无法静态提取为类）。产物 `!important` 10 处**全部位于 `@media (prefers-reduced-motion: reduce)`**，属该场景的正当用法。**新发现：站点为单主题（仅浅色）** → P3-5 |
| 样式代码 · 裸色值 | `tmp/color-check.mjs` 全量分类（BARE / SVG_ATTR / TOKEN_DEF 三类）+ 令牌定义块 `global.css:107-160` 对照 | 源码 166 个色值 → BARE 116 + SVG_ATTR 8 + TOKEN_DEF 31（**令牌定义按规则不报**）；剔除 5 处误报（1 处注释 `BackgroundCanvas.astro:5`、4 处 issue 编号 `releases.astro:144/147/148/149`）后 **119 处属可报告语境**。其中 **10 处主强调色 `#e85d04` 绕过令牌已修复**（P3-7）、**1 处 canvas 兜底值与令牌不符已修复**（P3-6）；残留 108 处分 4 类记录（P3-8），终端 chrome 配色与 macOS 红绿灯为刻意独立的视觉语言，本轮不改造 |
| 信息排版 · 标题层级 | `tmp/heading-check.mjs` + `tmp/heading-check2.mjs`（产物级 14 页全量）：h1 唯一性、逐级差 ≤1、空标题、标题嵌套、`nav`/`aside` 内 h-tag 误用、标题文本长度 | ✅ **完全合规，0 缺陷**（详见 §5 无发现记录 R5）。14/14 页各恰好 1 个 h1；跳级 0；空标题 0；嵌套 0；目录容器内 h-tag 0；超 60 字标题 0。8 个文档页 h1 由 `WikiDoc.astro:35` / `WikiManual` 组件以 `title` prop 注入，非硬编码 |
| 元素一致性 | — | ⏳ 待查（R4：七态、焦点可见、目标 ≥24×24、alt） |
| 交互体验 | — | ⏳ 待查（R5：反馈、可撤销、Tab 陷阱、模态焦点归还、`prefers-reduced-motion`、缩放） |
| 前端安全 | 外链 `rel=noopener`（随断链扫描顺带检查，134 条外链） | ✅ `target=_blank` 缺 `noopener` = 0；其余子项 ⏳ 待查（R6–R8：XSS 危险 API / CSP 与安全头 / 密钥进产物） |

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

### P2

⏳ 后续轮次填写（当前 0 项）。

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

#### P3-8 样式代码 · 裸色值 — 角色色双源真相（未修 · 需重构）

- **位置**：`site/src/pages/index.astro:42-92`（JS 数据数组）↔ `:679-716`、`:752-758`（拓扑图 CSS）
- **问题**：6 个角色色存在**两个真相源**。JS 数组驱动卡片强调色（`:208` `style={--card-accent: ${a.color}}`），拓扑图 CSS 又把同一批色值逐一硬编码进 `stroke` / `fill` / `background`。改一处不动另一处，两张图就会显示不同颜色。
- **Found（原文逐字）**：
  ```js
  // :42-92 · JS 数据
  { ..., color: '#e85d04' }, { ..., color: '#4a90d9' }, { ..., color: '#2ea043' },
  { ..., color: '#bf8700' }, { ..., color: '#a371f7' }, { ..., color: '#8b5cf6' }
  ```
  ```css
  /* :679-716 · 同一批色值再次硬编码 */
  .topo-bezier--return { stroke: #2ea043; ... }   .topo-bezier--fail { stroke: #bf8700; ... }
  .topo-dot--learn { fill: #8b5cf6; }              .topo-label--judge-cn { fill: #1f2328; ... }
  /* :752-758 · 图例第三次出现 */
  .topo-legend__dot--judge { background: #f6f8fa; border: 1.5px solid #bf8700; }
  ```
- **Expected**：单一真相源。两个可选方向 —— (a) 为每个角色加令牌（`--role-si` / `--role-ji` …），CSS 与 JS 均引用；(b) 拓扑图节点用 `style` 注入 `--role-color`，CSS 只写 `fill: var(--role-color)`。
- **Fix**：**本轮不改**。方向 (a) 需向令牌系统新增 6 个令牌（触及「不改令牌语义」边界）；方向 (b) 需重构拓扑图渲染（约 60+ 个元素加内联样式）。两者均超出「只改必要行 / ≤3 文件」的单轮约束，建议交强模型做独立重构轮。
- **Basis**：`检查要点 · 样式`（死代码与裸色值 / 令牌一致）。`tmp/color-check.mjs` 输出：`index.astro total: 96  unique: 22`，其中角色色 `#2ea043 ×14`、`#bf8700 ×15`、`#8b5cf6 ×5`、`#4a90d9 ×1`、`#a371f7 ×1`、`#e85d04 ×1`。
- **Note**：当前两处数值**完全一致**（人工核对 6/6），无可见不一致；风险是未来编辑漂移。

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

## 6. 提交与合并（⑥）

| 项 | 状态 |
|----|------|
| 分支 | `fix/web-quality-2026-09-19` |
| 提交规范 | `fix(web): …` / `chore(quality): …`（Conventional Commits） |
| PR + Squash merge | ⏳ 待全部维度完成后一次性提交 |
| `git status` 干净 | ⏳ 本轮提交后复查 |

---

## 7. 待办与阻塞

| 维度 | 轮次 | 状态 |
|------|------|------|
| 断链 | R1 | ✅ 完成（P1-1 已修复） |
| 空实现（`href="#"`） | R2 | ✅ 完成（0 缺陷） |
| `!important` 与内联滥用 | R3 | ✅ 完成（P3-1～P3-4 已修复；P3-5 单主题为设计取舍不改） |
| 裸色值 | R4 | ✅ 完成（P3-6/P3-7 已修 11 处；P3-8 双源真相待重构；P3-9 合法字面量留档） |
| 标题层级 | R5 | ✅ 完成（0 缺陷） |
| 对比度 | R6 | ⏳ |
| 键盘焦点 | R7 | ⏳ |
| 错误容错（含 404 / 空态） | R8 | ⏳ |
| 核心网页指标（LCP/INP/CLS） | R9 | ⏳ |
| XSS 危险 API | R10 | ⏳ |
| 密钥泄露 | R11 | ⏳ |
| 交互态（七态） | R12 | ⏳ |
| 视觉留档（③ 截图） | — | ⛔ **UNKNOWN**：需浏览器自动化依赖，待确认 |
| axe / pa11y（②） | — | ⛔ **缺口**：无依赖，待确认 |

### 需用户确认

1. **是否允许 `npm i -D playwright`**（或复用本机 Chrome）以完成 ③ 视觉留档的 375/768/1440 × 明暗截图？否则 ③ 只能以 UNKNOWN 结案。
2. **是否允许新增 `axe-core` / `stylelint`** 以补齐 ② 的可访问性与样式规则自动化？否则沿用 grep + 自研脚本并标注。
