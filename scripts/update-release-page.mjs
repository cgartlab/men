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
 *   1. 版本历史表：在 <tbody> 首个 <tr> 前插入新版本行（该版本已存在则跳过 → 幂等）
 *   2. 当前版本亮点：替换 "当前版本 vX.Y.Z 于 ..." 段落 + <h3> 标题 + <ul> 列表
 *   3. infobox 日期：更新 "YYYY-MM-DD 发布" 为新日期
 *   4. 版本列表：在版本计数段落中追加新版本号（已存在则跳过）
 *   5. 版本计数：更新 "共发布 N 个正式版本" 中的 N（按版本列表实际长度推导，不自增）
 *   6. 截至日期：同段 "截至 YYYY-MM-DD" 同步更新为新日期
 *
 * 要点通道：--notes（argv，仅限单行）或 --notes-stdin（多行，替代含 NUL 的 argv 传参）
 *
 * 退出码：0 = 成功 / 无需变更；1 = 关键项（highlight、infobox-date）结构未命中；2 = 参数错误
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ROOT 可被 MEN_ROOT 环境变量覆盖——与 release.mjs 同一机制，
// 让黑盒测试能把页面更新落到合成仓库而非真实仓库（见 release.mjs 的 ROOT 注释）。
const ROOT = (() => {
  const envRoot = process.env.MEN_ROOT;
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(fileURLToPath(import.meta.url), "../..");
})();
const RELEASES_ASTRO = path.join(ROOT, "site/src/pages/docs/releases.astro");

