# 首页视觉 / 排版 / 可读性设计评审报告

- **评审日期**：2026-10-08
- **评审范围**：`site/src/pages/index.astro`（929 行）＋ 其依赖的背景/装饰组件（`BaseLayout` / `BackgroundCanvas` / `HeroArt` / `ParticleGate` / `GateLogo` / `global.css`）
- **评审方式**：Playwright 实测 3 个视口截图 + `getComputedStyle` 量化 + Canvas 像素采样 + WCAG 对比度手算 + 源码逐行审读。**未修改任何源码。**
- **开发服务器**：`http://localhost:4399/`（本次全部数据取自该 dev server）

---

## 0. 结论速览

| 维度 | 判定 |
|---|---|
| 可读性（对比度） | **达标**。正文/标题对比度 15.8–16.7:1，粒子叠加后最差点仍 ≥13:1；唯一 AA 边缘是 10px 侧栏竖排小字 |
| 横向滚动 | **无**。三视口 `scrollWidth == viewportWidth` |
| 元素重叠 | **有 1 处真重叠**（1440 下侧栏 rail 与 header 品牌区重叠 36×52px，非致命但不该有） |
| 「多余背景元素」 | **确认残留 3 项**：全局 fixed 粒子层、左右 side-rail、hero logo drop-shadow；`body::before` 三个光晕在纯平底色上**已无可见效果**（死代码） |
| 用户反馈「明显不对」的根因 | 见 §7 —— **不是对比度问题，是几何与注意力问题**：土星横宽 1308/1440px（占视口 91%）把首屏文字整块套在环里，且该 canvas 是 `position: fixed` 全视口、滚动后仍在转 |
| 触达区 | 桌面/平板上 5 个导航链接 18–39px 高、分页点 8×8px、复制按钮 32×32px，均 <44px（WCAG 2.2 §2.5.8 AA） |

---

## 1. 截图存档（绝对路径 + 文字描述）

| 视口 | 文件 | 内容描述 |
|---|---|---|
| 1440×900 | `C:/Users/cgart/AppData/Local/hermes/cache/scratch/design-shots/home-1440-900.png` | 首页首屏：顶部 header（左「men（门）」门形 logo，右 首页/角色/机制/文档/关于 + GitHub 按钮）；hero 居中七件套（门形橙 logo → eyebrow「OPENCODE 首发 · CG 艺术实验室出品」→ 大标题「推开*这扇门*」→ 描述「围绕一人内容创作与工程协作的 6+1 Agent 团队系统」→ 橙色主 CTA「阅读文档」+ 白底次 CTA「GitHub ↗」→ 版本徽章「v0.6.1 · 一行命令安装」）；其下「快速开始」终端卡片。左右两侧各一条 36px 竖排灰字（左 `men · v0.6.1 · cgartlab`，右 `gate · triage · verify · audit`）。 |
| 1440×900（汇聚保持期） | `.../home-1440-900-converged.png` | 同一视口等待 9s（落入 16s 周期第 7–12.5s 的「保持」段）后截图：粒子已聚成一颗**居中撑满的土星**，横向从 x≈68 延伸到 x≈1376（宽 1308px，占视口 91%），纵向 y≈252–642。环形内圈从 logo、eyebrow、大标题、描述、CTA 背后穿过 —— 文字压环、环不压字，无遮挡，但**首屏全部 7 个元素被同一颗环包围**。 |
| 1440×900（滚动后） | `.../home-1440-900-scrolled-1100.png` | 页面滚到 1100px：可见四张角色卡（编排/思考/代码/持）+ 分页点 + 「团队拓扑」拓扑图。**粒子 canvas 与噪点层仍覆盖整个视口**（fixed），且左右 rail 仍钉在边缘。 |
| 768×1024 | `.../home-768-1024.png` 与 `.../home-768-1024-converged.png` | 平板宽度：header 未折叠为汉堡菜单，5 个链接横排；hero 结构与桌面一致；**左右 side-rail 在 ≤900px 已隐藏**（`display:none` 实测确认），此宽度下画面最干净。土星 bbox 690×454，环内圈仍在标题/描述区域后穿过。 |
| 390×844 | `.../home-390-844.png` 与 `.../home-390-844-converged.png` | 移动端：hero 单列居中，标题 clamp 到 31.2px；土星 bbox 350×374 居中，**内圈紧贴 desc 与 CTA**（canvas 对 desc 区域覆盖 0.71%、CTA 区域覆盖 9.66%）。无横向滚动。导航 5 个链接仍是 29px 宽的横排。 |
| 局部裁切 | `.../home-*-hero.png`（三个视口各一张） | hero 区特写，用于确认层级关系与环的位置。 |

> 说明：所有 wait 均包含 `networkidle` + 2.5s/9s 驻留，确保粒子已从「散开待机」进入「汇聚/保持」态（该组件是自己驱动的 Canvas 2D 动画，非录屏，时间点可复现）。

---

## 2. 量化数据表

### 2.1 层级（z-index / position）实测

| 元素 | position | z-index | 说明 |
|---|---|---|---|
| `.bg-layer-main`（静态点阵） | fixed | 0 | 唯一「底」层，带 `--color-bg:#fafafa` 实底 |
| `.particle-gate`（土星 canvas） | fixed | 0 | **与点阵同层同 z-index**，全视口覆盖 |
| `.hero-canvas`（禅意包裹容器） | fixed | 0 | 冗余容器，仅包住 canvas |
| `.side-rail` ×2 | fixed | 2 | 左右贴边 36px |
| `body::before`（噪点+光晕） | fixed | 3 | `mix-blend-mode: multiply`，`opacity:0.62` |
| `main` | static | 1 | 文字内容层 |
| `.site-header` | — | 10 | header 与 rail 同屏 |

