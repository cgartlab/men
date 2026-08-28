/**
 * men-learn — 学习自动化插件（非阻塞 best-effort）
 *
 * 监听会话事件，在合适时机自动触发学习回路：
 *   - `session.idle`：会话空闲（一轮任务结束）→ 自动运行
 *       `node scripts/learn.mjs --sid <sid> --json`
 *     从 events.jsonl 提取经验（errors/ + knowledge/patterns/）。
 *   - `session.error`：会话出错 → 也触发一次（记录运行时错误经验）。
 *
 * 非阻塞约定：
 *   - spawn 子进程后立即返回，绝不 await 阻塞主流程
 *   - 失败仅 console 提示，绝不 throw
 *   - 同会话去重：两次触发间隔 < DEDUP_MS 则跳过，避免每空闲一次就跑一次
 *
 * 与手动路径互补：/ultrawork 第 10 步仍保留 men 显式调用 learn.mjs，
 * 本插件在空闲时自动兜底，二者由 learn.mjs 内部 best-effort 去重。
 *
 * 运行环境：OpenCode 插件（Bun 运行，无需构建），类型来自 @opencode-ai/plugin。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type Plugin } from "@opencode-ai/plugin";

// ─────────────────────────── 常量 ───────────────────────────

// learn.mjs 相对项目根的路径
const LEARN_SCRIPT = ["scripts", "learn.mjs"];

// 同会话两次学习触发的最小间隔（毫秒）：session.idle 在每轮对话结束后都会触发，
// 阈值内跳过避免频繁跑 learn.mjs（其内部再对同一事件源做规则判定）
const DEDUP_MS = 60_000;

// 监听的会话事件 → 触发原因
const TRIGGER_EVENTS: Record<string, string> = {
  "session.idle": "session.idle",
  "session.error": "session.error",
};

// ─────────────────────────── 工具函数 ───────────────────────────

/**
 * 从事件对象中提取 sessionID（多字段容错）。
 * OpenCode 事件结构：{ type, properties: { sessionID, ... } }；
 * 部分旧版/变体事件可能把 sessionID 放在顶层，统一兜底。
 */
function extractSessionID(event: any): string {
  if (!event || typeof event !== "object") return "";
  const props = event.properties ?? {};
  const sid =
    props?.sessionID ?? props?.sessionId ?? event?.sessionID ?? event?.sessionId;
  return typeof sid === "string" && sid.length > 0 ? sid : "";
}

// ─────────────────────────── 插件主体 ───────────────────────────

const plugin: Plugin = async (input) => {
  const root = input.directory || process.cwd();

  // 安全日志：写入项目 .agents/logs/men-plugin.log，绝不写 stdout/stderr
  // （插件的 console 输出会被 OpenCode TUI 捕获并污染输入框，见 UI 事故）。
  function logToFile(msg: string) {
    try {
      const dir = path.join(root, ".agents", "logs");
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(
        path.join(dir, "men-plugin.log"),
        `${new Date().toISOString()} [men-learn] ${msg}\n`
      );
    } catch {
      /* best-effort，绝不阻塞主流程 */
    }
  }

  // 去重状态：sessionID → 上次触发时间戳（进程内有效）
  const lastTrigger = new Map<string, number>();

  /**
   * 触发一次 learn.mjs（非阻塞 spawn，best-effort）。
   * 去重：同会话 DEDUP_MS 内已触发则跳过；失败仅日志，绝不 throw。
   */
  function triggerLearn(sid: string, reason: string) {
    const now = Date.now();
    const prev = lastTrigger.get(sid) ?? 0;
    if (now - prev < DEDUP_MS) {
      logToFile(`skip（${DEDUP_MS / 1000}s 内已触发）sid=${sid || "unknown"} reason=${reason}`);
      return;
    }
    lastTrigger.set(sid, now);

    const learnPath = path.join(root, ...LEARN_SCRIPT);
    const args = [learnPath, "--sid", sid || "unknown", "--json"];

    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
    });

    // 消费 stdout，防止子进程输出积压阻塞
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});
    child.on("error", (err) => {
      // spawn 失败：仅日志，不中断
      logToFile(`spawn 失败: ${err.message}`);
    });
    child.on("close", (code) => {
      logToFile(`learn.mjs 完成 sid=${sid || "unknown"} reason=${reason} exit=${code}`);
    });
  }

  return {
    /**
     * event — 监听会话事件自动触发学习。
     * 绝不 throw：所有错误路径都吞掉，只留日志。
     */
    event: async ({ event }: any) => {
      if (!event || typeof event.type !== "string") return;
      const reason = TRIGGER_EVENTS[event.type];
      if (!reason) return;
      const sid = extractSessionID(event);
      triggerLearn(sid, reason);
    },
  };
};

export default plugin;