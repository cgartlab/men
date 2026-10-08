# men 发布/安装脚本审计报告 — release / update-release-page / release-notes / install / setup / skillhub-publish / smoke-update-check

- **审计日期**: 2026-10-08
- **审计角色**: ji（记）
- **仓库**: `D:\3-Resource\Hermes WorkSpace\men`（HEAD `70fe47c`）
- **审计对象**: `scripts/release.mjs`、`scripts/update-release-page.mjs`、`scripts/release-notes.mjs`、`scripts/install.mjs`、`scripts/setup.mjs`、`scripts/skillhub-publish.mjs`、`scripts/smoke-update-check.mjs` 及 `test/` 对应测试（release / install / skillhub-publish / update-check）
- **审计维度**: ① 错误处理（JSON.parse 无 try/catch、readFileSync 无 exists 检查、半完成状态）② 注入与路径 ③ 版本同步（清单遗漏 / 正则误伤 / 分隔符）④ Windows 兼容（路径、BOM、CRLF、编码）⑤ 破坏性操作（覆盖无备份、git 无确认）⑥ 边界（dry-run 真零写入、多 flag 互斥、部分失败后状态一致性）
- **方法**: 全量静态阅读 + Node 探针实证（合成仓库 / 临时副本上真实执行，命令与输出见文末「探针实证记录」）；环境 **Node v26.7.0 / Windows 11 / git-bash**
- **红线遵守**: **本轮只写本报告，未修改 `scripts/` 与 `test/` 下任何受版本控制的文件**（结束时 `git diff --stat HEAD -- scripts test` 为空；`git status --porcelain` 只出现未跟踪新文件：本报告 + 并行任务产生的 `docs/reports/audit-verify-chain-2026-10-08.md`、`.opencode/skills/hermes-bot-mode/`、`scripts/runtime-probe.mjs`、`test/runtime-probe.test.mjs`，均非本轮产物）；未 push、未发布、未触发任何外部操作。

## 跳过的已修复项（上轮修复 / 书面豁免）

| 文件 | 豁免内容 |
|------|----------|
| release.mjs | P4（M2）`package.json` 的 `JSON.parse` 已包 try/catch（exit 2）——已修，不复报 |
| update-release-page.mjs | `--notes` 分隔符已由换行改为 `\x00`——**分隔符选型本身不复报**；本轮 F1 报的是该实现下 `spawnSync` 未捕获的崩溃与半完成状态（不同缺陷类） |
| skillhub-publish.mjs | `cfg.cli` / `skillDir` 已书面豁免（docs/reports/code-quality-2026-09-19.md） |
| install.mjs | `--dir` 已书面豁免（同上） |

**不报的设计约定**: 纯 Node 零依赖；`import.meta.url === pathToFileURL(process.argv[1]).href` 入口守卫；release 的 `--push` / `--gh-release` / `--npm` 需人工确认（本报告只审其**失败时的退出码与状态**，不质疑人工确认设计）。

## 结论摘要

共 **21 项发现（P0 × 1，P1 × 3，P2 × 12，P3 × 5）**。核心问题集中在四类：

1. **发布主路径直接崩溃（P0）**：`release.mjs` 把多条 CHANGELOG 要点用 `\x00` 拼进 argv 交给 `spawnSync`，Node 拒绝含 NUL 的参数 → **未捕获 `TypeError` 直接崩溃**；崩溃点位于「已写盘」与「git add/commit/tag」之间，留下**版本号已 bump、CHANGELOG 已插条目、无 commit 无 tag** 的半成品（合成仓库实测复现）。`npm run release:push` / `release:all` 全部命中。
2. **失败被掩盖（P1）**：`release.mjs` 无论 git add/commit/tag、push、gh release、npm publish 是否失败，恒返回 `exitCode 0` 并打印「完成 ✓」——实测 `releases.astro 更新 FAIL` 之后仍是 `EXIT=0`。
3. **测试/冒烟失守（P1）**：`smoke-update-check.mjs` 仍按 **V1 API** 调用已是 V2 的 `runUpdateCheck`，实跑 **4 失败 / 13 通过、exit 1**，且 3 条「通过」是空转（函数在 `storage 不可用` 处提前 return）；`release.test.mjs` 黑盒**只跑 `--dry-run`**，P0 所在的主路径零覆盖。
4. **写入与状态一致性（P2）**：setup 交互路径 `--dry-run` 实测打印「已写入 opencode.json」而文件 sha256 未变；setup 非 TTY 无守卫静默 exit 0；`update-release-page` 重复执行重复插行 + 版本计数虚增、`--theme` 缺省写入字面 `null`、发版后「截至 日期」不更新；skillhub `--token`/`--host` 解析后不生效；install scaffold 备份清单与自身注释不符、全局模式部分失败仍报成功、还原旧备份吞掉用户后改配置。

**无发现的文件**: `scripts/release-notes.mjs`（实跑 `--json` 正常，`VERSION_HEAD_RE` 用 `\s*$` 对本仓库 CRLF 的 CHANGELOG 安全，`--file`/`--output` 均有 exists 检查与目录创建）、`test/install.test.mjs`、`test/skillhub-publish.test.mjs`、`test/update-check.test.mjs`（三个文件断言真实、无恒真断言、文件操作全在 os.tmpdir 且 finally 清理）。
**另经机械验证确认「无发现」的维度**: 版本同步清单与正则（见 §「版本同步专项验证」）——`VERSION_TEXT_FILES` 10/10 文件精确命中、无遗漏、无误伤，全仓库 `0.6.1` 引用载体全部在册。

## findings 总表

