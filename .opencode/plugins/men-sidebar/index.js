/**
 * men-sidebar — server entry (V8)
 *
 * 最小化 server 插件：仅记录日志，无 hook。
 * TUI 插件在 ./tui 子路径导出。
 */

// 调试日志门控：MEN_DEBUG=1（或 true）时输出，默认静默（与 ./tui.js 一致），避免污染 host stdout
const dbg = (...a) => { if (process.env.MEN_DEBUG === "1" || process.env.MEN_DEBUG === "true") { console.log(...a); } };

dbg("[men-sidebar] === SERVER ENTRY LOADED (V8) ===");

export default {
  id: "men-sidebar",
  server: async () => {
    dbg("[men-sidebar] server() called — no hooks, TUI handled by ./tui export");
    return {};
  },
};
