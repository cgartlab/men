#!/usr/bin/env node
/**
 * gate.mjs — Stop-hook 门禁脚本
 *
 * 任务收工前必须通过白名单内的机械检查，否则不允许"完成"。
 * 只执行 package.json 里开发者定义的对应脚本，杜绝任意命令注入；
 * 强化次数上限防止死循环。
 *
 * 用法：
 *   node scripts/gate.mjs <gate关键字> [--dir <工作目录>] [--sid <session-id>] [--force]
 *
 * 允许的 gate 关键字：typecheck / test / lint
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

// ─── 常量 ────────────────────────────────────────────────────────

const GATE_KEYWORDS = new Set(["typecheck", "test", "lint"]);
const MAX_REINFORCEMENTS = 5;
const SCRIPT_TIMEOUT_MS = 60_000;

const USAGE_TEXT = `用法: node scripts/gate.mjs <keyword> [--dir <dir>] [--sid <sid>] [--force]

keyword 白名单: typecheck / test / lint

说明:
  执行 package.json 中对应的 npm 脚本（typecheck/test/lint），
  退出码 0 = 通过。强化次数上限 ${MAX_REINFORCEMENTS} 次，超过后允许收工。

可选参数:
  --dir <dir>   指定 package.json 所在工作目录（默认当前目录）
  --sid <sid>   指定 session id（用于事件日志）
  --force       忽略强化次数上限，强制执行

退出码:
  0 = 通过 / 跳过 / 强化耗尽
  1 = 检查失败
  2 = 关键字不在白名单
`;

// ─── 参数解析 ───────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { keyword: null, dir: process.cwd(), sid: null, force: false };
  const rest = argv.slice(2);
  let i = 0;
  while (i < rest.length) {
    const v = rest[i];
    if (v === "--dir") {
      args.dir = rest[++i];
    } else if (v === "--sid") {
      args.sid = rest[++i];
    } else if (v === "--force") {
      args.force = true;
    } else if (v === "--help" || v === "-h") {
      args.help = true;
    } else if (!v.startsWith("--") && !args.keyword) {
      args.keyword = v;
    }
    i++;
  }
  return args;
}

// ─── 事件日志 ───────────────────────────────────────────────────

/**
 * 向 .agents/state/sessions/<sid>/events.jsonl 追加一行 JSONL。
 * best-effort，失败时静默。
 */
async function appendEvent(sid, type, subject, detail, payload) {
  try {
    const base = ".agents/state/sessions";
    const dir = join(base, sid);
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      type,
      ts: new Date().toISOString(),
      subject,
      sid,
      detail,
      payload,
    });
    const path = join(dir, "events.jsonl");
    const data = existsSync(path) ? (await readFile(path)) + "\n" : "";
    await writeFile(path, data + line);
  } catch {
    // 静默失败
  }
}

// ─── 状态文件 ───────────────────────────────────────────────────

/**
 * 状态文件路径：.agents/state/gates/gate-<keyword>.json
 */
function statePath(keyword) {
  return join(".agents/state/gates", `gate-${keyword}.json`);
}

async function readState(keyword) {
  const path = statePath(keyword);
  if (!existsSync(path)) return { reinforcementCount: 0, lastResult: null };
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { reinforcementCount: 0, lastResult: null };
  }
}

async function writeState(keyword, state) {
  const path = statePath(keyword);
  const dir = dirname(path);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2));
}

// ─── 主逻辑 ─────────────────────────────────────────────────────

