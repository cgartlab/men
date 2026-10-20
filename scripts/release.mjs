#!/usr/bin/env node
/**
 * release.mjs — 版本发布（SemVer bump + CHANGELOG + git tag + 推送/发布）
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 *
 * 用法：
 *   node scripts/release.mjs [patch|minor|major] [--dry-run] [--json]
 *                          [--push] [--gh-release] [--npm] [--all]
 *                          [--require-ci]
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
 *   --require-ci   发布前校验远端 CI 状态（combined status + check-runs 全绿才继续）。
 *                  与 --push / --gh-release / --all 组合使用时，在打 tag / 推送前先查询
 *                  当前 HEAD 的 GitHub commit status；任一 check 非 success 则拒绝发布
 *                  （exit 1）。可配 --dry-run 预览校验结果而不执行。Issue #156 方案 B。
 *
 *   若非 git 仓库：提示"尚未 git init，已更新版本号与 CHANGELOG，跳过 tag"
 *   7. 输出摘要，退出码 0
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

// ROOT 可被 MEN_ROOT 环境变量覆盖。
// 设计动机：release.mjs 的 ROOT 默认绑死脚本自身路径，黑盒测试若想验证「真发版」
// 就必须 spawn 真实仓库里的脚本，而 cwd 无法改变它算出的 ROOT —— 结果测试在真仓库上
// 真的跑了 git tag/commit/push（实测把 0.6.12→0.6.15 推上了 origin）。
// 覆盖后 ROOT 指向合成仓库，git 操作与版本文件全部落在临时目录，与真实仓库完全隔离。
const ROOT = (() => {
  const envRoot = process.env.MEN_ROOT;
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(fileURLToPath(import.meta.url), "../..");
})();
const PKG_PATH = path.join(ROOT, "package.json");
const CHANGELOG_PATH = path.join(ROOT, "CHANGELOG.md");
const RELEASE_NOTES_PATH = path.join(ROOT, ".release-notes.md");
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
// bump 子命令 → 递增的版本段下标（0=major, 1=minor, 2=patch）
const BUMP_SEGMENTS = { major: 0, minor: 1, patch: 2 };

export { VERSION_JSON_FILES, VERSION_TEXT_FILES, VERSION_TEXT_PATTERNS };

// 发布时需同步版本号的 JSON 文件（相对仓库根）
const VERSION_JSON_FILES = [
  "package-lock.json",          // 顶层 version + packages[""].version 两处
  "site/package-lock.json",     // 站点 lockfile 根版本（此前漏同步，#116 rebase 时漂过）
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
  ".opencode/skills/men-status/SKILL.md",  // 版本表格（v0.4.0 靠手工补过）
  "docs/integrations/argus.md",           // argus 集成文档的版本引用
  "docs/integrations/skillhub.md",        // SKILL.md frontmatter 示例（须与 men-status 同步）
  "docs/dsh-customization.md",            // 「关联」行的当前项目版本
  "scripts/skillhub-publish.mjs",         // CLI_VERSION 常量（v0.5.0 新增，此前漏同步）
];

// 文本文件中「应当被替换」的精确上下文（正则源串，`@VER@` 为旧版本号占位）。
//
// 为什么需要它：旧实现是 `text.split(old).join(new)` 全文件替换，会把**历史版本引用**
// 或**他项目版本引用**一并改掉。v0.6.0 发版实测误改两处：
//   - AGENTS.md「v0.5.0 发版手动补 releases.astro」→ 被改成 v0.6.0（历史事实被篡改）
//   - docs/integrations/argus.md「若 argus v0.5.0 后 License 更新」→ 被改成 argus v0.6.0
//     （argus 是另一个项目，当时实际为 0.5.8）
// 未在此表登记的文件仍回退到全文件替换（向后兼容）。
const VERSION_TEXT_PATTERNS = {
  "AGENTS.md": ["v@VER@（M0–M7 完成）"],
  "docs/guide/milestones.md": ["项目 v@VER@ 已发布"],
  "docs/governance.md": ["> 版本：v@VER@ ｜ 日期："],
  "knowledge/README.md": ["> 版本：v@VER@ ｜ 日期：", "## 当前内容（v@VER@）"],
  ".opencode/skills/men-status/SKILL.md": ["^version: @VER@$", "\\| 版本 \\| v@VER@ \\|"],
  "docs/integrations/argus.md": ["本项目 v@VER@（版本号由"],
  "docs/integrations/skillhub.md": ["^version: @VER@$"],
  "docs/dsh-customization.md": ["Agent 团队，v@VER@，M0–M7 完成"],
  "site/src/pages/docs/configure.astro": ["<td><code>@VER@</code></td><td>配置版本号</td>"],
  "scripts/skillhub-publish.mjs": ['CLI_VERSION = "@VER@"'],
};

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * 把文本里「应当更新」的版本号从 oldVersion 换成 newVersion。
 *
 * 登记在 VERSION_TEXT_PATTERNS 的文件只替换匹配到的上下文；未登记的沿用全文件替换。
 * 已是最新版本时所有模式都不匹配，返回原文（幂等）。
 */
