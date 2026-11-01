# LESSONS — men

> OpenCode Agent 团队配置仓库：6 个 agent 定义（men/si/ji/chi/yi/xun）+ 纯 Node 零依赖脚本 + `.opencode/` 插件与技能包，含 Argus 云端评审集成。npm 包 `@cgartlab/men`。
> 本仓库从真实失误沉淀的「教训→规则」清单。**会话开始先全文阅读并遵循其中所有规则**；出现新失误按 §维护 追加。
> 权威依据：Anthropic Claude Code memory/best practices（<200 行、具体可验证、第二次犯同样错即写入）；社区 lessons.md 惯例（Boris Cherny，Anthropic）。
> 来源：本仓库 AGENTS.md 的编辑规则 / 版本同步 / 进程管理红线 / 全员红线 + 已验证 fix 提交；预填为种子，后续由 Agent 在真实工作中增长。

## 维护
- **触发**：用户纠正 / Agent 自查到的失误 / 非显而易见的 gotcha。
- **格式**：`### <主题>` 下，每条 = 失误（具体场景）→ 规则（最小可执行指令），一行可验证。
- **只记项目特有、不可从代码推断的**；通用最佳实践不写；含糊措辞（"小心""注意"）删掉。
- **重复出现** → 升级进 `AGENTS.md` 硬规则；**月度审阅**裁剪过期项；目标 < 200 行。

## 版本同步

- 失误：发版漏掉多处版本引用（v0.3.2 漏 6 处）→ 规则：`node scripts/release.mjs` 自动同步版本到清单内所有文件；lockfile 的 `packages[""]` 根版本对任意 `*-lock.json` 生效（见 AGENTS.md「版本同步」）
- 失误：PR 式发版后没更新 `site/src/pages/docs/releases.astro` → 规则：它是唯一不在自动同步列表的文件，发版后必须手动跑 `node scripts/update-release-page.mjs --version X.Y.Z --date ... --theme ... --notes ...`（见 AGENTS.md「版本同步」）
- 失误：v0.5.0 发版手动补 releases.astro + men-status → 规则：用 `test/release.test.mjs` 锁住同步清单（见 AGENTS.md「版本同步」）

## 进程管理（Windows 事故后红线）

- 失误：跨 session 存活的僵尸 `astro preview` 占用 4399 端口并按旧 base 路由，站点访问异常 → 规则：常驻服务仅限受管形态，必须用仓库配置端口（4399），报告 pid 与停止命令；禁止裸 `Start-Process` / detached / 管道截流（见 AGENTS.md「进程管理红线」）
- 失误：依赖活服务器验证静态站 → 规则：一律用 `node site/scripts/check-site.mjs`（扫描 dist：UTF-8/mojibake/空 slot/base 回归/路由锚点）（见 AGENTS.md「进程管理红线」）
- 失误：HTTP 冒烟留了脱离本次命令的进程 → 规则：确需 HTTP 冒烟时只能在单个 Node 脚本内 `spawn` + `finally { kill }` 自终止，超时上限 60s（见 AGENTS.md「进程管理红线」）
- 失误：会话收尾不清残留进程 → 规则：结束前运行 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 过滤本仓库路径残留并清理，确认 4399 无监听（见 AGENTS.md「进程管理红线」）

## 编辑 agent 定义

- 失误：直接 edit 没先 read → 规则：`.opencode/agent/*.md` 是唯一源代码，每次编辑必须先 read 再 edit（见 AGENTS.md「编辑 agent 定义规则」）
- 失误：删了 YAML frontmatter → 规则：`description` / `mode` / `model` 必须保留；每个 agent 必须有 `CHARTER_CHECK` 字段（见 AGENTS.md「编辑 agent 定义规则」）
- 失误：6 个 agent 的全员红线各写各的 → 规则：「全员红线」段落必须逐字一致（复制粘贴，不修改）（见 AGENTS.md「编辑 agent 定义规则」）
- 失误：在仓库里写死 provider/key → 规则：CC Switch 管理 providers/keys，Men 只管理 agent 分配（`~/.config/opencode/men.jsonc` > 仓库 `opencode.json`）（见 AGENTS.md「编辑 agent 定义规则」）
- 失误：删除了 men 的输出规范（question 工具交互、代号降噪、todowrite 跟踪）→ 规则：men 输出规范不得删除或弱化（决策 D20）（见 AGENTS.md「编辑 agent 定义规则」）

## Web 与 a11y

