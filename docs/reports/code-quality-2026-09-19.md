# 代码质量 + 安全漏洞审查报告

> **审查日期**：2026-09-19
> **审查范围**：`@cgartlab/men` v0.5.0（OpenCode Agent 团队配置 + 纯 Node 脚本 + OpenCode 插件 + Astro 静态站）
> **审查者**：Men Agent 团队（机械门禁实跑 + 自动扫描 + 人工复核）
> **技术栈**：Node.js >= 18；根项目零运行时依赖（仅 `@opentui/solid ^0.5.8`）；`site/` 为 Astro 7 静态站；`.opencode/` 为插件本地依赖
> **代码基数**：178 个受版本控制文件（74 `.md` / 31 `.mjs` / 30 `.astro` / 15 `.json` / 10 `.yml` / 3 `.ts` / 3 `.js` / 2 `.ps1` / 1 `.sh`）

---

## 1. 机械门禁执行结果

所有命令均在本次会话中实跑，退出码为实际观测值。

| # | 门禁 | 命令 | 退出码 | 结果 |
|---|------|------|--------|------|
| 1 | test | `node --test` | **0** | ✅ 149 tests / 149 pass / 0 fail |
| 2 | verify | `node scripts/verify.mjs men` | **0** | ✅ PASS=9 / FAIL=0 / WARN=0 |
| 3 | syntax | `node --check`（31 个 `scripts/*.mjs` + `test/*.mjs` 逐一） | **0** | ✅ 31/31 语法通过，0 失败 |
| 4 | audit(root) | `npm audit --audit-level=high` | **0** | ✅ 0 vulnerabilities |
| 5 | audit(site) | `npm audit --audit-level=high`（`site/`） | **0** | ✅ 0 vulnerabilities |
| 6 | audit(plugins) | `npm audit --audit-level=high`（`.opencode/`） | **0** | ✅ 0 vulnerabilities |
| 7 | build(site) | `npm run build`（`astro build`，`site/`） | **0** | ✅ 14 page(s) built |
| 8 | check-site | `node site/scripts/check-site.mjs` | **0** | ✅ dist HTML 14 个，UTF-8 / charset / mojibake / base 守卫 / 锚点全部通过 |
| 9 | release-dry-run | `node scripts/release.mjs --dry-run` | **0** | ✅ 版本同步清单解析正常（4 JSON + 8 文本） |
| 10 | **lint** | — | — | ⚠️ **缺口**（见 §1.1） |
| 11 | **typecheck** | — | — | ⚠️ **缺口**（见 §1.1） |

### 1.1 缺口说明

| 缺口 | Found | Expected | 处置 |
|------|-------|----------|------|
| **lint** | 三个 `package.json` 均无 `lint` 脚本；仓库无 `.eslintrc*` / `eslint.config.*` / `biome.json` | 引入 `@eslint/js` + `eslint-plugin-security` | 📋 **书面豁免**（见 §3.11）。`scripts/verify.mjs` 的 `code-hygiene` 已覆盖核心 lint 规则：空 `catch` / 无 `timeout` 的 `spawnSync` / 裸 `console.log`，扫描 22 个文件 0 命中 |
| **typecheck** | 3 个受版本控制的 `.ts` 文件：`.opencode/plugins/men-learn.ts`、`.opencode/plugins/men-verify.ts`、`site/src/data/site.ts`；`site/tsconfig.json` 存在（`extends: astro/tsconfigs/strict`），但三个 `package.json` **均无 `typescript` 依赖、无 `tsc` 脚本** | `typescript --noEmit` 可运行 | 📋 **书面豁免**（见 §3.11）。补齐需新增 `typescript` devDependency，受"不新增依赖未经确认"硬约束限制，未执行。`.ts` 插件文件由 OpenCode 运行时（esbuild 类）即时转译，`site/*.astro` 内的 TS 由 Astro 构建期处理 |

