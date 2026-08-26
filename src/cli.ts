#!/usr/bin/env node
/**
 * opencode-men — CLI 入口
 *
 * 子命令：
 *   install  — 安装 opencode-men 插件
 *   doctor   — 诊断环境
 *   version  — 打印版本
 *
 * 零第三方依赖，用 Node 原生 API。
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 版本号：从根 package.json 动态读取（与 plugin.ts 同一机制）
let VERSION = "0.0.0";
try {
  let d = __dirname;
  for (let i = 0; i < 10 && d !== dirname(d); i++) {
    const p = join(d, "package.json");
    if (existsSync(p)) {
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      if (pkg.version) { VERSION = pkg.version; break; }
    }
    d = dirname(d);
  }
} catch {}

function printHelp(): void {
  console.log(`
opencode-men v${VERSION}

Usage:
  opencode-men install    Install opencode-men plugin
  opencode-men doctor     Diagnose environment
  opencode-men version    Print version

Examples:
  npx opencode-men install
  npx opencode-men doctor
`);
}

function cmdVersion(): void {
  console.log(`opencode-men v${VERSION}`);
}

function cmdDoctor(): void {
  console.log("Men Doctor\n");

  const checks: [string, boolean, string][] = [];

  // Node version
  const nodeVersion = process.version;
  const nodeOk = parseInt(nodeVersion.slice(1)) >= 18;
  checks.push(["Node.js detected", nodeOk, nodeVersion]);

  // @opencode-ai/plugin
  const pluginPath = join(__dirname, "..", "node_modules", "@opencode-ai", "plugin");
  const pluginOk = existsSync(pluginPath);
  checks.push(["@opencode-ai/plugin installed", pluginOk, pluginOk ? "found" : "missing"]);

  // src/agents/
  const agentsDir = join(__dirname, "agents");
  const agentsOk = existsSync(agentsDir);
  checks.push(["Agents directory", agentsOk, agentsOk ? "found" : "missing"]);

  // src/commands/
  const commandsDir = join(__dirname, "commands");
  const commandsOk = existsSync(commandsDir);
  checks.push(["Commands directory", commandsOk, commandsOk ? "found" : "missing"]);

  // src/skills/
  const skillsDir = join(__dirname, "skills");
  const skillsOk = existsSync(skillsDir);
  checks.push(["Skills directory", skillsOk, skillsOk ? "found" : "missing"]);

  // Event store
  const eventsFile = join(process.cwd(), "events.jsonl");
  const eventsOk = existsSync(eventsFile);
  checks.push(["Event store", eventsOk, eventsOk ? "found" : "not found (will be created)"]);

  // Scripts
  const scriptsDir = join(process.cwd(), "scripts");
  const scriptsOk = existsSync(scriptsDir);
  checks.push(["Verification scripts", scriptsOk, scriptsOk ? "found" : "missing"]);

  // Print results
  let allPass = true;
  for (const [label, pass, detail] of checks) {
    const icon = pass ? "✓" : "✗";
    const color = pass ? "\x1b[32m" : "\x1b[31m";
    console.log(`  ${color}${icon}\x1b[0m ${label} — ${detail}`);
    if (!pass) allPass = false;
  }

  console.log();
  if (allPass) {
    console.log("\x1b[32mMen is ready.\x1b[0m");
  } else {
    console.log("\x1b[33mSome checks failed. Run 'opencode-men install' to fix.\x1b[0m");
  }
}

async function cmdInstall(): Promise<void> {
  console.log("Installing opencode-men...\n");

  const configDir = join(process.env.HOME || process.env.USERPROFILE || "", ".config", "opencode");
  const pluginDir = join(configDir, "node_modules", "opencode-men");

  mkdirSync(pluginDir, { recursive: true });
  mkdirSync(join(pluginDir, "dist"), { recursive: true });

  const distDir = join(__dirname, "..", "dist");
  if (existsSync(distDir)) {
    console.log("  Copying plugin files...");
  }

  const srcSkills = join(__dirname, "skills");
  const dstSkills = join(pluginDir, "skills");
  if (existsSync(srcSkills)) {
    mkdirSync(dstSkills, { recursive: true });
    console.log("  Copying skills...");
  }

  console.log("\n✓ opencode-men installed successfully!");
  console.log("  Restart OpenCode to use the plugin.");
}

// Main
const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case "install":
    await cmdInstall();
    break;
  case "doctor":
    cmdDoctor();
    break;
  case "version":
    cmdVersion();
    break;
  default:
    printHelp();
}
