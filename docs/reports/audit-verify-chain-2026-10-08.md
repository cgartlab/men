# men 验证链路脚本审计报告 — verify / gate / event / learn / eval 系列

- **审计日期**: 2026-10-08
- **审计角色**: ji（记）
- **仓库**: `D:\3-Resource\Hermes WorkSpace\men`（HEAD `70fe47c`）
- **审计对象**: `scripts/verify.mjs`、`gate.mjs`、`event.mjs`、`learn.mjs`、`learn-budget.mjs`、`eval-metrics.mjs`、`eval-report.mjs`、`route-hint.mjs`、`migrate-events.mjs` 及 `test/` 对应测试（verify/gate/event/learn/learning）
- **审计维度**: 未捕获异常 / 空 catch / JSON.parse 无 try-catch / 递归无深度限制 / read-then-write 竞态 / Windows 路径与 BOM / 退出码语义与 `--json` schema 一致 / 测试断言恒真
- **方法**: 全量静态阅读 + Node 探针实证（探针脚本对可疑行为逐条真实执行，命令与输出见文末「探针实证记录」）；**本轮只写报告，未修改 `scripts/` 与 `test/` 任何文件**

## 跳过的已修复项（上轮修复，注释含标记）

| 文件 | 标记 |
|------|------|
| gate.mjs | P1 修复（H3a+L4）超时分档、P1（H1）appendFileSync 原子追加、P1（H3b）移除 unsafeChars |
| verify.mjs | P2 修复（M6）密钥扫描扩展、P2 修复（M1）checkBinExportsTargets 深度限制 |
| eval-report.mjs | P0 修复（H2）--sid 读事件 |
| event.mjs | P5 修复（L1）-h 子命令 |
| 其他 | release.mjs P4（M2）、cb6ba18/20cb19f/cb425f7 等提交已修项 |

**不报的设计约定**: 零依赖、`import.meta.url` 入口守卫、事件 best-effort 静默失败、gate 允许 shell 元字符、`spawnSync` 带 timeout。

## 结论摘要

共 **24 项发现（P2 × 8，P3 × 16，无 P0/P1）**。核心问题集中在四类：

1. **`--json`/参数契约破坏**：`event list --json` 尾部输出非 JSON；`verify --json` 参数错误时零输出；多处 `--sid`/`--date` 缺值直接裸栈崩溃或写入字面量 `undefined` 目录。
2. **静默假通过**：`verify checkGate` 的 `JSON.parse` 无 try-catch（损坏 package.json → 检查被吞成 SKIP、exit 0，测试根本没跑）；`eval-metrics` 的 `kpi-latest.json` 自动落盘条件 `!outputIdx` 恒假（R4 功能整体失效）。
3. **状态污染/竞态**：`gate` 状态读-改-写跨 300s spawnSync 窗口（强化上限可被绕开）；`eval-report --dry-run` 仍写 history；测试套件删除并消耗仓库真实 `budget.json`。
4. **测试失守**：`eval-metrics` CLI 测试近乎恒真且依赖磁盘上并不存在的 sid，恰是 H2/P0 回归面却无法发现回归。

**无发现的文件**: `scripts/route-hint.mjs`（无实质缺陷；仅 `jsonOut` 变量解析后未使用，但输出本就是 JSON，属无害死变量）、`test/verify.test.mjs`、`test/event.test.mjs`（仅文件头注释「event.mjs 的 ROOT = process.cwd()」与现状及本文件 cwd 测试相悖，属过时注释，不计缺陷）、`test/learn.test.mjs`。
**覆盖缺口**: `route-hint.mjs` 与 `migrate-events.mjs` 在 `test/` 中零测试覆盖；`eval-report` 仅有一条 `--help` 测试。

---

## P2 发现（中：功能缺陷 / 假通过 / 状态污染 / 测试失守）

### F1 · scripts/eval-metrics.mjs:258 — kpi-latest.json 自动落盘条件恒假，R4 功能整体失效

```js
if (outputFile || (!outputIdx && sid)) {
```

