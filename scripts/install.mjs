#!/usr/bin/env node
/**
 * install.mjs — men（门）Agent 团队 全平台一键安装核心
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 * 三种运行方式：
 *   - npx @cgartlab/men（npm 包 bin）：从任意目录 scaffold 运行时资产到当前目录
 *   - 被 install.sh（Linux/macOS）与 install.ps1（Windows）引导调用（git 一键路径）
 *   - 直接运行：node scripts/install.mjs [选项]
 *
 * 用法：
 *   npx @cgartlab/men
 *   node scripts/install.mjs [--dir <path>] [--skip-deps] [--skip-verify] [--json] [--help]
 *
 * 行为：
 *   1. 检测 Node 版本 >= 18（不满足则报错退出非 0）
 *   2. 目标目录：
 *      - npm 包 bin 运行（cwd ≠ 包目录）：SCAFFOLD 模式，复制运行时白名单到当前目录
 *      - 默认当前目录（仓库内运行则就地安装）
 *      - --dir 指向不存在的目录时，从当前仓库根复制源码（排除运行态目录）
 *   3. 安装 .opencode/ 依赖（npm install --prefix .opencode，Windows 用 cmd /c 无 shell）；
 *      失败仅告警不中止（@opencode-ai/plugin 仅类型声明，运行时不需要）
 *   4. 配置：.env 不存在时从 .env.example 复制
 *   5. 端到端验证：node scripts/verify.mjs men --json，退出码 0 才报"安装成功"
 *   6. 输出安装摘要
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const MIN_NODE_MAJOR = 18;
const ENV_TEMPLATE = ".env.example";
const ENV_TARGET = ".env";

// .opencode/package.json 缺失时的最小模板（npm 发布可能按 .gitignore 排除它）
const OPCODE_PKG_TEMPLATE = {
  dependencies: { "@opencode-ai/plugin": "1.18.23" },
};

// 复制到新目录时排除的路径（任意层级命中即跳过；.env 含密钥绝不复制）
const COPY_EXCLUDES = new Set([
  "node_modules", ".git", ".agents", "state", "dist", "build",
  "tmp", "temp", ".venv", ".obsidian", ".trae",
  ".env", ".env.local",
  ".DS_Store", "Thumbs.db",
]);

// scaffold 模式（npx @cgartlab/men）复制的运行时白名单：
// 仅这些顶层条目会进入目标目录；目录型条目递归复制并尊重 COPY_EXCLUDES
const SCAFFOLD_ENTRIES = [
  "opencode.json",
  "AGENTS.md",
  ".env.example",
  "install.sh",
  "install.ps1",
  ".opencode/",
  "scripts/",
  "config/",
  "knowledge/",
];

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    dir: null, skipDeps: false, skipVerify: false, json: false, help: false, global: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") out.dir = args[++i] || null;
    else if (a === "--skip-deps") out.skipDeps = true;
    else if (a === "--skip-verify") out.skipVerify = true;
    else if (a === "--global") out.global = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else {
      eprintf(`未知参数: ${a}（用 --help 查看用法）`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — 全平台一键安装器

npm 一键安装（推荐，scaffold 到当前目录）:
  npx @cgartlab/men
    从任意目录运行：复制运行时资产（opencode.json / .opencode/ / scripts/ 等）
    到当前目录，安装依赖、生成 .env、端到端验证，完成后在当前目录运行 opencode

用法:
  node scripts/install.mjs [选项]

选项:
  --dir <path>      安装目标目录（默认: 当前目录）。
                    目录不存在时从当前仓库根复制文件后安装
  --global          注册为 OpenCode 全局 TUI 插件（写入 tui.json 的 plugin 列表，
                    不触碰 opencode.json；重启 OpenCode 后任意目录侧边栏生效）
  --skip-deps       跳过 .opencode/ 依赖安装（npm install）
  --skip-verify     跳过端到端验证（scripts/verify.mjs men）
  --json            输出 JSON 摘要
  --help, -h        显示本帮助

平台引导（推荐，自动拉取仓库）:
  Linux/macOS:  bash <(curl -fsSL https://raw.githubusercontent.com/cgartlab/men/main/install.sh)
  Windows:      irm https://raw.githubusercontent.com/cgartlab/men/main/install.ps1 | iex
`);
}

function checkNode() {
  const raw = process.versions.node; // e.g. "26.2.0"
  const major = Number(raw.split(".")[0]);
  return { version: `v${raw}`, major, ok: Number.isFinite(major) && major >= MIN_NODE_MAJOR };
}

// Windows 下 npm 是 npm.cmd，不能直接 spawnSync('npm')，用 cmd /c 包裹（shell: false 安全模式）
function runNpm(cwd, args) {
  const win = process.platform === "win32";
  const cmd = win ? "cmd" : "npm";
  const cmdArgs = win ? ["/c", "npm", ...args] : args;
  return spawnSync(cmd, cmdArgs, {
    cwd, encoding: "utf-8", shell: false, timeout: 120_000,
  });
}

function runVerify(cwd) {
  return spawnSync(process.execPath, ["scripts/verify.mjs", "men", "--json"], {
    cwd, encoding: "utf-8", shell: false, timeout: 60_000,
  });
}

// 判断 dir 是否看起来像 men 仓库根
function isMenRepoRoot(dir) {
  return (
    fs.existsSync(path.join(dir, "scripts", "install.mjs")) &&
    fs.existsSync(path.join(dir, ".opencode", "agent"))
  );
}

function copyTree(src, dest, excludes) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d, excludes);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

// 按白名单复制运行时资产（scaffold 模式）：
// 只复制 entries 中存在的顶层条目；目录型条目递归复制并尊重 excludes
function copyAllowlist(src, dest, entries, excludes) {
  for (const name of entries) {
    const s = path.join(src, name);
    if (!fs.existsSync(s)) continue;
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d, excludes);
    } else if (fs.statSync(s).isFile()) {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

// 确保 .opencode/package.json 存在（缺失时写入最小模板，兼容 npm 发布分发）
function ensureOpencodePkg(dir) {
  const p = path.join(dir, ".opencode", "package.json");
  if (fs.existsSync(p)) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(OPCODE_PKG_TEMPLATE, null, 2) + "\n");
  return true;
}

// ─────────────────────────── 全局模式 ───────────────────────────

// OpenCode 全局配置目录：OPENCODE_CONFIG_DIR 优先，否则平台默认（~/.config/opencode）
function globalConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return path.resolve(process.env.OPENCODE_CONFIG_DIR);
  return path.join(os.homedir(), ".config", "opencode");
}

// --global：把 @cgartlab/men 注册为 OpenCode 全局 TUI 插件（写 tui.json）。
// 设计：只改 tui.json（TUI 插件声明）；不触碰 opencode.json（可能由 CC Switch 管理）。
// OpenCode 启动时自动用 Bun 安装 npm 包并解析 exports["./tui"] 加载侧边栏。
function installGlobal(cfg) {
  const dir = globalConfigDir();
  fs.mkdirSync(dir, { recursive: true });

  const tuiPath = path.join(dir, "tui.json");
  let tui = {};
  try {
    tui = JSON.parse(fs.readFileSync(tuiPath, "utf8"));
  } catch {
    tui = {};
  }
  const plugins = Array.isArray(tui.plugin) ? tui.plugin.slice() : [];
  const spec = "@cgartlab/men";
  const added = !plugins.includes(spec);
  if (added) plugins.push(spec);
  tui.plugin = plugins;

  fs.writeFileSync(tuiPath, JSON.stringify(tui, null, 2) + "\n");

  const result = {
    ok: true,
    summary: added ? "已注册全局 TUI 插件" : "全局 TUI 插件已存在，无需变更",
    mode: "global",
    dir,
    tuiJson: tuiPath,
    plugin: spec,
    added,
    note: "OpenCode 启动时会自动安装 @cgartlab/men 并加载侧边栏；重启 OpenCode 生效",
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`men（门）Agent 团队 — 全局安装摘要\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`  模式   ${added ? "新增注册" : "已存在（幂等）"}\n`);
    process.stdout.write(`  配置   ${tuiPath}\n`);
    process.stdout.write(`  插件   ${spec}\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`  ✓ ${result.summary}。重启 OpenCode 后任意目录侧边栏生效\n`);
  }
  return result;
}

// ─────────────────────────── 主流程 ───────────────────────────

function run() {
  const cfg = parseArgs(process.argv);
  if (cfg.help) {
    printHelp();
    process.exit(0);
  }

  // --global：只注册全局 TUI 插件，不进入项目安装流程
  if (cfg.global) {
    installGlobal(cfg);
    process.exit(0);
  }

  const fail = (msg) => {
    eprintf(`安装失败：${msg}`);
    process.exit(1);
  };

  // ── 1. Node 版本检查 ──
  const node = checkNode();
  if (!node.ok) fail(`Node.js 版本过低：${node.version}（要求 >= v${MIN_NODE_MAJOR}）`);

  // ── 2. 目标目录 ──
  let copyMode = "in-place";
  const inRepo = path.resolve(process.cwd()) === ROOT;
  let targetDir = cfg.dir ? path.resolve(cfg.dir) : process.cwd();

  if (cfg.dir) {
    // --dir 显式指定：保持原行为（不存在 → 全量复制；存在 → 必须是 men 仓库根）
    if (!fs.existsSync(targetDir)) {
      if (!isMenRepoRoot(ROOT)) {
        fail(`目标目录不存在：${targetDir}，且脚本所在目录不是 men 仓库根，无法复制。请先用 install.sh / install.ps1 拉取仓库`);
      }
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        copyTree(ROOT, targetDir, COPY_EXCLUDES);
        copyMode = "copied";
      } catch (e) {
        fail(`复制到 ${targetDir} 失败：${e.message}`);
      }
    } else if (!isMenRepoRoot(targetDir)) {
      fail(`目标目录已存在但不是 men 仓库根：${targetDir}`);
    }
  } else if (!inRepo) {
    // SCAFFOLD 模式：从已安装的 npm 包运行（npx @cgartlab/men），cwd ≠ 包目录
    // 目标 = 当前目录；已是 men 仓库根则幂等跳过复制，否则复制运行时白名单
    if (isMenRepoRoot(targetDir)) {
      copyMode = "in-place";
    } else {
      try {
        copyAllowlist(ROOT, targetDir, SCAFFOLD_ENTRIES, COPY_EXCLUDES);
        copyMode = "scaffolded";
      } catch (e) {
        fail(`scaffold 到 ${targetDir} 失败：${e.message}`);
      }
    }
  } else if (!isMenRepoRoot(targetDir)) {
    fail(`目标目录已存在但不是 men 仓库根：${targetDir}`);
  }

  // ── 3. 依赖安装 ──
  const opcodePkgCreated = ensureOpencodePkg(targetDir);
  const deps = { skipped: cfg.skipDeps, ok: null, command: null, exitCode: null, note: null, warning: null };
  if (opcodePkgCreated) deps.note = ".opencode/package.json 缺失，已写入最小模板";
  if (!cfg.skipDeps) {
    deps.command = "npm install --prefix .opencode";
    const r = runNpm(targetDir, ["install", "--prefix", ".opencode"]);
    deps.exitCode = r.status ?? -1;
    deps.ok = deps.exitCode === 0;
    if (!deps.ok) {
      // 非致命：@opencode-ai/plugin 仅类型声明，运行时不需要；无 registry 访问也能继续
      deps.warning = `依赖安装失败（exit ${deps.exitCode}），已跳过继续：${(r.stderr || "").slice(-200)}`;
      eprintf(`警告: ${deps.warning}\n`);
    }
  }

  // ── 4. 环境配置 ──
  const envSrc = path.join(targetDir, ENV_TEMPLATE);
  const envDst = path.join(targetDir, ENV_TARGET);
  const env = { created: false, existing: false, source: ENV_TEMPLATE, warning: null };
  if (fs.existsSync(envDst)) {
    env.existing = true;
  } else if (!fs.existsSync(envSrc)) {
    env.warning = `${ENV_TEMPLATE} 不存在，跳过 .env 创建`;
  } else {
    try {
      fs.copyFileSync(envSrc, envDst);
      env.created = true;
    } catch (e) {
      fail(`创建 .env 失败：${e.message}`);
    }
  }

  // ── 5. 端到端验证 ──
  const verify = { skipped: cfg.skipVerify, ok: null, exitCode: null, summary: null };
  if (!cfg.skipVerify) {
    const r = runVerify(targetDir);
    verify.exitCode = r.status ?? -1;
    try {
      verify.report = JSON.parse(r.stdout || "null");
    } catch {
      verify.report = null;
    }
    verify.summary = verify.report ? verify.report.summary : null;
    verify.ok = verify.exitCode === 0;
    if (!verify.ok) {
      fail(`端到端验证失败（exit ${verify.exitCode}）：${(r.stdout || r.stderr || "").slice(-300)}`);
    }
  }

  // ── 6. 摘要 ──
  const result = {
    ok: true,
    name: "men（门）Agent 团队",
    summary: "安装成功",
    dir: targetDir,
    copyMode,
    node: { ok: node.ok, version: node.version, required: `>=${MIN_NODE_MAJOR}` },
    deps,
    env,
    verify,
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printSummary(result);
  }
  process.exit(0);
}

function printSummary(r) {
  const mark = (ok, skip, okText, skipText, failText) => {
    if (skip) return `SKIP  ${skipText}`;
    if (ok) return `PASS  ${okText}`;
    return `FAIL  ${failText}`;
  };
  process.stdout.write(`men（门）Agent 团队 — 安装摘要\n`);
  process.stdout.write(`${"=".repeat(54)}\n`);
  const modeText =
    r.copyMode === "copied" ? "（从仓库复制）" :
    r.copyMode === "scaffolded" ? "（scaffold 到当前目录）" : "";
  process.stdout.write(`  路径   ${r.dir}${modeText}\n`);
  process.stdout.write(`  Node   ${mark(true, false, `${r.node.version}（要求 ${r.node.required}）`, "", "")}\n`);
  const depsText = r.deps.command
    ? `${r.deps.command}（exit ${r.deps.exitCode}）`
    : "已存在 .opencode/package.json";
  process.stdout.write(`  依赖   ${mark(r.deps.ok, r.deps.skipped, depsText, "跳过（--skip-deps）", `exit ${r.deps.exitCode}`)}\n`);
  if (r.deps.note) process.stdout.write(`         注意: ${r.deps.note}\n`);
  if (r.deps.warning) process.stdout.write(`         警告: ${r.deps.warning}\n`);
  const envText = r.env.created
    ? `已从 ${r.env.source} 创建 ${ENV_TARGET}`
    : r.env.existing
      ? `${ENV_TARGET} 已存在，跳过`
      : "未创建";
  process.stdout.write(`  配置   ${envText}\n`);
  if (r.env.warning) process.stdout.write(`         警告: ${r.env.warning}\n`);
  const verifyText = r.verify.summary
    ? `scripts/verify.mjs men（exit ${r.verify.exitCode}，PASS=${r.verify.summary.passed} FAIL=${r.verify.summary.failed} WARN=${r.verify.summary.warn}）`
    : `scripts/verify.mjs men（exit ${r.verify.exitCode}）`;
  process.stdout.write(`  验证   ${mark(r.verify.ok, r.verify.skipped, verifyText, "跳过（--skip-verify）", `exit ${r.verify.exitCode}`)}\n`);
  process.stdout.write(`${"=".repeat(54)}\n`);
  const nextStep = r.copyMode === "scaffolded"
    ? "  安装成功 ✓  下一步：在当前目录运行 opencode\n"
    : "  安装成功 ✓  下一步：在项目目录运行 opencode\n";
  process.stdout.write(nextStep);
}

run();