export function syncVersionText(text, file, oldVersion, newVersion) {
  const patterns = VERSION_TEXT_PATTERNS[file];
  if (!patterns) return text.split(oldVersion).join(newVersion);
  const escapedVer = oldVersion.replace(REGEX_SPECIALS, "\\$&");
  let out = text;
  for (const source of patterns) {
    const re = new RegExp(source.replace(/@VER@/g, escapedVer), "gm");
    out = out.replace(re, (match) => match.split(oldVersion).join(newVersion));
  }
  return out;
}

// ─────────────────────────── 工具函数 ───────────────────────────

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { bump: "patch", dryRun: false, json: false, push: false, ghRelease: false, npm: false, requireCi: false };
  for (const a of args) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--push") out.push = true;
    else if (a === "--gh-release") out.ghRelease = true;
    else if (a === "--npm") out.npm = true;
    else if (a === "--all") { out.push = true; out.ghRelease = true; out.npm = true; }
    else if (a === "--require-ci") out.requireCi = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      return { ...out, help: true };
    } else if (a === "patch" || a === "minor" || a === "major") {
      out.bump = a;
    } else {
      eprintf(`未知参数: ${a}（用法: node scripts/release.mjs [patch|minor|major] [--dry-run] [--json] [--push] [--gh-release] [--npm] [--all]）`);
      return { ...out, unknownArg: a };
    }
  }
  return out;
}

