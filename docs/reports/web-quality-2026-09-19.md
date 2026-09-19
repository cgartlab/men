# Web 质量审查报告 — men 站点（2026-09-19）

> **审查对象**：`@cgartlab/men` v0.5.0 文档站（`site/`，Astro 7.2.9，静态输出）
> **代码基数**：`site/src` 共 31 个源文件（14 `.astro` 页面 + 13 `.astro` 组件 + `global.css` 1340 行 + 3 数据文件）；构建产物 14 页 / 21 个文件
> **审查方式**：产物级机械检查为主（不启动常驻服务器，遵守 `AGENTS.md` 进程红线），源码 `file:line` 定位为辅
> **轮次**：R1 / 维度：断链（Lite 单维度循环第 1 项）
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

---

## 4. 六簇覆盖（④）

| 簇 | 已检查范围 | 结论 |
|----|-----------|------|
| 功能稳定 | 断链 / 锚点 / src 可达性（`tmp/link-check.mjs`，产物 14 页全量扫描） | ✅ **断链 0 / 锚点缺失 0 / src 缺失 0**（修复前为 2 处锚点缺失，见 §5 P1-1） |
| 样式代码 | — | ⏳ 待查（R2：`!important` 与内联滥用） |
| 信息排版 | — | ⏳ 待查（R3：标题层级、正文 ≥16px、行高、行长、对比度） |
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

### P2 / P3

⏳ 后续轮次填写。

---

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
| 空实现（`href="#"`） | R2 | ⏳ |
| `!important` 与内联滥用 | R3 | ⏳ |
| 裸色值 | R4 | ⏳ |
| 标题层级 | R5 | ⏳ |
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