> **注**：本仓库无 `build` 步骤的断言仅对**根项目**成立（CLI 工具，`package.json` 的 `bin` 直接指向 `.mjs`）。`site/` **实际存在** `build` 门禁（`astro build`），已实跑通过（#7）。

---

## 2. 自动扫描结果

### 2.1 npm audit ×3

依赖分属三个独立 `package.json` / `node_modules`，必须分别审计（仅审计根目录会漏掉另外两个）：

| 位置 | 依赖 | 结果 |
|------|------|------|
| 根 `package.json` | `@opentui/solid ^0.5.8` | `found 0 vulnerabilities` |
| `site/package.json` | `@iconify-json/lucide`、`astro ^7.2.9`、`astro-icon ^1.2.0` | `found 0 vulnerabilities` |
| `.opencode/package.json` | `@opencode-ai/plugin 1.18.30`、`@opentui/core ^0.5.8`、`@opentui/solid ^0.5.8` | `found 0 vulnerabilities` |

**结果**：0 P0 / 0 P1 / 0 P2 / 0 P3。三个 lockfile 完整锁定依赖树，无漂移。

### 2.2 扫描器覆盖说明

按技术栈选择了 `npm audit --audit-level=high`（Node.js 生态覆盖度最高的官方扫描器）并覆盖全部三个依赖根。未引入 semgrep / eslint-plugin-security / bandit / ruff 等额外扫描器：

- 理由：遵守"不新增依赖未经确认"硬约束（引入 `semgrep` 需 npm 安装，引入 `bandit`/`ruff` 需 Python 环境，均非仓库现有运行时）。
- 补偿措施：§3 的人工审查覆盖了自动扫描无法覆盖的 9 个高危面，包括 `child_process` 全量调用点（`exec` / `execSync` / `spawn` / `spawnSync`，全仓库 51 处匹配）与全部 `fetch` 调用点。

---

## 3. 人工安全审查

### 3.1 命令注入（CWE-78 / OS Command Injection）

| # | 严重度 | 文件:行 | 状态 | Found | Expected | 可复制修复 |
|---|--------|---------|------|-------|----------|-----------|
| 1 | **P2** | `scripts/install.mjs:299-311`（漏洞体 `305-306`） | ✅ **已修复**（commit `338227c`） | `commandExists(cmd)` 将 `cmd` 直接拼入 `sh -c "command -v \"${cmd}\""` 字符串执行。若 `cmd` 含 shell 元字符（如 `;`、`$()`、`&&`）可注入任意命令 | 执行前校验 `cmd` 为简单命令名 | 见下方代码块 |
| 2 | P3 | `scripts/gate.mjs:205-207` | 📋 **豁免** | `spawnSync(isWin ? "cmd" : "sh", isWin ? ["/c", scriptText] : ["-c", scriptText], ...)`；`scriptText` 来自 `package.json` 的 `scripts` 字段 | `scriptText` 应仅含仓库维护者控制的内容 | 维持现状（理由见下） |
| 3 | P3 | `scripts/verify.mjs:343-352` | 📋 **豁免** | `const spawnArgs = win ? ["cmd", "/c", script] : ["sh", "-c", script]; spawnSync(spawnArgs[0], spawnArgs.slice(1), ...)`；`script` 同样来自 `package.json` 的 `scripts` 字段 | 同上 | 维持现状 |
| 4 | P3 | `scripts/skillhub-publish.mjs:121-128` | 📋 **豁免** | `spawnSync(cfg.cli, args, { shell: false, ... })`；`cfg.cli` 为用户指定的 CLI 可执行路径 | 若 `cfg.cli` 需受控，应校验为白名单内的二进制 | 维持现状（本地 CLI，用户主动指定，见下） |

**#1 可复制修复**（已入库）：