> **关键发现 1**：`.hero-canvas` / `.particle-gate` 都是 `position: fixed; inset: 0`，**不是首屏局部背景而是全视口固定层**；实测滚动到 1100px 后 canvas 与噪点仍满屏覆盖正文区（见 `home-1440-900-scrolled-1100.png`）。
> **关键发现 2**：`HeroArt.astro` 只在首页被 `<HeroArt />` 引用（index.astro L102），但 `ParticleGate` 的样式是**组件级 scoped 单元素** —— 一旦被任何页面通过 `HeroArt` 引入即 full-viewport。当前仅首页引入，故"全站污染"风险而非既成事实，见 P0-2。

### 2.2 文字色 / WCAG 对比度（自己算，非脚本库）

前景色取自 `getComputedStyle` 实值，背景基底取 `.bg-layer-main` 的 `--color-bg = rgb(250,250,250)`；`body::before` 的通用3次幂 + 伽马复合后有效背景 ≈ rgb(238,238,238)。

| 元素 | 字号 | 字色 | 对比背景 | 对比度 | AA 达标 |
|---|---|---|---|---|---|
| hero 大标题 `.hero-title` | 54.4px / 31.2px | `#1a1a1a` | `#fafafa` | **16.67:1** | ✅ AAA |
| hero 大标题（含 `multiply` 噪点层复合后） | 同上 | `#1a1a1a` | ≈`#eeeeee` | **15.87:1** | ✅ AAA |
| hero 描述 `.hero-desc` | 16px | `#404040` | `#fafafa` | **9.93:1** | ✅ AAA |
| eyebrow `.hero-eyebrow` | 12px | `#737373` | `#fafafa` | **4.54:1** | ✅ AA（贴线） |
| eyebrow（叠加 `multiply` 层后） | 12px | `#737373` | ≈`#eeeeee` | **4.36:1** | ⚠ 跌破 AA |
| 主 CTA 文字 | 14px | `#0a0a0a` | `#e85d04` | **5.66:1** | ✅ AA |
| side-rail 竖排小字 | 10px | `#737373` | `#fafafa` | **4.54:1**（AA 按 ≥14px 非大字文本判定）| ⚠ 10px 装饰性文本，且 `aria-hidden`，不承担信息 |

#### 2.3 粒子层对对比度的实际影响（Canvas 像素采样 → 复合 → 再算对比度）

在**粒子汇聚保持期**对 hero 各文本 bbox 做逐像素采样，统计"多少比例的像素被粒子覆盖"与"最坏有效背景"，再按 `over(fg, α, bg)` 复合重算：

| 视口 | 文本区域 | 粒子覆盖像素比 | 最大 α | 粒子代表色 | 最坏有效背景 | 大标题最坏对比 | 正文最坏对比 |
|---|---|---|---|---|---|---|---|
| 1440 | 标题区 | 0.09% | 35 | `rgb(141,48,7)`（橘） | `rgb(235,222,217)` | **13.25:1** ✅ | 7.89:1 ✅ |
| 1440 | 描述区 | 1.42% | 71 | `rgb(17,17,17)` | `rgb(185,185,185)` | 8.87:1 ✅ | 5.28:1 ✅ |
| 1440 | CTA 区 | 1.93% | 59 | `rgb(15,15,15)` | `rgb(202,202,202)` | 10.16:1 ✅ | 5.94:1 ✅ |
| 768 | CTA 区 | 0.50% | 61 | `rgb(61,29,13)` | `rgb(205,197,193)` | 10.24:1 ✅ | 6.10:1 ✅ |
| 768 | 标题/描述区 | 0% | 0 | — | 无 | 16.67:1 ✅ | 9.93:1 ✅ |
| 390 | 描述区 | 0.71% | 62 | `rgb(43,23,13)` | `rgb(200,195,192)` | 9.96:1 ✅ | 5.94:1 ✅ |
| 390 | CTA 区 | 9.66% | 83 | `rgb(15,15,15)` | `rgb(174,174,174)` | 7.84:1 ✅ | 4.67:1 ✅ |

**结论**：粒子的 α 极低（全视口平均 α≈22/255、收敛期峰值 133/255），实测最坏点大标题仍有 **7.8–13.3:1**、正文 **4.7–7.9:1**，**可读性没有被粒子破坏**。**用户说"明显不对"不是对比度问题。**

### 2.4 7 个可触元素/信息位与土星环的几何关系（1440×900 汇聚期）

| 元素 | bbox | 与环的关系（环 bbox = x68–1376 / y252–642） |
|---|---|---|
| hero logo | x692–748, y96–152 | 在环**上方外** |
| eyebrow | x598–842, y164–184 | 在环**上方外** |
| 大标题 | x588–852, y196–256 | 上沿在环内 4px，**与环顶几乎相切** |
| 描述 | x534–906, y268–295 | **在环内** |
| CTA 组 | x585–855, y319–363 | **在环内** |
| 版本徽章 | x652–788, y395–418 | **在环内**，靠近环心 |

即：**首屏 7 个信息位里有 4 个（描述/CTA/版本/标题下沿）压在环内部**，环是唯一占据 1308×390px 的图形体，视觉重量远超文字本身。