- **触发条件**: 任何 `eval-metrics --sid <sid>`（不带 `--output`）的正常调用。`args.indexOf('--output')` 未命中返回 `-1`，而 `!(-1) === false`（已 `node -e` 实测确认），第二个析取项恒为 false，分支只在显式传 `--output` 时进入。
- **后果**: `docs/drafts/architecture-deviation-analysis.md` R4「KPI 落盘供路由参考」承诺的 `.agents/state/learn/kpi-latest.json` **从未被自动写出**（本机该文件不存在），men 路由低置信分支若引用该文件将读到缺失/陈旧数据。
- **实证**: 探针 `node scripts/eval-metrics.mjs --sid no-such-sid-xyz --json` → exit 0、输出正常 KPI JSON，但 `kpi-latest.json` 仍不存在。
- **修复方向**: `(!outputIdx && sid)` → `(outputIdx === -1 && sid)`。

### F2 · scripts/eval-report.mjs:165 — `--dry-run` 仍写入 history.json（副作用违约）

```js
history.push({ date: formatDate(date), metrics });
if (history.length > 30) history.shift();
saveHistory(history);
```

- **触发条件**: `node scripts/eval-report.mjs --dry-run [--sid ...]`——上述写入位于 `if (!dryRun)`（:173）**之前**，usage（:131）却承诺「--dry-run 预览报告但不写入文件」。
- **后果**: 探针证实 dry-run 后 `history.json` 内容确实改变；且 `--sid` 缺失/不存在时会压入一条**全 0 KPI** 历史条目，成为下一次真实报告的 `previousMetrics`（:160）对比基准，趋势判断（improved/degraded）被污染。
- **实证**: 见探针 #5「history.json changed by --dry-run: true」（审计后已还原该文件）。

### F3 · scripts/event.mjs:274（replay 同因 :315）— 合法 JSON 但缺字段的事件行导致 list/replay 未捕获崩溃

```js
console.log(`  [${tsLocal}] ${ev.type.padEnd(22)} subject=${ev.subject}  detail=${detail}`);
```

- **触发条件**: events.jsonl 中存在 JSON 语法合法但缺 `type`（list）或缺 `ts`（replay :315 `const tc = a.ts.localeCompare(b.ts);`）的行——追加写入方被打断、手工编辑或混入非事件 JSON 即可产生。
- **实证**: 探针 #3/#4——`list` 先打印「(2 条)」表头随后 `TypeError: Cannot read properties of undefined (reading 'padEnd')` exit 1（部分输出已泄出）；`replay` 在排序阶段 `reading 'localeCompare'` 崩溃、零输出。
- **矛盾点**: cmdList/cmdReplay 自带 `badReport` 容错数组（只为 JSON.parse 失败计数），`validate` 也能识别缺字段坏行——设计意图显然是容错渲染，实现却在渲染处崩溃；证据链回放（replay）恰好在需要诊断坏数据时最不可用。

### F4 · scripts/verify.mjs:353 — checkGate 的 JSON.parse 无 try-catch，损坏 package.json 使 gate 检查被吞成 SKIP → 假通过

```js
const scripts = JSON.parse(fs.readFileSync(p, "utf-8")).scripts || {};
```

（同函数 :356 `const pkg = JSON.parse(fs.readFileSync(chosen, "utf-8"));` 同样裸奔）

- **触发条件**: target 祖先链上任一 `package.json` 损坏（典型：monorepo 子包 package.json 坏、被截断）。`find` 回调抛异常直接中止（find 不捕获回调异常），一路冒到 `main` 的 `try/catch`（:922）→ `gate-exit-code` 记为 `SKIP`（`异常：...`），**SKIP 不计入 failed → verify 仍 exit 0**，typecheck/test/lint 根本没有执行。
- **对照**: 同文件 `checkBinExportsTargets` 的同类解析全部包裹（:541-543 `catch { return false; }`、:549-552 解析失败返回 FAIL），`checkStructure`/`checkModelsSchema`/`checkDepsImportConsistency` 亦全部有 try-catch——checkGate 是唯一裸奔点；`checkStructure` 只解析 target 作用域内 .json，单文件目标无法兜住祖先链。
- **建议**: 包裹并返回 FAIL（与 bin-exports 一致），或将 main 对该检查的 catch 降级为 FAIL 而非 SKIP。