| # | 文件:行号 | 严重级 | 问题描述 | 触发条件 | 建议修复 | 引用代码行原文 |
|---|-----------|--------|----------|----------|----------|----------------|
| F1 | scripts/release.mjs:411 | P0 | 含 NUL 的 argv 使 `spawnSync` 抛未捕获 `ERR_INVALID_ARG_VALUE`，崩溃点在写盘之后、git 提交之前 → 半完成发布态 | 非 dry-run + `--push/--gh-release/--all`，且该版本节 ≥2 条 `- ` bullet | notes 改走临时文件/stdin/base64；该 spawn 包 try/catch；失败可回滚 | `const updateResult = spawnSync("node", updateArgs, {`（配 `:403 const notesEsc = notesLines.join('\x00');`） |
| F2 | scripts/release.mjs:569 | P1 | git add/commit/tag、push、gh release、npm publish 任一失败仍 `exitCode 0` 并打印「完成 ✓」，自动化无法感知 | 任一发布子步骤失败（网络/权限/tag 已存在） | 汇总各步 `ok`，任一失败则 `ok:false`、exit 1 | `return { ok: true, exitCode: 0, result };` |
| F3 | scripts/smoke-update-check.mjs:99 | P1 | 按 V1 三参 + V1 mock 调用已是 V2 签名的 `runUpdateCheck`，核心链路未执行；实跑 4 失败 exit 1，3 条 PASS 空转 | 执行 `node scripts/smoke-update-check.mjs` | 按 V2 重建 mock 与两参调用；纳入 `npm test`/CI | `await runUpdateCheck(api, { state: "first" }, "0.2.1");` |
| F4 | scripts/skillhub-publish.mjs:188 | P1 | `--token` 仅用于本地门禁，既不进 `publishArgs` 也不设 `env`，子进程拿不到 → 校验通过但实际未认证 | `--token skh_xxx` 正式发布（非 dry-run） | 向子进程注入 `SKILLHUB_TOKEN` 环境变量或作为参数传递 | `if (!cfg.dryRun && !cfg.token) {`（`publishArgs` 仅 publish/skillDir/changelog） |
| F5 | scripts/skillhub-publish.mjs:122 | P2 | 裸 `spawnSync(cfg.cli)` 无 Windows `.cmd` shim 兜底，同模式在本仓库已三处翻车 | Windows + skillhub 由 npm 全局安装 | 复用 `install.mjs runShim` 的 `cmd /c` 范式 | `return spawnSync(cfg.cli, args, {` |
| F6 | scripts/skillhub-publish.mjs:81 | P2 | `--host` 解析后完全未传给 CLI，仅回显进摘要造成「已生效」假象 | 指定 `--host <url>`（含私有部署） | 显式传递（参数或环境变量），否则移除该选项 | `else if (a === "--host") out.host = args[++i] \|\| DEFAULT_HOST;` |
| F7 | scripts/setup.mjs:1319 | P2 | JSON 模式丢弃 `writeConfig` 返回值，写失败仍输出 `ok:true` + `fileWritten:"opencode.json"` + exit 0 | `--json` 且写入失败（权限/只读/磁盘满） | 接住 `wr`，据 `wr.ok` 决定 `ok`/error/退出码（对齐 :1249-1257） | `writeConfig(assignment, models, false);` → `ok: true,` |
| F8 | scripts/setup.mjs:1488 | P2 | 交互路径 `--dry-run` 打印「已写入 opencode.json」，实际零写入且无 `[DRY RUN]` 标记（实测 sha256 未变） | 交互流程 + `--dry-run` 走到确认写入 | 补 `if (cfg.dryRun)` 分支，与 :1266/:1355 一致 | ``process.stdout.write(`✅ 配置完成！已写入 opencode.json\n`);`` |
| F9 | scripts/setup.mjs:1407 | P2 | 交互路径无 `isTTY` 守卫：非 TTY 时静默 exit 0 中途收场；多行管道输入只消费第一行 | `node scripts/setup.mjs` 在 CI/管道/重定向 stdin 下 | 非 TTY 提示改用 `--no-interactive`/`--preset` 并非 0 退出 | `const rl = createRL();`（`// ── 交互模式 ──`） |
| F10 | scripts/setup.mjs:243 | P2 | 读 `opencode.json`/`models.json` 不剥离 BOM，PowerShell 保存的带 BOM JSON 直接 exit 2（install.mjs 已有 `readJsonSafe`） | 文件首字节为 `\uFEFF` | 复用 `readJsonSafe` 的 BOM 剥离 | `return JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf-8"));` |
| F11 | scripts/update-release-page.mjs:115 | P2 | 非幂等：同版本重复执行重复插历史行、版本计数自增虚高（实测 1→2 行、16→17），与 version-list 去重不一致 | 对同一版本重跑本脚本（失败后人工补跑） | 插行/计数前判重，计数按列表实际长度推导 | `content = content.slice(0, firstTrIdx) + row + "\n" + content.slice(firstTrIdx);` |
| F12 | scripts/update-release-page.mjs:91 | P2 | `--theme` 缺省时把字面 `null` 写入发布页（`buildRow` 有兜底、`buildHighlight` 没有） | 不带 `--theme` 直接调用本脚本 | 缺省回退 `v${version}` 或判必填 | ``lines.push(`...主题为「${theme}」。`);`` |
| F13 | scripts/update-release-page.mjs:146 | P2 | 只更新计数与版本列表，同段「截至 YYYY-MM-DD」永不更新（仓库现存 2026-10-04 vs 2026-10-07 矛盾） | 每次正常发版 | 同步替换 `截至 (\d{4}-\d{2}-\d{2})` | `content = content.replace(countRe, \`共发布 <strong>${newCount} 个正式版本</strong>\`);` |
| F14 | scripts/install.mjs:374 | P2 | scaffold 备份清单与注释不符（注释点名 tui.json 实际不在），`.opencode/**` 被整树覆盖无备份；`.men.bak` 二次安装被覆盖 | 在已有 men 资产的目录重复 `npx @cgartlab/men` | 备份所有将被覆盖的已存在文件，`.men.bak` 存在不覆盖，修注释 | `...entries.filter((n) => !n.endsWith("/")), ".opencode/package.json",` |
| F15 | scripts/install.mjs:531 | P2 | 全局模式复制失败仅告警仍 `ok:true` exit 0；两个全局分支在 try 之外、`--global-remove` 直接 `process.exit(0)` | `--global`/`--global-remove` 部分失败或抛文件系统异常 | 纳入 try/catch，统计失败数决定 `ok`/退出码，去掉内联 exit | `ok: true,` / `process.exit(0);` |
| F16 | scripts/install.mjs:609 | P2 | 卸载时用安装前旧备份整文件覆盖并删备份，吞掉用户安装后新增的全局配置 | `--global` 后手工改过 `~/.config/opencode/opencode.json` 再 `--global-remove` | 只回放 `default_agent` 差异，或还原前另存当前文件 | `fs.copyFileSync(bak, p); fs.rmSync(bak, { force: true });` |
| F17 | scripts/update-release-page.mjs:125 | P3 | 五项变更任一命中即 `changed:true`，未命中项无 else/告警仍 exit 0 → 半更新状态无信号 | 页面结构改动导致 highlight 正则不匹配 | 逐项记录 matched/skipped，关键项未命中非 0 退出 | `if (hlMatch) {` |
| F18 | scripts/setup.mjs:1195 | P3 | `--help` 依赖 `config/models.json`，缺失/损坏时打印报错而非帮助 | `models.json` 缺失时执行 `--help` | 把 `if (cfg.help)` 提到 `loadModels()` 之前 | `const models = loadModels();` → `if (cfg.help) {` |
| F19 | scripts/setup.mjs:1337 | P3 | `--reset --no-interactive` 组合下 reset 被静默忽略（打印当前配置即 exit 0），不提示冲突 | 已配置 + `--reset --no-interactive` | 非交互分支也尊重 reset，或互斥组合 exit 2 | `if (cfg.noInteractive) { if (configured) {` |
| F20 | scripts/install.mjs:674 | P3 | flag 组合互斥未校验：`--global-remove` 先判定（与 `--global` 同给只卸载），`--dir/--setup/--skip-*` 在全局模式下被静默忽略 | 任意冲突 flag 组合 | 解析阶段互斥校验，冲突 exit 2 | `if (cfg.globalRemove) { ... if (cfg.global) {` |
| F21 | test/release.test.mjs:245 | P3 | 覆盖缺口：release 黑盒只跑 `--dry-run`（F1/F2 全在盲区）；setup/release-notes 零测试；smoke 未进 `npm test`/CI；skillhub 测试不断言参数是否传递 | 回归审查 | 增合成仓库 release 黑盒（2 条 bullet + `--push`）、setup 输出契约、skillhub 参数传递断言，smoke 挂入测试入口 | `[path.join(REPO_ROOT, 'scripts', 'release.mjs'), '--dry-run', '--json'],` |

