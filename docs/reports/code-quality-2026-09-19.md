# 代码质量 + 安全漏洞审查报告

> **审查日期**：2026-09-19  
> **审查范围**：`@cgartlab/men` v0.5.0（纯 Node.js 脚本 + OpenCode 插件）  
> **审查者**：Men Agent 团队（自动审查 + 人工复核）  
> **技术栈**：Node.js >= 18，零运行时依赖（仅 `@opentui/solid ^0.5.8`）

---

## 1. 机械门禁执行结果

| 门禁 | 命令 | 退出码 | 结果 |
|------|------|--------|------|
| test | `npm test` (`node --test`) | 0 | ✅ 149/149 pass |
| verify | `node scripts/verify.mjs men` | 0 | ✅ 9 PASS, 0 FAIL |
| audit | `npm audit --audit-level=high` | 0 | ✅ 0 vulnerabilities |
| **lint** | — | — | ⚠️ **缺口**：项目未配置 ESLint / Biome 等 linter |
| **typecheck** | — | — | ⚠️ **缺口**：项目为纯 `.mjs`，无 TypeScript，无 `tsc --noEmit` |
| **build** | — | — | ⚠️ **缺口**：CLI 工具项目无构建步骤（纯 ESM 直接执行） |

### 缺口说明

- **lint**：项目所有脚本已通过 `verify.mjs` 的 `code-hygiene` 静态扫描（空 catch / 无 timeout spawnSync / 裸 console.log），覆盖部分 lint 规则。如需完整 lint，可考虑引入 `@eslint/js` + `eslint-plugin-security`。
- **typecheck**：纯 `.mjs` 无类型注解，`node --check` 已做语法校验。无 `.ts` 文件，`tsc --noEmit` 不适用。
- **build**：CLI 工具无编译步骤，`package.json` 的 `bin` 直接指向 `.mjs` 文件。

---

## 2. 自动扫描结果

### npm audit

```
$ npm audit --audit-level=high
found 0 vulnerabilities
```

**结果**：0 P0 / 0 P1 / 0 P2 / 0 P3。依赖仅 `@opentui/solid ^0.5.8`，无已知高危漏洞。

### 扫描器覆盖说明

项目为纯 Node.js 无框架项目，仅 1 个运行时依赖。`npm audit` 是覆盖度最高的扫描器。未引入 semgrep / eslint-plugin-security 等额外扫描器（遵守"不新增依赖未经确认"约束）。

---

## 3. 人工安全审查

### 3.1 命令注入（CWE-78）

| 严重度 | 文件:行 | 状态 | 说明 |
|--------|---------|------|------|
| **P2** | `scripts/install.mjs:300-304` | ✅ **已修复** | `commandExists(cmd)` 将 `cmd` 直接拼入 `sh -c "command -v \"${cmd}\""` 字符串。若 `cmd` 含 shell 元字符（如 `;`、`$()`）可注入任意命令。 |
| P3 | `scripts/gate.mjs:205-207` | 📋 **豁免** | `scriptText` 来自 `package.json` 的 `scripts` 字段，由仓库维护者控制，非外部用户输入。shell 执行是 npm 脚本执行的标准模式。 |

**P2 修复**：在 `commandExists` 入口添加正则校验 `/^[a-zA-Z0-9._-]+$/`，拒绝含 shell 元字符的输入。

**P3 豁免理由**：`gate.mjs` 执行 npm scripts 是设计意图，`scriptText` 来源于版本控制的 `package.json`，攻击面等同于修改仓库代码本身。

### 3.2 路径遍历（CWE-22）

| 严重度 | 文件:行 | 状态 | 说明 |
|--------|---------|------|------|
| P3 | `scripts/skillhub-publish.mjs:163-164` | 📋 **豁免** | `path.resolve(cfg.skillDir)` 允许绝对路径，可指向仓库外目录。但这是本地 CLI 工具，用户主动指定路径是预期行为。 |
| P3 | `scripts/install.mjs:782` | 📋 **豁免** | 同上，`--dir` 参数允许指定任意目标目录。 |

**豁免理由**：所有脚本均为本地 CLI 工具，用户拥有文件系统完全控制权。路径遍历在本地 CLI 场景中不构成安全边界突破（用户可自由读写文件系统）。若未来部署为服务端，需添加 ROOT 锚定校验。

### 3.3 SQL 注入 / XSS

| 严重度 | 文件:行 | 状态 | 说明 |
|--------|---------|------|------|
| — | — | ✅ 不适用 | 项目无数据库操作、无用户输入渲染到 HTML。纯 CLI + 文件 I/O。 |

### 3.4 SSRF（CWE-918）

| 严重度 | 文件:行 | 状态 | 说明 |
|--------|---------|------|------|
| — | `scripts/setup.mjs:1115` | ✅ 安全 | `fetch(ZEN_MODELS_API, ...)` 使用硬编码常量 URL，非用户可控。 |
| — | `scripts/smoke-update-check.mjs` | ✅ 安全 | 测试文件，使用 mock fetch。 |

### 3.5 硬编码密钥（CWE-798）