// 关键变更项：任一结构未命中则本次运行判失败（ok:false + exit 1），
// 避免「历史表已更新、亮点区还是上一版」的半更新状态被静默通过（F17）
const CRITICAL_ITEMS = ["highlight", "infobox-date"];

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
  const out = { version: null, date: null, theme: null, notes: null, notesStdin: false, dryRun: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--version") out.version = args[++i] || null;
    else if (a === "--date") out.date = args[++i] || null;
    else if (a === "--theme") out.theme = args[++i] || null;
    else if (a === "--notes") out.notes = args[++i] || null;
    else if (a === "--notes-stdin") out.notesStdin = true;
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
  --theme <string>    发布主题（缺省回退为 v<version>，不写入字面 null）
  --notes <string>    发布要点，Markdown 列表（\\n 分隔每行；多行请改用 --notes-stdin）
  --notes-stdin       从 stdin 读取发布要点（替代含特殊字符的 argv 传参，优先级高于 --notes）
  --dry-run           只打印变更，不写文件
  --json              输出 JSON 摘要
  --help, -h          显示本帮助

退出码:
  0  全部变更成功（或无需变更）
  1  关键变更项（highlight / infobox-date）结构未命中，或 --notes-stdin 读取失败
  2  参数错误
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

/**
 * 生成「当前版本亮点」块，返回**相对缩进**的块（首行无缩进，块内用 2 空格相对缩进）。
 * 实际缩进由调用方按上下文前缀统一施加——这样重复运行时无论页面现有缩进是 2 还是 6 空格，
 * 生成的内容都与输入一致，保证幂等。
 */
/**
 * 生成「当前版本亮点」块。prefix 是上下文里 <p> 之前的实际缩进前缀——
 * 页面各版本块的缩进并不统一（历史块 6 空格、当前块 2 空格），固定缩进会让重复运行
 * 反复「改写」同一块（F11 幂等性破坏），因此按实际前缀生成。
 */
/**
 * 生成「当前版本亮点」块。返回**不含前缀缩进**的块（首行 `<p>` 顶格，正文/`<li>` 用 2 空格相对缩进）。
 * 前缀由调用方按 hlMatch[1]（上下文里 <p> 前的实际缩进）拼接——这样无论页面里该块的缩进
 * 是 2 还是 6 空格，重复运行时生成结果都与输入一致，保证幂等（F11）。
 */
function buildHighlight(version, date, theme, notesLines, prefix = "") {
  const body = `${prefix}  `;
  const lines = [];
  lines.push(`${prefix}<p>`);
  lines.push(`${body}当前版本 <code>v${version}</code> 于 ${date} 发布，主题为「${theme}」。`);
  lines.push(`${prefix}</p>`);
  lines.push(`${prefix}<h3>v${version}「${theme}」</h3>`);
  lines.push(`${prefix}<ul>`);
  for (const line of notesLines) {
    const trimmed = mdToHtml(line.replace(/^-\s*/, "").trim());
    if (trimmed) lines.push(`${body}<li>${trimmed}</li>`);
  }
  lines.push(`${prefix}</ul>`);
  return lines.join("\n");
}

/**
 * 计算全部变更项。返回 { content, changed, changes, skipped }：
 *   changes — 实际产生内容变化的项（同参数重跑时为空 → 幂等）
 *   skipped — 结构未命中、无法执行的项（页面结构被改动的信号）
 *   已命中但内容无变化的项不计入任何一项
 *
 * 关键修复：
 *   F11 版本行按 `<td><strong>vX.Y.Z</strong></td>` 判重，不再重复插行；
 *       版本计数按版本列表实际长度推导，不再自增
 *   F13 同段「截至 YYYY-MM-DD」同步更新为新日期
 *   F17 逐项记录 changes / skipped，关键项未命中由 main() 判失败
 */
function updateFile(content, cfg) {
  const { version, date, theme, notes } = cfg;
  // 分隔符兼容：argv 老路径用 \x00，--notes-stdin 用换行
  const notesLines = String(notes ?? "").split(/\x0D\x0A|\x0A|\x0D|\x00/).map((s) => s.trim()).filter(Boolean);
  const changes = [];
  const skipped = [];

  // ── 1. 版本历史表：在 <tbody> 首个 <tr> 前插入新行（F11 幂等判重）──
  const rowCell = `<td><strong>v${version}</strong></td>`;
  if (content.includes(rowCell)) {
    // 该版本行已存在 → 跳过，不重复插行
  } else {
    const tbodyIdx = content.indexOf("<tbody>");
    const firstTrIdx = tbodyIdx === -1 ? -1 : content.indexOf("<tr>", tbodyIdx);
    if (firstTrIdx === -1) {
      skipped.push("version-history-row");
    } else {
      const row = buildRow(version, date, theme);
      content = content.slice(0, firstTrIdx) + row + "\n" + content.slice(firstTrIdx);
      changes.push("version-history-row");
    }
  }

  // ── 2. 当前版本亮点：替换 "<p>…</p>" + "<h3>vX.Y.Z「主题」</h3>" + "<ul>" 三段 ──
  const highlightRe = /([ \t]*)(<p>\s*\n\s*当前版本 <code>v[\d.]+<\/code>[\s\S]*?<\/p>\s*\n\s*<h3>v[\d.]+「[^」]+」<\/h3>\s*\n\s*<ul>[\s\S]*?<\/ul>)/
  const hlMatch = content.match(highlightRe);
  if (hlMatch) {
    // 消费式捕获：hlMatch[0]=前缀+块，hlMatch[1]=前缀，hlMatch[2]=块本体。
    // 旧实现用 lookbehind（不消费前缀），但 newHighlight 含前缀 → replace 后缩进翻倍，
    // 重复运行时读到新缩进又报「有变化」，破坏 F11 幂等性。
    const prefix = hlMatch[1] ?? "";
    // buildHighlight 已含 prefix，不能再额外拼接（否则缩进翻倍）
    const newMatch0 = buildHighlight(version, date, theme, notesLines, prefix);
    if (newMatch0 !== hlMatch[0]) {
      content = content.replace(highlightRe, newMatch0);
      changes.push("highlight");
    }
  } else {
    skipped.push("highlight");
  }

  // ── 3. infobox 日期：更新 "YYYY-MM-DD 发布" ──
  const dateRe = /\d{4}-\d{2}-\d{2} 发布/;
  const dateMatch = content.match(dateRe);
  if (dateMatch) {
    if (dateMatch[0] !== `${date} 发布`) {
      content = content.replace(dateRe, `${date} 发布`);
      changes.push("infobox-date");
    }
  } else {
    skipped.push("infobox-date");
  }

  // ── 4. 版本列表：在版本计数段落中追加新版本号（先于计数执行，计数按列表推导）──
  // 匹配 "（v0.1.0、v0.2.0、..." 格式的列表；按「、」分词精确判重（F11）
  const versionListRe = /（(v[\d.]+(?:、v[\d.]+)*)）/;
  const listMatch = content.match(versionListRe);
  if (!listMatch) {
    skipped.push("version-list");
  } else {
    const vTag = `v${version}`;
    if (!listMatch[1].split("、").includes(vTag)) {
      content = content.replace(versionListRe, `（${listMatch[1]}、${vTag}）`);
      changes.push("version-list");
    }
  }

  // ── 5. 版本计数：从版本列表实际长度推导，不自增（F11）──
  const countRe = /共发布 <strong>(\d+) 个正式版本<\/strong>/;
  const countMatch = content.match(countRe);
  const listNow = content.match(versionListRe);
  if (!countMatch || !listNow) {
    skipped.push("version-count");
  } else {
    const oldCount = parseInt(countMatch[1], 10);
    const newCount = listNow[1].split("、").length;
    if (oldCount !== newCount) {
      content = content.replace(countRe, `共发布 <strong>${newCount} 个正式版本</strong>`);
      changes.push(`version-count ${oldCount}→${newCount}`);
    }
  }

  // ── 6. 截至日期：同段 "截至 YYYY-MM-DD" 同步更新（F13）──
  const summaryRe = /截至 \d{4}-\d{2}-\d{2}/;
  const summaryMatch = content.match(summaryRe);
  if (!summaryMatch) {
    skipped.push("summary-date");
  } else if (summaryMatch[0] !== `截至 ${date}`) {
    content = content.replace(summaryRe, `截至 ${date}`);
    changes.push("summary-date");
  }

  return { content, changed: changes.length > 0, changes, skipped };
}

// ─────────────────── 主流程 ───────────────────

function main() {
  const cfg = parseArgs(process.argv);

  if (!cfg.version || !cfg.date) {
    eprintf("错误：--version 和 --date 为必填参数");
    process.exit(2);
  }

  // F12：--theme 缺省时回退到 v<version>（与 release.mjs 的默认值一致），
  // 避免把字面 "null" 写进发布页
  const theme = cfg.theme || `v${cfg.version}`;

  // F1：多行要点走 stdin —— NUL/换行无法安全进入 argv（Node 硬限制）
  let notes = cfg.notes;
  if (cfg.notesStdin) {
    try {
      notes = fs.readFileSync(0, "utf-8");
    } catch (err) {
      eprintf(`错误：读取 --notes-stdin 失败：${err.message}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(RELEASES_ASTRO)) {
    eprintf(`错误：文件不存在 ${RELEASES_ASTRO}`);
    process.exit(1);
  }

  const original = fs.readFileSync(RELEASES_ASTRO, "utf-8");
  const result = updateFile(original, { version: cfg.version, date: cfg.date, theme, notes });

  // F17：关键项未命中 → ok:false + 非 0 退出（半更新状态必须有信号）
  const missedCritical = CRITICAL_ITEMS.filter((k) => result.skipped.includes(k));
  const ok = missedCritical.length === 0;

  if (!result.changed) {
    if (cfg.json) {
      const payload = {
        ok,
        theme,
        dryRun: cfg.dryRun,
        changed: false,
        file: "site/src/pages/docs/releases.astro",
        changes: [],
        skipped: result.skipped,
      };
      if (!ok) payload.note = `关键变更项未命中: ${missedCritical.join(", ")}`;
      process.stdout.write(JSON.stringify(payload) + "\n");
    } else if (ok) {
      process.stdout.write("releases.astro 无需变更\n");
    } else {
      process.stdout.write(`releases.astro 无需变更，但关键变更项未命中：${missedCritical.join(", ")}\n`);
    }
    process.exit(ok ? 0 : 1);
  }

  if (!cfg.dryRun) {
    fs.writeFileSync(RELEASES_ASTRO, result.content);
  }

  if (cfg.json) {
    process.stdout.write(JSON.stringify({
      ok,
      theme,
      dryRun: cfg.dryRun,
      changed: true,
      file: "site/src/pages/docs/releases.astro",
      changes: result.changes,
      skipped: result.skipped,
    }, null, 2) + "\n");
  } else {
    const mode = cfg.dryRun ? "（dry-run）" : "";
    process.stdout.write(`releases.astro 已更新${mode}：${result.changes.join(", ")}\n`);
    if (result.skipped.length > 0) {
      eprintf(`警告: 未命中、已跳过的变更项：${result.skipped.join(", ")}`);
    }
    if (!ok) {
      eprintf(`错误: 关键变更项未命中：${missedCritical.join(", ")}（发布页可能只被部分更新，请人工核对）`);
    }
  }

  process.exit(ok ? 0 : 1);
}

// 入口守卫：仅直接执行时运行 CLI，被 import（测试）时不触发
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