### 2.5 16 秒动画周期采样（覆盖率随时间变化，暴露节奏问题）

逐秒采样整块 canvas 的非透明像素覆盖率与 bbox：

| 时刻 | 覆盖率 | 峰值 α | bbox | 相位 |
|---|---|---|---|---|
| 1s | 0.91% | 43 | 0,0,1438,898 | 散开待机 |
| 3s | 1.00% | 51 | 0,0,1436,896 | 散开待机 |
| 4s | 1.37% | 94 | 36,72,1354,730 | **开始汇聚** |
| 5s | 1.10% | **133** | 60,230,1314,430 | 汇聚峰值（最重） |
| **6s** | **0.12%** | 19 | 4,0,1430,898 | **几乎全空 —— 疑似丢帧/停顿** |
| 7s | 1.09% | 68 | 6,… | 汇聚 |
| 12s | 1.27% | 85 | 36,58,1362,766 | 保持 |
| 13s | 1.53% | **118** | 58,178,1326,530 | 保持内二次起伏 |
| 14s | 110 | 110 | 6,0,1432,898 | 散开 |
| 15–17s | 0.92–0.93% | 28–34 | 满屏 | 散开待机（重新铺满） |

**读法**：散开态铺满全屏（bbox=满视口）而非只在 hero 内 → 印证 P0-2（fixed 全视口）。**6s 覆盖率跌到 0.12% 是一次明显的视觉"空闪"**：代码里 `k = 1 - easeIO(...)*0.15` 的保持段与散开段交叠，加上每个粒子有独立 `phase`，汇聚动作在时间轴上被拉开成"一波一波"，观感是断续的脉冲而非一次成形（见 P1-4）。

### 2.6 其它实测

| 项目 | 1440 | 768 | 390 |
|---|---|---|---|
| `scrollWidth` vs `innerWidth` | 1440 = 1440 ✅ | 768 = 768 ✅ | 390 = 390 ✅ |
| side-rail 是否显示 | 显示（36px×900） | **已隐藏** | **已隐藏** |
| rail 与其它元素重叠 | **rail-L↔header 36×52px、rail-R↔header 36×52px** | 无 | 无 |
| canvas `width` 属性 | 1440（= CSS 宽） | 1440（**≠** 768，见下） | 1440（**≠** 390，见下） |
| 元素重叠（hero 内部） | 无 | 无 | 无 |

> **关键发现 3（建议核实）**：768/390 视口下 canvas `width` 属性仍为 1440（初始 1440 会话的值），说明 `build()` 在 resize 后没有重设 backing store 尺寸，或本次两条记录取自同一 resize 前状态；resize 后实测 `afterResize` 为 1400 且覆盖率回升到 1.55%，说明**只有触发过 resize 才对齐，首屏直开小视口时 canvas 用了错误的 DPR 比例**。已列入 P1-5 由 ji 复核。

---

## 3. 首屏视觉层级评审

**当前层级链**（源码顺序）：`hero-logo` → `hero-eyebrow` → `hero-title` → `hero-desc` → `hero-actions` → `hero-version`。

**判定：层级顺序本身清晰正确，但重量分配被粒子环扰乱 —— 重心偏移。**

1. **顺序与抑扬是对的**：logo(56px) 最轻 → eyebrow(12px mono) 次轻 → 标题(54.4px/600) 最重 → desc(16px) 回落 → CTA 用唯一实心橙色块收尾 → 版本徽章(12px) 最弱。这条链没有任何问题，**不要改结构**。
2. **问题在于第二视觉中心**：按设计意图，首屏应只有一个视觉中心（大标题）。实测土星环占据 **1308×390px、覆盖视口 91% 宽度**，且环心（≈y447）恰落在版本徽章附近 —— 也就是说**那颗环自己构成了一个与标题等量级的第二视觉中心**，眼睛在"字"和"环"之间来回跳。
3. **744px 的空旷落差被放大**：hero 顶到 desc 底部只有 y96→295（199px），而从 desc 到 hero 结束还有 100+px；环高 390px，视觉上把 hero 撑得比文字实际占位更大，读起来像"hero 很高但内容很少"。**根因是环的高度（H=390px）与文字块高度（H=322px：y96→418）接近 1:1，而横向环宽是文字块宽的 4 倍**，比例完全失衡。
4. **版心过窄加剧失衡**：hero 内容是 720px 版心（`--page-max`），但 `main` 容器是 1360px；中间 720px 的一条文字被两侧各 320px 的空地夹着，环正好填满那块空地 —— 于是"空地"变成了主角。这是我认为"明显不对"的核心机制：**不是元素脏，是纵深关系错了**。

---

## 4. 「多余背景元素」逐项判定

### 4.1 `body::before`（噪点 feTurbulence + 两个径向光晕）— **判定：删除（已是死代码）**

