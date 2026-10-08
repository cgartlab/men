#!/usr/bin/env node
/**
 * skillhub-publish.mjs — SkillHub CLI 发布封装
 *
 * 纯 Node（零第三方依赖），Windows pwsh 友好。
 *
 * 用法：
 *   node scripts/skillhub-publish.mjs <skill-dir> [选项]
 *
 * 选项：
 *   --changelog <text>   发布说明；默认读取 CHANGELOG.md 最新正式版本标题
 *   --dry-run            只执行 CLI 本地预检，不真正发布
 *   --json               输出 JSON 摘要
 *   --host <url>         SkillHub API host；作为 --host 参数传给 CLI（默认 https://api.skillhub.cn）
 *   --token <skh_...>    API token；默认读取 SKILLHUB_TOKEN / SKILLHUB_API_KEY
 *   --cli <path>         skillhub CLI 路径；默认使用 PATH 中的 skillhub
 *
 * 流程：
 *   1. 校验 SKILL.md frontmatter 必需字段
 *   2. token 注入子进程环境变量 SKILLHUB_TOKEN（--token 或 SKILLHUB_TOKEN / SKILLHUB_API_KEY），
 *      host 同时注入环境变量 SKILLHUB_HOST 与 argv --host（两者取值一致）
 *   3. 调用 skillhub publish <skill-dir> --host <url> [--dry-run] --changelog ...
 *
 * 依据：SkillHub 官方规范 https://skillhub.cn/ai/release.md ——
 *   `skillhub login --key <token> --host <url>` / `skillhub publish --host <url> [--dry-run]`，
 *   即 publish 支持 --host；token 走 SKILLHUB_TOKEN 环境变量是本仓库
 *   .github/workflows/skillhub-publish.yml 的既定约定（CI 不做 login，凭 env 认证）。
 * 注意：token 值只进子进程 env，绝不进 argv、不回显到 --json 摘要。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const DEFAULT_HOST = "https://api.skillhub.cn";
const DEFAULT_CLI = "skillhub";
const REQUIRED_FRONTMATTER = ["slug", "displayName", "version", "summary", "license"];
const CHANGELOG_VERSION_RE = /^## \[v?(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/m;
export const CLI_VERSION = "0.6.1";

export function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — SkillHub 发布器

用法:
  node scripts/skillhub-publish.mjs <skill-dir> [选项]

选项:
  --changelog <text>   发布说明；默认读取 CHANGELOG.md 最新正式版本标题
  --dry-run            只执行 skillhub publish --dry-run，不真正发布
  --json               输出 JSON 摘要
  --host <url>         SkillHub API host；作为 --host 参数传给 CLI（默认 ${DEFAULT_HOST}）
  --token <skh_...>    API token；默认读取 SKILLHUB_TOKEN / SKILLHUB_API_KEY
  --cli <path>         skillhub CLI 路径；默认使用 PATH 中的 skillhub
  --help, -h           显示本帮助
   --version, -v        显示版本号

前置条件:
  SKILL.md frontmatter 必须包含 slug/displayName/version/summary/license。
  API token 不得写入仓库，建议使用 GitHub Actions secret: SKILLHUB_API_KEY。
`);
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    skillDir: null,
    changelog: null,
    dryRun: false,
    json: false,
    host: DEFAULT_HOST,
    token: process.env.SKILLHUB_TOKEN || process.env.SKILLHUB_API_KEY || "",
    // token 来源（用于 result 标注；token 值本身绝不进摘要）
    tokenSource: process.env.SKILLHUB_TOKEN
      ? "env:SKILLHUB_TOKEN"
      : process.env.SKILLHUB_API_KEY
        ? "env:SKILLHUB_API_KEY"
        : "",
    cli: DEFAULT_CLI,
    help: false,
    version: false,
    unknownArg: null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--changelog") out.changelog = args[++i] || null;
    else if (a === "--host") out.host = args[++i] || DEFAULT_HOST;
    else if (a === "--token") {
      out.token = args[++i] || "";
      out.tokenSource = out.token ? "flag:--token" : "";
    }
    else if (a === "--cli") out.cli = args[++i] || DEFAULT_CLI;
    else if (!out.skillDir) out.skillDir = a;
    else out.unknownArg = a;
  }
  return out;
}

export function parseFrontmatter(text) {
  const match = text.match(/^\uFEFF?\n?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { ok: false, errors: ["SKILL.md 缺少 YAML frontmatter"] };

  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    values[m[1]] = value;
  }

  const errors = [];
  for (const field of REQUIRED_FRONTMATTER) {
    if (!values[field]) errors.push(`缺少 frontmatter 字段: ${field}`);
  }
  if (!values.version || !/^\d+\.\d+\.\d+$/.test(values.version)) {
    errors.push("version 必须形如 x.y.z");
  }
  return { ok: errors.length === 0, values, errors };
}

export function readDefaultChangelog(version) {
  const changelogPath = path.join(ROOT, "CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) return `SkillHub publish ${version}`;
  const text = fs.readFileSync(changelogPath, "utf-8");
  const m = text.match(CHANGELOG_VERSION_RE);
  return m ? `SkillHub publish ${m[1]} - ${m[2]}` : `SkillHub publish ${version}`;
}

/**
 * 构造子进程 env：token/host 显式注入（F4/F6）。
 * token 值只进 env，不进 argv；host 与 --host 参数取值一致。
 */
export function buildChildEnv(cfg) {
  const env = { ...process.env };
  if (cfg.token) env.SKILLHUB_TOKEN = cfg.token;
  env.SKILLHUB_HOST = cfg.host;
  return env;
}

