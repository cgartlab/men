#!/usr/bin/env node
/**
 * release.mjs — 版本发布（SemVer bump + CHANGELOG + git tag）
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 *
 * 用法：
 *   node scripts/release.mjs [patch|minor|major] [--dry-run] [--json]
 *
 * 流程：
 *   1. 读 package.json version，校验 SemVer（非法退出码 2）
 *   2. 计算新版本（patch / minor / major，默认 patch）
 *   3. 更新 package.json version（保留 JSON 格式）
 *   4. 更新 CHANGELOG.md：在 ## [Unreleased] 下插入 ## [vX.Y.Z] - <date>，
 *      并把 Unreleased 节中已整理的条目迁移到新版本节（空节按 Added/Changed/Fixed 占位）
 *   5. 若 git 仓库存在：git add + git commit + git tag（不自动 push）
 *      若非 git 仓库：提示"尚未 git init，已更新版本号与 CHANGELOG，跳过 tag"
 *   6. 输出摘要，退出码 0
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const PKG_PATH = path.join(ROOT, "package.json");
const CHANGELOG_PATH = path.join(ROOT, "CHANGELOG.md");
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
// bump 子命令 → 递增的版本段下标（0=major, 1=minor, 2=patch）
const BUMP_SEGMENTS = { major: 0, minor: 1, patch: 2 };

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { bump: "patch", dryRun: false, json: false };
  for (const a of args) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a === "patch" || a === "minor" || a === "major") {
      out.bump = a;
    } else {
      eprintf(`未知参数: ${a}（用法: node scripts/release.mjs [patch|minor|major] [--dry-run] [--json]）`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — 版本发布器

用法:
  node scripts/release.mjs [patch|minor|major] [--dry-run] [--json]

子命令:
  patch    修订号 +1（默认）: 0.1.0 → 0.1.1
  minor    次版本 +1        : 0.1.0 → 0.2.0
  major    主版本 +1        : 0.1.0 → 1.0.0

选项:
  --dry-run  只打印将做什么，不写任何文件
  --json     输出 JSON 摘要
  --help, -h 显示本帮助

流程: 校验 SemVer → 更新 package.json → 更新 CHANGELOG.md
      → git add/commit/tag（需已 git init；不自动 push）
`);
}

function bumpVersion(v, kind) {
  const seg = v.split(".").map(Number);
  const idx = BUMP_SEGMENTS[kind];
  seg[idx] += 1;
  for (let i = idx + 1; i < 3; i++) seg[i] = 0;
  return seg.join(".");
}

/**
 * 在 CHANGELOG 的 [Unreleased] 下插入新版本节。
 * 返回新全文；若文本不含 [Unreleased]，则插到文件头部。
 */
