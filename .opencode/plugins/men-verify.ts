/**
 * men-verify — 产物机械验证自动插件（渐进式第 1 步：非阻塞）
 *
 * 行为（OpenCode V2 · @opencode/plugin）：
 *   - 监听 write / edit 工具执行完成
 *   - 目标路径限定 docs/、knowledge/、output/ 三个产物目录
 *   - spawn scripts/verify.mjs --json，仅记录结果，不中断、不改写 output
 *   - 日志统一落 .agents/logs/men-plugin.log
 *   - 非阻塞：绝不抛错、绝不 await 子进程、绝不修改 tool output
 *
 * V2 迁移要点（对照 V1 @opencode-ai/plugin）：
 *   - `export default Plugin.define({ id, setup(ctx) })` 取代 `export default async (input) => ({...})`
 *   - `ctx.tool.hook("execute.after", (event) => …)` 取代 V1 的 `"tool.execute.after": (toolInput, toolOutput) => …`
 *     event = { tool, sessionID, agent, messageID, id, input }
 *              + ({ status: "completed", result } | { status: "error", error })
 *   - `event.input` 即 V1 的 `toolInput.args`；write 工具实测键为 `path` / `content`
 *   - `event.result` 即 V1 的 `toolOutput`（`{ output, content, metadata? }`）
 *   - `ctx.location.directory` 取代 `input.directory`
 *   - ⚠️ V2 以 Bun 二进制加载插件，`process.execPath` 是 `opencode.exe` 而非 `node`；
 *     verify.mjs 是纯 Node ESM，必须显式解析 node（见 resolveNodeBin）
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Plugin } from "@opencode/plugin";

// ─────────────────────────── 常量 ───────────────────────────

const PRODUCT_PREFIXES = [
  "docs" + path.sep,
  "knowledge" + path.sep,
  "output" + path.sep,
];

const WATCH_TOOLS = new Set(["write", "edit"]);

const VERIFY_SCRIPT = ["scripts", "verify.mjs"];

// ─────────────────────────── 路径判定 ───────────────────────────

function isProductPath(relPath) {
  const rel = relPath.replace(/\\/g, "/");
  return PRODUCT_PREFIXES.some((prefix) =>
    rel.startsWith(prefix.replace(/\\/g, "/"))
  );
}

// ─────────────────────────── node 解析 ───────────────────────────

let cachedNodeBin;

/**
 * 解析可用于运行 verify.mjs 的 Node 可执行文件。
 *
 * V2 插件运行在 OpenCode 的 Bun 运行时内，`process.execPath` 指向 `opencode.exe`，
 * 直接拿它 spawn 会退化成 `opencode.exe scripts/verify.mjs`。verify.mjs 零依赖、
 * 纯 Node ESM，必须用 node 运行。解析失败时回退 PATH 名 "node"。
 */
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

// ─────────────────────────── 日志 ───────────────────────────

function reportHasFail(jsonText) {
  try {
    const report = JSON.parse(jsonText);
    return typeof report?.summary?.failed === "number" && report.summary.failed > 0;
  } catch {
    return false;
  }
}

export default Plugin.define({
  id: "men-verify",
  async setup(ctx) {
    const root = ctx.location.directory;

    function logToFile(msg) {
      try {
        const dir = path.join(root, ".agents", "logs");
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(
          path.join(dir, "men-plugin.log"),
          `${new Date().toISOString()} [men-verify] ${msg}\n`
        );
      } catch {
        /* best-effort，绝不阻塞主流程 */
      }
    }

    await ctx.tool.hook("execute.after", (event) => {
      // 1. 只关注 write/edit
      if (!WATCH_TOOLS.has(event.tool)) return;

      // 2. 解析目标路径：优先 input.path（V2 write/edit 实测键），兼容其它常见键名
      const input = event.input || {};
      const result = event.status === "completed" ? event.result : undefined;
      const metadata = result && result.metadata;
      // 注意：?? 不能与 && 混用（JS 语法禁止，Bun 解析器报 "Unexpected &&"），必须加括号
      const filePath =
        input.path ??
        input.filePath ??
        input.file_path ??
        (metadata && metadata.path) ??
        (metadata && metadata.filePath);
      if (!filePath) return;

      // 3. 限定产物目录
      const abs = path.resolve(root, filePath);
      const rel = path.relative(root, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return;
      if (!isProductPath(rel)) return;

      const target = rel;
      const verifyPath = path.join(root, ...VERIFY_SCRIPT);
      const nodeBin = resolveNodeBin();
      const args = [verifyPath, target, "--json", "--sid", `men-verify-${Date.now()}`];

      // 4. 异步 spawn，不阻塞、不改写 output
      const child = spawn(nodeBin, args, { cwd: root, windowsHide: true });

      let stdout = "";
      child.stdout &&
        child.stdout.on("data", (d) => {
          stdout += d.toString();
        });

      child.on("error", (err) => {
        logToFile(`spawn 失败: ${err.message}`);
      });

      child.on("close", (code) => {
        const failed = code !== 0 || reportHasFail(stdout);
        if (failed) {
          logToFile(`${target} 未通过机械检查（exit=${code}）`);
        } else {
          logToFile(`${target} 机械检查通过（exit=${code}）`);
        }
      });
    });
  },
});
