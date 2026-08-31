#!/usr/bin/env node
/**
 * release.mjs — 版本发布（SemVer bump + CHANGELOG + git tag + 推送/发布）
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 *
 * 用法：
 *   node scripts/release.mjs [patch|minor|major] [--dry-run] [--json]
 *                          [--push] [--gh-release] [--npm] [--all]
 *
 * 流程（本地准备，始终执行）：
 *   1. 读 package.json version，校验 SemVer（非法退出码 2）
 *   2. 计算新版本（patch / minor / major，默认 patch）
 *   3. 更新 package.json version（保留 JSON 格式）
 *   4. 更新 CHANGELOG.md：在 ## [Unreleased] 下插入 ## [vX.Y.Z] - <date>，
 *      并把 Unreleased 节中已整理的条目迁移到新版本节（空节按 Added/Changed/Fixed 占位）
 *   5. 同步版本号到 JSON/文本文件（opencode.json、configure.astro、AGENTS.md 等）
 *   6. 若 git 仓库存在：git add + git commit + git tag
 *
 * 可选流程（需 flag 启用）：
 *   --push         git push + git push --tags
 *   --gh-release   用 release-notes.mjs 提取 notes → gh release create
 *   --npm          npm publish（需已登录或 NPM_TOKEN 环境变量）
 *   --all          = --push + --gh-release + --npm
 *
 *   若非 git 仓库：提示"尚未 git init，已更新版本号与 CHANGELOG，跳过 tag"
 *   7. 输出摘要，退出码 0
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const PKG_PATH = path.join(ROOT, "package.json");
const CHANGELOG_PATH = path.join(ROOT, "CHANGELOG.md");
const RELEASE_NOTES_PATH = path.join(ROOT, ".release-notes.md");
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
// bump 子命令 → 递增的版本段下标（0=major, 1=minor, 2=patch）
const BUMP_SEGMENTS = { major: 0, minor: 1, patch: 2 };

// 发布时需同步版本号的 JSON 文件（相对仓库根）
const VERSION_JSON_FILES = [
  "package-lock.json",          // 顶层 version + packages[""].version 两处
  "opencode.json",
  "site/package.json",
];
// 发布时需同步版本号的文本文件（用 oldVersion → newVersion 文本替换）
// 注：site/src/pages/docs/releases.astro 是内容性页面（发布历史 + 亮点），不进文本替换，发版后手动更新。
const VERSION_TEXT_FILES = [
  "site/src/pages/docs/configure.astro",  // 配置版本号展示
  "AGENTS.md",                            // 仓库状态 + CHARTER_CHECK 版本引用
  "docs/guide/milestones.md",             // 里程碑进度版本引用
  "docs/governance.md",                   // 治理文档版本引用
  "knowledge/README.md",                  // 知识库 README 版本引用
];

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { bump: "patch", dryRun: false, json: false, push: false, ghRelease: false, npm: false };
  for (const a of args) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--push") out.push = true;
    else if (a === "--gh-release") out.ghRelease = true;
    else if (a === "--npm") out.npm = true;
    else if (a === "--all") { out.push = true; out.ghRelease = true; out.npm = true; }
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a === "patch" || a === "minor" || a === "major") {
      out.bump = a;
    } else {
      eprintf(`未知参数: ${a}（用法: node scripts/release.mjs [patch|minor|major] [--dry-run] [--json] [--push] [--gh-release] [--npm] [--all]）`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — 版本发布器

用法:
  node scripts/release.mjs [patch|minor|major] [选项]

子命令:
  patch    修订号 +1（默认）: 0.1.0 → 0.1.1
  minor    次版本 +1        : 0.1.0 → 0.2.0
  major    主版本 +1        : 0.1.0 → 1.0.0

选项:
  --dry-run      只打印将做什么，不写任何文件
  --json         输出 JSON 摘要
  --push         git push + git push --tags
  --gh-release   用 release-notes.mjs 提取 notes → gh release create
  --npm          npm publish（需已登录或 NPM_TOKEN 环境变量）
  --all          = --push + --gh-release + --npm
  --help, -h     显示本帮助

流程: 校验 SemVer → 更新 package.json → 更新 CHANGELOG.md
      → 同步版本文件 → git add/commit/tag
      → （可选）push → GitHub Release → npm publish
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

/**
 * 同步其他文件的版本号：JSON 文件更新顶层 version 字段（package-lock.json 额外更新
 * packages[""].version）；文本文件做 oldVersion → newVersion 文本替换。
 * dryRun 时不写盘。返回每文件处理结果 [{ file, ok, changed, note }]。
 */
