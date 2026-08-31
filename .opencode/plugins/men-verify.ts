/**
 * men-verify — 产物机械验证自动插件（渐进式第 1 步：非阻塞）
 *
 * 在 `write` / `edit` 工具写完产物后，若目标路径指向本项目产物目录
 * （docs/、knowledge/、output/ 等），后台 spawn 运行
 *   `node scripts/verify.mjs <目标> --json`
 * 做机械检查（产物存在性 / 密钥扫描 / TODO / 结构 / gate 退出码）。
 *
 * 非阻塞约定：
 *   - 检查结果只作为提示（写 .agents/logs/men-plugin.log 日志）
 *   - 绝不 throw、绝不中断 tool 执行、绝不 await 阻塞写回
 *   - 命中 FAIL 时仅提示「建议运行 /verify」，不阻止写入
 *
 * 递归安全：verify.mjs 是独立脚本（不经过插件 Hook），不会再次触发本插件。
 *
 * 运行环境：OpenCode 插件（Bun 运行，无需构建），类型来自 @opencode-ai/plugin。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type Plugin } from "@opencode-ai/plugin";

// ─────────────────────────── 常量 ───────────────────────────

// 产物目录识别：命中这些相对前缀的写入路径才触发机械检查
// （相对项目根解析；全部前缀须带尾部分隔符，避免误匹配如 `documentation/`）
const PRODUCT_PREFIXES = [
  "docs" + path.sep,
  "knowledge" + path.sep,
  "output" + path.sep,
];

// 触发机械检查的工具
const WATCH_TOOLS = new Set(["write", "edit"]);

// verify.mjs 相对项目根的路径
const VERIFY_SCRIPT = ["scripts", "verify.mjs"];

// ─────────────────────────── 工具函数 ───────────────────────────

/** 判断一个相对路径是否属于产物目录（docs/、knowledge/、output/）。 */
function isProductPath(relPath: string): boolean {
  const rel = relPath.replace(/\\/g, "/");
  return PRODUCT_PREFIXES.some((prefix) =>
    rel.startsWith(prefix.replace(/\\/g, "/"))
  );
}

/** 解析 verify.mjs 的 --json 输出，返回是否包含 FAIL 项。 */
function reportHasFail(jsonText: string): boolean {
  try {
    const report = JSON.parse(jsonText);
    return (
      typeof report?.summary?.failed === "number" && report.summary.failed > 0
    );
  } catch {
    return false;
  }
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
        `${new Date().toISOString()} [men-verify] ${msg}\n`
      );
    } catch {
      /* best-effort，绝不阻塞主流程 */
    }
  }

  return {
    /**
     * tool.execute.after — 写产物后做非阻塞机械检查。
     * 绝不 throw：所有错误路径都吞掉，只留日志。
     */
    "tool.execute.after": async (toolInput, toolOutput) => {
      // 1. 只关注写类工具
      if (!WATCH_TOOLS.has(toolInput.tool)) return;

      // 2. 提取目标路径。
      //    tool.execute.after 的 input 实含 args 字段（见 @opencode-ai/plugin@1.18.23
      //    dist/index.d.ts 第 249-253 行：{ tool, sessionID, callID, args }）。
      //    write/edit 工具的目标路径参数名为 filePath（OpenCode 内置工具 schema）；
      //    保留 args.path / args.file_path 与 output.metadata 作向后兼容回退。
      const filePath =
        toolInput.args?.filePath ??
        toolInput.args?.path ??
        toolInput.args?.file_path ??
        toolOutput?.metadata?.filePath ??
        toolOutput?.metadata?.path;
      if (!filePath) return;
      const abs = path.resolve(root, filePath);
      const rel = path.relative(root, abs);

      // 3. 只检查产物目录内的写入
      if (rel.startsWith("..") || path.isAbsolute(rel)) return; // 项目根之外，跳过
      if (!isProductPath(rel)) return;

      // 4. 非阻塞 spawn verify.mjs（Windows 下用 node 直接调用，无需 shell）
      const target = rel;
      const verifyPath = path.join(root, ...VERIFY_SCRIPT);
      const args = [verifyPath, target, "--json", "--sid", `men-verify-${Date.now()}`];

      const child = spawn(process.execPath, args, {
        cwd: root,
        windowsHide: true,
      });

      let stdout = "";
      child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
      child.on("error", (err) => {
        // spawn 失败：仅日志，不中断
        logToFile(`spawn 失败: ${err.message}`);
      });
      child.on("close", (code) => {
        // verify.mjs 契约：非 0 退出 = 有检查项失败。以退出码为主信号，
        // JSON 报告兜底（覆盖 spawn 崩溃/stdout 缺失等 code≠0 但无 FAIL 计数、
        // 以及 code=0 但 JSON 异常含 FAIL 的边界）。任一命中即视为未通过。
        const failed = code !== 0 || reportHasFail(stdout);
        if (failed) {
          // 非阻塞约定：仅写日志提示。不修改 toolOutput——spawn 后 async hook 立即
          // resolve，close 回调触发时 output 已被消费，写入无效（M5/D4 修复）。
          logToFile(`${target} 未通过机械检查（exit=${code}）`);
        } else {
          logToFile(`${target} 机械检查通过（exit=${code}）`);
        }
      });
    },
  };
};

export default plugin;