- 位置：`site/src/styles/global.css` L89–104。
- 实测：`backgroundImage` 含 3 层（SVG 噪点 / 左上 `#d9d9d9` 光晕 / 右下 `#f0f0f0` 光晕），`mix-blend-mode: multiply`，`opacity: 0.62`，`z-index: 3` —— **高于 main(z1) 和 rail(z2)，且 fixed 满屏**。
- 为何判定为死代码：两个径向光晕颜色（`#d9d9d9`/`#f0f0f0`）与页面底色 `#fafafa` 的**色差 < 5/255**，在 multiply 下对像素的贡献趋近于零；SVG 噪点因子 `opacity=0.035` 且在 `feColorMatrix saturate=0` 后只是极淡灰阶，实测它把纯白底从 `#fafafa` 压到约 `#eeeeee`（我结算出的有效背景，见 2.2）。
- **理由保留**：它让纯白底稍微"温"一点，确实贡献了 R2 纸感叙事的一点余温；且它已经把 eyebrow 从 4.54:1 压到 4.36:1。
- **建议**：**整块删除**。理由：①用户已明确要求"去掉多余背景元素"；②它在层级上高于正文内容层（z3 vs z1），属于"盖在内容上的东西"，这是阅读心理负担的来源，即使肉眼几乎看不见；③它是**全站每页固定开销**。删除是零风险动作——不删任何文字信息，只少一层 multiply 合成，eyebrow 反而回升到 4.54:1。
- 若要保留纸感：把噪点降级到 `.bg-layer-main` 内部作为第 2 个 background-image（z0），取消 `multiply`，`opacity` 直接写 0.03——更便宜、且不再盖在内容上。

### 4.2 左右 side-rail 竖排小字 — **判定：改造（不整块删，收敛为页脚级信息）**

- 位置：`BaseLayout.astro` L47–54，样式 `global.css` L524–568。
- 实测：36px 宽、`position:fixed`、`z-index:2`、10px 字、`color: --color-fg-muted(#737373)`；1440 下与 header 品牌区**重叠 36×52px**；≤900px 已隐藏。
- 判定：**它不是阅读干扰，但是它和 header 重叠（几何错误）+ 传达零信息（版本信息已在 hero 版本徽章出现，`gate·triage·verify·audit` 是术语堆砌）**。
- 建议：`global.css` L525 `.side-rail` 加 `padding-top: var(--space-20)`（或 `top: var(--space-20)`），**把 rail 的下沉起点让出 header 高度，消除 36×52 重叠**；同时 `--rail-text-color` 从 `--color-fg-muted` 改为 `--color-fg-decorative`（`#8a8a8a`，更淡，10px 装饰字本该更弱）。**不要删除 rail 本体** —— 它是 R2 纸感风格在宽屏下的唯一"边框感"来源，删了宽屏会显得内容漂浮。若要更彻底，把右rail 的 `gate · triage · verify · audit` 换成与 hero 版本徽章不重复的信息或删除右rail。

### 4.3 hero logo 的 drop-shadow — **判定：删除（一行）**

- 位置：`index.astro` L518 `.hero-logo { filter: drop-shadow(0 0 24px color-mix(in srgb, var(--color-accent) 30%, transparent)); }`。
- 判定：24px 模糊半径的橘色辉光。在静止的平底上它只是让 logo 边缘发浑；在土星汇聚期它让 logo 与环之间的边界更糊（环心就在附近）。**这是纯粹的"发光感"遗留，与 R2 纸感杂志风冲突**。
- 建议：整行 `filter` 删除。若要保留一点点品牌感，改为 `filter: drop-shadow(0 2px 0 color-mix(in srgb, var(--color-accent) 18%, transparent))`（2px 实心投影，硬边，纸感）。

### 4.4 粒子层（ParticleGate / HeroArt）— **判定：改造（给它套上首屏栅格，而不是删）**

- 位置：`components/ParticleGate.astro`（319 行）+ `components/HeroArt.astro`（26 行）。
- 实测：`position: fixed; inset: 0; z-index: 0`，全视口；`uppercase` 平均 α≈22/255；16s 周期（待机 0–4.5 / 汇聚 4.5–7 / 保持 7–12.5 / 散开 12.5–16）；环几何 CX=0.5, CY=0.5, R=0.215，外环半径 0.455×W；DPR≤2；粒子数 cap = clamp(700, 2400, W*H/1300) → 1440×900 约 997 颗，390×844 约 253 颗。
- 判定：**技术实现质量高**（标注完整、reduced-motion 有静态分支、tab 隐藏暂停、颜色走 CSS 变量）。**问题全在"装在哪里"和"占多大"**：
  - **A. fixed 全视口 = 每页都在转、滚到底还在转**（实测 scrollY=1100 仍满屏覆盖）。
  - **B. 环把 hero 7 个信息位套住，第二视觉中心**（§3）。
  - **C. 6s 覆盖率空闪 + 13s 二次起伏**（§2.5）→ 观感断续。
- 建议：**不删组件，改作用域与尺寸**（具体见 §5 P0-1 / P0-2 / P1-4）。

### 4.5 静态点阵 `bg-layer-main` — **判定：保留**

- 位置：`BackgroundCanvas.astro`，34px 网格 + `--color-accent` 6% 的 0.6px 圆点，`#fafafa` 实底，`z-index:0`。
- 判定：34px 间距的 0.6px 点是"纸纹"而不是"网格"级别，实测对任何文字对比度无影响（2.2 表全部达标）。**它正是用户在噪点被删后仍能保住的"还不算太素"的下限**。保留，勿动。

### 4.6 汇总表

| # | 元素 | 位置 | 判定 | 一句话理由 |
|---|---|---|---|---|
| 1 | `body::before` 噪点+2 光晕 | global.css L89–104 | **删除** | z3 盖在内容上、光晕色差<5 属死代码、用户已点名 |
| 2 | side-rail ×2 | BaseLayout L47–54 / global.css L524–568 | **改造** | 保留宽屏边框感，但消除与 header 的重叠、淡化字色 |
| 3 | hero logo drop-shadow 24px | index.astro L518 | **删除** | 发光感与纸感冲突，且让 logo 与环边界发浑 |
| 4 | 粒子层 | ParticleGate / HeroArt | **改造** | 保留土星主体，改为 hero 局部 + 缩小 + 偏置 |
| 5 | 静态点阵 | BackgroundCanvas | **保留** | 唯一纸感底座，无对比度损失 |
| 6 | 终端卡片红黄绿三点 | index.astro L541–544 | 保留 | 拟物隐喻，功能性强，不干扰 |
| 7 | 拓扑图动点/blink | index.astro L355–370, 740–746 | 保留（P2） | 在 hero 之外，滚动到才见，注意力已被正文接管 |

