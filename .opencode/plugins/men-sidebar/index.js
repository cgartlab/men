/**
 * men-sidebar — server entry (V7)
 *
 * 最小化 server 插件：仅记录日志，无 hook。
 * TUI 插件在 ./tui 子路径导出。
 */

console.log("[men-sidebar] === SERVER ENTRY LOADED (V7) ===");

export default {
  id: "men-sidebar",
  server: async () => {
    console.log("[men-sidebar] server() called — no hooks, TUI handled by ./tui export");
    return {};
  },
};