### F5 · scripts/event.mjs:280 — `--json` 模式尾部追加非 JSON 文本，破坏 JSON 输出契约

```js
if (bad > 0) {
    console.log(`\n(跳过 ${bad} 行坏数据)`);
```

- **触发条件**: `event.mjs list --sid <sid> --json` 且文件含坏行。
- **实证**: 探针 #2——stdout 为 `[\n {...}\n]\n\n(跳过 1 行坏数据)`，`JSON.parse(stdout)` 必然失败；且该提示走 stdout 而非 stderr。
- **修复方向**: json 模式下将提示改走 stderr 或省略。

### F6 · scripts/gate.mjs:161 — 强化计数状态读-改-写跨 300s spawnSync 窗口，并发即丢计数

```js
const state = await readState(keyword);
```

（写回在 :260-262 / :277，中间隔着 :226-231 的 `spawnSync`，`test` 关键字预算 300s）

- **触发条件**: 两个 `gate test` 进程并发（多 Bot/多会话并行收工、CI 与本地同时跑）。两者都读到旧 `reinforcementCount`、各自 +1 后写回，后写者覆盖先写者——两次失败只记 1 次。
- **后果**: `MAX_REINFORCEMENTS = 5` 的防死循环上限被系统性低估，stop-hook 门禁的强化次数语义失效（与已修复的 H1（事件日志原子追加）同一类竞态，但状态文件这条未修）。
- **修复方向**: 读-改-写合并为单次原子操作（tmp+rename + 文件锁/自增语义），或在 spawnSync 前后各做一次带文件锁的 CAS。

### F7 · test/learning.test.mjs:106 — eval-metrics CLI 测试近乎恒真，且依赖磁盘上不存在的 sid

```js
assert.ok('KPI-task-completion' in j);
```

（被测调用 :104 `mod.main(['--sid', 'eval-lessons-1786816690877', '--json'])`）

- **触发条件**: 任何运行环境。`computeMetrics` 恒返回 8 个固定 key（空数组也返回），key 存在性断言在 readEvents 完全失效时同样通过；且该硬编码 sid 在本机不存在（`ls .agents/state/sessions | grep -c eval-lessons` → 0，`.agents` 不入 git，CI 必然也不存在）→ 读取路径恒走空集。
- **后果**: 测试名声称「CLI --sid reads from events.jsonl」，实际**无法发现任何读取回归**——恰是 H2/P0（computeMetrics 始终收空数组、KPI 全 0）的回归面。
- **修复方向**: 断言 `eventsRead`/具体 KPI 非零或用 fixture sid 现场生成事件文件。

### F8 · test/learning.test.mjs:125 — 测试删除并消耗仓库真实 learn 预算状态

```js
if (fs.existsSync(f)) fs.unlinkSync(f);
```

（`f = '.agents/state/learn/budget.json'` 相对路径；`node --test` 自仓库根运行 → 指向真实状态；随后 :127 `mod.main(['consume'])` 真实扣减）

- **触发条件**: 每次 `npm run test`。
- **后果**: ① 删除用户真实预算历史；② 每跑一次测试套件消耗 1/3 当日 L2 预算（一日 3 次测试后 `learn-budget check` 全部返回 `budget limit reached`，学习回路被测试"烧尽"）；③ 测试结束无还原。同文件 :132 的 status 测试结果还依赖前一条测试的扣减顺序。
- **修复方向**: 测试内改用临时目录（chdir 或注入 STATE_DIR），或测试前后备份/还原。

---

## P3 发现（低：输入校验 / 一致性 / 文档契约 / 边角）

### F9 · scripts/event.mjs:230 — 缺 `--sid` 未捕获崩溃（append :205 / replay :289 / validate :350 同因）

```js
const fp = eventsPath(sid);
```

`eventsPath`（:65）直接 `path.join(ROOT, ..., sid, ...)`，`sid` 未做任何校验/回退。**触发**: `node scripts/event.mjs list`（不带 `--sid`）或 `--sid` 在末位（此时 parseArgs 将其置为 `true`）。**实证**（探针 #1）: `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received undefined`，exit 1、裸栈到 stderr。对照：verify.mjs `--sid` 缺值回退默认值（:870），gate.mjs `sid || gate-<ts>` 回退（:148）——同链路三种行为。

