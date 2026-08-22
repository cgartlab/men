#!/usr/bin/env node
/**
 * release-notes.mjs — 从 CHANGELOG.md 提取指定版本的发布说明
 *
 * 纯 Node（零第三方依赖），供 `gh release create --notes-file` 使用。
 *
 * 用法：
 *   node scripts/release-notes.mjs [--version x.y.z] [--file <path>] [--json] [--output <path>]
 *   node scripts/release-notes.mjs --help
 *
 * 行为：
 *   - 解析 CHANGELOG.md 中每个以 "## [版本号] - 日期" 开头的版本节
 *   - 默认提取最新版本（跳过 [Unreleased]，取第一个正式版本）
 *   - 输出正文时去掉版本标题行，保留发布主题 blockquote + 分类内容
 *   - 指定版本不存在 → 退出码非 0，stderr 报错
 *   - CHANGELOG 文件不存在 → 退出码非 0
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const DEFAULT_CHANGELOG = path.join(ROOT, "CHANGELOG.md");
// 匹配 "## [v0.2.0] - 2026-08-21" 或 "## [0.2.0] - 2026-08-21"
const VERSION_HEAD_RE = /^## \[v?(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/;
const UNRELEASED_HEAD_RE = /^## \[Unreleased\]\s*$/i;

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    version: null,
    file: DEFAULT_CHANGELOG,
    json: false,
    output: null,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--version") {
      out.version = args[++i] || null;
    } else if (a === "--file") {
      out.file = args[++i] || DEFAULT_CHANGELOG;
    } else if (a === "--output") {
      out.output = args[++i] || null;
    } else {
      eprintf(`未知参数: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — CHANGELOG 发布说明提取器

用法:
  node scripts/release-notes.mjs [选项]

选项:
  --version <x.y.z>  提取指定版本（默认最新正式版本，跳过 [Unreleased]）
  --file <path>      指定 CHANGELOG 文件路径（默认 ./CHANGELOG.md）
  --json             输出 JSON（含 version, date, body, sections）
  --output <path>    将提取的正文写入文件（供 gh release create --notes-file 使用）
  --help, -h         显示本帮助

示例:
  node scripts/release-notes.mjs --output /tmp/release-notes.md
  node scripts/release-notes.mjs --version 0.1.0 --json
  node scripts/release-notes.mjs --file path/to/CHANGELOG.md
`);
}

// ─────────────────────────── 核心解析 ───────────────────────────

/**
 * 解析 CHANGELOG 全文，返回版本节数组（按文件中出现顺序，即最新在前）。
 * 每个元素: { version, date, body, sections }
 *   - body: 去掉标题行后的完整正文（含发布主题 blockquote）
 *   - sections: 按 ### 小标题拆分的对象 { heading: content }
 */
function parseChangelog(content) {
  const lines = content.split("\n");
  const entries = [];

  let current = null;
  let bodyLines = [];

  function flush() {
    if (!current) return;
    // 去掉首尾空行，确保正文从有效内容开始（如发布主题 blockquote）
    let body = bodyLines.join("\n");
    body = body.replace(/^\s*\n+/, "").replace(/\n+$/, "") + "\n";
    current.body = body;
    current.sections = extractSections(body);
    entries.push(current);
  }

  for (const line of lines) {
    const verMatch = line.match(VERSION_HEAD_RE);
    if (verMatch) {
      flush();
      current = { version: verMatch[1], date: verMatch[2] };
      bodyLines = [];
      continue;
    }
    const unrelMatch = line.match(UNRELEASED_HEAD_RE);
    if (unrelMatch) {
      flush();
      current = { version: "Unreleased", date: "" };
      bodyLines = [];
      continue;
    }
    if (current) {
      bodyLines.push(line);
    }
  }
  flush();

  return entries;
}

/**
 * 从版本正文中按 "### " 小标题拆分为 sections 对象。
 * 键为小标题文本（不含 ### 前缀），值为对应内容（不含小标题行）。
 * 标题前的前置内容（如发布主题 blockquote）存入 "__preamble__" 键。
 */
function extractSections(body) {
  const lines = body.split("\n");
  const sections = {};
  let currentKey = "__preamble__";
  let buf = [];

  function flush() {
    sections[currentKey] = buf.join("\n").replace(/^\n+|\n+$/g, "") + "\n";
    buf = [];
  }

  for (const line of lines) {
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (m) {
      flush();
      currentKey = m[1].trim();
      continue;
    }
    buf.push(line);
  }
  flush();

  return sections;
}

/**
 * 在版本数组中查找指定版本。version 参数可含或不含 v 前缀。
 * 若 version 为 null，返回第一个非 Unreleased 的版本（即最新）。
 */
function findEntry(entries, version) {
  if (version === null || version === undefined) {
    return entries.find((e) => e.version !== "Unreleased") || null;
  }
  const clean = version.replace(/^v/, "");
  return entries.find((e) => e.version === clean) || null;
}

// ─────────────────────────── 主流程 ───────────────────────────

export function main(argv) {
  const cfg = parseArgs(argv);

  if (cfg.help) {
    printHelp();
    process.exit(0);
  }

  // 1. 读取 CHANGELOG
  const changelogPath = path.resolve(cfg.file);
  if (!fs.existsSync(changelogPath)) {
    eprintf(`[错误] CHANGELOG 文件不存在: ${changelogPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(changelogPath, "utf-8");

  // 2. 解析版本节
  const entries = parseChangelog(content);
  if (entries.length === 0) {
    eprintf("[错误] CHANGELOG 中未找到任何版本节");
    process.exit(1);
  }

  // 3. 查找目标版本
  const entry = findEntry(entries, cfg.version);
  if (!entry) {
    const target = cfg.version || "（最新正式版本）";
    eprintf(`[错误] 未找到版本 ${target}`);
    eprintf(`可用版本: ${entries.filter((e) => e.version !== "Unreleased").map((e) => e.version).join(", ")}`);
    process.exit(1);
  }

  // 4. 输出
  if (cfg.output) {
    const outPath = path.resolve(cfg.output);
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outPath, entry.body, "utf-8");
  }

  if (cfg.json) {
    process.stdout.write(JSON.stringify({
      version: entry.version,
      date: entry.date,
      body: entry.body,
      sections: entry.sections,
    }, null, 2) + "\n");
  } else if (!cfg.output) {
    // 没有 --output 且没有 --json 时，默认打印正文到 stdout
    process.stdout.write(entry.body);
  }

  process.exit(0);
}

// 直接运行时执行
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv);
}