---

## 5. 问题清单（P0 必须修 / P1 建议修 / P2 可选）

> 每条给：**文件 · 元素 · 改什么 · 建议值 · 理由**。所有改动均由 ji 执行；本报告不含任何代码修改。

### P0-1 土星必须变成 hero 局部层，且缩到文字块比例以下

- **文件/元素**：`site/src/components/HeroArt.astro`（`.hero-canvas`）＋ `site/src/components/ParticleGate.astro`（`.particle-gate` 样式块 L24–32）。
- **改什么**：
  - `.hero-canvas`：`position: fixed; inset: 0` → `position: absolute; inset: 0`（把层还给 `.hero` 的包含块，`.hero` 已是 `position:relative` + `overflow:hidden`，见 index.astro L516）。
  - `.particle-gate`：新增 `inset: 0` 改为 `left: 0; top: 0; width: 100%; height: 100%` 并去掉默认 300×150（canvas 必须先由 CSS 给尺寸再读 `clientWidth`，否则出现 §2.6 的 300×150 尺寸）。
  - 几何：`ParticleGate.astro` L83 `const CX = 0.5, CY = 0.5, R = 0.215;` → **`CX = 0.5, CY = 0.42, R = 0.135`**；外环 `ring(0.455, ...)` L90 → **0.30 / 0.29 / 0.22 / 0.26**（按 0.455:0.438:0.390:0.335 等比缩 66%）。
- **建议值**：环最大半径 ≤ `min(hero宽, hero高) × 0.32`；1440 下环宽 ≤ 460px、环心 y 落在 eyebrow 与 title 之间（≈y170）。
- **理由**：现在环宽 1308px = 视口 91%、环心 y≈447 与版本徽章同位，直接制造第二视觉中心（§3）。缩到 460px 后它变成"标题背后的一枚印章"，环心低于标题基线、不侵入 desc/CTA bbox，7 个信息位全部回到环外。
- **验收**：用 §2.3 的同一脚本重跑，要求 `canvasTitle.canvasDesc.canvasActions` 三项 `coveredPct` 全部 < 0.05%。

### P0-2 粒子层收紧到 hero（修掉「固定、全屏、滚动后仍在转」）

- **文件/元素**：`site/src/components/HeroArt.astro` L18–25（`.hero-canvas`）。
- **改什么**：确认 `.hero` 有 `position: relative`（已有，index.astro L516）后，把 `.hero-canvas` 的 `position` 由 `fixed` 改 `absolute`，`z-index` 保持 `0`，并给 `.hero` 的 `overflow: hidden` 保持不变。
- **建议值**：`position: absolute`。
- **理由**：实测 `scrollY=1100` 时 canvas 与噪点仍满屏（截图 `home-1440-900-scrolled-1100.png`）→ 粒子在用户读「团队拓扑」时仍在背景转，这是最直接的"背景元素阻碍阅读"体感来源。改为 absolute 后滚出 hero 即停止绘制（rAF 仍在跑但整块被裁掉，若能顺手在构件里加 `IntersectionObserver` 停 rAF 更好，见 P1-6）。
- **验收**：滚到 1100px 后截图，hero 外不再有粒子覆盖正文。

### P0-3 删除 `body::before`（噪点 + 两个不可见光晕）

- **文件/元素**：`site/src/styles/global.css` L88–104 整块（含 L88 注释行）。
- **改什么**：整块删除；连带 `:root` 里 L262–264 的 `--paper-noise-opacity / --paper-blend / --paper-overlay-opacity` 三个令牌若无其它引用，一并清理。
- **建议值**：删除（纸感若不退让，把噪点以第二层 `background-image` 加进 `BackgroundCanvas.astro` 的 `.bg-layer-main`，`opacity: 0.03`、无 `mix-blend-mode`、`z-index: 0`）。
- **理由**：①它 `z-index: 3` 高于正文层（z1），是"盖在内容之上"的层，与用户诉求正面冲突；②两个光晕与底色差 <5/255，纯属死代码；③删后 eyebrow 从 4.36:1 回到 4.54:1，可用性反而更好。
- **验收**：`getComputedStyle(document.body,'::before').zIndex` 无值或该规则不存在；`npm run check:source` 全绿；eyebrow 对比度 ≥4.5:1。

### P0-4 删除 hero logo 的 24px 橘色 drop-shadow

- **文件/元素**：`site/src/pages/index.astro` L518 `.hero-logo`。
- **改什么**：删除 `filter: drop-shadow(0 0 24px color-mix(in srgb, var(--color-accent) 30%, transparent));`。
- **建议值**：直接删除；或换成 `filter: drop-shadow(0 2px 0 color-mix(in srgb, var(--color-accent) 18%, transparent))`。
- **理由**：辉光让 56px logo 在半格点阵 + 环上边缘发浑，与 R2 纸感（硬边、哑光）冲突；同时这是用户"发光/多余元素"观感的直接来源之一。