export function printHelp() {
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
  --require-ci   发布前校验远端 CI 状态（combined status + check-runs 全绿才继续）
  --help, -h     显示本帮助

流程: 校验 SemVer → 更新 package.json → 更新 CHANGELOG.md
      → 同步版本文件 → git add/commit/tag
      → （可选）push → GitHub Release → npm publish
`);
}

export function bumpVersion(v, kind) {
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
export function bumpChangelog(text, version, date) {
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
  // 发布主题 blockquote（> 开头，通常首行）单独提取并剥离，避免迁入时重复
  const blockquote = section.match(/^> .+/m)?.[0] ?? "";
  const bodySection = blockquote ? section.replace(/^> .+\n?/, "").replace(/^\n+/, "") : section;
  const hasItems = /^[ \t]*[-*] /m.test(bodySection);
  const migrated = hasItems ? `${bodySection}\n` : "";
  const block = `${entry}\n\n${blockquote ? `${blockquote}\n\n` : ""}${migrated || "### Added\n\n### Changed\n\n### Fixed\n"}`.trimEnd();

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
        f.endsWith("-lock.json") &&
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
      const next = syncVersionText(text, f, oldVersion, newVersion);
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

/**
 * 运行 git 子步骤并计入失败汇总（F2）。
 * 失败时仅告警、不中断后续步骤（tag 已存在等情形需继续执行 push/npm），
 * 但失败会记入 failures，最终由调用方汇总为 ok:false + exit 1。
 *
 * @returns {{ok: boolean}}
 */
function runGitStep({ name, args, gitResults, failures, actions, note }) {
  const r = git(args, ROOT);
  const ok = r.status === 0;
  if (gitResults) gitResults.push({ step: name, command: `git ${args.join(" ")}`, ok, exitCode: r.status ?? -1 });
  if (note) actions.push(note(ok));
  if (!ok) {
    eprintf(`警告: git ${name} 失败（${procFailInfo(r, 30_000)}）：${(r.stderr || r.stdout || "").trim().slice(-200)}`);
    failures.push(`git ${name}`);
  }
  return { ok };
}

/**
 * 生成子进程失败/超时的诊断信息（exit code 或超时提示）。
 * spawnSync 在子进程被 timeout 杀掉时返回 status === null（error 为 timeout）——
 * 此时给出明确超时提示（X 为对应 timeout 秒数），而非笼统的「exit -1」。
 *
 * @param {object} r spawnSync 返回结果
 * @param {number} timeoutMs 该次调用的超时毫秒数（用于提示实际超时秒数）
 * @returns {string} 如 "exit 1" 或 "子进程超时（30s）"
 */
export function procFailInfo(r, timeoutMs) {
  if (r && typeof r === "object" && r.status === null) {
    const secs = Math.round((timeoutMs || 0) / 1000);
    return `子进程超时（${secs}s）`;
  }
  return `exit ${r?.status ?? -1}`;
}

/**
 * 校验远端 GitHub CI 状态（Issue #156 方案 B）。
 *
 * 用 `gh api` 查询给定 commit 的 combined status 与 check-runs：
 *  - combined status：`/repos/{owner}/{repo}/commits/{sha}/status`（传统 statuses）
 *  - check-runs：`/repos/{owner}/{repo}/commits/{sha}/check-runs`
 *  任一 check 状态为 failure / cancelled / timed_out / action_required →
 *  判为 CI 红，发布应被拒绝。
 *
 * @param {object} opts
 * @param {string} opts.owner  GitHub owner（默认从 `gh api user` 或仓库 remote 解析）
 * @param {string} opts.repo   GitHub repo
 * @param {string} opts.sha    目标 commit SHA（默认 HEAD）
 * @param {number} opts.timeoutMs 超时毫秒（默认 30s）
 * @returns {{ ok: boolean, reason?: string, details?: object }}
 *   ok=true 表示 CI 全绿（或查询到明确 success）；ok=false 表示 CI 红或查询失败。
 *   查询失败（gh 不可用 / 网络错误 / 无权限）时 ok=false 但 reason 以 "(查询失败)" 开头，
 *   调用方可决定是硬拒绝还是仅告警——本函数只报告事实。
 */
export function checkRemoteCiStatus({ owner, repo, sha, timeoutMs = 30_000 } = {}) {
  const gh = (args) =>
    spawnSync("gh", args, { encoding: "utf-8", shell: false, timeout: timeoutMs });

  // 解析 owner/repo：优先显式传入，否则从 `gh repo view --json nameWithOwner` 推断，最后回退 remote
  let nameWithOwner = "";
  if (owner && repo) {
    nameWithOwner = `${owner}/${repo}`;
  } else {
    const rv = gh(["repo", "view", "--json", "nameWithOwner"]);
    if (rv.status === 0) {
      try { nameWithOwner = JSON.parse(rv.stdout).nameWithOwner || ""; } catch { nameWithOwner = ""; }
    }
    if (!nameWithOwner) {
      const rr = spawnSync("git", ["config", "--get", "remote.origin.url"], {
        encoding: "utf-8", shell: false, timeout: 10_000, cwd: ROOT,
      });
      if (rr.status === 0) {
        const u = (rr.stdout || "").trim().replace(/\.git$/, "");
        const m = u.match(/(?:github\.com[:/])([^/]+)\/([^/]+)$/);
        if (m) nameWithOwner = `${m[1]}/${m[2]}`;
      }
    }
  }
  if (!nameWithOwner) {
    // `details` is always present (see the contract asserted in
    // test/release.test.mjs): the caller puts it in the error report as
    // `ci: ci.details`, and JSON.stringify drops undefined keys — so an
    // early return without it would silently lose the field.
    return { ok: false, reason: "(查询失败) 无法解析 GitHub 仓库 owner/repo", details: {} };
  }

  // 目标 SHA：显式传入优先，否则 HEAD
  let headSha = sha;
  if (!headSha) {
    const rv = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf-8", shell: false, timeout: 10_000, cwd: ROOT,
    });
    if (rv.status !== 0) {
      return { ok: false, reason: "(查询失败) 无法获取 HEAD SHA", details: {} };
    }
    headSha = (rv.stdout || "").trim();
  }

  // 1) combined status（传统 statuses）
  const statusRes = gh(["api", `repos/${nameWithOwner}/commits/${headSha}/status`, "--jq", ".state"]);
  const statusState = statusRes.status === 0 ? (statusRes.stdout || "").trim() : null;

  // 2) check-runs
  const checksRes = gh([
    "api", `repos/${nameWithOwner}/commits/${headSha}/check-runs`, "--jq",
    '.check_runs[] | "\(.name)|\(.status)|\(.conclusion)"',
  ]);

  let checks = [];
  let checksLookupFailed = false;
  if (checksRes.status === 0) {
    checks = (checksRes.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, status, conclusion] = l.split("|");
        return { name: name || l, status: status || "", conclusion: conclusion || "" };
      });
  } else {
    checksLookupFailed = true;
  }

  // 解析失败 → 查询失败（gh api 报 404/超时等）
  if (statusState === null && checksLookupFailed) {
    return {
      ok: false,
      reason: `(查询失败) git status 与 check-runs 均不可用；statusRes=${procFailInfo(statusRes, timeoutMs)} checksRes=${procFailInfo(checksRes, timeoutMs)}`,
      details: { nameWithOwner, headSha, statusState: null, checks: [] },
    };
  }

  // 判定：编译成统一结论
  const FAIL_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required"]);
  const failedChecks = checks.filter((c) => FAIL_CONCLUSIONS.has(c.conclusion));
  const red =
    (statusState !== null && statusState !== "success") ||
    failedChecks.length > 0;

  if (red) {
    const reasons = [];
    if (statusState !== null && statusState !== "success") {
      reasons.push(`combined status = "${statusState}"`);
    }
    if (failedChecks.length > 0) {
      reasons.push(`失败 checks: ${failedChecks.map((c) => c.name).join(", ")}`);
    }
    return {
      ok: false,
      reason: reasons.join("；") || "CI 非绿",
      details: { nameWithOwner, headSha, statusState, checks },
      failedChecks,
    };
  }

  return { ok: true, details: { nameWithOwner, headSha, statusState, checks } };
}

// ─────────────────────────── 主流程 ───────────────────────────

export function main(argv = process.argv) {
  const cfg = parseArgs(argv);
  // --help / -h 短路径（在 parseArgs 内已输出帮助文本）
  if (cfg.help) {
    return { ok: true, exitCode: 0, help: true };
  }
  // 未知参数
  if (cfg.unknownArg) {
    return { ok: false, exitCode: 2, error: `未知参数: ${cfg.unknownArg}` };
  }

  if (!fs.existsSync(PKG_PATH)) {
    eprintf(`package.json 不存在：${PKG_PATH}（请在仓库根目录运行）`);
    return { ok: false, exitCode: 2, error: "package.json 不存在" };
  }

  // P4 修复（M2）：包装 JSON.parse 防止损坏的 package.json 导致未处理异常
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
  } catch (e) {
    eprintf(`package.json 解析失败：${e.message}`);
    return { ok: false, exitCode: 2, error: `package.json 解析失败: ${e.message}` };
  }
  const oldVersion = String(pkg.version ?? "");
  if (!SEMVER_RE.test(oldVersion)) {
    eprintf(`非法 SemVer 版本号: "${oldVersion}"（要求形如 0.1.0）`);
    return { ok: false, exitCode: 2, error: `非法 SemVer: ${oldVersion}` };
  }

  const newVersion = bumpVersion(oldVersion, cfg.bump);
  // 日期取本地时区（东八区场景：UTC 的 toISOString 会差一天，导致 CHANGELOG / releases.astro 日期错位）
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const gitOk = isGitRepo(ROOT);
  const actions = [];
  const gitResults = [];
  // F2：收集全部失败子步骤，任一失败 → ok:false + exit 1
  const failures = [];

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
    if (cfg.requireCi) {
      // --require-ci dry-run：真实查询远端 CI（不写盘不发布），预览校验结果
      const ci = checkRemoteCiStatus();
      if (ci.ok) {
        actions.push("CI 校验: 远端 CI 全绿（combined status + check-runs）");
      } else {
        actions.push(`CI 校验: 拒绝发布 — ${ci.reason}`);
        failures.push(ci.reason);
      }
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
    // --require-ci 且在 git 仓库中：先校验远端 CI，红则拒绝整个发布（Issue #156 方案 B）
    if (cfg.requireCi && gitOk) {
      const ci = checkRemoteCiStatus();
      if (!ci.ok) {
        eprintf(`错误: --require-ci 校验未通过，拒绝发布 — ${ci.reason}`);
        return {
          ok: false,
          exitCode: 1,
          error: `CI 校验未通过，拒绝发布: ${ci.reason}`,
          result: { ok: false, name: "men（门）Agent 团队 版本发布", dryRun: false, oldVersion, newVersion, date, ci: ci.details },
        };
      }
      actions.push(`CI 校验: 远端 CI 全绿（${ci.details.headSha}）`);
    }

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
        const notesEsc = notesLines.join('\n');
        // F1：多行要点走 stdin，不进 argv —— spawnSync 的参数禁止含 NUL，
        // 旧实现用 \x00 拼接，≥2 条要点时直接抛 ERR_INVALID_ARG_VALUE 未捕获崩溃，
        // 崩溃点位于「已写盘」与「git add/commit/tag」之间，留下半完成发布态。
        const updateArgs = [
          updateScript,
          "--version", newVersion,
          "--date", date,
          "--theme", theme,
          "--notes-stdin",
        ];
        let updateResult;
        try {
          // MEN_ROOT 传递：子脚本（update-release-page.mjs）与自身 ROOT 语义一致
          updateResult = spawnSync("node", updateArgs, {
            cwd: ROOT, encoding: "utf-8", shell: false, timeout: 30_000,
            env: { ...process.env, MEN_ROOT: ROOT },
            input: notesEsc,
          });
        } catch (e) {
          // 兜底：spawn 调用本身抛错也不能冒泡到模块顶层
          updateResult = { status: -1, stdout: "", stderr: String(e && e.message ? e.message : e), error: e };
        }
        const updateOk = updateResult.status === 0;
        actions.push(`releases.astro 更新 ${updateOk ? "OK" : "FAIL"}`);
        if (updateOk) {
          addFiles.push("site/src/pages/docs/releases.astro");
        } else {
          eprintf(`警告: update-release-page.mjs 失败：${procFailInfo(updateResult, 30_000)}：${(updateResult.stderr || "").trim().slice(-200)}`);
          failures.push("update-release-page.mjs");
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
        runGitStep({ name, args, gitResults, failures });
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
        runGitStep({
          name, args, gitResults, failures, actions,
          note: (ok) => `git ${name} ${ok ? "OK" : "FAIL"}`,
        });
      }
    }

    // ── 可选：GitHub Release ──
    if (cfg.ghRelease && gitOk) {
      // 1. 用 release-notes.mjs 提取当前版本 notes
      const notesScript = path.join(ROOT, "scripts/release-notes.mjs");
      if (fs.existsSync(notesScript)) {
        const notesResult = spawnSync("node", [notesScript, "--output", RELEASE_NOTES_PATH], {
          cwd: ROOT, encoding: "utf-8", shell: false, timeout: 30_000,
          env: { ...process.env, MEN_ROOT: ROOT },
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
            eprintf(`警告: gh release create 失败：${procFailInfo(ghResult, 60_000)}：${(ghResult.stderr || "").trim().slice(-200)}`);
            failures.push("gh release create");
          }
          // 清理临时 notes 文件
          try { fs.unlinkSync(RELEASE_NOTES_PATH); } catch { /* 临时文件清理失败可忽略 */ }
        } else {
          eprintf(`警告: release-notes.mjs 提取失败（${procFailInfo(notesResult, 30_000)}），跳过 gh release create`);
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
        failures.push("npm publish");
      }
    }
  }

  // ── 摘要输出 ──
  // F2：汇总各子步骤 ok —— 任一失败则 ok:false + exit 1，失败项写入 --json 摘要
  const ok = failures.length === 0;
  const result = {
    ok,
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
    failures,
  };

  // 摘要行两种模式都打印：JSON 模式下单独一行（JSON.parse 前先 grep，或调用方取首行 JSON），
  // 人读模式下跟在表格之后。修复：此前「完成 ✗」只出现在人读分支，
  // --json 时失败是沉默的，调用方无法从 stdout 判断成败。
  const summary = ok ? "完成 ✓" : `完成 ✗（失败子步骤：${failures.join(", ")}）`;

  result.summary = summary;
  if (cfg.json) {
    // 摘要只进 result.summary，不额外打印一行——否则 stdout 不再是合法 JSON。
    // F2 修复目标：JSON 调用方也能看到「完成 ✗」，而非从 silence 推断成败。
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
      // F2：只有全部子步骤成功才打印「完成 ✓」
      process.stdout.write(`${summary}\n`);
    }
  }
  result.ok = ok;
  return { ok, exitCode: ok ? 0 : 1, result };
}

// 入口守卫：仅直接执行时运行 CLI，被 import 时不触发
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = main(process.argv);
  if (res && typeof res.exitCode === "number") process.exit(res.exitCode);
}