/**
 * 实际 argv 形态（F5）：Windows 下 npm 全局安装的 skillhub 落地为 skillhub.cmd shim，
 * shell:false 下 libuv 不解析 .cmd → 直接 spawn 返回 ENOENT；与 install.mjs runShim
 * 同一范式：win32 走 `cmd /c <cli> ...`，POSIX 直接 spawn。
 */
function cliInvocation(cfg, args) {
  const win = process.platform === "win32";
  return { bin: win ? "cmd" : cfg.cli, argv: win ? ["/c", cfg.cli, ...args] : args };
}

/** argv → 可读命令行（仅用于摘要展示；含空格的参数加引号） */
function formatCmd(bin, argv) {
  return [bin, ...argv].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
}

function runCli(cfg, args, env, timeoutMs = 120_000) {
  const { bin, argv } = cliInvocation(cfg, args);
  return spawnSync(bin, argv, {
    cwd: ROOT,
    encoding: "utf-8",
    shell: false,
    timeout: timeoutMs,
    env,
  });
}

function stepResult(name, r, extra = {}) {
  return {
    name,
    ok: r.status === 0,
    exitCode: r.status ?? -1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
    timedOut: Boolean(r.error && r.error.code === "ETIMEDOUT"),
    ...extra,
  };
}

export function main(argv = process.argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return { ok: true, exitCode: 0, help: true };
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${CLI_VERSION}\n`);
    return { ok: true, exitCode: 0, version: true };
  }

  const cfg = parseArgs(argv);
  if (cfg.unknownArg) {
    process.stderr.write(`未知参数: ${cfg.unknownArg}\n`);
    return { ok: false, exitCode: 2, error: `未知参数: ${cfg.unknownArg}` };
  }
  if (!cfg.skillDir) {
    process.stderr.write("缺少 skill 目录参数\n");
    printHelp();
    return { ok: false, exitCode: 2, error: "缺少 skill 目录" };
  }

  const skillDir = path.isAbsolute(cfg.skillDir)
    ? path.resolve(cfg.skillDir)
    : path.resolve(ROOT, cfg.skillDir);
  const skillMd = path.join(skillDir, "SKILL.md");
  const steps = [];

  if (!fs.existsSync(skillMd)) {
    const error = `SKILL.md 不存在: ${skillMd}`;
    process.stderr.write(`${error}\n`);
    return { ok: false, exitCode: 2, error };
  }

  const frontmatter = parseFrontmatter(fs.readFileSync(skillMd, "utf-8"));
  if (!frontmatter.ok) {
    const error = frontmatter.errors.join("; ");
    process.stderr.write(`${error}\n`);
    return {
      ok: false,
      exitCode: 2,
      error,
      skill: { dir: skillDir, frontmatter: frontmatter.values },
    };
  }

  const changelog = cfg.changelog || readDefaultChangelog(frontmatter.values.version);

  if (!cfg.dryRun && !cfg.token) {
    const error = "正式发布需要 API token：设置 SKILLHUB_TOKEN / SKILLHUB_API_KEY，或使用 --token；dry-run 不需要 token";
    process.stderr.write(`${error}\n`);
    return { ok: false, exitCode: 2, error };
  }

  const publishArgs = [
    "publish",
    skillDir,
    "--host",
    cfg.host,
    "--changelog",
    changelog,
  ];
  if (cfg.dryRun) publishArgs.push("--dry-run");

  const env = buildChildEnv(cfg);
  const invocation = cliInvocation(cfg, publishArgs);
  const publish = runCli(cfg, publishArgs, env);
  // 摘要里展示真实命令行与注入的 env（token 只标 <set>，绝不回显值）
  const envShown = { SKILLHUB_HOST: cfg.host };
  if (cfg.token) envShown.SKILLHUB_TOKEN = "<set>";
  steps.push(stepResult("publish", publish, {
    command: formatCmd(invocation.bin, invocation.argv),
    env: envShown,
  }));

  const ok = steps.every((s) => s.ok);
  const result = {
    ok,
    name: "men（门）Agent 团队 SkillHub 发布",
    dryRun: cfg.dryRun,
    skill: {
      dir: path.relative(ROOT, skillDir) || skillDir,
      slug: frontmatter.values.slug,
      displayName: frontmatter.values.displayName,
      version: frontmatter.values.version,
    },
    changelog,
    host: cfg.host,
    // token 来源标注（F4）：provided/source/via，不含 token 值
    token: cfg.token
      ? { provided: true, source: cfg.tokenSource || "unknown", via: "env:SKILLHUB_TOKEN" }
      : { provided: false, source: null, via: null },
    steps,
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`SkillHub publish${cfg.dryRun ? " dry-run" : ""}: ${frontmatter.values.slug}@${frontmatter.values.version}\n`);
    for (const step of steps) {
      process.stdout.write(`${step.ok ? "PASS" : "FAIL"} ${step.name} exit=${step.exitCode}\n`);
      if (step.command) process.stdout.write(`  cmd: ${step.command}\n`);
      if (step.env) process.stdout.write(`  env: ${JSON.stringify(step.env)}\n`);
      if (step.stdout) process.stdout.write(`  stdout: ${step.stdout}\n`);
      if (!step.ok && step.stderr) process.stdout.write(`  stderr: ${step.stderr}\n`);
    }
  }

  return { ok, exitCode: ok ? 0 : 1, result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = main(process.argv);
  if (res && typeof res.exitCode === "number") process.exit(res.exitCode);
}
