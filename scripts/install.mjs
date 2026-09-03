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
import { fileURLToPath, pathToFileURL } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const MIN_NODE_MAJOR = 18;
const MIN_OPENCODE_VERSION = "1.18.25";  // Men 依赖：plugin API + TUI 插件系统 + agent 权限
const ENV_TEMPLATE = ".env.example";
const ENV_TARGET = ".env";

// ─────────────────────────── 前置条件检查 ───────────────────────────

// 检测 OpenCode 是否已安装，返回 { installed, version, path }
export function checkOpenCode() {
  const result = { installed: false, version: null, path: null, error: null };
  try {
    const r = spawnSync("opencode", ["--version"], { encoding: "utf-8", shell: false, timeout: 10_000 });
    if (r.status === 0 && r.stdout) {
      const ver = r.stdout.trim().split("\n")[0].trim();
      result.installed = true;
      result.version = ver;
      // 获取安装路径
      const r2 = spawnSync(
        process.platform === "win32" ? "where" : "which",
        ["opencode"],
        { encoding: "utf-8", shell: false, timeout: 5_000 },
      );
      if (r2.status === 0 && r2.stdout) result.path = r2.stdout.trim().split("\n")[0].trim();
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

// 比较版本号：返回 1(a>b) / 0(相等) / -1(a<b)。自动剥离前缀/后缀，仅比较语义化 x.y.z
export function compareVersions(a, b) {
  const extract = (s) => String(s).match(/(\d+(?:\.\d+)*)/)?.[1] || "0";
  const pa = extract(a).split(".").map(Number);
  const pb = extract(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// 检测 OpenCode 版本是否满足最低要求
export function checkOpenCodeVersion(version) {
  if (!version) return { ok: false, current: null, required: MIN_OPENCODE_VERSION };
  return {
    ok: compareVersions(version, MIN_OPENCODE_VERSION) >= 0,
    current: version,
    required: MIN_OPENCODE_VERSION,
  };
}

// 检测 CC Switch / opencode.json 配置状态
// 返回 { exists, managedByCCSwitch, hasModel, hasMCP, hasAgent, fields }
export function checkCCSwitch() {
  const result = { exists: false, managedByCCSwitch: false, hasModel: false, hasMCP: false, hasAgent: false, fields: [] };
  const candidates = [];
  // 全局配置
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (home) candidates.push(path.join(home, ".config", "opencode", "opencode.json"));
  // 环境变量
  if (process.env.OPENCODE_CONFIG_DIR) candidates.push(path.resolve(process.env.OPENCODE_CONFIG_DIR, "opencode.json"));
  // 当前目录（项目级）
  candidates.push(path.join(process.cwd(), "opencode.json"));

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      let raw = fs.readFileSync(p, "utf8");
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      const cfg = JSON.parse(raw);
      result.exists = true;
      result.fields = Object.keys(cfg).filter((k) => k !== "$schema");
      // CC Switch 特征：有 disabled_providers / enabled_providers / 大量 provider 字段
      if (cfg.disabled_providers || cfg.enabled_providers) result.managedByCCSwitch = true;
      // 模型配置
      if (cfg.model || cfg.provider || Object.keys(cfg.agent || {}).length > 0) result.hasModel = true;
      // MCP
      if (cfg.mcp && Object.keys(cfg.mcp).length > 0) result.hasMCP = true;
      // Agent
      if (cfg.agent && Object.keys(cfg.agent).length > 0) result.hasAgent = true;
      break; // 找到一个就停
    } catch {
      // 解析失败跳过
    }
  }
  return result;
}

// .opencode/package.json 缺失时的最小模板：从根 package.json 派生运行时依赖，加 @opencode-ai/plugin 兜底
// 注意：版本号需与 .opencode/package.json 保持同步（发版时检查）
export function buildOpencodePkgTemplate() {
  try {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return { dependencies: { "@opencode-ai/plugin": "1.18.25", ...(rootPkg.dependencies || {}) } };
  } catch {
    return { dependencies: { "@opencode-ai/plugin": "1.18.25", "@opentui/core": "^0.5.8", "@opentui/solid": "^0.5.8" } };
  }
}
const OPCODE_PKG_TEMPLATE = buildOpencodePkgTemplate();

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

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    dir: null, skipDeps: false, skipVerify: false, json: false, help: false,
    global: false, globalRemove: false, setup: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") out.dir = args[++i] || null;
    else if (a === "--skip-deps") out.skipDeps = true;
    else if (a === "--setup") out.setup = true;
    else if (a === "--skip-verify") out.skipVerify = true;
    else if (a === "--global") out.global = true;
    else if (a === "--global-remove") out.globalRemove = true;
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
  --global          全局安装：部署 agents/commands/skills/plugins 到 ~/.config/opencode，
                     合并全局 opencode.json（仅 default_agent: men，不碰 mcp/plugin —— CC Switch 统一管理），
                     并注册 TUI 插件（tui.json 相对路径）。重启 OpenCode 后任意目录生效
  --global-remove   卸载全局安装：删除部署的 agents/commands/skills/plugins，
                     还原 opencode.json（有备份还原 / 仅移除 default_agent），并从 tui.json 注销
  --skip-deps       跳过 .opencode/ 依赖安装（npm install）
  --skip-verify     跳过端到端验证（scripts/verify.mjs men）
  --setup           安装完成后立即进入模型配置引导（对话式，约 2 分钟）
  --json            输出 JSON 摘要
  --help, -h        显示本帮助

平台引导（推荐，自动拉取仓库）:
  Linux/macOS:  bash <(curl -fsSL https://raw.githubusercontent.com/cgartlab/men/main/install.sh)
  Windows:      irm https://raw.githubusercontent.com/cgartlab/men/main/install.ps1 | iex
`);
}

export function checkNode() {
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

// 截断长输出：保留头部 + 尾部，丢掉中间，避免丢关键错误信息
function clipErr(s, n = 200) {
  if (!s) return "";
  if (s.length <= n * 2) return s;
  return s.slice(0, n) + "\n...（截断）...\n" + s.slice(-n);
}

function runVerify(cwd) {
  return spawnSync(process.execPath, ["scripts/verify.mjs", "men", "--json"], {
    cwd, encoding: "utf-8", shell: false, timeout: 60_000,
  });
}

// 判断 dir 是否看起来像 men 仓库根
export function isMenRepoRoot(dir) {
  return (
    fs.existsSync(path.join(dir, "scripts", "install.mjs")) &&
    fs.existsSync(path.join(dir, ".opencode", "agent"))
  );
}

export function copyTree(src, dest, excludes) {
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
export function copyAllowlist(src, dest, entries, excludes) {
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

// 跨平台检测命令是否存在（Windows: where，POSIX: command -v）
function commandExists(cmd) {
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

// 检测 OpenCode 全局配置里是否有模型/provider 配置（CC Switch 或手写全局配置）
// best-effort：找不到目录/文件不算失败，仅用于安装后预警
function detectModelConfig() {
  const candidates = [];
  if (process.env.OPENCODE_CONFIG_DIR) candidates.push(path.resolve(process.env.OPENCODE_CONFIG_DIR));
  candidates.push(path.join(os.homedir(), ".config", "opencode"));
  for (const dir of candidates) {
    const p = path.join(dir, "opencode.json");
    if (!fs.existsSync(p)) continue;
    try {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (cfg.provider || cfg.agent || cfg.model) return { configured: true, file: p };
    } catch {
      /* 解析失败视为未配置 */
    }
  }
  return { configured: false, file: null };
}

// scaffold 前冲突保护：对将覆盖的已存在文件做 .men.bak 备份，返回冲突列表
// 覆盖顶层配置文件（opencode.json / AGENTS.md）与 .opencode/ 配置类文件（package.json / tui.json）
// 绝不静默覆盖用户已有配置
const CONFLICT_BACKUP_SUFFIX = ".men.bak";
function backupConflicts(targetDir, relativePaths) {
  const conflicts = [];
  for (const rel of relativePaths) {
    const p = path.join(targetDir, rel);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    const bak = `${p}${CONFLICT_BACKUP_SUFFIX}`;
    try {
      fs.copyFileSync(p, bak);
      conflicts.push(`${rel}（原文件已备份为 ${rel}${CONFLICT_BACKUP_SUFFIX}）`);
    } catch (e) {
      conflicts.push(`${rel}（备份失败：${e.message}）`);
    }
  }
  return conflicts;
}

// scaffold 冲突保护覆盖的文件清单：顶层配置 + .opencode/ 配置类文件
function scaffoldConflictPaths(entries) {
  return [
    ...entries.filter((n) => !n.endsWith("/")),
    ".opencode/package.json",
    ".opencode/tui.json",
  ];
}

// 从 verify.mjs 的 JSON 报告提取 FAIL 项，生成人类可读摘要
function formatVerifyFailures(report) {
  if (!report || !Array.isArray(report.checks)) return null;
  const fails = report.checks.filter((c) => c && c.status === "FAIL");
  if (fails.length === 0) return null;
  return fails
    .map((c) => `  ✗ ${c.id}：${c.evidence || c.detail || c.message || "无详情"}`)
    .join("\n");
}

// ─────────────────────────── 全局模式 ───────────────────────────

// OpenCode 全局配置目录：OPENCODE_CONFIG_DIR 优先，否则平台默认（~/.config/opencode）
function globalConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return path.resolve(process.env.OPENCODE_CONFIG_DIR);
  return path.join(os.homedir(), ".config", "opencode");
}

// 全局安装时部署的运行时资产白名单：<men 相对路径> -> <全局子目录>
// agents/commands 是单个 md 文件；skills 是「技能名目录/SKILL.md」目录；plugins 是侧边栏插件目录。
// 侧边栏插件部署到本地后 tui.json 用相对路径注册——不依赖 opencode 的 npm 缓存（men@latest），
// 避免缓存锁死在旧版导致侧边栏版本号不更新；CC Switch 覆盖 opencode.json 也不影响已部署文件。
const GLOBAL_ASSETS = [
  { name: "agents",   src: path.join(ROOT, ".opencode", "agent"),   dest: "agent" },
  { name: "commands", src: path.join(ROOT, ".opencode", "command"), dest: "command" },
  { name: "skills",   src: path.join(ROOT, ".opencode", "skills"),  dest: "skills" },
  { name: "plugins",  src: path.join(ROOT, ".opencode", "plugins", "men-sidebar"), dest: "plugins/men-sidebar" },
];

// 旧版注册名（npm 包名 @cgartlab/men）：升级后写入 tui.json 的已是相对路径。
// 卸载/清理时两种 spec 都要移除，避免残留旧注册。
const MEN_PLUGIN_SPEC = "@cgartlab/men";
const MEN_TUI_SPEC = "./plugins/men-sidebar/tui.js";
const MEN_DEFAULT_AGENT = "men";
const GLOBAL_BACKUP_NAME = "opencode.json.men-backup";

// 安全读 JSON：解析失败返回 null（自动处理 UTF-8 BOM）
function readJsonSafe(p) {
  try {
    let raw = fs.readFileSync(p, "utf8");
    // PowerShell Set-Content 默认写 UTF-8 with BOM（\uFEFF），JSON.parse 无法解析
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 部署单类资产：把 src 下的每个条目复制到 destDir/<同名条目>
// 返回 { copied, entries }（copied 为成功复制的条目数，entries 为复制到的绝对路径）
function deployAssetGroup(src, destDir) {
  const out = { copied: 0, entries: [] };
  if (!fs.existsSync(src)) return out;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const s = path.join(src, entry.name);
    const d = path.join(destDir, entry.name);
    try {
      if (entry.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        copyTree(s, d, COPY_EXCLUDES);
      } else if (entry.isFile()) {
        fs.copyFileSync(s, d);
      }
      out.copied += 1;
      out.entries.push(d);
    } catch (e) {
      eprintf(`警告: 复制 ${s} 失败: ${e.message}`);
    }
  }
  return out;
}

// 备份全局 opencode.json（仅首次修改前备份一次，不覆盖既有备份）
function backupGlobalOpencodeJson(dir) {
  const p = path.join(dir, "opencode.json");
  const bak = path.join(dir, GLOBAL_BACKUP_NAME);
  if (!fs.existsSync(p)) return { existed: false, backedUp: false };
  if (fs.existsSync(bak)) return { existed: true, backedUp: false };
  fs.copyFileSync(p, bak);
  return { existed: true, backedUp: true };
}

// 合并全局 opencode.json：仅设置 default_agent=men（幂等）。
// 不改动 mcp / plugin 等其余字段——MCP 与 plugin 由 CC Switch 统一管理，
// 全局 TUI 插件已通过 tui.json 相对路径注册，无需在 opencode.json 写入 plugin。
function mergeGlobalOpencodeJson(dir) {
  const p = path.join(dir, "opencode.json");
  const cfg = readJsonSafe(p) || {};
  let changed = false;

  if (cfg.default_agent !== MEN_DEFAULT_AGENT) {
    cfg.default_agent = MEN_DEFAULT_AGENT;
    changed = true;
  }

  if (changed) fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
  return { path: p, changed };
}

// 注册全局 TUI 插件（写 tui.json）；从 v0.3.4 起迁移：写入相对路径时移除旧 npm 包名注册，避免重复加载侧边栏
function writeTuiPlugin(dir, spec) {
  const tuiPath = path.join(dir, "tui.json");
  const tui = readJsonSafe(tuiPath) || {};
  const plugins = Array.isArray(tui.plugin) ? tui.plugin.slice() : [];
  const added = !plugins.includes(spec);
  if (added) plugins.push(spec);
  // 旧注册名（npm 包名 @cgartlab/men）与新注册（相对路径）语义等价：移除旧的，只保留新的
  const migrated = plugins.filter((x) => !(x !== spec && (x === MEN_PLUGIN_SPEC || x === MEN_TUI_SPEC)));
  tui.plugin = migrated;
  fs.writeFileSync(tuiPath, JSON.stringify(tui, null, 2) + "\n");
  return { path: tuiPath, added, migrated: migrated.length !== plugins.length };
}

// 部署版本标记：让部署的 men-sidebar 能读到真实发布版本（不依赖 npm 缓存包）
function writeSidebarVersion(dir) {
  try {
    const versionFile = path.join(dir, "plugins", "men-sidebar", "VERSION");
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    if (!rootPkg.version) return false;
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
    fs.writeFileSync(versionFile, String(rootPkg.version) + "\n");
    return true;
  } catch {
    return false;
  }
}

// --global：完整全局安装。
// 1. 部署 agents/commands/skills/plugins 到 ~/.config/opencode/{agent,command,skills,plugins}
// 2. 备份并合并全局 opencode.json（仅 default_agent=men，不动 mcp / plugin —— CC Switch 统一管理）
// 3. 注册 TUI 插件（tui.json 相对路径 ./plugins/men-sidebar/tui.js，不依赖 opencode npm 缓存）
// 幂等：重复执行不产生重复条目。
function installGlobal(cfg) {
  const dir = globalConfigDir();
  fs.mkdirSync(dir, { recursive: true });

  const hasOpencode = commandExists("opencode");
  if (!hasOpencode) {
    eprintf("警告: 未检测到 opencode 命令，全局注册暂不生效；请先安装 OpenCode CLI（https://opencode.ai）\n");
  }

  const assets = {};
  for (const a of GLOBAL_ASSETS) {
    const r = deployAssetGroup(a.src, path.join(dir, a.dest));
    assets[a.name] = r.copied;
  }

  // 部署版本标记：让部署的 men-sidebar 能读到真实发布版本（不依赖 npm 缓存包）
  writeSidebarVersion(dir);

  const backup = backupGlobalOpencodeJson(dir);
  const merged = mergeGlobalOpencodeJson(dir);
  const tui = writeTuiPlugin(dir, MEN_TUI_SPEC);

  const result = {
    ok: true,
    summary: "全局安装完成（agents/commands/skills/plugins 已部署，opencode.json 已合并 default_agent）",
    mode: "global",
    dir,
    assets: {
      agents: assets.agents,
      commands: assets.commands,
      skills: assets.skills,
      plugins: assets.plugins,
    },
    opencodeJson: {
      path: path.join(dir, "opencode.json"),
      changed: merged.changed,
      backup: backup.backedUp ? path.join(dir, GLOBAL_BACKUP_NAME) : null,
    },
    tuiJson: tui.path,
    plugin: MEN_TUI_SPEC,
    defaultAgent: MEN_DEFAULT_AGENT,
    opencodeDetected: hasOpencode,
    warning: hasOpencode ? null : "未检测到 opencode 命令，注册暂不生效",
    note: "重启 OpenCode 后任意目录生效：agents 可选（Tab/@）、侧边栏显示 MEN AGENTS、/ultrawork /verify /hyperplan 可用",
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`men（门）Agent 团队 — 全局安装摘要\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`  全局目录  ${dir}\n`);
    process.stdout.write(`  agents    ${assets.agents} 个 → ${path.join(dir, "agent")}\n`);
    process.stdout.write(`  commands  ${assets.commands} 个 → ${path.join(dir, "command")}\n`);
    process.stdout.write(`  skills    ${assets.skills} 个 → ${path.join(dir, "skills")}\n`);
    process.stdout.write(`  plugins   ${assets.plugins} 个 → ${path.join(dir, "plugins", "men-sidebar")}\n`);
    process.stdout.write(`  opencode.json  ${merged.changed ? "已合并（default_agent=men）" : "已就绪（无需变更）"}\n`);
    if (backup.backedUp) process.stdout.write(`  （原 opencode.json 已备份: ${path.join(dir, GLOBAL_BACKUP_NAME)}）\n`);
    process.stdout.write(`  tui.json  插件已${tui.added ? "新增注册" : "注册（幂等）"}（${MEN_TUI_SPEC}）\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`  ✓ 重启 OpenCode 后任意目录生效。卸载: node scripts/install.mjs --global-remove\n`);
    process.stdout.write(`  ℹ 已部署到本地（非 npm 缓存），侧边栏版本号直接读取部署目录，不再受 opencode 缓存影响\n`);
  }
  return result;
}

// 从全局目录删除 men 部署的资产（仅删除 men 源里存在的同名条目，避免误删其它插件的文件）
function removeGlobalAssets(dir) {
  const removed = { agents: 0, commands: 0, skills: 0, plugins: 0 };
  for (const a of GLOBAL_ASSETS) {
    if (!fs.existsSync(a.src)) continue;
    const destDir = path.join(dir, a.dest);
    for (const entry of fs.readdirSync(a.src, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const d = path.join(destDir, entry.name);
      if (!fs.existsSync(d)) continue;
      try {
        fs.rmSync(d, { recursive: true, force: true });
        removed[a.name] += 1;
      } catch (e) {
        eprintf(`警告: 删除 ${d} 失败: ${e.message}`);
      }
    }
  }
  // 清理整个 men-sidebar 插件目录（该目录全部由 men 部署；文件级计数已在上面循环完成）
  try {
    const sidebarDir = path.join(dir, "plugins", "men-sidebar");
    if (fs.existsSync(sidebarDir)) fs.rmSync(sidebarDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
  return removed;
}

// 还原全局 opencode.json：有备份则恢复；无备份则移除 default_agent（仅限 =men 的条目）。
// plugin 数组不在此处处理——CC Switch 统一管理，避免误删用户/CC Switch 配置。
function restoreGlobalOpencodeJson(dir) {
  const p = path.join(dir, "opencode.json");
  const bak = path.join(dir, GLOBAL_BACKUP_NAME);
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, p);
    fs.rmSync(bak, { force: true });
    return { restored: true, note: "已从备份还原" };
  }
  const cfg = readJsonSafe(p);
  if (!cfg) return { restored: false, note: "opencode.json 不存在或无法解析，跳过" };
  let changed = false;
  if (cfg.default_agent === MEN_DEFAULT_AGENT) {
    delete cfg.default_agent;
    changed = true;
  }
  if (changed) fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
  return { restored: changed, note: changed ? "已移除 default_agent=men" : "未发现 men 相关字段" };
}

// 从 tui.json 注销 men 插件（兼容新旧注册名：npm 包名 @cgartlab/men 与相对路径 ./plugins/men-sidebar/tui.js）；
// 插件为空时删除整个文件（避免残留空数组）
function unregisterTuiPlugin(dir) {
  const tuiPath = path.join(dir, "tui.json");
  const tui = readJsonSafe(tuiPath);
  if (!tui) return { path: tuiPath, removed: false };
  if (Array.isArray(tui.plugin)) {
    const next = tui.plugin.filter((x) => x !== MEN_TUI_SPEC && x !== MEN_PLUGIN_SPEC);
    if (next.length !== tui.plugin.length) {
      if (next.length === 0) {
        fs.rmSync(tuiPath, { force: true });
        return { path: tuiPath, removed: true, deleted: true };
      }
      tui.plugin = next;
      fs.writeFileSync(tuiPath, JSON.stringify(tui, null, 2) + "\n");
      return { path: tuiPath, removed: true, deleted: false };
    }
  }
  return { path: tuiPath, removed: false, deleted: false };
}

// --global-remove：卸载全局安装（删除部署资产 + 还原 opencode.json + 注销 TUI 插件）
function removeGlobal(cfg) {
  const dir = globalConfigDir();
  const removed = removeGlobalAssets(dir);
  const opencode = restoreGlobalOpencodeJson(dir);
  const tui = unregisterTuiPlugin(dir);

  const result = {
    ok: true,
    summary: "全局卸载完成",
    mode: "global-remove",
    dir,
    removed,
    opencodeJson: { path: path.join(dir, "opencode.json"), ...opencode },
    tuiJson: tui,
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`men（门）Agent 团队 — 全局卸载摘要\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`  删除 agents    ${removed.agents} 个\n`);
    process.stdout.write(`  删除 commands  ${removed.commands} 个\n`);
    process.stdout.write(`  删除 skills    ${removed.skills} 个\n`);
    process.stdout.write(`  删除 plugins   ${removed.plugins} 个\n`);
    process.stdout.write(`  opencode.json  ${opencode.note}\n`);
    process.stdout.write(`  tui.json       ${tui.removed ? (tui.deleted ? "已删除（无剩余插件）" : "已注销 men 插件") : "无需变更"}\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`  ✓ 全局安装已卸载。重启 OpenCode 生效\n`);
  }
  return result;
}

// ─────────────────────────── 主流程 ───────────────────────────

export function main(argv = process.argv) {
  const cfg = parseArgs(argv);
  if (cfg.help) {
    printHelp();
    return { ok: true, exitCode: 0, help: true };
  }

  // --global / --global-remove：不进入项目安装流程
  if (cfg.globalRemove) {
    removeGlobal(cfg);
    process.exit(0);
  }
  if (cfg.global) {
    const result = installGlobal(cfg);
    return { ok: true, exitCode: 0, result };
  }

  // fail 通过抛错中断流程，由外层 catch 捕获并返回错误结果
  class InstallError extends Error {}
  const fail = (msg) => {
    eprintf(`安装失败：${msg}`);
    throw new InstallError(msg);
  };

  try {

  // ── 0. 检测 OpenCode 是否已安装 ──
  eprintf(">> [0/7] 检测 OpenCode CLI ...");
  const oc = checkOpenCode();
  if (!oc.installed) {
    // OpenCode 不是安装的必要条件（文件可装），但使用时需要。非阻断，仅警告+引导。
    eprintf("⚠ 未检测到 OpenCode CLI（Men 是 OpenCode 插件，使用时需要 OpenCode）\n");
    eprintf("  安装 OpenCode: npm install -g @opencode-ai/cli\n");
    eprintf("  参考: https://opencode.ai/docs/installation\n");
    if (process.stdin.isTTY && !cfg.json) {
      process.stdout.write("\n  是否现在自动安装 OpenCode？[Y/n] ");
      const r = spawnSync(
        process.execPath,
        ["-e", `const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});rl.question('',a=>{rl.close();process.exit(/^n/i.test(String(a).trim())?1:0)});`],
        { encoding: "utf-8", shell: false, stdio: "inherit", timeout: 30_000 },
      );
      if (r.status === 0) {
        eprintf(">> 正在安装 @opencode-ai/cli ...\n");
        const installR = spawnSync("npm", ["install", "-g", "@opencode-ai/cli"], {
          encoding: "utf-8", shell: false, stdio: "inherit", timeout: 120_000,
        });
        if (installR.status === 0) {
          const oc2 = checkOpenCode();
          if (oc2.installed) {
            eprintf(`✓ OpenCode ${oc2.version} 已安装\n`);
            Object.assign(oc, oc2);
          }
        } else {
          eprintf("⚠ OpenCode 安装失败，可稍后手动执行: npm install -g @opencode-ai/cli\n");
        }
      }
    }
  } else {
    eprintf(`✓ OpenCode ${oc.version}（${oc.path || "已安装"}）\n`);
  }

  // ── 1. 检测 OpenCode 版本 ──
  eprintf(">> [1/7] 检测 OpenCode 版本 ...");
  const ocVer = checkOpenCodeVersion(oc.version);
  if (!oc.installed) {
    eprintf("⏭ 跳过（OpenCode 未安装）\n");
  } else if (!ocVer.ok) {
    eprintf(`⚠ OpenCode 版本偏低：${ocVer.current}（Men 推荐 >= ${ocVer.required}）\n`);
    eprintf("  部分功能可能受限（TUI 插件系统、agent 权限控制等）\n");
    if (process.stdin.isTTY && !cfg.json) {
      process.stdout.write("  是否现在升级 OpenCode？[Y/n] ");
      const r = spawnSync(
        process.execPath,
        ["-e", `const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});rl.question('',a=>{rl.close();process.exit(/^n/i.test(String(a).trim())?1:0)});`],
        { encoding: "utf-8", shell: false, stdio: "inherit", timeout: 30_000 },
      );
      if (r.status === 0) {
        eprintf(">> 正在升级 OpenCode ...\n");
        spawnSync("opencode", ["upgrade"], { encoding: "utf-8", shell: false, stdio: "inherit", timeout: 120_000 });
      }
    }
  } else {
    eprintf(`✓ OpenCode ${ocVer.current} >= ${ocVer.required}\n`);
  }

  // ── 2. 检测 CC Switch / opencode.json 配置 ──
  eprintf(">> [2/7] 检测 OpenCode 配置环境 ...");
  const cc = checkCCSwitch();
  if (cc.exists) {
    if (cc.managedByCCSwitch) {
      eprintf(`✓ 检测到 CC Switch 管理的 opencode.json（${cc.fields.length} 个字段）\n`);
      eprintf("  CC Switch 统一管理 MCP / provider / plugin，Men 的 --global 不会修改这些字段\n");
    } else {
      eprintf(`✓ 检测到 opencode.json（${cc.fields.length} 个字段，非 CC Switch 管理）\n`);
      if (cc.hasModel) eprintf("  模型配置已存在\n");
      if (cc.hasMCP) eprintf("  MCP 配置已存在\n");
    }
  } else {
    eprintf("⚠ 未检测到 opencode.json（全局配置不存在）\n");
    eprintf("  首次启动 OpenCode 时会自动创建；或运行 opencode providers 配置模型\n");
  }

  // ── 3. Node.js 版本检查 ──
  eprintf(">> [3/7] 检查 Node.js 版本 ...");
  const node = checkNode();
  if (!node.ok) fail(`Node.js 版本过低：${node.version}（要求 >= v${MIN_NODE_MAJOR}）`);

  // ── 3.5 前置命令检测（best-effort，仅提示不阻断）──
  const envCmds = {
    npm: commandExists("npm"),
    git: commandExists("git"),
  };
  if (!envCmds.npm) eprintf("警告: 未检测到 npm，依赖安装将失败（可用 --skip-deps 跳过依赖步骤）\n");
  if (!envCmds.git) eprintf("提示: 未检测到 git（仅一键脚本 git clone 需要；scaffold 安装不需要）\n");

  // ── 4. 目标目录 ──
  let copyMode = "in-place";
  let conflicts = [];
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
      fail(`目标目录已存在但不是 men 仓库根：${targetDir}（若想在当前目录 scaffold 安装，请不带 --dir 直接运行 npx @cgartlab/men）`);
    }
  } else if (!inRepo) {
    // SCAFFOLD 模式：从已安装的 npm 包运行（npx @cgartlab/men），cwd ≠ 包目录
    // 目标 = 当前目录；已是 men 仓库根则幂等跳过复制，否则复制运行时白名单
    if (isMenRepoRoot(targetDir)) {
      copyMode = "in-place";
    } else {
      // 冲突保护：已有 opencode.json / AGENTS.md / .opencode 配置时先备份，绝不静默覆盖
      conflicts = backupConflicts(targetDir, scaffoldConflictPaths(SCAFFOLD_ENTRIES));
      eprintf(">> [4/7] scaffold 运行时资产到当前目录 ...");
      try {
        copyAllowlist(ROOT, targetDir, SCAFFOLD_ENTRIES, COPY_EXCLUDES);
        copyMode = "scaffolded";
      } catch (e) {
        fail(`scaffold 到 ${targetDir} 失败：${e.message}`);
      }
      // scaffold 也写入 VERSION 标记：本地 men-sidebar 插件可读到真实发布版本（不依赖 npm 缓存）
      try {
        const versionFile = path.join(targetDir, ".opencode", "plugins", "men-sidebar", "VERSION");
        const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
        if (rootPkg.version) {
          fs.mkdirSync(path.dirname(versionFile), { recursive: true });
          fs.writeFileSync(versionFile, String(rootPkg.version) + "\n");
        }
      } catch {
        /* best-effort：版本标记失败不影响安装 */
      }
    }
  } else if (!isMenRepoRoot(targetDir)) {
    fail(`目标目录已存在但不是 men 仓库根：${targetDir}（若想在当前目录安装，请先进入空目录后运行 npx @cgartlab/men）`);
  }

  // ── 3. 依赖安装 ──
  const opcodePkgCreated = ensureOpencodePkg(targetDir);
  const deps = { skipped: cfg.skipDeps, ok: null, command: null, exitCode: null, note: null, warning: null };
  if (opcodePkgCreated) deps.note = ".opencode/package.json 缺失，已写入最小模板";
  if (!cfg.skipDeps) {
    eprintf(">> [5/7] 安装 .opencode/ 依赖 ...");
    deps.command = "npm install --prefix .opencode";
    const r = runNpm(targetDir, ["install", "--prefix", ".opencode"]);
    deps.exitCode = r.status ?? -1;
    deps.ok = deps.exitCode === 0;
    if (!deps.ok) {
      // 非致命但显著：@opentui 等缺失会导致侧边栏不渲染，摘要会给出修复指引
      deps.warning = `依赖安装失败（exit ${deps.exitCode}）：${clipErr(r.stderr || "")}`;
      eprintf(`警告: ${deps.warning}\n`);
    }
  }

  // ── 4. 环境配置 ──
  eprintf(">> [6/7] 配置 .env ...");
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
    eprintf(">> [7/7] 端到端验证 ...");
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
      // 人类可读：优先列出 FAIL 项及原因，避免让用户面对被截断的 JSON
      const fails = formatVerifyFailures(verify.report);
      if (fails) {
        fail(`端到端验证失败（exit ${verify.exitCode}）：\n${fails}\n请按上述项修复后重试；或用 --skip-verify 跳过（不推荐）`);
      }
      fail(`端到端验证失败（exit ${verify.exitCode}）：${clipErr(r.stdout || r.stderr || "", 300)}`);
    }
  }

  // ── 7.5 运行环境检测（与验证合并，不再单独编号）──
  // OpenCode 命令已由 [0/7] 检测；模型配置已由 [2/7] 检测。此处补充详细信息供摘要使用。
  const runtime = {
    opencode: oc.installed,
    modelConfig: detectModelConfig(),
  };

  // ── 5.6 模型配置引导（对齐 OMO 安装交互：检测未配置 → 询问用户是否立即引导）──
  // 仅交互模式（非 --json）且未检测到模型配置时触发；--setup 强制进入引导。
  // main 是同步函数，用 spawnSync 内联读取 stdin 保持同步，避免把整个流程改 async。
    let setup = { skipped: false, reason: null, started: false };
  if (cfg.json) {
    setup.skipped = true;
    setup.reason = "--json 模式跳过交互";
  } else if (!runtime.modelConfig.configured || cfg.setup) {
    // 仅在真正可能进入引导时才打印提示；非 TTY 时跳过，不在摘要后留多余行
    let proceed = cfg.setup;
    if (!proceed && process.stdin.isTTY) {
      eprintf("⚠ 未检测到模型配置（首次启动会提示模型不存在）。\n");
      process.stdout.write("  是否现在配置模型（推荐，约 2 分钟）？[Y/n] ");
      const r = spawnSync(
        process.execPath,
        [
          "-e",
          `const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});rl.question('',a=>{rl.close();process.exit(/^n/i.test(String(a).trim())?1:0)});`,
        ],
        { encoding: "utf-8", shell: false, stdio: "inherit", timeout: 30_000 },
      );
      proceed = r.status === 0;
      if (!proceed) {
        setup.skipped = true;
        setup.reason = "用户选择跳过（可稍后运行 node scripts/setup.mjs 配置）";
      }
    } else if (!proceed) {
      // 非 TTY：不打印警告（摘要里已有环境行提示），仅记录跳过原因
      setup.skipped = true;
      setup.reason = "未检测到模型配置（非 TTY 环境跳过，可稍后运行 node scripts/setup.mjs）";
    } else {
      // --setup 强制：打印提示
      eprintf("⚠ 未检测到模型配置（首次启动会提示模型不存在）。\n");
    }
    if (proceed) {
      setup.started = true;
      eprintf(">> 调用 setup.mjs 引导模型配置 ...\n");
      const setupPkg = path.join(targetDir, "scripts", "setup.mjs");
      const setupSrc = path.join(ROOT, "scripts", "setup.mjs");
      const setupFile = fs.existsSync(setupPkg) ? setupPkg : setupSrc;
      if (fs.existsSync(setupFile)) {
        const r = spawnSync(process.execPath, [setupFile], {
          cwd: targetDir, encoding: "utf-8", shell: false, stdio: "inherit", timeout: 600_000,
        });
        setup.exitCode = r.status ?? -1;
      } else {
        setup.reason = "setup.mjs 不存在，跳过引导（可稍后运行 node scripts/setup.mjs）";
      }
    }
  } else {
    setup.skipped = true;
    setup.reason = "已检测到模型配置";
  }

  // ── 6. 摘要 ──
  const result = {
    ok: true,
    name: "men（门）Agent 团队",
    summary: deps.ok === false && !deps.skipped ? "安装完成（依赖未安装）" : "安装成功",
    dir: targetDir,
    copyMode,
    conflicts,
    envCmds,
    runtime,
    setup,
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
  return { ok: true, exitCode: 0, result };
  } catch (e) {
    // fail() 抛出的 InstallError → 返回失败结果；其余异常归为内部错误
    const msg = e instanceof InstallError ? e.message : `内部错误：${e.message}`;
    return { ok: false, exitCode: 1, error: msg };
  }
}

// 入口守卫：仅直接执行时运行 CLI，被 import 时不触发
// 注意：macOS 上 /tmp 是 /private/tmp 的软链接，需 realpath 归一化后比较
const _argv1 = process.argv[1];
const _isDirect = _argv1 && import.meta.url === pathToFileURL(fs.realpathSync(_argv1)).href;
if (_isDirect) {
  const res = main(process.argv);
  if (res && typeof res.exitCode === "number") process.exit(res.exitCode);
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
    ? `已从 ${r.env.source} 创建 ${ENV_TARGET}（占位符仅知识检索/内网源需要，基础对话可不填）`
    : r.env.existing
      ? `${ENV_TARGET} 已存在，跳过`
      : "未创建";
  process.stdout.write(`  配置   ${envText}\n`);
  if (r.env.warning) process.stdout.write(`         警告: ${r.env.warning}\n`);
  const verifyText = r.verify.summary
    ? `scripts/verify.mjs men（exit ${r.verify.exitCode}，PASS=${r.verify.summary.passed} FAIL=${r.verify.summary.failed} WARN=${r.verify.summary.warn}）`
    : `scripts/verify.mjs men（exit ${r.verify.exitCode}）`;
  process.stdout.write(`  验证   ${mark(r.verify.ok, r.verify.skipped, verifyText, "跳过（--skip-verify）", `exit ${r.verify.exitCode}`)}\n`);
  if (r.runtime) {
    if (!r.runtime.opencode) {
      process.stdout.write(`  环境   ⚠ 未检测到 opencode 命令：安装已完成，但需要先安装 OpenCode CLI 才能使用\n`);
    } else if (!r.runtime.modelConfig.configured) {
      process.stdout.write(`  环境   ⚠ 未检测到模型配置：请用 CC Switch（或 ~/.config/opencode/opencode.json）配置模型，否则首次启动会提示模型不存在\n`);
    } else {
      process.stdout.write(`  环境   opencode ✓ · 模型配置 ✓\n`);
    }
  }
  if (r.setup) {
    // started：引导已触发 → 显示结果或原因；skipped 但 reason 有提醒价值（非 json / 非 TTY / 用户选择跳过）才显示
    if (r.setup.started) {
      if (r.setup.exitCode === 0) {
        process.stdout.write(`  模型   已引导配置完成（setup.mjs exit 0）\n`);
      } else if (r.setup.exitCode != null) {
        process.stdout.write(`  模型   ⚠ setup.mjs 退出码 ${r.setup.exitCode}：配置未完成，可稍后重跑 node scripts/setup.mjs\n`);
      } else if (r.setup.reason && r.setup.reason !== "用户选择跳过（可稍后运行 node scripts/setup.mjs 配置）") {
        process.stdout.write(`  模型   ⚠ ${r.setup.reason}\n`);
      }
    } else if (r.setup.skipped && r.setup.reason && r.setup.reason !== "--json 模式跳过交互" && r.setup.reason !== "已检测到模型配置") {
      process.stdout.write(`  模型   ${r.setup.reason}\n`);
    }
  }
  if (Array.isArray(r.conflicts) && r.conflicts.length > 0) {
    process.stdout.write(`  冲突   ${r.conflicts.join("；")}\n`);
  }
  process.stdout.write(`${"=".repeat(54)}\n`);
  let nextStep;
  if (r.deps && r.deps.ok === false && !r.deps.skipped) {
    nextStep =
      "  ⚠ 安装完成但 .opencode/ 依赖未安装：侧边栏/插件可能不可用。\n" +
      "    请修复后重试：npm install --prefix .opencode，然后重启 opencode\n";
  } else if (r.runtime && !r.runtime.modelConfig.configured && (!r.setup || !r.setup.started || r.setup.exitCode != null && r.setup.exitCode !== 0)) {
    nextStep =
      "  ✓ 安装完成。还差一步：配置模型（对话式引导，约 2 分钟）：\n" +
      "    node scripts/setup.mjs     （或 npx @cgartlab/men --setup）\n";
  } else if (r.copyMode === "scaffolded") {
    nextStep = "  安装成功 ✓  下一步：在当前目录运行 opencode（注意：men 仅对当前目录生效）\n";
  } else {
    nextStep = "  安装成功 ✓  下一步：在项目目录运行 opencode\n";
  }
  process.stdout.write(nextStep);
}