| 严重度 | 文件:行 | 状态 | 说明 |
|--------|---------|------|------|
| — | 全仓库 | ✅ 安全 | `verify.mjs` 的 `checkSecrets` 扫描 22 个文件，0 命中。所有 token 通过环境变量传递（`SKILLHUB_TOKEN` / `SKILLHUB_API_KEY` / `EMBEDDING_API_KEY`）。 |

### 3.6 不安全反序列化（CWE-502）

| 严重度 | 文件:行 | 状态 | 说明 |
|--------|---------|------|------|
| — | 全仓库 | ✅ 安全 | 所有 `JSON.parse` 调用均在 try-catch 中，仅解析 JSON（无 `eval` / `Function` 构造器 / `yaml.load` 等危险反序列化）。 |

### 3.7 日志泄露敏感信息（CWE-532）

| 严重度 | 文件:行 | 状态 | 说明 |
|--------|---------|------|------|
| P3 | `scripts/eval-metrics.mjs:265` | 📋 **豁免** | `console.log(main(process.argv.slice(2)))` 输出完整 main 返回值。CLI 工具的 stdout 输出是预期行为，非日志泄露。 |
| P3 | `scripts/event.mjs:206,253-268` | 📋 **豁免** | 同上，事件列表 CLI 工具输出事件内容到 stdout。 |

**豁免理由**：所有 `console.log` 均为 CLI 工具的 stdout 输出（用户主动调用的查询/报告命令），非后台日志。token 值从未被写入日志——`skillhub-publish.mjs` 仅检查 token 是否存在，不打印 token 内容。

### 3.8 安全响应头

| 严重度 | 状态 | 说明 |
|--------|------|------|
| — | ✅ 不适用 | 项目无 HTTP 服务器。静态站点 `site/` 使用 Astro 构建，部署时由托管平台（如 Netlify/Vercel）添加安全头。 |

### 3.9 鉴权缺失 / IDOR（CWE-862）

| 严重度 | 状态 | 说明 |
|--------|------|------|
| — | ✅ 不适用 | 项目无多用户鉴权场景。所有操作为本地 CLI 或 GitHub Actions（CI token 由 GitHub 管理）。 |

### 3.10 依赖供应链

| 严重度 | 状态 | 说明 |
|--------|------|------|
| — | ✅ 安全 | `npm audit --audit-level=high` 0 漏洞。仅 1 个依赖 `@opentui/solid ^0.5.8`。`package-lock.json` 锁定完整依赖树。无 lockfile 漂移。 |

---

## 4. 发现汇总

| 严重度 | 数量 | 已修复 | 豁免 |
|--------|------|--------|------|
| **P0** | 0 | — | — |
| **P1** | 0 | — | — |
| **P2** | 1 | 1 (`install.mjs` 命令注入) | 1 (`gate.mjs` 脚本执行，书面豁免) |
| **P3** | 4 | 0 | 4 (路径遍历×2, console.log×2，书面豁免) |
| **缺口** | 3 | — | lint / typecheck / build 门禁不存在 |

### 官方文档引用

| CWE | 标题 | 官方参考 |
|-----|------|---------|
| CWE-78 | Improper Neutralization of Special Elements used in an OS Command | [OWASP: Command Injection](https://owasp.org/www-community/attacks/Command_Injection) |
| CWE-22 | Improper Limitation of a Pathname to a Restricted Directory | [CWE-22](https://cwe.mitre.org/data/definitions/22.html) |
| CWE-502 | Deserialization of Untrusted Data | [CWE-502](https://cwe.mitre.org/data/definitions/502.html) |
| CWE-798 | Use of Hard-coded Credentials | [CWE-798](https://cwe.mitre.org/data/definitions/798.html) |
| CWE-918 | Server-Side Request Forgery (SSRF) | [CWE-918](https://cwe.mitre.org/data/definitions/918.html) |
| CWE-532 | Insertion of Sensitive Information into Log File | [CWE-532](https://cwe.mitre.org/data/definitions/532.html) |

---

## 5. 改进建议（非阻断）

1. **引入 ESLint + eslint-plugin-security**：补全 lint 门禁缺口。当前 `verify.mjs` 的 `code-hygiene` 已覆盖核心规则，但 ESLint 可补充更多 lint 模式。
2. **路径遍历加固**：若脚本未来部署为服务端（如 GitHub App），需在 `path.resolve` 后校验 `absPath.startsWith(ROOT)`。
3. **CLI_VERSION 同步**：`scripts/skillhub-publish.mjs` 的 `CLI_VERSION = "0.5.0"` 未纳入 `release.mjs` 的 `VERSION_TEXT_FILES` 同步列表，发版时需手动更新或加入列表。

---

## 6. 验证证据

```
$ npm test
✔ 149 tests, 0 fail, exit 0

$ node scripts/verify.mjs men
PASS=9, FAIL=0, exit 0

$ npm audit --audit-level=high
found 0 vulnerabilities, exit 0

$ node --check scripts/install.mjs scripts/gate.mjs scripts/verify.mjs scripts/skillhub-publish.mjs
(no output, exit 0)
```