---

## P0 发现（阻断）

### F1 · scripts/release.mjs:411 — `--push/--gh-release/--all` 未捕获 `ERR_INVALID_ARG_VALUE` 崩溃，留下半完成发布状态

```js
403: const notesEsc = notesLines.join('\x00');
409:   "--notes", notesEsc,
411: const updateResult = spawnSync("node", updateArgs, {
412:   cwd: ROOT, encoding: "utf-8", shell: false, timeout: 30_000,
413: });
```

- **触发条件**: 非 dry-run 且带 `--push` / `--gh-release` / `--all`（`npm run release:push`、`release:all`），并且本次发布的版本节内有 **≥ 2 条 `- ` 列表项**（常规发版情形；1 条时不产生 NUL，0 条传空串也不触发）。
- **机制**: `notesLines.join('\x00')` 产生含 NUL 的字符串作为 `spawnSync` 参数，Node 的 `normalizeSpawnArguments → validateArgumentsNullCheck` 直接抛 `TypeError [ERR_INVALID_ARG_VALUE]`，该调用**没有任何 try/catch**，异常一路冒到模块顶层 → 进程以未捕获异常退出（exit 1）。
- **后果（半完成状态）**: 崩溃点在 `:377`（写 package.json）、`:378`（写 CHANGELOG）、`:383`（同步版本文件）**之后**，在 `:425` git add/commit/tag **之前** → 仓库留下「版本号已 bump + CHANGELOG 已插入新版本节 + 10 个版本载体已改」但**无 commit、无 tag** 的中间态；此时直接重跑会再次 bump（0.1.1 → 0.1.2），版本与 CHANGELOG 连续跳变。
- **实证（合成仓库，真实执行）**:
  ```
  $ node scripts/release.mjs --push
  TypeError [ERR_INVALID_ARG_VALUE]: The argument 'args[8]' must be a string without null bytes.
    Received '- 要点一：正常发版的第一条 bullet\x00- 要点二：正常发版的第二条 bullet'
      at normalizeSpawnArguments (node:child_process:602:3)
      at spawnSync (node:child_process:887:8)
      at main (.../scripts/release.mjs:411:30)
  EXIT: 1
  --- 写盘状态 ---
  package.json version: 0.1.1   （原 0.1.0）
  CHANGELOG 头部: ...## [Unreleased]...## [v0.1.1] - 2026-10-08...（新版本节已插入）
  git 目录存在: False（本例未 git init；有 git 时同样崩在 add/commit 之前）
  ```
- **说明**: 上轮已把分隔符从换行改为 `\x00`（属豁免项，本条不质疑分隔符选型）；**本条是该实现缺少异常处理 + 失败点位于写盘与提交之间**导致的阻断与半完成状态。本机仅有 Node v26.7.0（两处安装均实测抛错），Node 18/20/22 上的行为本机不可测，未作为结论依据。
- **修复方向**: ① 把 notes 改为不进 argv 的通道（临时文件 / stdin，或 base64 编码）；② 即使保留现方案也必须把该 `spawnSync` 包 try/catch 并计入 `actions`/`gitResults`；③ 把「写盘」整体后移到 git 三步之前的所有外部调用之后，或失败时用备份回滚，保证要么全成要么可重入。

---

## P1 发现（功能错误）

### F2 · scripts/release.mjs:569 — 任何一步失败仍返回 `exitCode 0` 并打印「完成 ✓」

```js
569: return { ok: true, exitCode: 0, result };
```

- **关联代码**: `:431-438` git add/commit/tag 失败仅 `eprintf 警告` 并继续；`:449-457` push 失败同理；`:414-420` update-release-page 失败仅告警；`:512-516` npm publish 失败仅告警；`:484-490` gh release 失败仅告警。
- **触发条件**: 任一子步骤失败（网络/权限/tag 已存在/子脚本 exit 1）。
- **后果**: 脚本摘要打出 `releases.astro 更新 FAIL` 之后仍是 `完成 ✓`，进程 exit 0；CI/`npm run release:*` 无法感知发布失败，`ok:true` 的 JSON 摘要同样谎报成功。
- **实证**: 合成仓库探针 → `动作 releases.astro 更新 FAIL` + `完成 ✓` + `EXIT=0`（stderr 有 `警告: update-release-page.mjs 失败：exit 1`）。
- **修复方向**: 汇总 `gitResults` 与各可选步骤的 `ok`，任一失败则 `exitCode = 1`、`result.ok = false`，并把失败步骤写进 `--json` 摘要。

### F3 · scripts/smoke-update-check.mjs:99 — 仍按 V1 API 调用 V2 的 `runUpdateCheck`，冒烟脚本实跑 4 失败 exit 1，且 3 条「通过」是空转

```js
99:  await runUpdateCheck(api, { state: "first" }, "0.2.1");
111: await runUpdateCheck(api, {}, "0.2.1");
119: try { await runUpdateCheck(api, {}, "0.2.1"); } catch { threw = true; }
131: process.exit(failed ? 1 : 0);
```