```js
// scripts/install.mjs:299-311
function commandExists(cmd) {
  // 安全：cmd 仅允许简单命令名，禁止 shell 元字符（CWE-78 命令注入防护）
  if (!/^[a-zA-Z0-9._-]+$/.test(cmd)) return false;   // ← 关键防线
  try {
    const win = process.platform === "win32";
    const r = win
      ? spawnSync("where", [cmd], { encoding: "utf-8", shell: false, timeout: 10_000 })
      : spawnSync("sh", ["-c", `command -v "${cmd}"`], { encoding: "utf-8", shell: false, timeout: 10_000 });
    return r.status === 0 && String(r.stdout || "").trim().length > 0;
  } catch {
    return false;
  }
}
```

**#2 / #3 / #4 豁免理由（责任方：仓库维护者 cgartlab，复审触发条件：`package.json` 的 `scripts` 字段或 CLI 路径来源改为外部输入时）**：
- `gate.mjs` / `verify.mjs`：执行 npm scripts 是设计意图，`scriptText` 来源于版本控制的 `package.json`，攻击面等同于修改仓库代码本身；且 `shell: false` + `timeout` 已防止二次 shell 展开与超时挂起。
- `skillhub-publish.mjs`：`cfg.cli` 由本地用户在命令行主动指定，本地 CLI 场景下用户已拥有等价执行能力，不构成安全边界突破。

### 3.2 路径遍历（CWE-22 / Path Traversal）

| # | 严重度 | 文件:行 | 状态 | Found | Expected | 可复制修复 |
|---|--------|---------|------|-------|----------|-----------|
| 5 | P3 | `scripts/skillhub-publish.mjs:162-164` | 📋 **豁免** | `const skillDir = path.isAbsolute(cfg.skillDir) ? path.resolve(cfg.skillDir) : path.resolve(ROOT, cfg.skillDir);` 允许绝对路径指向仓库外 | 若需限定仓库内，应校验 `skillDir.startsWith(ROOT + path.sep)` | 见下方代码块 |
| 6 | P3 | `scripts/install.mjs:784` | 📋 **豁免** | `let targetDir = cfg.dir ? path.resolve(cfg.dir) : process.cwd();` `--dir` 允许任意目标目录 | 同上 | 同上 |

**加固代码（未来若部署为服务端需套用）**：

```js
// 在 path.resolve 之后追加 ROOT 锚定校验
const abs = path.resolve(userInput);
if (!abs.startsWith(ROOT + path.sep)) {
  throw new Error(`路径越界：${userInput}`);
}
```

**豁免理由（责任方：仓库维护者 cgartlab）**：本仓库全部脚本均为本地 CLI 工具，用户拥有文件系统完全控制权；路径遍历在本地 CLI 场景中不构成安全边界突破。`verify.mjs:218` 已示范了正确的 ROOT 锚定写法（`abs.startsWith(ROOT + path.sep + ".opencode")`），可作为服务端化改造的参考实现。

### 3.3 SQL 注入 / XSS（CWE-89 / CWE-79）

| 严重度 | 文件:行 | 状态 | Found | Expected |
|--------|---------|------|-------|----------|
| — | 全仓库 | ✅ **不适用** | 0 处数据库操作（无 `mysql` / `pg` / `sqlite` / `knex` / `sequelize` 引用）；0 处用户输入渲染到 HTML | 若未来有数据库操作，应使用参数化查询 |

> **XSS 边界检查**：`.opencode/plugins/men-sidebar/update-check.mjs:168-172` 的 `api.ui.DialogConfirm({ message: `当前 v${currentVersion}，最新 v${latest}。是否更新？` })` 将 `latest` 渲染进对话框。`latest` 由 `parseLatestTag`（同文件 `:35`）的正则 `/\/releases\/tag\/v(\d+(?:\.\d+)*)/` 约束，只可能输出数字与点号，**注入面已被上游正则消除**。

### 3.4 SSRF（CWE-918 / Server-Side Request Forgery）

