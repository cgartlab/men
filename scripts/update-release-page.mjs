#!/usr/bin/env node
/**
 * update-release-page.mjs — 自动更新 releases.astro（版本行 + 高亮 + infobox 日期）
 *
 * 纯 Node（零第三方依赖），供 release.mjs --all 流程调用。
 *
 * 用法：
 *   node scripts/update-release-page.mjs --version 0.3.4 --date 2026-08-30 \
 *     --theme "主题名" --notes "- 要点1\n- 要点2" [--dry-run] [--json]
 *
 * 行为：
 *   1. 版本历史表：在 <tbody> 首个 <tr> 前插入新版本行
 *   2. 当前版本亮点：替换 "当前版本 vX.Y.Z 于 ..." 段落 + <h3> 标题 + <ul> 列表
 *   3. infobox 日期：更新 "YYYY-MM-DD 发布" 为新日期
 *   4. 版本计数：更新 "共发布 N 个正式版本" 中的 N
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const RELEASES_ASTRO = path.join(ROOT, "site/src/pages/docs/releases.astro");

// ─────────────────── 工具函数 ───────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

/**
 * 把 CHANGELOG 条目里的轻量 Markdown 转为 HTML 标签。
 * 支持行内代码 `x` 与粗体 **x**（避免发布页原样显示裸标记）。
 * 先转代码再转粗体，保证 code 内容里的 ** 不被二次处理。
 */