### F10 · scripts/event.mjs:367 — 事件链读取方全部不剥离 UTF-8 BOM（list :248 / replay :305；learn.mjs:63、eval-metrics.mjs:236、eval-report.mjs:24 同）

```js
obj = JSON.parse(lines[i]);
```

**触发**: events.jsonl 被 PowerShell `Set-Content` / 编辑器「UTF-8 with BOM」重存。**后果**: validate 将首行判为坏行 exit 1（证据链断裂）；learn/eval 静默丢弃首条事件（KPI 少计一条）。**仓库内已有处理先例而验证链漏掉**: install.mjs:421 注释「PowerShell Set-Content 默认写 UTF-8 with BOM（\uFEFF），JSON.parse 无法解析」并在 :106/:422 剥离，setup.mjs:525、skillhub-publish.mjs:91 同——唯独 event/learn/eval 系列没有。

### F11 · scripts/verify.mjs:331 — scaffold SKIP 分支永假（死代码），测试注释仍引用它当依据

```js
if (repoRoot && !path.resolve(pkgDir).startsWith(repoRoot)) {
```

`repoRoot` 由从 `pkgDir` 逐级向上扫描（:325-329）得到，必为其祖先，`startsWith` 恒真 → 「目标不在 men 仓库内（scaffold 模式）」分支不可达。test/event.test.mjs:154 注释声称「指向仓库外的临时目标即可让 checkGate 走 scaffold 分支直接 SKIP（verify.mjs:315）」——实际该测试走的是 :347「未找到 package.json」分支，测试依据失真。

### F12 · scripts/verify.mjs:885 — `--json` 模式下参数错误零 JSON 输出，退出码 2 与 usage 文档冲突

```js
return { ok: false, exitCode: 2, error: "缺少目标" };
```

**触发**: `node scripts/verify.mjs --json`（缺 target）。**实证**（探针 #8）: exit 2、stdout 为空、仅 stderr 用法文本——`--json` 调用方无法解析错误；USAGE_TEXT 只声明「0 = 全部检查通过 / 非 0 = 有检查项失败」，2 并非"检查项失败"。`--help --json` 同理输出纯文本。

### F13 · scripts/gate.mjs:153 — 缺关键字 exit 1 与「1 = 检查失败」撞车；exit 3 未文档化

```js
console.error("用法：node scripts/gate.mjs <gate关键字> ...");
process.exit(1);
```

USAGE_TEXT（:44-47）定义 `0 = 通过/跳过/强化耗尽`、`1 = 检查失败`、`2 = 关键字不在白名单`——用法错误（缺关键字）返回 1，机器调用方无法区分"门禁失败"与"没传参数"；另 :290 `main().catch` 的 `exit 3`（通用异常）未列入退出码表。

### F14 · scripts/gate.mjs:133 — 状态文件非原子写 + readState 无形状校验（损坏即静默重置上限）

```js
await writeFile(path, JSON.stringify(state, null, 2));
```

直接覆盖写（对照 learn-budget.mjs:44-46、learn.mjs:167-169、eval-report.mjs:58-60 均 tmp+rename）：进程被杀留下截断/空文件；readState（:120-126）只兜语法错误，读到合法但形状不符的 `{}` 时 `reinforcementCount === undefined` → 上限检查恒 false、`undefined + 1` → NaN → JSON 序列化为 null——**状态损坏 = 强化上限 fail-open 重置**。

### F15 · scripts/learn.mjs:93 — 声明「所有学习操作 best-effort」但写入路径全部裸奔

```js
fs.writeFileSync(file, content, 'utf8');
```

文件头 :8 与 usage :189 均承诺「所有学习操作 best-effort，不阻塞主流程」，但 `writeError`（:93）、`writePattern`（:105）、`queueGate`（:168）、`rebuildIndex`（:147）及 main 执行循环（:210-239）、CLI 入口（:264 `console.log(main(...))`）全部无 try/catch——`errors/` 或 `knowledge/patterns/` 只读、EISDIR、权限拒绝时 learn 整体未捕获崩溃，与声明契约相反。

