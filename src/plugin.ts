/**
 * opencode-men — OpenCode Plugin 入口（v1 真实 API）
 *
 * 匹配 @opencode-ai/plugin v1 签名：
 *   Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>
 *
 * Plugin API 能力边界（xun 研究结论）：
 *   - 提供 agent/command/skill 注册的 API 并不存在，它们通过 .opencode/ 目录
 *     的文件系统机制注册（本仓库已由 .opencode/agent|command|skills 承载）。
 *   - Plugin 真正能做的是：注册自定义 tool、拦截/修改消息流、注入环境变量。
 *
 * 因此本插件只负责：注册 men_triage 自定义工具 + 注入 MEN_* 环境变量。
 * 核心判定逻辑在 core/，此处仅为薄 adapter。
 */

import { tool, type PluginInput, type Hooks } from "@opencode-ai/plugin";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 版本号：从根 package.json 动态读取（与 men-sidebar tui.js 同一机制）。
// 从模块所在目录向上遍历，找到最近的带 version 的祖先 package.json。
let PLUGIN_VERSION = "0.0.0";
try {
  let d = __dirname;
  for (let i = 0; i < 10 && d !== dirname(d); i++) {
    const p = join(d, "package.json");
    if (existsSync(p)) {
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      if (pkg.version) {
        PLUGIN_VERSION = pkg.version;
        break;
      }
    }
    d = dirname(d);
  }
} catch {
  // 读取失败保持 0.0.0 兜底，不阻塞插件加载
}

/**
 * men Plugin — v1 API 签名
 * 输入: PluginInput（client, project, directory, worktree, serverUrl, $）
 * 输出: Hooks 对象
 */
export default async function menPlugin(input: PluginInput): Promise<Hooks> {
  console.log(`[opencode-men] Plugin loaded v${PLUGIN_VERSION}`);

  return {
    // 注册自定义工具：men_triage（意图门判定）
    tool: {
      men_triage: tool({
        description:
          "men 意图门判定：分析任务文本，返回意图分类和 agent 路由建议",
        args: {
          task: tool.schema.string().describe("任务描述文本"),
        },
        async execute(args) {
          // 动态 import 以避免与 core/ 的循环依赖
          const { triage } = await import("./core/triage.js");
          const result = triage(args.task);
          return JSON.stringify(result, null, 2);
        },
      }),
    },

    // 环境变量注入（input 来自外层 PluginInput，含 project 信息）
    "shell.env": async (_input, output) => {
      output.env.MEN_VERSION = PLUGIN_VERSION;
      output.env.MEN_PROJECT = input?.project?.name ?? "unknown";
    },
  };
}
