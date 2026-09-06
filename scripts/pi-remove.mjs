#!/usr/bin/env node
/**
 * pi-remove.mjs — men（门）Agent 团队 Pi Harness 卸载器
 *
 * 按 <目标>/.pi/men-install.json（pi-install.mjs 落位时写入）清单，
 * 删除已落位的 agents / APPEND_SYSTEM.md / scripts，并移除清单本身。
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 *
 * 用法：
 *   node scripts/pi-remove.mjs [选项]
 *
 * 选项：
 *   --dir <path>      目标项目目录（默认: 当前目录；对应安装时 --dir）
 *   --global          清理全局 ~/.pi/agent/ 落位（对应安装时 --global）
 *   --json            输出 JSON 摘要
 *   --help, -h        显示帮助
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const AGENT_NAMES = ["si", "ji", "chi", "yi", "xun"];
const INSTALL_MANIFEST = "men-install.json";

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { dir: null, global: false, json: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") out.dir = args[++i] || null;
    else if (a === "--global") out.global = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else { eprintf(`未知参数: ${a}（用 --help 查看用法）`); process.exit(2); }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — Pi Harness 卸载器

用法:
  node scripts/pi-remove.mjs [选项]

选项:
  --dir <path>      目标项目目录（默认: 当前目录）
  --global          清理全局 ~/.pi/agent/ 落位
  --json            输出 JSON 摘要
  --help, -h        显示本帮助
`);
}

function run() {
  const cfg = parseArgs(process.argv);
  if (cfg.help) { printHelp(); process.exit(0); }

  const targetDir = cfg.dir ? path.resolve(cfg.dir) : process.cwd();
  const targetPiDir = cfg.global ? path.join(os.homedir(), ".pi", "agent") : path.join(targetDir, ".pi");
  const manifestPath = path.join(targetPiDir, INSTALL_MANIFEST);

  const removed = [];
  if (fs.existsSync(manifestPath)) {
    // 按清单删除
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (e) {
      eprintf(`警告：清单解析失败（${e.message}），改用已知落位点清理`);
    }
    if (manifest && Array.isArray(manifest.files)) {
      for (const rel of manifest.files) {
        const p = path.join(targetPiDir, rel);
        if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.push(rel); }
      }
    }
    fs.rmSync(manifestPath, { force: true });
  } else {
    // 无清单：尽力清理已知落位点（agents + APPEND_SYSTEM + scripts/men）
    for (const name of AGENT_NAMES) {
      const p = path.join(targetPiDir, "agents", `${name}.md`);
      if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); removed.push(`agents/${name}.md`); }
    }
    const append = path.join(targetPiDir, "APPEND_SYSTEM.md");
    if (fs.existsSync(append)) { fs.rmSync(append, { force: true }); removed.push("APPEND_SYSTEM.md"); }
    const scripts = path.join(targetPiDir, "scripts", "men");
    if (fs.existsSync(scripts)) { fs.rmSync(scripts, { recursive: true, force: true }); removed.push("scripts/men"); }
  }

  // 清空空的 agents 目录
  const agentsDir = path.join(targetPiDir, "agents");
  if (fs.existsSync(agentsDir) && fs.readdirSync(agentsDir).length === 0) {
    fs.rmdirSync(agentsDir);
  }

  const result = { ok: true, dir: targetPiDir, global: !!cfg.global, removed };
  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`men Pi Harness 卸载完成\n`);
    process.stdout.write(`${"=".repeat(56)}\n`);
    if (removed.length) {
      for (const r of removed) process.stdout.write(`  - 已删除 ${r}\n`);
    } else {
      process.stdout.write(`  （无落位文件，无需清理）\n`);
    }
    process.stdout.write(`${"=".repeat(56)}\n`);
    process.stdout.write(`  完成 ✓  Pi skills/prompts 仍由 pi list 管理，如需移除：pi remove\n`);
  }
  process.exit(0);
}

run();