- 失误：小字强调色 12 处 AA 对比度违规 → 规则：小字用 `--color-accent-dark`，改色后实算 WCAG（commit f0928ea）
- 失误：首页把信息做成"罗列卡片"，像 PPT 而不是有吸引力的门面；安装命令代码块看不清 → 规则：首页优先视觉叙事与信息层级，禁止罗列式卡片堆叠；安装命令块必须可读（等宽、足够字号、对比达标）（用户 2026-10 会话明确否决）
- 失误：首页使用 emoji 充当图标 → 规则：首页**禁止任何 emoji**，改用与项目风格一致的开源免费图标库（用户明确要求）
- 失误：文档页直接贴入未经适配的原始内容，风格不统一 → 规则：`site/src/pages/docs/*` 统一按 wiki 体改写（releases/quickstart/install/configure/architecture/governance 六页同一标准）
- 失误：角色标签 14px 达不到 3:1 阈值 → 规则：标签文本按实算值升级到 20px/700（commit 9459700）
- 失误：令牌注释里写"声称的对比度"而非实算 → 规则：注释写 WCAG 实算值，并加防回归检查器（commit a9cd200）
- 失误：SVG 容器用 `role="img"` 吞掉 6 个交互节点的 AT 可见性 → 规则：交互型 SVG 用 `role="group"`（commit db4775d）
- 失误：缺 `--font-size-h5` 令牌导致 4 处标题字号退化 → 规则：字号必须走令牌，缺了先补令牌（commit 4e0320d）
- 失误：留死令牌 / 死 CSS / 重复规则块 → 规则：删除冗余死令牌与去重规则块（commit 51f83ad、98e6cc2）
- 失误：innerHTML sink + 无 CSP → 规则：消除 innerHTML sink，补 CSP 与安全响应头（commit 92eaec0）
- 失误：404 页缺失 + 复制按钮失败静默吞错 → 规则：补 404 页与失败反馈，消除静默错误盲区（commit 7de0cc3）
- 失误：4 处 `!important` 与内联样式债务 → 规则：消除 `!important` 与内联样式，收敛到令牌（commit 9aa7f0a、a21f124）

## CI 与评审集成