| 严重度 | 文件:行 | 状态 | Found | Expected |
|--------|---------|------|-------|----------|
| — | `scripts/setup.mjs:1115` | ✅ **安全** | `fetch(ZEN_MODELS_API, ...)`，URL 为硬编码常量 | 用户可控 URL 需做 allowlist 校验 |
| — | `.opencode/plugins/men-sidebar/update-check.mjs:138` | ✅ **安全** | `fetch("https://github.com/cgartlab/men/releases/latest", { redirect: "manual", signal })`，硬编码 HTTPS URL | 同上 |

**关键判断**：全仓库共 2 处 `fetch`，**0 处**用户可控 URL；`update-check.mjs` 对 3xx 的 `Location` 响应头**仅做正则解析**（`:153`），解析结果只用于版本比较与 UI 展示，**不会被再次 fetch**，因此不存在 SSRF 链式利用面。

### 3.5 硬编码密钥（CWE-798 / Hard-coded Credentials）

| 严重度 | 文件:行 | 状态 | Found | Expected |
|--------|---------|------|-------|----------|
| — | 全仓库 | ✅ **安全** | `scripts/verify.mjs:137` 的正则 `(password\|secret\|api_key\|token\|apikey)\s*[:=]\s*['\"][^'\"]{8,}` 扫描 22 个文件，**0 命中** | token 一律经环境变量传递 |

**验证补充**：

- `.env` **未被 git 跟踪**（`git ls-files` 无命中），`.gitignore` 已排除 `.env` / `.env.local` / `*.local`。
- `.env.example`（唯一入库的环境变量文件）31 行**全部为占位符**（`your_embedding_api_key_here`、`https://your-embedding-service.example.com/v1` 等），无任何真实凭据。
- token 通过环境变量传递：`SKILLHUB_TOKEN` / `SKILLHUB_API_KEY` / `EMBEDDING_API_KEY` / `NPM_TOKEN`。
- `scripts/install.mjs:138-151` 的 `COPY_EXCLUDES` 明确包含 `".env"` / `".env.local"` —— 复制仓库时**绝不传播密钥文件**，是正确的纵深防御。

### 3.6 不安全反序列化（CWE-502 / Deserialization of Untrusted Data）

| 严重度 | 文件:行 | 状态 | Found | Expected |
|--------|---------|------|-------|----------|
| — | 全仓库 | ✅ **安全** | 0 处 `eval` / `new Function` / `vm.run*` / `yaml.load`（非 `safeLoad`）；所有 `JSON.parse` 均包裹在 `try/catch` 中 | 解析不可信数据需使用 `JSON.parse`（禁止 `eval`/`Function`） |

### 3.7 日志泄露敏感信息（CWE-532 / Sensitive Info in Log File）

| # | 严重度 | 文件:行 | 状态 | Found | Expected | 可复制修复 |
|---|--------|---------|------|-------|----------|-----------|
| 7 | P3 | `scripts/eval-metrics.mjs:265` | 📋 **豁免** | `console.log(main(process.argv.slice(2)))` 输出完整 main 返回值 | stdout 输出不得包含凭据 | 维持现状（见下） |
| 8 | P3 | `scripts/event.mjs:206, 253-268` | 📋 **豁免** | CLI 查询命令将事件内容输出到 stdout | 同上 | 维持现状 |

**豁免理由（责任方：仓库维护者 cgartlab）**：所有 `console.log` 均为 CLI 工具的 stdout 输出（用户主动调用的查询/报告命令），非后台日志。token 值从未被写入日志——`scripts/skillhub-publish.mjs` 仅检查 token 是否存在（`:188-192`），从不打印其值；`process.argv.slice(2)` 在本仓库无一处会把 token 作为参数传入（token 走 env，见 §3.5）。

### 3.8 安全响应头（CWE-693 / Security Misconfiguration）