function bumpChangelog(text, version, date) {
  const lines = text.split("\n");
  const entry = `## [v${version}] - ${date}`;

  const idx = lines.findIndex((l) => l.startsWith("## [Unreleased]"));
  if (idx === -1) {
    const block = `${entry}\n\n### Added\n\n### Changed\n\n### Fixed\n\n`;
    return (block + text.trimStart()).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  }

  // 找 Unreleased 节结束（下一个 ## 标题或文件尾）
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  // Unreleased 节内已整理的条目（任意行以 - 或 * 开头的列表项）→ 迁入新版本节
  const section = lines.slice(idx + 1, end).join("\n").trim();
  const hasItems = /^[ \t]*[-*] /m.test(section);
  const migrated = hasItems ? `${section}\n` : "";
  const block = `${entry}\n\n${migrated || "### Added\n\n### Changed\n\n### Fixed\n"}`.trimEnd();

  // 保持 [Unreleased] 在文件顶部，新版本节插在其下、旧版本节之上（Keep a Changelog 约定）
  const head = lines.slice(0, idx).join("\n").trimEnd();
  const reset = `## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n`;
  const after = end < lines.length ? lines.slice(end).join("\n").trimStart() : "";
  return `${head}\n\n${reset}\n${block}\n\n${after}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd() + "\n";
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf-8", shell: false, timeout: 30_000 });
}

// ─────────────────────────── 主流程 ───────────────────────────

function main() {
  const cfg = parseArgs(process.argv);

  if (!fs.existsSync(PKG_PATH)) {
    eprintf(`package.json 不存在：${PKG_PATH}（请在仓库根目录运行）`);
    process.exit(2);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
  const oldVersion = String(pkg.version ?? "");
  if (!SEMVER_RE.test(oldVersion)) {
    eprintf(`非法 SemVer 版本号: "${oldVersion}"（要求形如 0.1.0）`);
    process.exit(2);
  }

  const newVersion = bumpVersion(oldVersion, cfg.bump);
  const date = new Date().toISOString().slice(0, 10);
  const gitOk = isGitRepo(ROOT);
  const actions = [];
  const gitResults = [];

  if (cfg.dryRun) {
    // ── dry-run：只报告将做什么 ──
    actions.push(`package.json version → ${newVersion}`);
    actions.push(`CHANGELOG.md 插入 [v${newVersion}] - ${date}`);
    if (gitOk) {
      actions.push("git add package.json CHANGELOG.md");
      actions.push(`git commit -m "chore(release): v${newVersion}"`);
      actions.push(`git tag v${newVersion}`);
    } else {
      actions.push("git 操作跳过（尚未 git init）");
    }
  } else {
    // ── 构建新内容（内存中全部完成，再统一写盘，避免半成品）──
    const newPkg = { ...pkg, version: newVersion };
    const changelog = fs.existsSync(CHANGELOG_PATH)
      ? fs.readFileSync(CHANGELOG_PATH, "utf-8")
      : "";
    const newChangelog = bumpChangelog(changelog, newVersion, date);

    fs.writeFileSync(PKG_PATH, JSON.stringify(newPkg, null, 2) + "\n");
    fs.writeFileSync(CHANGELOG_PATH, newChangelog);
    actions.push(`package.json version → ${newVersion}`);
    actions.push(`CHANGELOG.md 插入 [v${newVersion}] - ${date}`);

    // ── git 操作（仅 git 仓库存在时）──
    if (gitOk) {
      const steps = [
        ["add", ["add", "package.json", "CHANGELOG.md"]],
        ["commit", ["commit", "-m", `chore(release): v${newVersion}`]],
        ["tag", ["tag", `v${newVersion}`]],
      ];
      for (const [name, args] of steps) {
        const r = git(args, ROOT);
        const ok = r.status === 0;
        gitResults.push({ step: name, command: `git ${args.join(" ")}`, ok, exitCode: r.status ?? -1 });
        if (!ok) {
          eprintf(`警告: git ${name} 失败（exit ${r.status ?? -1}）：${(r.stderr || r.stdout || "").trim().slice(-200)}`);
        }
      }
    } else {
      actions.push("git 操作跳过（尚未 git init，已更新版本号与 CHANGELOG）");
    }
  }

  // ── 摘要输出 ──
  const result = {
    ok: true,
    name: "men（门）Agent 团队 版本发布",
    dryRun: cfg.dryRun,
    bump: cfg.bump,
    oldVersion,
    newVersion,
    date,
    git: {
      available: gitOk,
      note: gitOk ? "将执行/已执行 add/commit/tag（不自动 push）" : "尚未 git init，跳过 tag",
    },
    actions,
    gitResults,
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    const mode = cfg.dryRun ? "（dry-run 预览）" : "";
    process.stdout.write(`men（门）Agent 团队 — 版本发布${mode}\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`  子命令   ${cfg.bump}\n`);
    process.stdout.write(`  当前版本 ${oldVersion}\n`);
    process.stdout.write(`  目标版本 ${newVersion}\n`);
    process.stdout.write(`  日期     ${date}\n`);
    for (const a of actions) process.stdout.write(`  动作     ${a}\n`);
    if (gitResults.length > 0) {
      for (const r of gitResults) {
        process.stdout.write(`  git      ${r.ok ? "OK " : "FAIL "} ${r.command}\n`);
      }
    }
    process.stdout.write(`${"=".repeat(54)}\n`);
    if (cfg.dryRun) {
      process.stdout.write(`dry-run 模式：以上为预览，未写入任何文件\n`);
    } else {
      process.stdout.write(`完成 ✓  发布到 GitHub 前请先 git init 并关联 remote，然后 git push --tags\n`);
    }
  }
  process.exit(0);
}

main();
