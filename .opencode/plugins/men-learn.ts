/**
 * men-learn — 自动学习插件（渐进式第 2 步）
 *
 * 行为（OpenCode V2 · @opencode/plugin）：
 *   - 会话结束事件 → spawn scripts/learn.mjs --sid <sid> --json（L0 经验提取）
 *   - 60s 去重窗口，同一 session 不重复触发
 *   - 子进程异步执行，不阻塞会话；日志落 .agents/logs/men-plugin.log
 *   - 只读取 session transcript，不修改会话
 *
 * V2 迁移要点（对照 V1 @opencode-ai/plugin）：
 *   - `Plugin.define({ id, setup(ctx) })` 取代 V1 的 default export 函数
 *   - `ctx.event.subscribe({ signal })` 返回 AsyncIterable，取代 V1 的 `event: async ({event}) => …`
 *     取消方式：`AbortController` + 从 setup 返回 cleanup 函数调用 `controller.abort()`
 *   - 事件形状从 V1 `{ properties: { sessionID } }` 变为 `{ type, data: { sessionID } }`
 *   - 事件类型映射：
 *       V1 "session.idle"      → V2 "session.idle"（实测：`run` 一次性模式不发，仅 TUI 会话发）
 *       V1 "session.error"     → V2 "session.execution.failed"
 *       新增 "session.execution.succeeded"（一轮任务成功的可靠信号，run/TUI 均发）
 *     三者都触发，保证两种运行模式下 learn 都会跑
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Plugin } from "@opencode/plugin";

// ─────────────────────────── 常量 ───────────────────────────

const LEARN_SCRIPT = ["scripts", "learn.mjs"];
const DEDUP_MS = 60_000;

const TRIGGER_EVENTS = {
  "session.idle": "session.idle",
  "session.execution.succeeded": "session.execution.succeeded",
  "session.execution.failed": "session.execution.failed",
};

let cachedNodeBin;

/** V2 下 `process.execPath` 是 `opencode.exe`（Bun），必须显式解析 node。 */
function resolveNodeBin() {
  if (cachedNodeBin) return cachedNodeBin;
  let found = "";
  try {
    const finder = process.platform === "win32" ? "where.exe" : "which";
    const out = spawnSync(finder, ["node"], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      encoding: "utf8",
    });
    const first = (out.stdout || "").split(/\r?\n/)[0];
    if (out.status === 0 && first && first.trim()) found = first.trim();
  } catch {
    /* 回退 PATH 名 */
  }
  cachedNodeBin = found || "node";
  return cachedNodeBin;
}

export default Plugin.define({
  id: "men-learn",
  async setup(ctx) {
    const root = ctx.location.directory;

    function logToFile(msg) {
      try {
        const dir = path.join(root, ".agents", "logs");
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(
          path.join(dir, "men-plugin.log"),
          `${new Date().toISOString()} [men-learn] ${msg}\n`
        );
      } catch {
        /* best-effort */
      }
    }

    // 5. 去重窗口
    const lastTrigger = new Map();

    function triggerLearn(sid, reason) {
      const now = Date.now();
      const last = lastTrigger.get(sid) || 0;
      if (now - last < DEDUP_MS) return;
      lastTrigger.set(sid, now);

      const learnPath = path.join(root, ...LEARN_SCRIPT);
      const nodeBin = resolveNodeBin();
      const args = [learnPath, "--sid", sid || "unknown", "--json"];

      const child = spawn(nodeBin, args, { cwd: root, windowsHide: true });

      let stdout = "";
      let stderr = "";
      child.stdout && child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr && child.stderr.on("data", (d) => (stderr += d.toString()));

      child.on("error", (err) => {
        logToFile(`spawn 失败 (${reason}): ${err.message}`);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          logToFile(`learn 退出码 ${code} (${reason}): ${stderr.slice(0, 200)}`);
        }
      });
    }

    // 4. 订阅事件流（取消 = 抛入 signal）
    const controller = new AbortController();
    (async () => {
      try {
        for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
          const reason = TRIGGER_EVENTS[ev && ev.type];
          if (!reason) continue;
          triggerLearn((ev && ev.data && ev.data.sessionID) || "", reason);
        }
      } catch {
        /* 取消 / 连接断开：静默退出 */
      }
    })();

    // 3. 返回 cleanup：TUI 退出 / 插件热重载时中止订阅
    return () => controller.abort();
  },
});