### F16 · scripts/learn.mjs:198 — `--sid` 缺值时向字面量 `undefined/` 会话目录写事件

```js
const sid = sidIdx >= 0 ? args[sidIdx + 1] : 'unknown';
```

**触发**: `node scripts/learn.mjs --sid`（缺值）。**实证**（探针 #7）: exit 0，且在仓库 `.agents/state/sessions/undefined/` 建出真实目录并写入事件（审计探针已清理）。同场景 event.mjs 崩溃（F9）、eval-metrics 静默全 0（F17）——链路内对同一种误用三种表现。

### F17 · scripts/eval-metrics.mjs:252 — 缺 `--sid` 静默返回全 0 KPI，无任何提示

```js
const events = sid ? readEvents(sid) : [];
```

stderr 无警告、输出 JSON 不含 sid 标记——与本文件 :20-21 自己的设计评论（「KPI 全部归零且与『无数据』无法区分」）直接相悖；对照 eval-report.mjs:154 同场景会输出 `⚠ 警告：未指定 --sid`。

### F18 · scripts/eval-metrics.mjs:113 — `fail` 计算后从未使用；失败事件系统性归为 unknown

```js
const fail = judgeEvents.filter(e => parseOutcome(e) === 'FAIL').length;
```

全文仅 :57 的字符串字面量与该行出现 `fail`，8 项 KPI 输出无失败计数（死变量）。且 `parseOutcome` 只做英文关键词匹配：gate.failed 的 detail 是「退出码 1」（gate.mjs:268）、verify 失败事件 detail 是「失败项: ...」（verify.mjs:958），fallback 中文关键词只有「通过」可命中 PASS——失败事件一律 `unknown`。当前因 `fail` 未被消费而未污染 KPI，一旦有后续代码引用即失真。

### F19 · scripts/eval-report.mjs:65 — `--date` 零校验，非法值未捕获崩溃

```js
return date.toISOString().slice(0, 10);
```

（`--date` 原始取值在 :145 `args[dateIdx + 1]`，无任何校验）**触发**: `eval-report --date --json`（--date 后随 flag，date 变成字符串 `'--json'`）→ `TypeError: date.toISOString is not a function`；`--date 2026-99-99`（Invalid Date → RangeError: Invalid time value）同理。**实证**（探针 #6）: exit 1、裸栈，崩溃点 main:165。

### F20 · scripts/eval-report.mjs:78 — `--date` 只作用于文件名，报告头仍用当天，产物内日期自相矛盾

```js
const date = formatDate(new Date());
```

**触发**: `eval-report --date 2026-10-01` → 写出 `docs/eval/2026-10-01.md`（:174）、历史条目记 `2026-10-01`（:165），但报告头是 `# 团队评估报告 — 2026-10-08`——同一产物三个日期口径不一致，违背 usage :129「--date 报告日期（默认今天）」。

### F21 · scripts/learn-budget.mjs:38 — budget.json 无形状校验，合法但空的 JSON 导致当日预算 fail-open 重置

```js
return JSON.parse(raw);
```

只兜语法错误。**触发**: budget.json 被外部写成合法的 `{}`/`[]`（手工编辑、工具改写）→ `b.date === undefined` → `isSameDay` false → `check()` 直接返回 `{ ok: true, reason: 'new day, budget reset' }`，当日 L2 预算静默重开；`consume()` 同样重置计数。

### F22 · scripts/migrate-events.mjs:66 — 事件主文件非原子重写 + 混合行尾被归一化，违背头部承诺

```js
fs.writeFileSync(file, fixedLines.join(eol), 'utf8');
```

① 直接覆盖重写 events.jsonl（同仓 learn/learn-budget/eval-report 均 tmp+rename），迁移中被杀即截断会话日志；② :55 `const eol = raw.includes('\r\n') ? '\r\n' : '\n';` 把混合行尾文件整体归一化为单一行尾，与文件头 :8「保留其余字段与**行尾符不变**」冲突。

### F23 · test/gate.test.mjs:40 — 测试创建的会话事件目录无清理，仓库状态无限累积