| 严重度 | 状态 | Found | Expected |
|--------|------|-------|----------|
| — | ✅ **不适用** | 全仓库 **0 处** `http.createServer` / `.listen(`（`.opencode/plugins/men-sidebar/index.js` 的 `server:` 是 OpenCode 插件 API 的空实现 `async () => ({})`，**不是 HTTP 服务器**） | 静态站点由托管平台（Netlify / Vercel）在部署时注入安全头 |

### 3.9 鉴权缺失 / 越权 IDOR（CWE-862 / CWE-639）

| 严重度 | 状态 | Found | Expected |
|--------|------|-------|----------|
| — | ✅ **不适用** | 项目无多用户模型，无服务端会话。所有操作为本地 CLI 或 GitHub Actions（CI 凭据由 GitHub 管理：`ci.yml` 使用 `${{ github.token }}`，`codeql.yml` 显式声明最小权限 `permissions: contents: read, security-events: write`） | 若未来提供服务端，需引入鉴权中间件 |

### 3.10 依赖供应链（CWE-1104 / Dependency Confusion）

| 严重度 | 状态 | Found | Expected |
|--------|------|-------|----------|
| — | ✅ **安全** | 三个 `package.json` 共 3 组依赖，`npm audit` ×3 全部 0 漏洞；三个 lockfile 完整锁定；`dist/`（磁盘上 76 个文件）**未被 git 跟踪**，无陈旧构建产物入库风险 | 定期运行 audit + lockfile 提交 |

**补充**：`.github/dependabot.yml` 已启用，`dedb061` 等历史 commit 显示依赖更新由 Dependabot 自动化。

### 3.11 门禁缺口的书面豁免（lint / typecheck）

| 缺口 | 严重度 | Found | Expected | 豁免理由 | 责任方 |
|------|--------|-------|----------|----------|--------|
| lint | P3 | 无 linter 配置 | ESLint + `eslint-plugin-security` | ① 新增依赖需先经用户确认（硬约束）；② `verify.mjs` 的 `code-hygiene` 已覆盖核心规则（空 catch / 无 timeout spawnSync / 裸 console.log，22 文件 0 命中） | 仓库维护者 cgartlab |
| typecheck | P3 | 3 个 `.ts` 文件、`site/tsconfig.json` 存在，但无 `typescript` 依赖 | `tsc --noEmit` | ① 同上，需新增 `typescript` devDependency；② `.ts` 插件由 OpenCode 运行时即时转译，`site/*.astro` 的 TS 由 Astro 构建期处理，`astro build` 实跑通过（14 页）已覆盖语法层 | 仓库维护者 cgartlab |

### 3.12 版本同步漂移（工程质量项，CWE 不适用）

| # | 严重度 | 文件:行 | 状态 | Found | Expected | 可复制修复 |
|---|--------|---------|------|-------|----------|-----------|
| 9 | P3（质量） | `scripts/release.mjs:55-63` 与 `scripts/skillhub-publish.mjs:35` | ✅ **已修复**（本报告配套 commit） | `skillhub-publish.mjs:35` 定义 `export const CLI_VERSION = "0.5.0"`，但 `scripts/skillhub-publish.mjs` **不在** `VERSION_TEXT_FILES` 同步清单中。发版时 `release.mjs` 只做文本替换，该常量会**永远停在旧版本** | 该文件应纳入 `VERSION_TEXT_FILES` | 见下方代码块 |

**可复制修复**（已入库，2 处改动）：

```js
// scripts/release.mjs —— VERSION_TEXT_FILES 追加一行
  "docs/integrations/argus.md",           // argus 集成文档的版本引用
  "scripts/skillhub-publish.mjs",         // CLI_VERSION 常量（v0.5.0 新增，此前漏同步）
];
```

```js
// test/release.test.mjs —— textMust 追加一行（防清单被改窄）
    'docs/integrations/argus.md',
    'scripts/skillhub-publish.mjs',
  ];
```