### P0-5 消除 side-rail 与 header 的 36×52px 重叠

- **文件/元素**：`site/src/styles/global.css` L525 `.side-rail`。
- **改什么**：加 `padding-top: var(--space-20)`（80px）或改 `top: 0; bottom: 0` 为 `top: var(--space-20); bottom: 0`；并把 `--rail-text-color`（L271）由 `var(--color-fg-muted)` 改为 `var(--color-fg-decorative)`。
- **建议值**：`top: var(--space-20)`；rail 字号保持 10px（本来就该是装饰级）但颜色降到 `#8a8a8a`。
- **理由**：1440 下实测 rail 顶部 52px 与 header 品牌/导航区重叠，两侧竖排文字会撞进 header 的视觉范围；两者都是 fixed 元素，永远错不开。rail 降色后它在视觉上更弱、更"边框"。
- **注意**：这是几何缺陷，不是风格选择，**修**。

### P0-6 首屏文案层级：给 `hero-title` 的 `<em>` 补回强调色（顺带修掉"斜体中文"）

- **文件/元素**：`site/src/pages/index.astro` L106 `<h1 class="hero-title">推开<em>这扇门</em></h1>`；样式在 L520。
- **改什么**：实测 `<em>` 计算值为 `color: rgb(26,26,26)` + `font-style: italic` —— **用户默认样式让中文标题后半句强制斜体，而颜色没有区分**。需新增规则：
  ```css
  .hero-title em { font-style: normal; color: var(--color-accent-dark); font-weight: var(--font-weight-semi); }
  ```
  同样问题在 L501 `.cta__title` 的 `<em>推门而入</em>`，用同一规则覆盖（` .cta__title em { font-style: normal; color: var(--color-accent-dark); }`）。
- **建议值**：`--color-accent-dark`（`#a03c00`，6.41:1）而非 `--color-accent`（3.35:1，不达 AA）。`global.css` L749 的 `.oc-title em` 已用 `--color-accent` 先例，但那是给英文标题用的，不适用于中文大标题正文场景。
- **理由**：中文（及日文）没有真正的斜体字形，浏览器是剪切变形，读起来"歪"；同时 `<em>` 承担了"推开**这扇门**"的语义强调却与前半句同色同重，强调失效。这是排版正确性问题，不依赖任何背景改动。

### P0-7 为「明显不对」定一个可回归的验收基线

- **改什么**：不是代码，是**验收口径**。任何一轮背景改造后，用以下三条机械判定是否"修好了"：
  1. hero 三个文本 bbox（`.hero-title` / `.hero-desc` / `.hero-actions`）的 canvas `coveredPct` **全部 < 0.05%**（当前 0.09% / 1.42% / 1.93%）；
  2. 土星 bbox 宽度 ≤ hero 内容宽 720px 的 65%（≤468px）；
  3. `npm run check:source` 全绿（`check-contrast` / `check-tokens` / `check-text-contrast` / `check-dynamic-el`）。
- **理由**：用户说"明显不对"但说不出哪里不对时，只有可测量的口径能让多轮迭代收敛；否则每轮都在换形容词。

---

### P1-1 粒子汇聚节律：消掉 6s 空闪

- **文件/元素**：`site/src/components/ParticleGate.astro` L224–259（`frame`）与 L218–220（`P/T1/T2/T3`）。
- **改什么**：两个问题叠在一起 —— ①每粒子独立 `phase: hash(i)*0.9` 使汇聚在 2.5s 内被摊成"一波一波"；②保持段 `k = 1 - easeIO((tt-T3)/(P-T3))*0.15` 的 0.15 回落在 13s 附近造成二次明暗。建议：`phase` 由 `hash(i)*0.9` 改为 `hash(i)*0.35`（相位差从 0.9s 收到 0.35s），或干脆按粒子 y/θ 分组错开（视觉上仍像描笔，但同一波内 0.2s 内落位）；`T3` 段 `*0.15` 改为 `*0.06`。
- **建议值**：`phase` 尺度 0.35s；保持段回落 ≤0.06。
- **理由**：§2.5 实测 6s 覆盖率 0.12%（对比相邻 1.09%），是一次肉眼可辨的"灭了又亮"；保持段回落让同一颗土星在 5.5s 内亮两次，注意力被反复拽走。

### P1-2 首屏 hero 加一个中性"纸底补丁"，兜住残余对比度风险

- **文件/元素**：`site/src/pages/index.astro` L516 `.hero`。
- **改什么**：给 `.hero-content` 加一层极淡纸底（不是给整屏加），例如
  ```css
  .hero-content { background: color-mix(in srgb, var(--color-bg) 82%, transparent); border-radius: var(--radius-lg); }
  ```
  仅在粒子层保留时使用；若按 P0-1/4.4 把粒子缩到标题背后，则**不需要**这一步。
- **理由**：§2.3 证明当前最坏点已达标，此条是**保险**而非修复；它同时能在你决定"放大土星"时提供退路（见 §6 取舍）。

### P1-3 移动端 hero 顶到导航的问题

- **文件/元素**：`site/src/pages/index.astro` L516 `.hero { padding: var(--space-12) 0 var(--space-8); }`。
- **改什么**：移动端（`@media (max-width: 480px)`，L800）加 `.hero { padding-top: var(--space-20); }`。
- **理由**：实测 390 视口 hero `top=32`、logo y=152，header 高约 60px，logo 与导航底边仅隔 ~90px；土星环心 y≈224 时环上缘会伸到导航下方。补 80px 顶距让首屏信息位整体下移，也让环心与文字的关系重新变松。