function syncVersionFiles(newVersion, oldVersion, dryRun) {
  const results = [];

  for (const f of VERSION_JSON_FILES) {
    const fullPath = path.join(ROOT, f);
    if (!fs.existsSync(fullPath)) {
      results.push({ file: f, ok: false, changed: false, note: "文件不存在" });
      continue;
    }
    try {
      const obj = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      let changed = false;
      if (obj.version !== undefined && obj.version !== newVersion) {
        obj.version = newVersion;
        changed = true;
      }
      if (
        f === "package-lock.json" &&
        obj.packages &&
        typeof obj.packages[""] === "object" &&
        obj.packages[""].version !== undefined &&
        obj.packages[""].version !== newVersion
      ) {
        obj.packages[""].version = newVersion;
        changed = true;
      }
      if (changed && !dryRun) {
        fs.writeFileSync(fullPath, JSON.stringify(obj, null, 2) + "\n");
      }
      results.push({ file: f, ok: true, changed, note: changed ? `version → ${newVersion}` : "无需变更" });
    } catch (err) {
      results.push({ file: f, ok: false, changed: false, note: `解析/写入失败: ${err.message}` });
    }
  }

  for (const f of VERSION_TEXT_FILES) {
    const fullPath = path.join(ROOT, f);
    if (!fs.existsSync(fullPath)) {
      results.push({ file: f, ok: false, changed: false, note: "文件不存在" });
      continue;
    }
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const next = text.split(oldVersion).join(newVersion);
      const changed = next !== text;
      if (changed && !dryRun) {
        fs.writeFileSync(fullPath, next);
      }
      results.push({ file: f, ok: true, changed, note: changed ? `version → ${newVersion}` : "无需变更" });
    } catch (err) {
      results.push({ file: f, ok: false, changed: false, note: `读取/写入失败: ${err.message}` });
    }
  }

  return results;
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

  // 需随发布同步版本号的文件（仅计入实际存在的；git add 不存在文件会报错）
  const syncFiles = [...VERSION_JSON_FILES, ...VERSION_TEXT_FILES].filter((f) =>
    fs.existsSync(path.join(ROOT, f))
  );
  const addFiles = ["package.json", "CHANGELOG.md", ...syncFiles];

  if (cfg.dryRun) {
    // ── dry-run：只报告将做什么 ──
    actions.push(`package.json version → ${newVersion}`);
    actions.push(`CHANGELOG.md 插入 [v${newVersion}] - ${date}`);
    actions.push(`同步版本文件 → ${newVersion}（${VERSION_JSON_FILES.length} JSON + ${VERSION_TEXT_FILES.length} 文本）`);
    // dry-run 也执行 syncVersionFiles（dryRun=true 不写盘），提前发现文件缺失/解析失败
    const syncResults = syncVersionFiles(newVersion, oldVersion, true);
    for (const r of syncResults) {
      actions.push(`同步 version → ${newVersion}: ${r.file} (${r.changed ? "将变更" : "无需变更"})`);
    }
    if (cfg.push || cfg.ghRelease) {
      actions.push(`releases.astro 更新 → v${newVersion}`);
    }
    if (gitOk) {
      actions.push(`git add ${addFiles.join(" ")}`);
      actions.push(`git commit -m "chore(release): v${newVersion}"`);
      actions.push(`git tag v${newVersion}`);
    } else {
      actions.push("git 操作跳过（尚未 git init）");
    }
    if (cfg.push) actions.push("git push origin HEAD + git push origin --tags");
    if (cfg.ghRelease) actions.push(`gh release create v${newVersion}`);
    if (cfg.npm) actions.push("npm publish");
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

    // ── 同步其余文件的版本号 ──
    const syncResults = syncVersionFiles(newVersion, oldVersion, false);
    for (const r of syncResults) {
      if (r.changed) actions.push(`同步 version → ${newVersion}: ${r.file}`);
    }

    // ── 可选：更新 releases.astro（在 git commit 之前，纳入同一次 commit）──
    if (cfg.push || cfg.ghRelease) {
      const updateScript = path.join(ROOT, "scripts/update-release-page.mjs");
      if (fs.existsSync(updateScript)) {
        // 从 CHANGELOG 提取主题和要点
        const currentChangelog = fs.readFileSync(CHANGELOG_PATH, "utf-8");
        const versionBlock = currentChangelog.match(new RegExp(`## \\[v${newVersion}\\][\\s\\S]*?(?=## \\[|$)`));
        let theme = `v${newVersion}`;
        let notesLines = [];
        if (versionBlock) {
          const themeM = versionBlock[0].match(/^> (.+)/m);
          if (themeM) theme = themeM[1];
          const listItems = versionBlock[0].match(/^- .+/gm);
          if (listItems) notesLines = listItems;
        }
        const notesEsc = notesLines.join("\\n");
        const updateArgs = [
          updateScript,
          "--version", newVersion,
          "--date", date,
          "--theme", theme,
          "--notes", notesEsc,
        ];
        const updateResult = spawnSync("node", updateArgs, {
          cwd: ROOT, encoding: "utf-8", shell: false, timeout: 30_000,
        });
        const updateOk = updateResult.status === 0;
        actions.push(`releases.astro 更新 ${updateOk ? "OK" : "FAIL"}`);
        if (updateOk) {
          addFiles.push("site/src/pages/docs/releases.astro");
        } else {
          eprintf(`警告: update-release-page.mjs 失败：${(updateResult.stderr || "").trim().slice(-200)}`);
        }
      }
    }

    // ── git 操作（仅 git 仓库存在时）──
    if (gitOk) {
      const steps = [
        ["add", ["add", ...addFiles]],
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

    // ── 可选：git push ──
    if (cfg.push && gitOk) {
      const pushSteps = [
        ["push", ["push", "origin", "HEAD"]],
        ["push-tags", ["push", "origin", "--tags"]],
      ];
      for (const [name, args] of pushSteps) {
        const r = git(args, ROOT);
        const ok = r.status === 0;
        gitResults.push({ step: name, command: `git ${args.join(" ")}`, ok, exitCode: r.status ?? -1 });
        actions.push(`git ${name} ${ok ? "OK" : "FAIL"}`);
        if (!ok) {
          eprintf(`警告: git ${name} 失败（exit ${r.status ?? -1}）：${(r.stderr || r.stdout || "").trim().slice(-200)}`);
        }
      }
    }

    // ── 可选：GitHub Release ──
    if (cfg.ghRelease && gitOk) {
      // 1. 用 release-notes.mjs 提取当前版本 notes
      const notesScript = path.join(ROOT, "scripts/release-notes.mjs");
      if (fs.existsSync(notesScript)) {
        const notesResult = spawnSync("node", [notesScript, "--output", RELEASE_NOTES_PATH], {
          cwd: ROOT, encoding: "utf-8", shell: false, timeout: 30_000,
        });
        if (notesResult.status === 0 && fs.existsSync(RELEASE_NOTES_PATH)) {
          // 2. 读取 CHANGELOG 获取主题行（首个 > 开头的 blockquote）
          const changelog = fs.readFileSync(CHANGELOG_PATH, "utf-8");
          const themeMatch = changelog.match(new RegExp(`## \\[v${newVersion}\\][\\s\\S]*?\\n\\n> (.+)`));
          const theme = themeMatch ? themeMatch[1] : `v${newVersion}`;
          // 3. gh release create
          const ghArgs = [
            "release", "create", `v${newVersion}`,
            "--repo", "cgartlab/men",
            "--title", `v${newVersion} — ${theme}`,
            "--notes-file", RELEASE_NOTES_PATH,
          ];
          const ghResult = spawnSync("gh", ghArgs, {
            cwd: ROOT, encoding: "utf-8", shell: false, timeout: 60_000,
          });
          const ghOk = ghResult.status === 0;
          actions.push(`gh release create ${ghOk ? "OK" : "FAIL"}`);
          if (ghOk) {
            const url = (ghResult.stdout || "").trim();
            if (url) actions.push(`  ${url}`);
          } else {
            eprintf(`警告: gh release create 失败：${(ghResult.stderr || "").trim().slice(-200)}`);
          }
          // 清理临时 notes 文件
          try { fs.unlinkSync(RELEASE_NOTES_PATH); } catch {}
        } else {
          eprintf("警告: release-notes.mjs 提取失败，跳过 gh release create");
          actions.push("gh release create SKIP（release-notes 提取失败）");
        }
      } else {
        eprintf("警告: release-notes.mjs 不存在，跳过 gh release create");
        actions.push("gh release create SKIP（release-notes.mjs 不存在）");
      }
    }

    // ── 可选：npm publish ──
    if (cfg.npm) {
      // Windows 下 npm 是 npm.cmd，不能直接 spawnSync('npm')，用 cmd /c 包裹（同 install.mjs runNpm）
      const win = process.platform === "win32";
      const npmCmd = win ? "cmd" : "npm";
      const npmArgs = win ? ["/c", "npm", "publish"] : ["publish"];
      const npmResult = spawnSync(npmCmd, npmArgs, {
        cwd: ROOT, encoding: "utf-8", shell: false, timeout: 120_000,
      });
      const npmOk = npmResult.status === 0;
      actions.push(`npm publish ${npmOk ? "OK" : "FAIL"}`);
      if (!npmOk) {
        eprintf(`警告: npm publish 失败：${(npmResult.stderr || npmResult.stdout || "").trim().slice(-200)}`);
      }
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
    flags: { push: cfg.push, ghRelease: cfg.ghRelease, npm: cfg.npm },
    git: {
      available: gitOk,
      note: gitOk ? "已执行 add/commit/tag" : "尚未 git init，跳过 tag",
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
    if (cfg.push || cfg.ghRelease || cfg.npm) {
      const flags = [];
      if (cfg.push) flags.push("push");
      if (cfg.ghRelease) flags.push("gh-release");
      if (cfg.npm) flags.push("npm");
      process.stdout.write(`  发布     ${flags.join(" + ")}\n`);
    }
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
      process.stdout.write(`完成 ✓\n`);
    }
  }
  process.exit(0);
}

main();