- **机制**: 被测模块 `.opencode/plugins/men-sidebar/update-check.mjs:125` 现为 V2 签名 `runUpdateCheck(ctx, currentVersion)`，内部依赖 `ctx.storage.store(...)`（`:131`）与 `ctx.ui.dialog.confirm(...)`（`:180`）；smoke 仍构造 V1 形态 mock（`api.kv` / `api.ui.dialog.replace` / `api.keymap.dispatchCommand`）并按 V1 三参调用。第 2 个参数 `{state:"first"}` 被当作 `currentVersion`，第 3 个被丢弃；`ctx.storage` 缺失 → `store = null` → `:134` 直接 `return`。
- **后果**: 冒烟脚本声称覆盖 7 类场景（含「302 → 弹窗 → onConfirm 触发更新」「24h 缓存」），实际**核心链路一条都没执行到**。
- **实证（真实执行）**:
  ```
  $ node scripts/smoke-update-check.mjs
  ❌ FAIL  302 + 新 tag → dialog.replace 被调用
  ❌ FAIL  弹窗 message 含 v9.9.9
  ❌ FAIL  成功拿到 latest → 缓存 men:lastCheck
  ❌ FAIL  onConfirm → dispatchCommand 或 toast 被触发
  ✅ PASS  24h 缓存生效 → dialog.replace 未被调用      ← 空转（storage 不可用提前 return）
  ✅ PASS  api.ui.dialog undefined → 静默 return 不抛错 ← 仅此条判据真实
  ✅ PASS  非 3xx（200）→ 静默 return 不弹窗          ← 空转（同上）
  结果：13 通过，4 失败
  EXIT=1
  ```
- **连带**: `runUpdateCheck` 的编排逻辑（缓存 / fetch / 弹窗 / 记录忽略）**在 `test/` 里零覆盖**——`test/update-check.test.mjs` 只测 3 个纯函数，唯一覆盖编排的冒烟脚本已失效，且该脚本既不在 `npm test`（`node --test`）也不在任何 CI workflow 中（全仓 grep 仅 README 与自身提及）。
- **修复方向**: 按 V2 重建 mock（`storage.store()` 返回 `[state, mutate]`、`ui.dialog.confirm` 返回 Promise、`keymap.dispatch`、`ui.toast.show`）并改用两参调用；把 smoke 纳入 `npm test` 或 CI。

### F4 · scripts/skillhub-publish.mjs:188 — `--token` 通过本地校验但从未传给子进程，实际发布未认证

```js
82:  else if (a === "--token") out.token = args[++i] || "";
188: if (!cfg.dryRun && !cfg.token) {
194: const publishArgs = [
195:   "publish",
196:   skillDir,
197:   "--changelog",
198:   changelog,
199: ];
121: function runCli(cfg, args, timeoutMs = 120_000) {
122:   return spawnSync(cfg.cli, args, {
123:     cwd: ROOT,
124:     encoding: "utf-8",
125:     shell: false,
126:     timeout: timeoutMs,
```

- **触发条件**: `node scripts/skillhub-publish.mjs <dir> --token skh_xxx`（不带 `--dry-run`）。
- **机制**: `--token` 只写进 `cfg.token` 供 `:188` 的门禁判定；`publishArgs` 不含 token，`runCli` 也**不传 `env`**（子进程仅继承 `process.env`）。只有当 token 本来就来自 `SKILLHUB_TOKEN`/`SKILLHUB_API_KEY` 环境变量时子进程才拿得到；**显式 `--token` 时子进程环境里没有它**。
- **后果**: 走完「已提供 token」的校验（不再报 `正式发布需要 API token`）→ 调用 CLI → CLI 无 token 认证失败，用户看到的是下游晦涩报错，无法意识到 `--token` 根本没生效。
- **修复方向**: `spawnSync(..., { env: { ...process.env, ...(cfg.tokenFromFlag ? { SKILLHUB_TOKEN: cfg.token } : {}) } })`，或把 token 直接拼进 `publishArgs`（注意不要回显到 `--json` 摘要）；同时 `--token` 与环境变量来源应在 `result` 中标明。

---

## P2 发现（隐患 / 数据丢失 / 状态污染）

### F5 · scripts/skillhub-publish.mjs:122 — Windows 下裸 `spawnSync("skillhub")` 无 `.cmd` shim 兜底

```js
122: return spawnSync(cfg.cli, args, {
123:   cwd: ROOT,
124:   encoding: "utf-8",
125:   shell: false,
126:   timeout: timeoutMs,
127: });
```

- **触发条件**: Windows + `skillhub` 由 npm 全局安装（落地为 `skillhub.cmd` shim）+ `npm run skillhub:check` / `skillhub:publish`。
- **机制与实证**: 本机实测 `spawnSync("npm", ["--version"], {shell:false})` → `ENOENT`（npm 同为 `.cmd` shim）；同仓库 `install.mjs:236` 注释与 `install.mjs:251 runShim()` 就是为此而设，CHANGELOG 也记录了同一模式的三处历史故障（`checkOpenCode()` Windows 恒报未安装、`gate.mjs` Windows 必失败、`install.mjs` 交互装 OpenCode 恒失败）。本机未安装 skillhub CLI（`command -v skillhub` 无结果），**无法端到端复现到 skillhub 本身，故不评 P1**。
- **修复方向**: 复用 `install.mjs` 的 `runShim` 范式（Windows 走 `cmd /c <cli> ...`），或 `--cli` 缺省时先做存在性探测并给出可操作提示。

### F6 · scripts/skillhub-publish.mjs:81 — `--host` 解析后完全未使用，摘要却回显造成「已生效」假象

```js
81:  else if (a === "--host") out.host = args[++i] || DEFAULT_HOST;
...
217:   host: cfg.host,
```

- **触发条件**: `--host https://my-skillhub.internal`（帮助文本将其列为正式选项）。
- **机制**: `cfg.host` 只出现在 `result.host` / 摘要回显中，既不进 `publishArgs`，也不设 `SKILLHUB_HOST` 之类环境变量；`DEFAULT_HOST` 同样从不参与请求。
- **后果**: 私有部署 / 测试环境用户以为已指向自建 host，实际请求仍打向 CLI 默认地址；JSON 摘要里 `host` 字段的值是**未经验证的回显**。
- **修复方向**: 显式传递给 CLI（`--host` 参数或环境变量），无法传递则从帮助与摘要中移除该选项。

### F7 · scripts/setup.mjs:1319 — JSON 模式丢弃 `writeConfig` 返回值，写失败仍输出 `ok:true` + `fileWritten`