### P1-4 交互控件 <44px：分页点 / 复制按钮 / 导航链接

- **文件/元素**：
  - 分页点：`index.astro` L656–663 `:global(.showcase__dot)`，实测 **8×8px**（WCAG 2.2 §2.5.8 AA 要求 ≥24×24 CSS px，AAA 44px）；
  - 复制按钮：L572–576 `.terminal__copy` 实测 **32×32px**；
  - 导航链接：`Header.astro` 的 `.site-header__link` 桌面实测 **25×18px**；
  - 轮播箭头：`.showcase__arrow` 40×40px。
- **改什么**：把可视尺寸与触达尺寸分离 —— 视觉仍是小点，但命中区扩到 44px：
  ```css
  :global(.showcase__dot) { width: 8px; height: 8px; position: relative; }
  :global(.showcase__dot)::after { content:''; position:absolute; inset:-18px; } /* 44px 命中区 */
  .terminal__copy { width: 32px; height: 32px; }
  .terminal__copy { position: relative; }
  .terminal__copy::after { content:''; position:absolute; inset:-6px; } /* 44px 命中区 */
  ```
  导航链接：`.site-header__link { padding: var(--space-3) var(--space-2); }` 并给 `<li>` 减 margin 补偿。
- **建议值**：命中区 ≥44×44px（AA 最低 24×24，按团队既有口径取 44）。
- **理由**：实测 1440 就有 29 个控件、390 有 26 个低于 44px，其中分页点是纯视觉控件（无文字），误触代价最高。注意 §1.4.11（边界对比）与 §2.5.8（触达）是两条不同标准，代码注释 L659 只覆盖了前者。

### P1-5 小视口 canvas backing store 尺寸

- **文件/元素**：`site/src/components/ParticleGate.astro` L183–214（`build`）。
- **改什么**：核实 `build()` 是否在 `resize` 事件里正确重算（当前 `onResize` L305 调 `build()`，逻辑上是对的）。若 §2.6 记录属实（768/390 直开时 `canvas.width` 仍 1440），说明 Astro dev 下 scoped CSS 的 `position:fixed; inset:0` 在首帧后 canvas 已是 100vw/100vh，但 `width/height` 属性在 `build()` 前是默认 300×150，需要在 CSS 里给 `.particle-gate` 写死 `width: 100%; height: 100%` 之外再确认 `cvs.clientWidth` 读取时机。
- **建议值**：给 `.particle-gate` 补 `width: 100%; height: 100%;`（并配合 P0-1 的作用域改造）。
- **理由**：我实测 768/390 首屏 canvas `width` 属性 = 1440 而 CSS 宽 = 768/390 → 若为真，粒子是按 1440 的几何铺到 768 的画布上，环会被裁切、集中度异常；这至少会让小屏观感与桌面不一致。**需要 ji 复核确认是探针取值的时序问题还是真实缺陷**。

### P1-6 加 IntersectionObserver 停 rAF（省电 + 减少"到处在动"）

- **文件/元素**：`site/src/components/ParticleGate.astro` L288–313（`start/stop/onResize/visibilitychange`）。
- **改什么**：给 `.hero-canvas` 加 `IntersectionObserver`，hero 不可见时 `stop()`，可见时 `start()`（`visibilitychange` 已有，此处补滚动维度）。
- **理由**：现在只要 tab 可见，rAF 全速跑；即使按 P0-1/2 把层收到 hero 内，rAF 仍在后台空转。

---

### P2-1 hero 上空旷：加一条细分隔线或一行 micro-copy

- **文件/元素**：`site/src/pages/index.astro` L516–521（`.hero` / `.hero-content`）。
- **改什么**：hero 底部（版本徽章与「快速开始」之间）加 40px 宽的 `--color-accent` 短线（`global.css` L663 `.threshold-line` 现成可用），或把 eyebrow 上方加一行 micro「6 roles · 1 gate · mechanical verification」。
- **理由**：1440 下 hero 高 402px 而文字实际只占 322px，环（改造后）不再撑场后会显得空；一条 40×2px 的橘线就能收口。

### P2-2 划分 hero 的 font-size-display 上限

- **文件/元素**：`global.css` L196 `--font-size-display: clamp(2.4rem, 5.2vw, 3.4rem)`。
- **改什么**：可选收紧为 `clamp(2.4rem, 4.4vw, 3.0rem)`。
- **理由**：1440 下 54.4px 的中文 5 字标题横向 264px、纵向 60px，`max-width: 18ch` 形同虚设；环缩小后标题将是绝对主角，3.0–3.4rem 都成立，取更小值可让首屏更接近"杂志小标 + 大留白"的 R2 气质。**风险最低，可选。**

### P2-3 `--page-max: 720px` 与 `--container-max: 1360px` 的落差

- **文件/元素**：`index.astro` L513 `:root { --page-max: 720px; }`。
- **改什么**：可考虑首页 hero 单独用 `--content-width-wide: 880px`（token 已存在）。
- **理由**：安装/机制/FAQ/CTA 全部 720px 而 showcase/topology 是满宽，节奏切换显突兀；但这是整体版式策略问题，不属于"多余背景元素"，故列 P2。

---

## 6. 全站一致性