```js
const r = runGate(['test', '--dir', tempRoot, '--sid', sid]);
```

每次 `npm run test` 在真实仓库 `.agents/state/sessions/` 留下 `gate-meta-*` / `gate-pass-*` / `gate-unsafe-*` 目录（当前磁盘已累积 30+ 个），测试无任何 finally 清理（对照 event.test.mjs 每个 sid 都 `rmSync`）。

### F24 · test/learning.test.mjs:121 — 断言近乎恒真

```js
assert.ok(j.ok === true || j.ok === false);
```

等价于 `typeof j.ok === 'boolean'`，对任何布尔值恒真，无法区分 `check()` 在超限时应返回 `ok:false` 的任何逻辑错误——「CLI check returns JSON with ok field」名不副实（应断言具体场景下的真值）。

---

## 无发现 / 低风险文件说明

| 文件 | 结论 |
|------|------|
| `scripts/route-hint.mjs` | 无实质缺陷。仅 `jsonOut`（:99）解析后未使用，但输出本就是 JSON（头部契约如此），无害；frontmatter 解析对正文 `---` 水平线的 `inFrontmatter` 翻转为边角场景，未计。**零测试覆盖**。 |
| `scripts/migrate-events.mjs` | 仅 F22（P3）。**零测试覆盖**。 |
| `test/verify.test.mjs` | 断言具体（正/负样本均有），未发现恒真断言。 |
| `test/event.test.mjs` | 断言质量高（黑盒闭环、写入方契约、cwd 隔离均有实效）；仅文件头注释「event.mjs 的 ROOT = process.cwd()」过时（与本文件 :193 测试相悖），不计缺陷。 |
| `test/learn.test.mjs` | 临时目录 + chdir 隔离干净，未发现恒真断言。 |

## 探针实证记录

探针脚本（`scratch/men-audit-probe.mjs`，对仓库只读、副作用全部还原/清理）逐条真实执行：

| # | 命令 | 结果 |
|---|------|------|
| 1 | `event.mjs list`（无 --sid） | exit 1，`TypeError ... Received undefined` @ eventsPath:65 → 证实 F9 |
| 2 | `event.mjs append --type verify --subject x`（无 --sid） | 同上崩溃 @ cmdAppend:205 |
| 3 | 向 events.jsonl 混入坏行后 `list --sid x --json` | stdout = JSON + `(跳过 1 行坏数据)` → 证实 F5 |
| 4 | 追加 `{"foo":1}` 后 `list` / `replay` | list 表头后 `padEnd` TypeError；replay `localeCompare` TypeError → 证实 F3 |
| 5 | `eval-metrics --sid no-such-sid-xyz --json` | exit 0，`kpi-latest.json exists: false` → 证实 F1 |
| 6 | `eval-report --dry-run --sid no-such` | `history.json changed by --dry-run: true` → 证实 F2（已还原） |
| 7 | `eval-report --date --json` | exit 1，`date.toISOString is not a function` @ :65 → 证实 F19 |
| 8 | `learn.mjs --sid`（缺值） | exit 0，`sessions/undefined created: true` → 证实 F16（已清理） |
| 9 | `verify.mjs --json`（缺 target） | exit 2，stdout 空 → 证实 F12 |
| 辅 | `node -e "!(-1)"` / `ls .agents/state/sessions \| grep eval-lessons` | `false` / `0` → 证实 F1、F7 |

审计后仓库 `git status --short` 为空（`scripts/`、`test/` 未改动；`history.json` 已还原，探针产生的临时会话目录已删除）。

## 修复建议顺序

1. **F4**（verify 假通过）与 **F1**（KPI 落盘失效）——直接影响验证链可信度；
2. **F6**（gate 状态竞态）、**F2**（dry-run 副作用）、**F8**（测试烧预算）——状态正确性；
3. **F3/F5/F9**（event.mjs 三连：崩溃与 JSON 契约）——证据链工具可用性；
4. **F7/F24**（恒真断言）——让测试真正具备回归守护能力；
5. 其余 P3 按文件顺手清理（参数校验、BOM 剥离、退出码文档、原子写统一）。