```js
1319:       writeConfig(assignment, models, false);
...
1324:     ok: true,
...
1331:     process.stdout.write(JSON.stringify(result, null, 2) + "\n");
1332:     process.exit(0);
```

- **触发条件**: `node scripts/setup.mjs --json` 且 `opencode.json` 未配置（或带 `--reset`），此时写入失败（只读文件、权限不足、磁盘满）。
- **后果**: `writeConfig` 内部已把失败写在 `result.error` 并回滚（`:477-489`），但调用点直接忽略 → 自动化拿到 `ok:true` / `fileWritten:"opencode.json"` / exit 0，配置实际没落盘。
- **修复方向**: `const wr = writeConfig(...); result.ok = wr?.ok ?? true; if (!wr?.ok) { result.error = wr.error; ... }`，并据 `result.ok` 决定退出码（同文件 preset 分支 `:1249-1257` 已是正确写法，可直接对齐）。

### F8 · scripts/setup.mjs:1488 — 交互路径 `--dry-run` 打印「已写入 opencode.json」，实际零写入

```js
1481: const wr = writeConfig(assignment, models, cfg.dryRun);
...
1488: process.stdout.write(`✅ 配置完成！已写入 opencode.json\n`);
```

- **机制**: `writeConfig` 在 `dryRun` 时 `:450-453` 直接 `return { ok: true }`（不写盘、无 backupPath），而 `:1487-1498` 的输出块**没有任何 dry-run 分支**——同文件 preset 路径（`:1266-1269`）与 `--no-interactive` 路径（`:1355-1358`）都会打印 `[DRY RUN] 未写入文件` 并提前退出，唯独交互路径漏了。
- **实证（真实执行，stdout 落文件，逐行喂入）**:
  ```
  $ printf '5\ny\n' | node scripts/setup.mjs --reset --dry-run   （stdin 分两次写入）
  EXIT: 0
  ... 确认写入 opencode.json？(y/n)
  ✅ 配置完成！已写入 opencode.json
  含『已写入』: True | 含 DRY RUN: False | 含『配置完成』: True
  opencode.json 未被修改: True   （sha256 前后一致）
  ```
- **后果**: dry-run 的核心承诺「只预览不写入」被输出否定，人工/自动化据此判断配置已生效。
- **修复方向**: `:1487` 前加 `if (cfg.dryRun) { process.stdout.write("[DRY RUN] 未写入文件\n"); process.exit(0); }`，与另两条路径统一。

### F9 · scripts/setup.mjs:1407 — 交互路径无 `process.stdin.isTTY` 守卫：非 TTY 静默中途退出 exit 0

```js
1406: // ── 交互模式 ──
1407: const rl = createRL();
```

- **对照**: `install.mjs` 三处交互提示都先判 `process.stdin.isTTY && !cfg.json`（`:700`、`:740`、`:921`），setup.mjs 只有显式的 `--no-interactive`，默认路径对 TTY 无任何检查。
- **实证 1（stdin 关闭，CI/管道典型）**:
  ```
  $ timeout 15 node scripts/setup.mjs --dry-run < /dev/null
  EXIT=0   （541 字节输出，止于「你的选择 (1-3):」）
  ```
  `rl.question` 的回调在 EOF 后永不触发 → `main` 的 await 悬挂 → 事件循环清空 → **进程 exit 0 静默收场**：既不写配置、也不打印任何提示或错误码。
- **实证 2（多行管道输入）**: `printf '5\ny\n' | node scripts/setup.mjs --reset --dry-run` → 只有第一行 `5` 被 Q1 消费，第二行 `y` 因 readline 在同一 chunk 内同步派发 `line` 事件时 `question` 尚未重新注册而被丢弃 → 同样停在第二个提问后 exit 0。逐行带间隔喂入（探针 A）才能走完全流程。
- **修复方向**: 默认路径先判 `process.stdin.isTTY`，非 TTY 时提示改用 `--no-interactive` / `--preset` 并以非 0 退出（或直接走 `--no-interactive` 分支）。

### F10 · scripts/setup.mjs:243 — 不剥离 UTF-8 BOM，Windows PowerShell 保存的 JSON 直接 exit 2

```js
230:     return JSON.parse(fs.readFileSync(MODELS_JSON, "utf-8"));
243:     return JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf-8"));
```

- **对照**: 同仓库 `install.mjs:418-427 readJsonSafe()` 明确处理该场景并写下注释「PowerShell `Set-Content` 默认写 UTF-8 with BOM（`\uFEFF`），`JSON.parse` 无法解析」；`setup.mjs:525 readMenConfig()` 自己也做了 BOM 剥离，唯独 `readOpencodeJson` / `loadModels` 没有。
- **实证**: `node -e 'JSON.parse("\uFEFF{\"a\":1}")'` → `SyntaxError`（本机实测）。
- **触发条件**: 用户用 PowerShell/记事本另存为（默认带 BOM）编辑 `opencode.json` 或 `config/models.json`。
- **后果**: `setup.mjs` 直接 `错误: 解析 opencode.json 失败` exit 2，连 `--help`/`--json` 都进不去；用户无从判断是编码问题。
- **修复方向**: 复用 `install.mjs` 的 `readJsonSafe`（或在两个读取函数里统一 `raw.charCodeAt(0)===0xFEFF && raw.slice(1)`）。

### F11 · scripts/update-release-page.mjs:115 — 非幂等：同一版本重复执行会重复插行 + 版本计数虚增

```js
115: content = content.slice(0, firstTrIdx) + row + "\n" + content.slice(firstTrIdx);
...
146: content = content.replace(countRe, `共发布 <strong>${newCount} 个正式版本</strong>`);
158:   if (!existing.includes(vTag)) {          ← 版本列表有去重，计数没有
```

- **触发条件**: 对同一版本再跑一次 `node scripts/update-release-page.mjs --version X ...`（发布失败后的人工补跑是常态——本仓库 `AGENTS.md` 就记载过「v0.5.0 发版手动补 releases.astro」）。
- **实证（临时副本上真实执行两次）**:
  ```
  第1次: changes = [version-history-row, highlight, infobox-date, version-count 15→16, version-list]
         v0.7.0 历史行 = 1 行；计数 16；列表含 v0.7.0
  第2次: changes = [version-history-row, highlight, infobox-date, version-count 16→17]
         v0.7.0 历史行 = 2 行；计数 17；列表因去重未再追加   ← exit 0，无任何警告
  ```