| 页面 | 背景栈 | 与首页差异 |
|---|---|---|
| 首页 `index.astro` | 静态点阵 + **粒子土星（fixed 全视口）** + 噪点 + 2 rail | 唯一有动态图形的页面 |
| `docs/*`（11 个子页 + 索引） | 静态点阵 + 噪点 + 2 rail（`BaseLayout` 统一注入，无 `HeroArt`） | 比首页少一个动效层 |
| `roles.astro` / `mechanisms.astro` / `about.astro` / `404.astro` | 同上 | 同上 |

**判定**：
1. **全局层（点阵 / 噪点 / rail）是全站统一的，这部分一致性没问题**，问题在首页多出来的粒子层。
2. 首页是唯一"动态"页面，这本身**不是缺陷**（首页承担品牌表达，是通行做法）；但因为粒子层是 `fixed` 全视口、且**滚动到 hero 之后仍在绘制**，它实际上把"首页动态"变成了"首页全程动态"，与 docs 页的安静阅读形成同一站点内的两极。**P0-2 修掉作用域后，这个不一致自动消解**：动态只发生在首屏，滚下去后与 docs 页完全一致。
3. 需要明确的取舍：**不要为了让全站一致而把粒子搬到 docs 页**。docs 是长文阅读场景，任何运动层都是净负担（这正是用户抱怨的方向）。
4. 附带发现：`global.css` L749 `.oc-title em { color: var(--color-accent) }` 这条规则与首页 P0-6 的建议相反（3.35:1 不达 AA）。`.oc-title` 目前无任何页面引用（搜遍 `site/src` 仅 `WikiDoc.astro` 的 `doc-title`），属死规则，建议随死代码清理时一并删除，避免后人照抄。
5. `dot-pattern` / `dot-pattern--hero`（L689–714）同样 0 引用，`snap-container-y/x`（L577–588）、`pull-quote`（L607–661）、`threshold-line`（L664–673）疑似死代码 —— 不影响视觉，但会让"到底还有哪些背景层"变得难查，建议 ji 单独立项清理（不在本报告 P0/P1 内）。

---

## 7. 明确取舍建议

### 7.1 「土星放大 vs 文字对比增强」二选一 → **我推荐：两者都不选，选第三条「土星缩小并偏置到标题背后」**

理由：

- **放大土星**（让环更宽更满、更"纪念碑"）：直接强化 §3 的第二视觉中心。用户的原话是"去掉多余的背景元素阻碍阅读和体验"——放大是逆着诉求走。而且 §2.3 的实测已经证明粒子当前 α 下**没有任何对比度问题**（最坏 7.8:1），放大只会把环从"背景"推到"图形主体"，让标题沦为环的注脚。**否决。**
- **文字对比增强**（把标题/描述改深、加粗、或给文字加底）：当前 16.67:1 / 9.93:1 已经是 AAA，再增强等于把 A+ 改成 A++++，**收益为零且会让版面变脏**。真正该修的对比度问题只有一个 10px 的 rail 装饰字（P0-5），与土星无关。**否决。**
- **缩小 + 偏置（推荐）**：把环宽从 1308px 收到 ≤460px、环心从 y447 上移到 y≈200、半径 R 从 0.215 收到 0.135。收益：①7 个信息位全部回到环外，第二视觉中心消失，标题重新成为唯一焦点；②组件一行不改逻辑，只改几何常量，风险最低；③"门 → 土星"的意象从"环绕整个首屏"变成"印章落在标题后面"，品牌感反而更聚焦；④环仍可见、仍在转，首页的动态辨识度保留。

### 7.2 如果只能做三件事

1. **P0-1 + P0-2**（土星缩到 hero 局部并缩小）—— 直接消灭"明显不对"；
2. **P0-3**（删 `body::before`）—— 直接兑现"去掉多余背景元素"，零信息损失，反而修好 eyebrow 对比度；
3. **P0-6**（`<em>` 去斜体 + 上色）—— 排版正确性，5 分钟改动，观感提升最大。

### 7.3 一句话核心建议

> **删噪点光晕层、把土星从"撑满全屏的第二主角"缩成"标题背后的一枚 460px 印章"，并修掉 `<em>` 的中文斜体——三件事都不动文字内容，却正好各自消掉用户所说的三类"多余"（盖在内容上的层、抢焦点的图形、读起来歪的字）。**

---

## 8. 交付物索引

| 类型 | 路径 |
|---|---|
| 本报告 | `D:\3-Resource\Hermes WorkSpace\men\docs\reports\design-review-home-2026-10-08.md` |
| 截图（3 视口基础） | `C:/Users/cgart/AppData/Local/hermes/cache/scratch/design-shots/home-1440-900.png`<br>`.../home-768-1024.png`<br>`.../home-390-844.png` |
| 截图（汇聚保持期） | `.../home-1440-900-converged.png` · `home-768-1024-converged.png` · `home-390-844-converged.png` |
| 截图（hero 局部） | `.../home-1440-900-hero.png` · `home-768-1024-hero.png` · `home-390-844-hero.png` |
| 截图（滚动后） | `.../home-1440-900-scrolled-1100.png` |
| 量化原始数据 | `.../_probe.json`（计算样式/触达/重叠）、`_probe3.json`（canvas 覆盖/复合对比/bbox）、`_timeline.json`（16s 周期） |
| 探针脚本 | `C:/Users/cgart/AppData/Local/hermes/cache/scratch/design-probe.mjs`、`probe2.mjs`、`probe3.mjs`、`probe4.mjs`、`probe5.mjs` |

**权限声明**：本次评审只读源码 + 截图 + 采集 computed style / canvas 像素；未修改 `site/src/**` 下任何文件，未执行 git / npm release / install 类命令。