export function mdToHtml(s) {
  return String(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { version: null, date: null, theme: null, notes: null, dryRun: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--version") out.version = args[++i] || null;
    else if (a === "--date") out.date = args[++i] || null;
    else if (a === "--theme") out.theme = args[++i] || null;
    else if (a === "--notes") out.notes = args[++i] || null;
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else { eprintf(`未知参数: ${a}`); process.exit(2); }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men — releases.astro 自动更新器

用法:
  node scripts/update-release-page.mjs [选项]

选项:
  --version <x.y.z>   版本号（必填）
  --date <YYYY-MM-DD> 发布日期（必填）
  --theme <string>    发布主题（如 "品牌升级 + 架构重构"）
  --notes <string>    发布要点，Markdown 列表（\\n 分隔每行）
  --dry-run           只打印变更，不写文件
  --json              输出 JSON 摘要
  --help, -h          显示本帮助
`);
}

// ─────────────────── 核心逻辑 ───────────────────

function buildRow(version, date, theme) {
  const desc = theme ? `发布主题「${theme}」` : "";
  return [
    `            <tr>`,
    `              <td><strong>v${version}</strong></td>`,
    `              <td>${date}</td>`,
    `              <td>${desc}。</td>`,
    `            </tr>`,
  ].join("\n");
}

function buildHighlight(version, date, theme, notesLines) {
  const lines = [];
  lines.push(`      <p>`);
  lines.push(`        当前版本 <code>v${version}</code> 于 ${date} 发布，主题为「${theme}」。`);
  lines.push(`      </p>`);
  lines.push(`      <h3>v${version}「${theme}」</h3>`);
  lines.push(`      <ul>`);
  for (const line of notesLines) {
    const trimmed = mdToHtml(line.replace(/^\s*-\s*/, "").trim());
    if (trimmed) lines.push(`        <li>${trimmed}</li>`);
  }
  lines.push(`      </ul>`);
  return lines.join("\n");
}

function updateFile(content, cfg) {
  const { version, date, theme, notes } = cfg;
  const notesLines = (notes || "").split("\\n").filter(Boolean);
  let changed = false;
  const changes = [];

  // ── 1. 版本历史表：在 <tbody> 首个 <tr> 前插入新行 ──
  const tbodyIdx = content.indexOf("<tbody>");
  if (tbodyIdx !== -1) {
    const firstTrIdx = content.indexOf("<tr>", tbodyIdx);
    if (firstTrIdx !== -1) {
      const row = buildRow(version, date, theme);
      content = content.slice(0, firstTrIdx) + row + "\n" + content.slice(firstTrIdx);
      changed = true;
      changes.push("version-history-row");
    }
  }

  // ── 2. 当前版本亮点：替换 "当前版本 vX.Y.Z 于 ..." + <h3> + <ul> ──
  // 匹配从 <p> 到下一个 <h3> 或 <p class="wiki-note"> 之间的内容
  const highlightRe = /(?<=[ \t]*)(<p>\s*\n\s*当前版本 <code>v[\d.]+<\/code>[\s\S]*?<\/p>\s*\n\s*<h3>v[\d.]+「[^」]+」<\/h3>\s*\n\s*<ul>[\s\S]*?<\/ul>)/;
  const hlMatch = content.match(highlightRe);
  if (hlMatch) {
    const newHighlight = buildHighlight(version, date, theme, notesLines);
    content = content.replace(highlightRe, newHighlight);
    changed = true;
    changes.push("highlight");
  }

  // ── 3. infobox 日期：更新 "YYYY-MM-DD 发布" ──
  const dateRe = /\d{4}-\d{2}-\d{2} 发布/;
  if (dateRe.test(content)) {
    content = content.replace(dateRe, `${date} 发布`);
    changed = true;
    changes.push("infobox-date");
  }

  // ── 4. 版本计数：更新 "共发布 N 个正式版本" ──
  const countRe = /共发布 <strong>(\d+) 个正式版本<\/strong>/;
  const countMatch = content.match(countRe);
  if (countMatch) {
    const oldCount = parseInt(countMatch[1], 10);
    const newCount = oldCount + 1;
    content = content.replace(countRe, `共发布 <strong>${newCount} 个正式版本</strong>`);
    changed = true;
    changes.push(`version-count ${oldCount}→${newCount}`);
  }

  // ── 5. 版本列表：在版本计数段落中追加新版本号 ──
  // 匹配 "（v0.1.0、v0.2.0、..." 格式的列表
  const versionListRe = /（(v[\d.]+(?:、v[\d.]+)*)）/;
  const listMatch = content.match(versionListRe);
  if (listMatch) {
    const existing = listMatch[1];
    const vTag = `v${version}`;
    if (!existing.includes(vTag)) {
      const newList = `${existing}、${vTag}`;
      content = content.replace(versionListRe, `（${newList}）`);
      changed = true;
      changes.push("version-list");
    }
  }

  return { content, changed, changes };
}

// ─────────────────── 主流程 ───────────────────

function main() {
  const cfg = parseArgs(process.argv);

  if (!cfg.version || !cfg.date) {
    eprintf("错误：--version 和 --date 为必填参数");
    process.exit(2);
  }

  if (!fs.existsSync(RELEASES_ASTRO)) {
    eprintf(`错误：文件不存在 ${RELEASES_ASTRO}`);
    process.exit(1);
  }

  const original = fs.readFileSync(RELEASES_ASTRO, "utf-8");
  const result = updateFile(original, cfg);

  if (!result.changed) {
    if (cfg.json) {
      process.stdout.write(JSON.stringify({ ok: true, changed: false, note: "无需变更" }) + "\n");
    } else {
      process.stdout.write("releases.astro 无需变更\n");
    }
    process.exit(0);
  }

  if (!cfg.dryRun) {
    fs.writeFileSync(RELEASES_ASTRO, result.content);
  }

  if (cfg.json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      dryRun: cfg.dryRun,
      changed: true,
      file: "site/src/pages/docs/releases.astro",
      changes: result.changes,
    }, null, 2) + "\n");
  } else {
    const mode = cfg.dryRun ? "（dry-run）" : "";
    process.stdout.write(`releases.astro 已更新${mode}：${result.changes.join(", ")}\n`);
  }

  process.exit(0);
}

// 入口守卫：仅直接执行时运行 CLI，被 import（测试）时不触发
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