- **后果**: 公开发布页出现重复版本行 + 计数与列表对不上；同一次运行里 `version-list` 去重而 `version-count` 不去重，行为自相矛盾。
- **修复方向**: 插行前先判 `<td><strong>v${version}</strong></td>` 是否已存在；计数改为「从版本列表实际长度推导」而不是自增。

### F12 · scripts/update-release-page.mjs:91 — `--theme` 缺省时把字面 `null` 写进发布页

```js
78:  const desc = theme ? `发布主题「${theme}」` : "";          ← buildRow 有空值兜底
91:  lines.push(`        当前版本 <code>v${version}</code> 于 ${date} 发布，主题为「${theme}」。`);
93:  lines.push(`      <h3>v${version}「${theme}」</h3>`);      ← buildHighlight 无兜底
```

- **触发条件**: 直接调用本脚本时不带 `--theme`（`parseArgs:50` 允许为 `null`，帮助未标注必填；release.mjs 调用时总会传，故只在人工补跑时触发）。
- **实证（临时副本真实执行）**:
  ```
  $ node scripts/update-release-page.mjs --version 0.7.0 --date 2026-12-01 --json
  含 null 的行: ['当前版本 <code>v0.7.0</code> 于 2026-12-01 发布，主题为「null」。',
                 '<h3>v0.7.0「null」</h3>']
  ```
- **修复方向**: `--theme` 缺省时回退到 `v${version}`（与 `release.mjs:395` 的默认值一致），或与 `buildRow` 一样做空值兜底 / 直接判定为必填。

### F13 · scripts/update-release-page.mjs:146 — 只更新计数与版本列表，同段「截至 YYYY-MM-DD」日期永不更新

```js
141: const countRe = /共发布 <strong>(\d+) 个正式版本<\/strong>/;
146: content = content.replace(countRe, `共发布 <strong>${newCount} 个正式版本</strong>`);
153: const versionListRe = /（(v[\d.]+(?:、v[\d.]+)*)）/;
```

- **触发条件**: 每次正常发版。
- **实证**: 临时副本跑一次后该段变为
  `截至 2026-10-04，共发布 <strong>16 个正式版本</strong>（…、v0.6.1、v0.7.0）`——**计数与列表更新了，日期仍是旧的**。
- **仓库现存矛盾（当前 HEAD 实况）**: `site/src/pages/docs/releases.astro:142` 写「截至 2026-10-04，共发布 15 个正式版本（…、v0.6.1）」，而 `:151` 写「当前版本 v0.6.1 于 2026-10-07 发布」——该段日期已落后一次发布。
- **修复方向**: 在本函数中同步更新 `截至 (\d{4}-\d{2}-\d{2})` 为新日期（并把 `version-count` 改为按列表长度推导，与 F11 一并修）。

### F14 · scripts/install.mjs:374 — scaffold 备份清单与自身注释不符：`.opencode/**` 被静默覆盖无备份

```js
354: // 覆盖顶层配置文件（opencode.json / AGENTS.md）与 .opencode/ 配置类文件（package.json / tui.json）
355: // 绝不静默覆盖用户已有配置
374: function scaffoldConflictPaths(entries) {
375:   return [
376:     ...entries.filter((n) => !n.endsWith("/")),
377:     ".opencode/package.json",
378:   ];
379: }
...
825:       copyAllowlist(ROOT, targetDir, SCAFFOLD_ENTRIES, COPY_EXCLUDES);
```

- **触发条件**: `npx @cgartlab/men` 在**已存在 men 资产**的目录上再次运行（升级重装）。
- **机制**: 备份清单只有 6 个顶层文件（其中还包含并无冲突风险的 `.env.example`）+ `.opencode/package.json`；而 `SCAFFOLD_ENTRIES` 含 `".opencode/"`，`copyAllowlist → copyTree` 会**整树覆盖** `.opencode/agent/*`、`.opencode/command/*`、`.opencode/skills/*`、`.opencode/plugins/*` —— 这些恰恰是允许用户自行改写的文件，覆盖前不备份，与 `:355` 的自我承诺直接冲突（注释点名的 `tui.json` 实际不在清单里，V2 迁移后该文件也已从仓库移除，注释已过时）。
- **连带**: `:361-364` 每次运行都 `copyFileSync(p, bak)` 覆盖 `.men.bak` → 第二次安装时**最初那份用户原文件的备份被覆盖丢失**。
- **修复方向**: 备份范围改为「所有将被覆盖且内容不同的已存在文件」（或至少整个 `.opencode/` 白名单文件），`.men.bak` 已存在时不覆盖；同步修正 `:354` 注释。

### F15 · scripts/install.mjs:531 — 全局模式部分失败仍报 `ok:true` exit 0，且两个分支都在 try/catch 之外

```js
448: } catch (e) {
449:   eprintf(`警告: 复制 ${s} 失败: ${e.message}`);   ← deployAssetGroup 只告警
...
531:   ok: true,                                          ← installGlobal 恒成功
...
638:   ok: true,                                          ← removeGlobal 恒成功
674: if (cfg.globalRemove) {
675:   removeGlobal(cfg);
676:   process.exit(0);                                   ← 绕过返回值，恒 exit 0
678: if (cfg.global) {
679:   const result = installGlobal(cfg);
680:   return { ok: true, exitCode: 0, result };
681: }
（两者都在 :690 的 try 之前）
```

- **触发条件**: `--global` / `--global-remove` 下发生部分失败（权限、单个文件占用）或文件系统异常（EACCES/EEXIST）。
- **后果**: ① 复制失败仅 stderr 警告，摘要照样输出「全局安装完成」`ok:true`、exit 0，自动化无法感知半完成；② 因分支位于 `try` 之外且入口守卫（`:999-1002`）没有包 `try/catch`，文件系统异常直接抛裸栈（对比 `setup.mjs:1507` 的 `main().catch(...)`）；③ `--global-remove` 用 `process.exit(0)` 收尾，连 JSON 消费方都拿不到结构化失败。
- **修复方向**: 把两个分支纳入统一 try/catch；`deployAssetGroup` 的失败数计入 `result.assetsFailed` 并据此决定 `ok`/退出码；`--global-remove` 改为 `return { ok, exitCode }`。

### F16 · scripts/install.mjs:609 — `--global-remove` 用安装时的旧备份整文件覆盖，吞掉用户安装后的修改

```js
608: if (fs.existsSync(bak)) {
609:   fs.copyFileSync(bak, p);
610:   fs.rmSync(bak, { force: true });
611:   return { restored: true, note: "已从备份还原" };
```

