#!/usr/bin/env node
/**
 * install.mjs — men（门）Agent 团队 全平台一键安装核心
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 * 被 install.sh（Linux/macOS）与 install.ps1（Windows）引导调用，
 * 也可直接运行：node scripts/install.mjs [选项]
 *
 * 用法：
 *   node scripts/install.mjs [--dir <path>] [--skip-deps] [--skip-verify] [--json] [--help]
 *
 * 行为：
 *   1. 检测 Node 版本 >= 18（不满足则报错退出非 0）
 *   2. 目标目录：默认当前目录（已有仓库则就地安装）；
 *      --dir 指向不存在的目录时，从当前仓库根复制源码（排除运行态目录）
 *   3. 安装 .opencode/ 依赖（npm install --prefix .opencode，Windows 用 cmd /c 无 shell）
 *   4. 配置：.env 不存在时从 .env.example 复制
 *   5. 端到端验证：node scripts/verify.mjs men --json，退出码 0 才报"安装成功"
 *   6. 输出安装摘要
 */
import fs from "node:fs";
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
  dependencies: { "@opencode-ai/plugin": "1.18.18" },
};

// 复制到新目录时排除的路径（任意层级命中即跳过；.env 含密钥绝不复制）
const COPY_EXCLUDES = new Set([
  "node_modules", ".git", ".agents", "state", "dist", "build",
  "tmp", "temp", ".venv", ".obsidian", ".trae",
  ".env", ".env.local",
  ".DS_Store", "Thumbs.db",
]);

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    dir: null, skipDeps: false, skipVerify: false, json: false, help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") out.dir = args[++i] || null;
    else if (a === "--skip-deps") out.skipDeps = true;
    else if (a === "--skip-verify") out.skipVerify = true;
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

用法:
  node scripts/install.mjs [选项]

选项:
  --dir <path>      安装目标目录（默认: 当前目录）。
                    目录不存在时从当前仓库根复制文件后安装
  --skip-deps       跳过 .opencode/ 依赖安装（npm install）
  --skip-verify     跳过端到端验证（scripts/verify.mjs men）
  --json            输出 JSON 摘要
  --help, -h        显示本帮助

平台引导（推荐，自动拉取仓库）:
  Linux/macOS:  bash <(curl -fsSL <INSTALL_URL>)
  Windows:      irm <INSTALL_URL> | iex
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

// 确保 .opencode/package.json 存在（缺失时写入最小模板，兼容 npm 发布分发）
function ensureOpencodePkg(dir) {
  const p = path.join(dir, ".opencode", "package.json");
  if (fs.existsSync(p)) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(OPCODE_PKG_TEMPLATE, null, 2) + "\n");
  return true;
}

// ─────────────────────────── 主流程 ───────────────────────────

function run() {
  const cfg = parseArgs(process.argv);
  if (cfg.help) {
    printHelp();
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
  let targetDir = cfg.dir ? path.resolve(cfg.dir) : process.cwd();

  if (!fs.existsSync(targetDir)) {
    // 目标不存在：从当前仓库根复制（本地分发模式）
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

  // ── 3. 依赖安装 ──
  const opcodePkgCreated = ensureOpencodePkg(targetDir);
  const deps = { skipped: cfg.skipDeps, ok: null, command: null, exitCode: null, note: null };
  if (opcodePkgCreated) deps.note = ".opencode/package.json 缺失，已写入最小模板";
  if (!cfg.skipDeps) {
    deps.command = "npm install --prefix .opencode";
    const r = runNpm(targetDir, ["install", "--prefix", ".opencode"]);
    deps.exitCode = r.status ?? -1;
    deps.ok = deps.exitCode === 0;
    if (!deps.ok) {
      fail(`依赖安装失败（exit ${deps.exitCode}）：${(r.stderr || "").slice(-300)}`);
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
  process.stdout.write(`  路径   ${r.dir}${r.copyMode === "copied" ? "（从仓库复制）" : ""}\n`);
  process.stdout.write(`  Node   ${mark(true, false, `${r.node.version}（要求 ${r.node.required}）`, "", "")}\n`);
  const depsText = r.deps.command
    ? `${r.deps.command}（exit ${r.deps.exitCode}）`
    : "已存在 .opencode/package.json";
  process.stdout.write(`  依赖   ${mark(r.deps.ok, r.deps.skipped, depsText, "跳过（--skip-deps）", `exit ${r.deps.exitCode}`)}\n`);
  if (r.deps.note) process.stdout.write(`         注意: ${r.deps.note}\n`);
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
  process.stdout.write(`  安装成功 ✓  下一步：在项目目录运行 opencode\n`);
}

run();