**验证**：`node scripts/release.mjs --dry-run` 输出由 `4 JSON + 7 文本` 变为 `4 JSON + 8 文本`，并出现 `同步 version → 0.5.1: scripts/skillhub-publish.mjs (将变更)`。文件内 `"0.5.0"` 仅出现 1 处，`split(oldVersion).join(newVersion)` 的全局替换安全无误伤。

---

## 4. 发现汇总

| 严重度 | 数量 | 已修复 | 豁免（含理由与责任方） |
|--------|------|--------|------------------------|
| **P0** | 0 | — | — |
| **P1** | 0 | — | — |
| **P2** | 1 | 1 | 0 |
| **P3** | 6 | 1 | 5 |
| **缺口** | 2 | — | 2（书面豁免） |

**P2 / P3 明细**：

| 严重度 | 发现 | 位置 | 处置 |
|--------|------|------|------|
| P2 | 命令注入 CWE-78 | `scripts/install.mjs:299-311` | ✅ 已修复（commit `338227c`，正则白名单 `^[a-zA-Z0-9._-]+$`） |
| P3 | npm script shell 执行 CWE-78 | `scripts/gate.mjs:205-207` | 📋 豁免（维护者控制输入） |
| P3 | npm script shell 执行 CWE-78 | `scripts/verify.mjs:343-352` | 📋 豁免（同上） |
| P3 | 用户指定 CLI 二进制执行 CWE-78 | `scripts/skillhub-publish.mjs:121-128` | 📋 豁免（本地 CLI 预期行为） |
| P3 | 路径遍历 CWE-22 | `scripts/skillhub-publish.mjs:162-164` | 📋 豁免（本地 CLI，附服务端加固代码） |
| P3 | 路径遍历 CWE-22 | `scripts/install.mjs:784` | 📋 豁免（同上） |
| P3（质量） | 版本同步漂移 | `scripts/release.mjs:55-63` + `scripts/skillhub-publish.mjs:35` | ✅ 已修复（本报告配套 commit，清单 7→8） |

> **上一版报告的勘误**（本版已修正）：
> 1. 上一版汇总表将 `gate.mjs` 计为 P2 豁免，但 §3.1 表格中它标注为 P3 —— 分类不一致，本版已统一为 P3。
> 2. 上一版将 `build` 整体列为缺口，遗漏了 `site/` 实际存在的 `astro build` 门禁（已实跑 exit 0）。
> 3. 上一版称"项目为纯 `.mjs`，无 TypeScript"，遗漏了 3 个受版本控制的 `.ts` 文件（2 个插件 + 1 个 site 数据文件）与 `site/tsconfig.json`。
> 4. 上一版仅审计了根目录依赖，遗漏了 `site/` 与 `.opencode/` 两个独立依赖根（本版已分别审计，均 0 漏洞）。
> 5. 上一版遗漏了 `scripts/verify.mjs:343-352` 的 npm script shell 执行面。

---

## 5. 官方文档引用