- 失误：agent 提示词自洽性漂移 → 规则：提示词一致性要有测试锁（commit 150b19a）
- 失误：dependabot PR 也触发 argus 评审 → 规则：dependabot PR 跳过 argus 设计评审（commit 91b2092）
- 失误：workflow 里含 `!` 的 env 表达式未加引号 → 规则：YAML `!` 开头的表达式加引号；argus-review job 需要 `contents:write`（commit fff47ac）
- 失误：在根目录安装 node 依赖 → 规则：依赖装在 `.opencode/node_modules/` 本地，不共享根目录（见 AGENTS.md「Node 环境」）
- 失误：忽略 Argus 的 BSL 1.1 许可 → 规则：对外发布 `@cgartlab/men` 或在商业产品中使用前，评估 BSL 1.1 合规风险（见 AGENTS.md「Argus Design Review 集成」）
- 失误：门禁 workflow 用了 `verify.mjs .`（扫全仓）而 ci.yml 用 `verify.mjs men`（扫角色产物）——扫全仓会命中**扫描器自己的正则样例**（`password=<redacted>,`）和**测试文件里的标识符**（`checkTodos`），2 项误报让门禁 exit 1；但这个门禁从 v0.6.1 起**一次都没被触发过**（没有 tag push），所以没人发现它必红 → 规则：**门禁里引用的命令必须与 ci.yml 里已在跑的那条完全一致**（`npm run verify`）；且「YAML 结构检查通过」不等于「门禁能跑通」——新 workflow 必须用**干净树 + 干净 remote**实跑一遍全部步骤再合并
- 失误：测试用例断言 `r.details` 是对象，但 `checkRemoteCiStatus` 的两条早退分支只返回 `{ok, reason}` → 规则：**函数返回值要么所有分支字段齐全，要么调用方容忍缺字段**（这里调用方把 `ci.details` 放进错误报告，而 `JSON.stringify` 会丢掉 `undefined` 键，报告就静默少一个字段）；且**测试要真的走到目标分支才算数**——原用例名叫「无 git 目录 → 查询失败」，但仓库有 remote 时 `gh repo view` 成功，压根到不了早退分支 → 规则：**造目标分支的测试要显式构造前置条件**（这里用 PATH 前置假 `gh` + `GIT_DIR` 指向不存在路径），并验证「去掉修复后该测试确实失败」
- 失误：用 `git archive` 造的沙箱跑测试，出现 `checkRemoteCiStatus` 假失败 → 规则：**沙箱环境要复刻 CI 的必要条件**（该沙箱没有 `.git` → 没有 git remote → 早退分支行为不同）；结论不可信前先问「这个失败是我的改动造成的吗」
- 失误：`--require-ci` 门禁**永远不可能通过**——它读 GitHub combined status 的 `.state`，而 GitHub 在「该 commit 没有任何 legacy status」时返回 `state="pending"`（API 默认值，不是"还有 status 没跑完"）。只用 GitHub Actions v2+（check-runs）的仓库 `total_count` 恒为 0 → 每一个绿灯 commit 都被判成红 → 规则：**读 combined status 必须同时看 `total_count`**：只有「`state != success` 且 `total_count > 0`」才是真的红
- 失误：`--jq` 表达式写成 `"\(.name)|\(.status)"`——JS 单引号字符串里 `\(` 是未知转义，**反斜杠被 JS 丢掉**，gh 收到的是 `(.name)|(.status)`，jq 于是原样打印这些字面量 → 六行 check 全被解析成「名字叫 `(.name)`、状态叫 `(.status)`」的占位符，**conclusion 永远匹配不到 failure → 真正失败的 check 被判成绿** → 规则：**jq 表达式里不要用 `"\(...)"` 插值形式**，用 `[a, b] | join("|")`（完全不需要反斜杠）；写完必须把 gh 的**真实 stdout 打出来看**，不能只看代码逻辑
- 失误：门禁只查「有没有失败的 check」，漏了「有没有跑完的 check」→ 规则：**CI 没跑完 ≠ 绿**，`status != completed` 的 check 也必须判红（否则 CI 还在排队就放行了发布）
- 失误：门禁判定逻辑埋在 `checkRemoteCiStatus` 里，无法单测 → 规则：**判定逻辑抽成纯函数导出**（`evaluateCiState`），才能用构造数据把「绿/红/未完成/无证据」四种情况都锁进单测。**本轮教训串起来**：一个从未被触发过的门禁（没有 tag push）会同时藏好几处错——命令用错、jq 转义错、判据漏项、返回值字段不齐。**门禁必须被实际执行过一次才算数**
- 失误：`config/models.json` 的 free 预设 7 个模型 ID 用 `opencode-zen/` 前缀，但 CLI 的 provider id 是 `opencode`——`opencode models` 在 `opencode-zen/` 下是 0 条，**free 预设 100% 不可用**。既有 `checkModelsSchema` 只校验「ID 在本文件内部自洽」（ID 与 provider key 匹配），完全没查「这个 ID 在 OpenCode 里存不存在」→ 规则：**配置文件里的外部 ID 必须有「实际调用过一次」的证据**，不能只靠「格式对了」就放行。补了 `free-models-manifest` 检查：核对清单与 6 个 agent frontmatter 是否一致 + 模型是否在清单内
- 失误：`setup.mjs` 的 `fetchFreeModels()` 直接拿 `GET /zen/v1/models` 返回当可用清单，但**目录里存在 ≠ 能调用**（实测 9 个 `-free` 模型里只有 3 个真能调，其余 6 个是 CLI 无法解析或地区封锁）→ 规则：**外部 API 的「列出」与「可调用」是两件事**，拿清单当可用之前必须各发一次真实请求并确认返回正确答案。新增 `filterCallableFree()` 取 live 目录与实测基准清单的交集
- 失误：改了 `opencode.json` 的 `agent.<name>.model` 但 subagent 仍跑在全局顶层模型上——实测 6 组对照发现 **subagent 的 frontmatter `model:` 是唯一稳定生效点**，`agent.<name>.model` 被全局顶层 `model` 覆盖 → 规则：**改 subagent 模型必须改 frontmatter**，不能只改 opencode.json 的 agent 段；优先级写入 AGENTS.md
- 失误：`setup.mjs` 在 `await fetch(...)` 之后直接 `process.exit()`，Windows 上命中 libuv 断言 `!(handle->flags & UV_HANDLE_CLOSING)`（`src\win\async.c:94`），进程以 **0xC0000409** 崩溃。实测 `--json --dry-run` 8 崩 7、`--preset free --dry-run` 8 崩 7、`--preset free` 8 崩 3 → 规则：**Node CLI 里不要在 fetch 或任何异步 I/O 之后调 `process.exit()`**——undici 的跨线程 async 句柄还在收尾，强制退出会撞断言。改成「设 `process.exitCode` 后自然退出」实测 0 崩；要保留「立即停止执行」语义就抛哨兵（`exitNow()` → `SetupExit`），由顶层统一落 `exitCode`。**这类崩溃是 Windows 独有且概率性的，CI 跑 Linux 永远绿**，所以必须另配源码级守卫（`F21`：`main()` 内禁裸 `process.exit`）
- 失误：把「`--json` 跑 8 次崩 7 次」误判成「stdout 未 flush」和「`AbortSignal.timeout` 定时器没收」两个假因，各改一版都没解决 → 规则：**先用最小复现把变量隔离干净，再动手改**。真正有效的隔离实验是「有网/无网」对照：`fetchFreeModels()` 直接 `return null` 时 0 崩、真发请求时 5 崩，一步就把范围从「整个 CLI」缩到「fetch 之后」；`setImmediate` 够不够、`setTimeout(50)` 够不够，也是同一批对照实验测出来的，不靠猜