- **触发条件**: `--global` 装完之后，用户又编辑过 `~/.config/opencode/opencode.json`（新增 MCP / provider / agent 等），再执行 `--global-remove`。
- **后果**: 覆盖回**安装前**状态并删除备份 → 用户后加的配置无提示丢失（men 只需要移除 `default_agent`，`:613-621` 的无备份分支才是正确语义）。属「破坏性操作先确认/先备份」红线范畴。
- **修复方向**: 有备份时只回放差异（移除 `default_agent=men`），或还原前先把当前文件另存为 `opencode.json.before-restore`；至少在摘要里显式提示「安装后新增的字段将被还原」。

---

## P3 发现（质量 / 可维护性）

### F17 · scripts/update-release-page.mjs:125 — 五项变更任一命中即 `changed:true`，未命中的项静默跳过且 exit 0

```js
125: if (hlMatch) {
126:   const newHighlight = buildHighlight(version, date, theme, notesLines);
127:   content = content.replace(highlightRe, newHighlight);
128:   changed = true;
129:   changes.push("highlight");
130: }
```

- **问题**: 无 `else`/告警。`highlightRe`（`:123`）要求 `<p>…</p>` + `<h3>vX.Y.Z「主题」</h3>` + `<ul>` 三段严格相邻，页面结构一旦微调即整体不匹配；此时仍会插入历史行、更新计数，输出 `changes` 里**看不出哪一项没做**，`main` 照样 `process.exit(0)`。
- **后果**: 发布页出现「历史表有新版本、亮点区还是上一版」的半更新状态且无任何信号。
- **修复方向**: 每项变更记录 `matched/skipped`，关键项（highlight、infobox-date）未命中时以非 0 退出或在 `--json` 中标 `ok:false`。

### F18 · scripts/setup.mjs:1195 — `--help` 依赖 `config/models.json`，文件缺失/损坏时打印报错而非帮助

```js
1195: const models = loadModels();
1197: if (cfg.help) {
1198:   printHelp();
1199:   process.exit(0);
```

- **触发条件**: `config/models.json` 不存在或 JSON 损坏时执行 `node scripts/setup.mjs --help`。
- **后果**: `loadModels()` 先 `exit(2)` 报「错误: 模型知识基不存在」，帮助文本永远打不出来——排障入口本身依赖数据文件。
- **修复方向**: 把 `if (cfg.help)` 提到 `loadModels()` 之前。

### F19 · scripts/setup.mjs:1337 — `--reset` 与 `--no-interactive` 组合时 reset 被静默忽略

```js
1336: if (cfg.noInteractive) {
1337:   if (configured) {
1338:     const assignment = currentAssignment(config);
...
1344:     process.exit(0);
```

- **触发条件**: `node scripts/setup.mjs --reset --no-interactive`（已配置时）。
- **后果**: 打印当前配置即 exit 0，既不重配置也不提示 flag 冲突；用户以为已重置。同理 `--preset` 分支（`:1203`）也会吃掉 `--reset`/`--no-interactive`。
- **修复方向**: 非交互分支也尊重 `cfg.reset`（走 default/free 预设重写），或对互斥组合显式报错退出 2。

### F20 · scripts/install.mjs:674 — 全局模式下其余 flag 被静默忽略，`--global-remove` 优先于 `--global`

```js
674: if (cfg.globalRemove) {
675:   removeGlobal(cfg);
676:   process.exit(0);
678: if (cfg.global) {
679:   const result = installGlobal(cfg);
```

- **触发条件**: `--global --global-remove` 同给 → 只执行卸载；`--global --dir X` / `--global --setup` / `--global --skip-deps` → `dir`/`setup`/`skipDeps` 全部被忽略且无提示。
- **修复方向**: 解析阶段做互斥校验，冲突组合 `eprintf` + exit 2（与 `release.mjs` 未知参数的处理一致）。

### F21 · test/release.test.mjs:245 — 覆盖缺口：release 黑盒只跑 `--dry-run`，P0 所在主路径零覆盖；setup / release-notes 无测试

```js
248:     spawnSync(
249:       process.execPath,
250:       [path.join(REPO_ROOT, 'scripts', 'release.mjs'), '--dry-run', '--json'],
```

- **缺口**:
  1. `release.test.mjs` 黑盒仅 `--dry-run`（该模式在 `:346` 就分叉，**不会走到** `:403/:411` 的 notes 传参、也不会走到 git/npm/gh 任何一步）→ F1、F2 全部落在测试盲区；文件头注释也自陈「黑盒 spawn 只跑 --dry-run」。
  2. `scripts/setup.mjs`（54K，写 `opencode.json` + `~/.config/opencode/men.jsonc`）与 `scripts/release-notes.mjs` 在 `test/` 中**零覆盖**（F7/F8/F9/F10 无回归网）。
  3. `smoke-update-check.mjs` 未纳入 `npm test`（`node --test`）与 CI → F3 长期无人发现。
  4. `test/skillhub-publish.test.mjs:14` 只断言 `r.host === 'https://api.skillhub.cn'`（默认值回显），从不验证 host/token 是否真正传递 → F4/F6 不会被发现。
- **修复方向**: 增加合成仓库的 release 黑盒（含 2 条 bullet 的 CHANGELOG + `--push`，断言不崩溃或有结构化失败）、setup 的 `--dry-run`/`--json` 输出契约测试、skillhub 的参数传递断言（断言 `publishArgs`/`env` 内容），并把 smoke 挂进测试入口。
- **附**: 4 个既有测试文件实跑全绿——`node --test test/release.test.mjs test/install.test.mjs test/skillhub-publish.test.mjs test/update-check.test.mjs` → **tests 69 / pass 69 / fail 0**（断言本身未发现恒真或伪造问题）。

---

## 版本同步专项验证（维度 3，机械验证，无发现）

对 `release.mjs` 导出的 `syncVersionText` 用合成版本号 `0.6.1 → 9.9.9` 对全部 10 个 `VERSION_TEXT_FILES` 实测（只读，不落盘）：

| 文件 | 命中 | 结果 |
|------|------|------|
| site/src/pages/docs/configure.astro | 1/1 | OK（CRLF，精确上下文） |
| AGENTS.md | 1/1 | OK（历史引用未被误改） |
| docs/guide/milestones.md | 1/1 | OK |
| docs/governance.md | 1/1 | OK |
| knowledge/README.md | 2/2 | OK（两条模式各自命中） |
| .opencode/skills/men-status/SKILL.md | 2/2 | OK（**CRLF 下 `^version: …$` 与 `\| 版本 \| v… \|` 均命中**） |
| docs/integrations/argus.md | 1/1 | OK（他项目引用不受影响） |
| docs/integrations/skillhub.md | 1/1 | OK（CRLF `$` 锚点安全） |
| docs/dsh-customization.md | 1/1 | OK |
| scripts/skillhub-publish.mjs | 1/1 | OK |