async function main() {
  const { keyword, dir, sid, force, help } = parseArgs(process.argv);

  // --help / -h 短路径
  if (help) {
    console.log(USAGE_TEXT);
    process.exit(0);
  }

  // 默认 sid
  const sessionId = sid || `gate-${Date.now()}`;

  // ── 1. 白名单校验 ──
  if (!keyword) {
    console.error("用法：node scripts/gate.mjs <gate关键字> [--dir <dir>] [--sid <sid>] [--force]");
    process.exit(1);
  }
  if (!GATE_KEYWORDS.has(keyword)) {
    console.error(`GATE_REJECTED: ${keyword}（gate 关键字不在白名单）`);
    process.exit(2);
  }

  // ── 2. 读取状态 ──
  const state = await readState(keyword);

  // ── 3. 强化上限检查 ──
  if (!force && state.reinforcementCount >= MAX_REINFORCEMENTS) {
    console.error(
      `GATE_EXHAUSTED：停止强化（已达上限 ${MAX_REINFORCEMENTS}），允许收工。`
    );
    await appendEvent(
      sessionId,
      "gate.failed",
      `gate.${keyword}`,
      `GATE_EXHAUSTED: 强化次数 ${state.reinforcementCount} >= ${MAX_REINFORCEMENTS}`,
      { keyword, reinforcementCount: state.reinforcementCount }
    );
    process.exit(0);
  }

  // ── 4. 读取 package.json ──
  const pkgPath = join(dir, "package.json");
  let scriptText;
  if (!existsSync(pkgPath)) {
    console.error(`GATE_SKIP: ${keyword} 未配置（package.json 不存在于 ${dir}）`);
    await appendEvent(sessionId, "gate.passed", `gate.${keyword}`, "SKIP: package.json 不存在", {
      keyword,
      reason: "no-package.json",
    });
    // 重置强化计数
    await writeState(keyword, { reinforcementCount: 0, lastResult: "passed" });
    process.exit(0);
  }

  try {
    const pkgRaw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw);
    scriptText = pkg.scripts?.[keyword];
  } catch (e) {
    console.error(`GATE_SKIP: ${keyword} 未配置（package.json 解析失败: ${e.message}）`);
    await appendEvent(sessionId, "gate.passed", `gate.${keyword}`, `SKIP: package.json 解析失败`, {
      keyword,
      reason: "parse-error",
    });
    await writeState(keyword, { reinforcementCount: 0, lastResult: "passed" });
    process.exit(0);
  }

  if (!scriptText) {
    console.error(`GATE_SKIP: ${keyword} 未配置（package.json scripts.${keyword} 不存在）`);
    await appendEvent(sessionId, "gate.passed", `gate.${keyword}`, `SKIP: scripts.${keyword} 不存在`, {
      keyword,
      reason: "no-script",
    });
    await writeState(keyword, { reinforcementCount: 0, lastResult: "passed" });
    process.exit(0);
  }

  // ── 5. 执行（无 shell argv，Windows 用 cmd /c） ──
  const isWin = process.platform === "win32";
  const result = spawnSync(
    isWin ? "cmd" : "sh",
    isWin ? ["/c", scriptText] : ["-c", scriptText],
    {
      cwd: dir,
      encoding: "utf-8",
      timeout: SCRIPT_TIMEOUT_MS,
    }
  );

  // ── 6. 判定 ──
  const passed = result.status === 0 && !result.error;
  const timedOut = result.status === null && result.signal === "SIGTERM";

  if (timedOut) {
    console.error(`GATE_FAILED: ${keyword} 超时（60 秒），已 SIGKILL`);
    state.reinforcementCount = state.reinforcementCount + 1;
    state.lastResult = "failed-timeout";
    await writeState(keyword, state);
    await appendEvent(
      sessionId,
      "gate.failed",
      `gate.${keyword}`,
      `超时（60 秒），已 SIGKILL`,
      { keyword, status: null, signal: "SIGTERM", stdout: result.stdout, stderr: result.stderr }
    );
    process.exit(1);
  }

  if (!passed) {
    const reason = result.error ? result.error.message : `退出码 ${result.status}`;
    console.error(`GATE_FAILED: ${keyword} — ${reason}`);
    if (result.stdout) console.error(`[stdout]\n${result.stdout}`);
    if (result.stderr) console.error(`[stderr]\n${result.stderr}`);

    state.reinforcementCount = state.reinforcementCount + 1;
    state.lastResult = "failed";
    await writeState(keyword, state);
    await appendEvent(
      sessionId,
      "gate.failed",
      `gate.${keyword}`,
      `${reason}`,
      { keyword, status: result.status, stdout: result.stdout, stderr: result.stderr }
    );
    process.exit(1);
  }

  // ── 7. 通过 ──
  console.error(`GATE_PASSED: ${keyword} ✓`);
  state.reinforcementCount = 0;
  state.lastResult = "passed";
  await writeState(keyword, state);
  await appendEvent(
    sessionId,
    "gate.passed",
    `gate.${keyword}`,
    `${keyword} 通过`,
    { keyword, stdout: result.stdout, stderr: result.stderr }
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("gate.mjs 异常:", err.message);
  process.exit(3);
});
