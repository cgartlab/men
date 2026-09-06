#!/usr/bin/env node
/**
 * pi-install.mjs — men（门）Agent 团队 Pi Harness 引导安装器
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 *
 * 职责（对应 docs/pi-harness-install.md §4.3）：
 *   1. 环境检查：Node >= 18、pi >= 0.83、pi-subagents 扩展状态
 *   2. 模式识别：A（men 仓库即工作目录，就地校验零复制）/
 *                B（插件安装，落位 agents/APPEND_SYSTEM/scripts 到目标项目）
 *   3. 资产校验：5 agents frontmatter 契约 + 15 skills 集合 + 4 prompts + settings
 *   4. 扩展引导：检测 pi-subagents 未安装时，交互式询问是否安装
 *   5. 落位（模式 B）：复制 + 写 men-install.json 清单（幂等，供卸载）
 *
 * 交互体验：TTY 下步骤化彩色输出 + 交互确认；非 TTY / --json 降级为纯文本 / JSON。
 *
 * 用法：
 *   node scripts/pi-install.mjs [选项]
 *
 * 选项：
 *   --dir <path>      目标项目目录（默认: 当前目录；模式 B 使用）
 *   --global          落位到全局 ~/.pi/agent/（agents/ + APPEND_SYSTEM.md + scripts）
 *   --yes, -y         免交互确认（自动化/CI 场景）
 *   --skip-pi-check   跳过 pi 二进制检查（离线环境）
 *   --json            输出 JSON 摘要（机器可读）
 *   --help, -h        显示帮助
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const MIN_NODE_MAJOR = 18;
const MIN_PI_VERSION = "0.83.0";
const PI_SUBAGENTS_PKG = "npm:@johnnywu/pi-subagents";
const AGENT_NAMES = ["si", "ji", "chi", "yi", "xun"];
const REQUIRED_SKILLS = [
  "chi-invest", "chi-judge",
  "ji-content-write", "ji-frontend-design", "ji-github", "ji-l1-verify",
  "men-status", "men-update",
  "si-knowledge", "si-plan-compose",
  "xun-factcheck", "xun-rss-scan", "xun-search",
  "yi-design", "yi-imagegen",
];
const REQUIRED_PROMPTS = ["ultrawork", "verify", "hyperplan", "gh-issue"];
const PI_FRONTMATTER_KEYS = ["name", "description", "tools", "systemPrompt", "thinking", "maxDepth"];
const INSTALL_MANIFEST = "men-install.json";

// 落位时排除的仓库根路径（agents/APPEND_SYSTEM/scripts 之外，不整仓复制）
const SCRIPTS_EXCLUDE = new Set(["pi-install.mjs", "pi-remove.mjs"]);

// ANSI 颜色（仅 TTY 启用）
const C = { green: "", yellow: "", red: "", dim: "", bold: "", reset: "" };

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { dir: null, global: false, yes: false, skipPiCheck: false, json: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") out.dir = args[++i] || null;
    else if (a === "--global") out.global = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--skip-pi-check") out.skipPiCheck = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else { eprintf(`未知参数: ${a}（用 --help 查看用法）`); process.exit(2); }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — Pi Harness 引导安装器

用法:
  node scripts/pi-install.mjs [选项]

选项:
  --dir <path>      目标项目目录（默认: 当前目录）
  --global          落位到全局 ~/.pi/agent/（agents + APPEND_SYSTEM.md + scripts）
  --yes, -y         免交互确认（自动化/CI 场景）
  --skip-pi-check   跳过 pi 二进制检查（离线环境）
  --json            输出 JSON 摘要（机器可读）
  --help, -h        显示本帮助

模式:
  A（项目内）  cwd 已是 men 仓库根 → 就地校验，不复制文件
  B（插件）    pi install 后运行 → 落位 agents/APPEND_SYSTEM/scripts 到目标项目
`);
}

function checkNode() {
  const raw = process.versions.node;
  const major = Number(raw.split(".")[0]);
  return { version: `v${raw}`, ok: Number.isFinite(major) && major >= MIN_NODE_MAJOR };
}

function checkPi() {
  try {
    const r = spawnSync("pi", ["--version"], { encoding: "utf-8", shell: false, timeout: 10_000 });
    if (r.status !== 0) return { ok: false, reason: `pi --version exit ${r.status}` };
    return { ok: true, version: (r.stdout || "").trim() };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// 检测 pi-subagents 扩展：settings.json packages 或 npm 落盘目录
function checkSubagents() {
  try {
    const settingsFile = path.join(os.homedir(), ".pi", "agent", "settings.json");
    if (fs.existsSync(settingsFile)) {
      const s = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
      const pkgs = Array.isArray(s.packages) ? s.packages : [];
      if (pkgs.some((p) => typeof p === "string" && p.includes("@johnnywu/pi-subagents"))) {
        return { installed: true, how: "settings.packages" };
      }
    }
  } catch (e) {
    eprintf(`  ${C.yellow}⚠ 读取 pi settings 失败：${e.message}${C.reset}`);
  }
  const dir = path.join(os.homedir(), ".pi", "agent", "npm", "node_modules", "@johnnywu", "pi-subagents");
  if (fs.existsSync(dir)) return { installed: true, how: "npm node_modules" };
  return { installed: false };
}

// 共享 readline 接口（避免多实例复用 stdin 的状态问题）
let _rl = null;
function getReadline() {
  if (!_rl) _rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return _rl;
}

// 交互提问（TTY 且未 --yes 时；否则用默认值）。EOF/关闭时回退默认值。
function ask(question, defaultValue = "n") {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return Promise.resolve(defaultValue === "y");
  const rl = getReadline();
  const hint = defaultValue === "y" ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`${C.bold}${question}${C.reset} (${hint}) `, (ans) => {
      const v = (ans || "").trim().toLowerCase();
      if (!v) resolve(defaultValue === "y");
      else resolve(v === "y" || v === "yes");
    });
  });
}

// 读取 .md frontmatter（--- 包裹的 YAML 键值，简单解析）
function readFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  const data = {};
  for (const line of text.slice(4, end).split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const sep = t.indexOf(":");
    if (sep === -1) continue;
    const key = t.slice(0, sep).trim();
    const value = t.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) data[key] = value;
  }
  return data;
}

// 解析 CSV 列表字段（tools/skills）
function splitCsv(v) {
  return (v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// 递归复制目录（排除集合，任意层级命中即跳过）
function copyTree(src, dest, excludes) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d, excludes);
    else copyFile(s, d);
  }
}

function isMenRepoRoot(dir) {
  return (
    fs.existsSync(path.join(dir, "scripts", "install.mjs")) &&
    fs.existsSync(path.join(dir, ".opencode", "agent", "men.md")) &&
    fs.existsSync(path.join(dir, ".pi", "settings.json"))
  );
}

// ─────────────────────────── 校验逻辑 ───────────────────────────

// 校验 5 个 agent 定义：文件存在 + frontmatter 契约
function checkAgents(agentsDir) {
  const checks = [];
  for (const name of AGENT_NAMES) {
    const file = path.join(agentsDir, `${name}.md`);
    if (!fs.existsSync(file)) {
      checks.push({ id: `agent.${name}`, status: "FAIL", evidence: "文件缺失" });
      continue;
    }
    const fm = readFrontmatter(file);
    const missing = PI_FRONTMATTER_KEYS.filter((k) => !fm[k]);
    const tools = splitCsv(fm.tools);
    const badThinking = fm.thinking && !["off", "minimal", "low", "medium", "high", "xhigh"].includes(fm.thinking);
    const badMode = fm.systemPrompt && !["append", "replace", "replace-all"].includes(fm.systemPrompt);
    const badDepth = fm.maxDepth !== undefined && !/^\d+$/.test(String(fm.maxDepth));
    checks.push({
      id: `agent.${name}`,
      status: missing.length === 0 && !badThinking && !badMode && !badDepth && tools.length > 0 ? "PASS" : "FAIL",
      evidence: missing.length
        ? `缺字段: ${missing.join(", ")}`
        : badThinking ? `thinking 非法: ${fm.thinking}`
        : badMode ? `systemPrompt 非法: ${fm.systemPrompt}`
        : badDepth ? `maxDepth 非法: ${fm.maxDepth}`
        : `tools=${tools.join("+")}`,
    });
  }
  return checks;
}

// 校验 skills：从 skills 目录读取 SKILL.md 的 name 集合
function checkSkills(skillsDir) {
  const found = new Set();
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const fm = readFrontmatter(skillFile);
      if (fm.name) found.add(fm.name);
    }
  }
  return REQUIRED_SKILLS.map((name) => ({
    id: `skill.${name}`,
    status: found.has(name) ? "PASS" : "FAIL",
    evidence: found.has(name) ? "OK" : "缺失",
  }));
}

// 校验 prompts：4 个模板存在 + frontmatter 合法
function checkPrompts(promptsDir) {
  return REQUIRED_PROMPTS.map((name) => {
    const file = path.join(promptsDir, `${name}.md`);
    if (!fs.existsSync(file)) {
      return { id: `prompt.${name}`, status: "FAIL", evidence: "文件缺失" };
    }
    const fm = readFrontmatter(file);
    return {
      id: `prompt.${name}`,
      status: fm.description ? "PASS" : "WARN",
      evidence: fm.description ? `argument-hint: ${fm["argument-hint"] || "无"}` : "缺 description",
    };
  });
}

// 校验 .pi/settings.json：packages 自引用仓库根（相对 settings 文件所在目录）
function checkSettings(settingsFile) {
  if (!fs.existsSync(settingsFile)) {
    return { id: "pi.settings", status: "FAIL", evidence: "文件缺失" };
  }
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
    const hasSelf = Array.isArray(s.packages) && s.packages.includes("../");
    return {
      id: "pi.settings",
      status: hasSelf ? "PASS" : "WARN",
      evidence: hasSelf ? "packages: [\"../\"]" : "packages 未声明自引用 ../",
    };
  } catch (e) {
    return { id: "pi.settings", status: "FAIL", evidence: `JSON 解析失败: ${e.message}` };
  }
}

// ─────────────────────────── 落位逻辑（模式 B） ───────────────────────────

function placeInto(menRoot, targetPiDir, globalAgentsDir) {
  const placed = [];
  // 1. agents → <target>/.pi/agents/（或全局 ~/.pi/agent/agents/）
  const agentsDest = globalAgentsDir || path.join(targetPiDir, "agents");
  for (const name of AGENT_NAMES) {
    const src = path.join(menRoot, ".pi", "agents", `${name}.md`);
    if (!fs.existsSync(src)) continue;
    copyFile(src, path.join(agentsDest, `${name}.md`));
    placed.push(`agents/${name}.md`);
  }
  // 2. APPEND_SYSTEM.md → <target>/.pi/APPEND_SYSTEM.md（或全局 ~/.pi/agent/APPEND_SYSTEM.md）
  const appendSrc = path.join(menRoot, ".pi", "APPEND_SYSTEM.md");
  const appendDest = globalAgentsDir
    ? path.join(os.homedir(), ".pi", "agent", "APPEND_SYSTEM.md")
    : path.join(targetPiDir, "APPEND_SYSTEM.md");
  if (fs.existsSync(appendSrc)) {
    copyFile(appendSrc, appendDest);
    placed.push("APPEND_SYSTEM.md");
  }
  // 3. scripts → 目标项目 scripts/men-*（避免覆盖项目已有 scripts）
  const menScriptsSrc = path.join(menRoot, "scripts");
  if (fs.existsSync(menScriptsSrc)) {
    const destScripts = globalAgentsDir
      ? path.join(os.homedir(), ".pi", "agent", "scripts", "men")
      : path.join(targetPiDir, "scripts", "men");
    copyTree(menScriptsSrc, destScripts, SCRIPTS_EXCLUDE);
    placed.push("scripts/men");
  }
  return placed;
}

// ─────────────────────────── 输出 helpers ───────────────────────────

// 步骤横幅：如 [2/6] 模式识别
function stepBanner(step, total, title, jsonMode) {
  if (jsonMode) return;
  process.stdout.write(`\n${C.bold}${C.green}[${step}/${total}]${C.reset} ${C.bold}${title}${C.reset}\n`);
}

// 单行检查项：✓/✗/⚠ + 描述 + 证据
function printCheck(id, status, evidence, jsonMode) {
  if (jsonMode) return;
  if (status === "PASS") {
    process.stdout.write(`  ${C.green}✓${C.reset} ${id}${evidence ? C.dim + "  " + evidence + C.reset : ""}\n`);
  } else if (status === "WARN") {
    process.stdout.write(`  ${C.yellow}⚠${C.reset} ${id}${evidence ? C.dim + "  " + evidence + C.reset : ""}\n`);
  } else {
    process.stdout.write(`  ${C.red}✗${C.reset} ${id}${evidence ? C.dim + "  " + evidence + C.reset : ""}\n`);
  }
}

// ─────────────────────────── 主流程 ───────────────────────────

async function run() {
  const cfg = parseArgs(process.argv);
  if (cfg.help) { printHelp(); process.exit(0); }

  // TTY 颜色启用
  if (process.stdout.isTTY && !cfg.json) {
    Object.assign(C, {
      green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
      dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m",
    });
  }

  const fail = (msg) => { eprintf(`${C.red}安装失败：${msg}${C.reset}`); process.exit(1); };

  const totalSteps = 6;
  let step = 0;

  // ── 步骤 1：环境检查 ──
  stepBanner(++step, totalSteps, "环境检查", cfg.json);
  const node = checkNode();
  printCheck("Node.js", node.ok ? "PASS" : "FAIL", node.ok ? `${node.version}（要求 >= ${MIN_NODE_MAJOR}）` : `${node.version} < ${MIN_NODE_MAJOR}`, cfg.json);
  if (!node.ok) fail(`Node.js 版本过低：${node.version}（要求 >= v${MIN_NODE_MAJOR}）`);

  const pi = cfg.skipPiCheck ? { ok: true, version: "skipped（--skip-pi-check）" } : checkPi();
  const piVer = pi.version || "";
  const piOk = pi.ok && (cfg.skipPiCheck || piVer >= MIN_PI_VERSION);
  printCheck("pi CLI", piOk ? "PASS" : "WARN", pi.ok ? `${piVer}（要求 >= ${MIN_PI_VERSION}）` : `未检测到（${pi.reason}）`, cfg.json);
  if (!pi.ok) {
    eprintf(`${C.yellow}  ⚠ 请先安装 pi：npm i -g @earendil-works/pi-coding-agent${C.reset}`);
    if (!cfg.json && !cfg.yes) {
      const cont = await ask("pi 未安装，仍要继续校验 men 资产吗？", "n");
      if (!cont) process.exit(1);
    }
  }

  const subagents = checkSubagents();
  printCheck("pi-subagents", subagents.installed ? "PASS" : "WARN",
    subagents.installed ? `已安装（${subagents.how}）` : `未安装（subagent 工具不可用，见步骤 ${Math.min(totalSteps, 5)}）`, cfg.json);

  // ── 步骤 2：模式识别 ──
  stepBanner(++step, totalSteps, "模式识别", cfg.json);
  const targetDir = cfg.dir ? path.resolve(cfg.dir) : process.cwd();
  const mode = isMenRepoRoot(targetDir) ? "A" : "B";
  if (!cfg.json) {
    process.stdout.write(`  目标目录：${C.dim}${targetDir}${C.reset}\n`);
    process.stdout.write(mode === "A"
      ? `  ${C.green}模式 A${C.reset} — men 仓库即工作目录，就地校验、零复制\n`
      : `  ${C.yellow}模式 B${C.reset} — 插件安装${cfg.global ? "（全局 ~/.pi/agent/）" : ""}，落位 agents/APPEND_SYSTEM/scripts\n`);
  }

  // ── 步骤 3：资产校验 ──
  stepBanner(++step, totalSteps, "men 资产校验", cfg.json);
  const agentsDir = path.join(ROOT, ".pi", "agents");
  const skillsDir = path.join(ROOT, ".opencode", "skills");
  const promptsDir = path.join(ROOT, "prompts");
  const checks = [
    ...checkAgents(agentsDir),
    ...checkSkills(skillsDir),
    ...checkPrompts(promptsDir),
    checkSettings(path.join(ROOT, ".pi", "settings.json")),
  ];
  const failed = checks.filter((c) => c.status === "FAIL");
  const warned = checks.filter((c) => c.status === "WARN");
  if (!cfg.json) {
    process.stdout.write(`  agents（5）：${failed.some((c) => c.id.startsWith("agent.")) ? C.red + "✗ 有失败" : C.green + "✓ 全部就绪" + C.reset}\n`);
    process.stdout.write(`  skills（15）：${failed.some((c) => c.id.startsWith("skill.")) ? C.red + "✗ 有失败" : C.green + "✓ 全部就绪" + C.reset}\n`);
    process.stdout.write(`  prompts（4）：${failed.some((c) => c.id.startsWith("prompt.")) ? C.red + "✗ 有失败" : C.green + "✓ 全部就绪" + C.reset}\n`);
  }
  for (const c of checks) {
    if (c.status !== "PASS") printCheck(c.id, c.status, c.evidence, cfg.json);
  }

  // ── 步骤 4：模式 B 落位确认 + 执行 ──
  const placed = [];
  if (mode === "B") {
    stepBanner(++step, totalSteps, "落位（模式 B）", cfg.json);
    const targetPiDir = cfg.global ? path.join(os.homedir(), ".pi", "agent") : path.join(targetDir, ".pi");
    if (!cfg.json && !cfg.yes && process.stdin.isTTY) {
      const ok = await ask(`将落位 agents(5)/APPEND_SYSTEM/scripts 到 ${targetPiDir}，继续？`, "y");
      if (!ok) {
        process.stdout.write(`  ${C.yellow}已取消，未落位任何文件${C.reset}\n`);
        printSummary({ ...summaryBase(), ok: failed.length === 0, mode, dir: targetDir, node, pi, subagents, checks, placed: [], cancelled: true });
        process.exit(failed.length === 0 ? 0 : 1);
      }
    }
    placed.push(...placeInto(ROOT, targetPiDir, cfg.global ? path.join(os.homedir(), ".pi", "agent", "agents") : null));

    // 落位清单（供 pi-remove.mjs 卸载）
    const manifestPath = path.join(targetPiDir, INSTALL_MANIFEST);
    const manifest = {
      installedAt: new Date().toISOString(),
      menVersion: "pi-harness",
      global: !!cfg.global,
      files: placed,
    };
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    if (!cfg.json) {
      for (const p of placed) process.stdout.write(`  ${C.green}✓${C.reset} ${p}\n`);
    }
  } else {
    // 模式 A：无落位，步骤标记跳过
    stepBanner(++step, totalSteps, "落位", cfg.json);
    if (!cfg.json) process.stdout.write(`  ${C.dim}模式 A 无需落位（仓库即工作目录）${C.reset}\n`);
  }

  // ── 步骤 5：扩展引导（pi-subagents） ──
  stepBanner(++step, totalSteps, "子 agent 扩展", cfg.json);
  let subagentInstalled = subagents.installed;
  // 安全开关：MEN_PI_INSTALL_EXT=0 禁用自动安装（自动化/受限环境）
  const canInstall = process.env.MEN_PI_INSTALL_EXT !== "0";
  if (!subagents.installed && pi.ok) {
    if (!cfg.json && !cfg.yes && process.stdin.isTTY) {
      if (!canInstall) {
        process.stdout.write(`  ${C.dim}跳过安装（MEN_PI_INSTALL_EXT=0）；请手动执行：pi install ${PI_SUBAGENTS_PKG}${C.reset}\n`);
      } else {
        const doInstall = await ask("未检测到 pi-subagents，是否现在安装（提供 subagent 工具）？", "n");
        if (doInstall) {
          process.stdout.write(`  正在安装 ${PI_SUBAGENTS_PKG} ...\n`);
          const r = spawnSync("pi", ["install", PI_SUBAGENTS_PKG], { encoding: "utf-8", shell: false, timeout: 120_000 });
          if (r.status === 0) {
            subagentInstalled = true;
            process.stdout.write(`  ${C.green}✓ pi-subagents 已安装${C.reset}\n`);
          } else {
            eprintf(`${C.yellow}  ⚠ 安装失败（exit ${r.status}）：${(r.stderr || "").slice(-200)}${C.reset}`);
          }
        } else {
          process.stdout.write(`  ${C.dim}跳过安装；后续可随时执行：pi install ${PI_SUBAGENTS_PKG}${C.reset}\n`);
        }
      }
    } else if (cfg.yes && !cfg.json) {
      process.stdout.write(`  ${C.dim}--yes 模式跳过扩展安装；请手动执行：pi install ${PI_SUBAGENTS_PKG}${C.reset}\n`);
    }
  }

  // ── 步骤 6：摘要 ──
  stepBanner(++step, totalSteps, "完成", cfg.json);
  const summaryBase = () => ({
    ok: failed.length === 0,
    mode,
    dir: targetDir,
    node: { ok: node.ok, version: node.version },
    pi: { ok: pi.ok, version: piVer || "skipped" },
    subagents: { installed: subagentInstalled, note: subagents.installed ? subagents.how : PI_SUBAGENTS_PKG },
    checks: checks.map((c) => ({ id: c.id, status: c.status, evidence: c.evidence })),
    summary: { passed: checks.length - failed.length - warned.length, failed: failed.length, warn: warned.length },
    placed,
  });

  const result = summaryBase();

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printSummary(result, pi, subagentInstalled);
  }
  process.exit(result.ok ? 0 : 1);
}

function printSummary(r, pi, subagentInstalled) {
  process.stdout.write(`\n${C.bold}${"=".repeat(56)}${C.reset}\n`);
  process.stdout.write(`${C.bold}  men（门）Pi Harness${r.mode === "A" ? " 就绪" : " 安装"}${r.ok ? C.green + " ✓" : C.red + " ✗"}${C.reset}\n`);
  process.stdout.write(`${C.bold}${"=".repeat(56)}${C.reset}\n`);
  process.stdout.write(`  资产校验：${C.green}${r.summary.passed} 项通过${C.reset}${r.summary.failed ? C.red + ` / ${r.summary.failed} 项失败` + C.reset : ""}${r.summary.warn ? C.yellow + ` / ${r.summary.warn} 项警告` + C.reset : ""}\n`);
  if (r.mode === "B" && r.placed.length) {
    process.stdout.write(`  已落位：${r.placed.length} 项（agents/APPEND_SYSTEM/scripts）\n`);
    process.stdout.write(`  卸载：node scripts/pi-remove.mjs${r.global ? " --global" : ""}\n`);
  }
  process.stdout.write(`\n  ${C.bold}下一步：${C.reset}\n`);
  let nextIdx = 1;
  if (!pi.ok) {
    process.stdout.write(`    ${nextIdx++}. npm i -g @earendil-works/pi-coding-agent\n`);
  }
  if (!subagentInstalled) {
    process.stdout.write(`    ${nextIdx++}. pi install ${PI_SUBAGENTS_PKG}   # 子 agent 工具\n`);
  }
  process.stdout.write(`    ${nextIdx++}. pi                          # 首次启动信任项目\n`);
  process.stdout.write(`    ${nextIdx}. 验证：/skill:ji-github · /ultrawork · /verify men\n`);
  process.stdout.write(`${C.bold}${"=".repeat(56)}${C.reset}\n`);
}

run();