- **清单遗漏检查**: `git grep -n --fixed-strings 0.6.1 -- . ':!CHANGELOG.md' ':!docs/reports'` 命中的载体全部在册：`package.json` / 两个 `package-lock.json` / `site/package.json`（JSON 清单）、上述 10 个文本文件（文本清单）、`CHANGELOG.md`（由 bumpChangelog 处理）、`site/src/pages/docs/releases.astro`（**注释明确声明为内容性页面、发版后手动更新，且 release.mjs:389-421 会在 `--push/--gh-release` 时自动调用 update-release-page.mjs**）——**无遗漏**。
- **正则误伤检查**: 每个文件被改动的行都逐条比对，**无历史版本引用、无他项目版本被改**；`VERSION_TEXT_FILES` 与 `VERSION_TEXT_PATTERNS` 键集合完全一致（10 = 10），`:99` 的全文件替换兜底分支当前不可达。
- **结论**: 版本同步维度本轮**无发现**（`release.test.mjs:158-226` 的清单锁与正则回归断言真实有效）。

---

## 按严重级汇总统计

| 严重级 | 数量 | 编号 |
|--------|------|------|
| **P0 阻断** | 1 | F1 |
| **P1 功能错误** | 3 | F2、F3、F4 |
| **P2 隐患** | 12 | F5、F6、F7、F8、F9、F10、F11、F12、F13、F14、F15、F16 |
| **P3 质量** | 5 | F17、F18、F19、F20、F21 |
| **合计** | **21** | |

| 审计对象 | 本轮发现 |
|----------|----------|
| scripts/release.mjs | F1、F2 |
| scripts/update-release-page.mjs | F11、F12、F13、F17 |
| scripts/release-notes.mjs | **无发现** |
| scripts/install.mjs | F14、F15、F16、F20 |
| scripts/setup.mjs | F7、F8、F9、F10、F18、F19 |
| scripts/skillhub-publish.mjs | F4、F5、F6 |
| scripts/smoke-update-check.mjs | F3 |
| test/release.test.mjs | F21（覆盖缺口；断言本身无缺陷） |
| test/install.test.mjs | **无发现** |
| test/skillhub-publish.test.mjs | **无发现**（F4/F6 的成因之一，已计入 F21.4） |
| test/update-check.test.mjs | **无发现** |
| 版本同步（清单/正则/CRLF） | **无发现**（专项机械验证） |

---

## 探针实证记录（均为真实执行，只读或在临时副本/合成仓库上进行）

| # | 命令 | 关键输出 |
|---|------|----------|
| 1 | 合成仓库 `node scripts/release.mjs --push`（CHANGELOG 有 2 条 bullet） | `TypeError [ERR_INVALID_ARG_VALUE] The argument 'args[8]' must be a string without null bytes` at `release.mjs:411`，`EXIT: 1`，package.json 0.1.0→0.1.1、CHANGELOG 已插入新版本节 |
| 2 | 合成仓库 `node scripts/release.mjs --push`（update-release-page 缺 releases.astro） | `动作 releases.astro 更新 FAIL` + `完成 ✓` + `EXIT=0` |
| 3 | `node -e "spawnSync(...args 含 \x00...)"` | `THROWN: TypeError must be a string without null bytes`（两处 Node 安装均为 v26.7.0） |
| 4 | `node scripts/update-release-page.mjs --version 0.7.0 --date 2026-12-01 --dry-run --json`（真实仓库） | `changes: [version-history-row, highlight, infobox-date, version-count 15→16, version-list]` |
| 5 | releases.astro 临时副本连续执行两次同版本 | 第 2 次仍 `changed:true`，`v0.7.0` 历史行 1→2，计数 16→17，`version-list` 因去重未追加 |
| 6 | releases.astro 临时副本 `--version 0.7.0 --date 2026-12-01 --json`（**不带 --theme**） | 写入 `主题为「null」`、`<h3>v0.7.0「null」</h3>` |
| 7 | releases.astro 临时副本执行后正则抽取计数段 | `截至 2026-10-04，共发布 <strong>16 个正式版本</strong>（…、v0.6.1、v0.7.0）`（日期未更新） |
| 8 | `node scripts/smoke-update-check.mjs` | `结果：13 通过，4 失败`，`EXIT=1` |
| 9 | `node --test test/release.test.mjs test/install.test.mjs test/skillhub-publish.test.mjs test/update-check.test.mjs` | `tests 69 / pass 69 / fail 0` |
| 10 | syncVersionText 探针（`0.6.1 → 9.9.9`，10 个文本文件） | 10/10 OK，改动行逐条核对无误伤，CRLF 文件锚点模式命中 |
| 11 | `node scripts/release-notes.mjs --json` | 正常输出 `version: 0.6.1 / date: 2026-10-07` + body + sections，`EXIT=0`（CRLF 安全） |
| 12 | `spawnSync("npm",["--version"],{shell:false})` 本机实测 | `ENOENT`（Windows `.cmd` shim，支撑 F5） |
| 13 | `node -e 'JSON.parse("\uFEFF{...}")'` | `SyntaxError`（支撑 F10） |
| 14 | `printf '5\ny\n' \| node scripts/setup.mjs --reset --dry-run`（stdin 分次喂入，stdout 落文件） | 输出 `✅ 配置完成！已写入 opencode.json`，无 `[DRY RUN]`，opencode.json sha256 前后一致（支撑 F8） |
| 15 | `timeout 15 node scripts/setup.mjs --dry-run < /dev/null` | `EXIT=0`，止于 `你的选择 (1-3):`，541 字节（支撑 F9） |
| 16 | `git status --porcelain` + `git diff --stat HEAD -- scripts test`（审计结束时） | `git diff` 为空（**受版本控制的 scripts/ 与 test/ 零改动**）；未跟踪新文件仅本报告与并行任务产物；无 `.release-notes.md`、`opencode.json.bak` 等残留 |

> 所有探针均未在真实仓库执行写操作：release 系探针在 scratch 合成仓库、update-release-page 探针在 scratch 副本、setup 探针全程 `--dry-run` 且以 sha256 复核目标文件未变、测试探针仅在 os.tmpdir。
