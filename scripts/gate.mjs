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

import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { existsSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ─── 常量 ────────────────────────────────────────────────────────

const GATE_KEYWORDS = new Set(["typecheck", "test", "lint"]);
const MAX_REINFORCEMENTS = 5;
// P1 修复（H3a + L4）：统一 60s 超时导致测试套件超时被误报为失败。
// 与 verify.mjs 一致：test 放宽至 300s，其他保持 60s。
const TEST_TIMEOUT_MS = 300_000;
const OTHER_TIMEOUT_MS = 60_000;

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
  2 = 用法错误（缺关键字 / 关键字不在白名单）
  3 = 未捕获异常
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
    const base = join(STATE_ROOT, ".agents", "state", "sessions");
    const dir = join(base, sid);
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      eventId: crypto.randomUUID(),
      type,
      ts: new Date().toISOString(),
      subject,
      sid,
      detail,
      payload,
    });
    const path = join(dir, "events.jsonl");
    // P1 修复（H1）：使用 appendFileSync 原子追加，避免 read-then-write 竞态条件
    appendFileSync(path, line + "\n");
  } catch {
    // 静默失败
  }
}

// ─── 状态文件 ───────────────────────────────────────────────────

// 状态路径按**脚本所在项目**解析，而非相对 cwd。
// 此前 appendEvent / statePath 都用相对路径（由 fs 按 cwd 解析），于是
// `cd site && node ../scripts/gate.mjs test` 会另写一份日志、并另建一份
// gate-<kw>.json —— 强化次数上限 5 因而被绕开（换目录即重置）。
// 与 verify.mjs / event.mjs 一致，改用 import.meta.url。
const STATE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 状态文件路径：.agents/state/gates/gate-<keyword>.json
 */
function statePath(keyword) {
  return join(STATE_ROOT, ".agents", "state", "gates", `gate-${keyword}.json`);
}

async function readState(keyword) {
  const path = statePath(keyword);
  if (!existsSync(path)) return { reinforcementCount: 0, lastResult: null };
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    // F14：形状校验——合法但形状不符（如 {}）的状态不得让上限检查 fail-open。
    if (parsed && typeof parsed === "object" && Number.isFinite(parsed.reinforcementCount)) {
      return { reinforcementCount: parsed.reinforcementCount, lastResult: parsed.lastResult ?? null };
    }
    return { reinforcementCount: 0, lastResult: null };
  } catch {
    return { reinforcementCount: 0, lastResult: null };
  }
}

async function writeState(keyword, state) {
  const path = statePath(keyword);
  const dir = dirname(path);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  // F14：tmp + rename 原子写，进程被杀不再留下截断/空状态文件。
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, path);
}

// F6：强化计数的读-改-写临界区锁。
// 此前 read（spawnSync 前300s）与 write（spawnSync 后）隔着整个执行窗口，
// 并发 gate 进程互相覆盖计数 → 上限被系统性低估。
// mkdir 在所有平台都是原子操作，用作互斥锁；带 stale 检测（持锁进程被杀）与超时降级。
const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 3_000;

async function withStateLock(keyword, fn) {
  const lockDir = `${statePath(keyword)}.lock`;
  const start = Date.now();
  for (;;) {
    try {
      await mkdir(lockDir); // 非递归：已存在则抛 EEXIST
      break;
    } catch (e) {
      if (e.code !== "EEXIST") break; // 其他错误：放弃锁竞争，继续（best-effort，不阻塞门禁）
      try {
        const st = await stat(lockDir);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          await rm(lockDir, { recursive: true, force: true });
          continue; // stale 锁：抢占后重试
        }
      } catch {
        continue;
      }
      if (Date.now() - start > LOCK_WAIT_MS) break; // 超时：无锁执行，宁可继续也不死锁
      await new Promise((r) => setTimeout(r, 20 + Math.floor(Math.random() * 30)));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 在锁内完成「重读 → 自增/重置 → 原子写」。
 * 必须在 spawnSync 之后调用：以最新状态为基准，窗口从 300s 缩到毫秒级且互斥。
 */
async function updateReinforcement(keyword, mutate) {
  return withStateLock(keyword, async () => {
    const state = await readState(keyword);
    mutate(state);
    await writeState(keyword, state);
    return state;
  });
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
    // F13：用法错误归 2（与「关键字不在白名单」同类），1 保留给「检查失败」。
    process.exit(2);
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

  // P1 修复（H3b）：移除 unsafeChars 检查。
  // keyword 已通过 GATE_KEYWORDS 白名单过滤，scriptText 仅用于 npm run <keyword>（keyword 是参数），
  // 不存在注入向量。此前的检查误杀了合法的 && / ; / | 等 npm 脚本语法。
  // Windows 上必须走 `cmd /c`：直接 spawn npm.cmd 且 shell:false 会 EINVAL，
  // spawn npm 则 ENOENT（npm 只是 .cmd shim）。与 verify.mjs / install.mjs 同一写法。
  const isWin = process.platform === "win32";
  // P1 修复（H3a）：test 使用 300s 超时，其他保持 60s
  const timeoutMs = keyword === "test" ? TEST_TIMEOUT_MS : OTHER_TIMEOUT_MS;
  const npmCmd = isWin ? "cmd" : "npm";
  const npmArgs = isWin ? ["/c", "npm", "run", keyword] : ["run", keyword];
  const result = spawnSync(npmCmd, npmArgs, {
    cwd: dir,
    encoding: "utf-8",
    shell: false,
    timeout: timeoutMs,
  });
  // ── 6. 判定 ──
  const passed = result.status === 0 && !result.error;
  // 超时判定（Node 实测）：spawnSync 超时表现为 status=null、signal='SIGTERM'、
  // error.code='ETIMEDOUT'。三者任一即可判定，两个条件并写以兼容不同平台表现。
  const timedOut = result.status === null && (result.signal === "SIGTERM" || result.error?.code === "ETIMEDOUT");

  if (timedOut) {
    const timeoutSec = Math.round(timeoutMs / 1000);
    console.error(`GATE_FAILED: ${keyword} 超时（${timeoutSec} 秒），已 SIGKILL`);
    // F6：锁内重读再自增，避免跨 spawnSync 窗口的并发丢计数。
    await updateReinforcement(keyword, (s) => {
      s.reinforcementCount = s.reinforcementCount + 1;
      s.lastResult = "failed-timeout";
    });
    await appendEvent(
      sessionId,
      "gate.failed",
      `gate.${keyword}`,
      `超时（${timeoutSec} 秒），已 SIGKILL`,
      { keyword, status: null, signal: "SIGTERM", stdout: result.stdout, stderr: result.stderr }
    );
    process.exit(1);
  }

  if (!passed) {
    const reason = result.error ? result.error.message : `退出码 ${result.status}`;
    console.error(`GATE_FAILED: ${keyword} — ${reason}`);
    if (result.stdout) console.error(`[stdout]\n${result.stdout}`);
    if (result.stderr) console.error(`[stderr]\n${result.stderr}`);

    // F6：锁内重读再自增。
    await updateReinforcement(keyword, (s) => {
      s.reinforcementCount = s.reinforcementCount + 1;
      s.lastResult = "failed";
    });
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
  // F6：锁内重读再重置。
  await updateReinforcement(keyword, (s) => {
    s.reinforcementCount = 0;
    s.lastResult = "passed";
  });
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