| CWE | 标题 | 官方参考 |
|-----|------|---------|
| CWE-78 | Improper Neutralization of Special Elements used in an OS Command（OS Command Injection） | [OWASP: Command Injection](https://owasp.org/www-community/attacks/Command_Injection) · [Node.js 安全: child_process spawn 不用 shell](https://nodejs.org/api/child_process.html#spawn) |
| CWE-22 | Improper Limitation of a Pathname to a Restricted Directory（Path Traversal） | [CWE-22](https://cwe.mitre.org/data/definitions/22.html) · [Node.js path.resolve](https://nodejs.org/api/path.html#pathresolvepath) |
| CWE-89 | SQL Injection | [OWASP: SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection) |
| CWE-79 | Improper Neutralization of Input During Web Page Generation（XSS） | [OWASP: Cross Site Scripting](https://owasp.org/www-community/attacks/xss/) |
| CWE-918 | Server-Side Request Forgery (SSRF) | [CWE-918](https://cwe.mitre.org/data/definitions/918.html) |
| CWE-798 | Use of Hard-coded Credentials | [CWE-798](https://cwe.mitre.org/data/definitions/798.html) |
| CWE-502 | Deserialization of Untrusted Data | [CWE-502](https://cwe.mitre.org/data/definitions/502.html) |
| CWE-532 | Insertion of Sensitive Information into Log File | [CWE-532](https://cwe.mitre.org/data/definitions/532.html) |
| CWE-693 | Protection Mechanism Misconfiguration（安全响应头缺失） | [CWE-693](https://cwe.mitre.org/data/definitions/693.html) |
| CWE-862 | Missing Authorization | [CWE-862](https://cwe.mitre.org/data/definitions/862.html) |
| CWE-639 | Authorization Bypass Through User-Controlled Key（IDOR） | [CWE-639](https://cwe.mitre.org/data/definitions/639.html) |
| CWE-1104 | Software Dependencies | [CWE-1104](https://cwe.mitre.org/data/definitions/1104.html) |

---

## 6. 验证证据（本会话实跑）

```
$ node --test
ℹ tests 149
ℹ pass 149
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 696.7162
===TEST EXIT: 0===

$ node scripts/verify.mjs men
汇总: PASS=9  FAIL=0  WARN=0
===VERIFY EXIT: 0===

$ for f in scripts/*.mjs test/*.mjs; do node --check "$f"; done
SYNTAX OK, failures=0   (31 个文件)

$ npm audit --audit-level=high                     # 根
found 0 vulnerabilities                             ===AUDIT EXIT: 0===
$ npm audit --audit-level=high                      # site/
found 0 vulnerabilities                             ===SITE_AUDIT_EXIT: 0===
$ npm audit --audit-level=high                      # .opencode/
found 0 vulnerabilities                             ===OPENCODE_AUDIT_EXIT: 0===

$ npm run build                                     # site/
14 page(s) built in 731ms
===SITE BUILD EXIT: 0===

$ node site/scripts/check-site.mjs
PASS | dist HTML 总数: 14
PASS | 全部页面：UTF-8 解码 / charset / mojibake 特征 / base 守卫 检查完成
结果：站点产物验证全部通过（无服务器、零常驻进程）
===CHECK-SITE EXIT: 0===

$ node scripts/release.mjs --dry-run
动作     同步版本文件 → 0.5.1（4 JSON + 8 文本）
  动作     同步 version → 0.5.1: scripts/skillhub-publish.mjs (将变更)
===DRYRUN EXIT: 0===
```

---

## 7. 结论

1. **P0 / P1 = 0**：未发现阻断级或高危安全漏洞。
2. **P2 = 1，已全部修复**：`install.mjs` 命令注入（CWE-78），commit `338227c`。
3. **P3 = 6**：1 项已修复（版本同步漂移），5 项为本地 CLI 场景下的书面豁免，均附理由与责任方，并给出服务端化时的加固代码。
4. **门禁 9/9 通过**（exit 0），**缺口 2/2 已书面豁免**（lint / typecheck，均受"不新增依赖未经确认"硬约束限制）。
5. **自动扫描 ×3 全部 0 漏洞**，依赖供应链受 Dependabot + 三个 lockfile 保护。
6. **硬约束遵守情况**：未新增任何依赖；`.env` 未入库（仅 `.env.example`，全占位符）；未改公共 API 签名（`VERSION_TEXT_FILES` 为导出常量的值变更，非签名变更，且该列表的追加是 `test/release.test.mjs:157` 既有守卫的既定意图）；未降级任何安全严重度；未删除或跳过任何测试（149→149）；仓库不存在 `AGENTS.md` 的 ANTI-PATTERNS 章节（已全仓搜索确认，该约束不适用）；未全局安装任何工具。
