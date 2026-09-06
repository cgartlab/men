#!/usr/bin/env node
/**
 * pi-install.mjs — men（门）Agent 团队 Pi Harness 安装/校验器
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 *
 * 职责（对应 docs/pi-harness-install.md §4.3）：
 *   1. 前置检查：pi >= 0.83（若安装则提示）、Node >= 18
 *   2. 模式 A（项目内）：cwd 已是 men 仓库根 → 就地校验就绪状态，不复制任何文件
 *   3. 模式 B（插件）：把 .pi/agents/*.md、.pi/APPEND_SYSTEM.md、scripts/ 落位到
 *      目标项目（默认 <cwd>/.pi/，--global 时写到 ~/.pi/agent/）
 *   4. 机械校验：agents frontmatter 契约 + skills 名称集合 + prompts 数量
 *   5. 幂等：重复安装可覆盖；落位清单写入 <目标>/.pi/men-install.json 供卸载
 *
 * 用法：
 *   node scripts/pi-install.mjs [选项]
 *
 * 选项：
 *   --dir <path>      目标项目目录（默认: 当前目录；模式 B 使用）
 *   --global          落位到全局 ~/.pi/agent/（agents/ + APPEND_SYSTEM.md）
 *   --skip-pi-check   跳过 pi 二进制检查（离线环境）
 *   --json            输出 JSON 摘要
 *   --help, -h        显示帮助
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const MIN_NODE_MAJOR = 18;
const MIN_PI_VERSION = "0.83.0";
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

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { dir: null, global: false, skipPiCheck: false, json: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") out.dir = args[++i] || null;
    else if (a === "--global") out.global = true;
    else if (a === "--skip-pi-check") out.skipPiCheck = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else { eprintf(`未知参数: ${a}（用 --help 查看用法）`); process.exit(2); }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — Pi Harness 安装/校验器

用法:
  node scripts/pi-install.mjs [选项]

选项:
  --dir <path>      目标项目目录（默认: 当前目录）
  --global          落位到全局 ~/.pi/agent/（agents + APPEND_SYSTEM.md）
  --skip-pi-check   跳过 pi 二进制检查（离线环境）
  --json            输出 JSON 摘要
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

function checkSettings(settingsFile) {
  if (!fs.existsSync(settingsFile)) {
    return { id: "pi.settings", status: "FAIL", evidence: "文件缺失" };
  }
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
    const hasSelf = Array.isArray(s.packages) && s.packages.includes("./");
    return {
      id: "pi.settings",
      status: hasSelf ? "PASS" : "WARN",
      evidence: hasSelf ? "packages: [\"./\"]" : "packages 未声明自引用 ./",
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
  const menScriptsDest = path.join(targetPiDir, "scripts");
  if (fs.existsSync(menScriptsSrc)) {
    const destScripts = globalAgentsDir
      ? path.join(os.homedir(), ".pi", "agent", "scripts", "men")
      : path.join(menScriptsDest, "men");
    copyTree(menScriptsSrc, destScripts, SCRIPTS_EXCLUDE);
    placed.push(`scripts/men`);
  }
  return placed;
}

// ─────────────────────────── 主流程 ───────────────────────────

function run() {
  const cfg = parseArgs(process.argv);
  if (cfg.help) { printHelp(); process.exit(0); }

  const fail = (msg) => { eprintf(`安装失败：${msg}`); process.exit(1); };

  // ── 1. 前置检查 ──
  const node = checkNode();
  if (!node.ok) fail(`Node.js 版本过低：${node.version}（要求 >= v${MIN_NODE_MAJOR}）`);

  const pi = cfg.skipPiCheck ? { ok: true, version: "skipped" } : checkPi();
  if (!pi.ok) {
    eprintf(`警告：未检测到 pi（${pi.reason}）。安装包后请先安装 pi：npm i -g @earendil-works/pi-coding-agent`);
    eprintf(`提示：子 agent 工具需要 pi-subagents 扩展：pi install npm:@johnnywu/pi-subagents`);
  }

  const targetDir = cfg.dir ? path.resolve(cfg.dir) : process.cwd();
  const mode = isMenRepoRoot(targetDir) ? "A" : "B";

  // ── 2. 校验 men 仓库自身资产（两种模式共用） ──
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

  // ── 3. 模式 B 落位 ──
  const placed = [];
  if (mode === "B") {
    const targetPiDir = cfg.global ? path.join(os.homedir(), ".pi", "agent") : path.join(targetDir, ".pi");
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
  }

  // ── 4. 摘要 ──
  const result = {
    ok: failed.length === 0,
    mode,
    dir: targetDir,
    node: { ok: node.ok, version: node.version },
    pi: { ok: pi.ok, version: pi.version },
    checks: checks.map((c) => ({ id: c.id, status: c.status, evidence: c.evidence })),
    summary: { passed: checks.length - failed.length - warned.length, failed: failed.length, warn: warned.length },
    placed,
    note: "安装包后请执行：pi install npm:@johnnywu/pi-subagents",
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printSummary(result);
  }
  process.exit(result.ok ? 0 : 1);
}

function printSummary(r) {
  process.stdout.write(`men（门）Agent 团队 — Pi Harness ${r.mode === "A" ? "就绪校验（模式 A）" : "安装（模式 B）"}\n`);
  process.stdout.write(`${"=".repeat(56)}\n`);
  process.stdout.write(`  Node   ${r.node.ok ? `PASS  ${r.node.version}` : `FAIL  ${r.node.version}`}\n`);
  process.stdout.write(`  Pi     ${r.pi.ok ? `PASS  ${r.pi.version}` : `WARN  ${r.pi.reason || "未检测到"}`}\n`);
  for (const c of r.checks) {
    const mark = c.status === "PASS" ? "PASS" : c.status === "WARN" ? "WARN" : "FAIL";
    process.stdout.write(`  ${mark}  ${c.id.padEnd(24)} ${c.evidence}\n`);
  }
  if (r.placed.length) {
    process.stdout.write(`\n  已落位（${r.placed.length} 项）：\n`);
    for (const p of r.placed) process.stdout.write(`    - ${p}\n`);
  }
  process.stdout.write(`${"=".repeat(56)}\n`);
  if (r.ok) {
    process.stdout.write(`  Pi Harness 就绪 ✓  下一步：\n`);
    process.stdout.write(`    pi install npm:@johnnywu/pi-subagents\n`);
    process.stdout.write(`    pi（首次启动信任项目）\n`);
  } else {
    process.stdout.write(`  校验未通过 ✗  ${r.summary.failed} 项失败，见上方 FAIL 项\n`);
  }
}

run();
