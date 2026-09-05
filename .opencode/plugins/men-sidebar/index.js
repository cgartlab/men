/**
 * men-sidebar — server entry (V8)
 *
 * 最小化 server 插件：空实现，无 hook，无输出。
 * TUI 插件在 ./tui 子路径导出。
 *
 * 说明：server entry 加载是内部行为，加载成功不需要可被 env 意外触发的
 * 顶层输出；调试日志由 ./tui.js 出口统一负责（MEN_DEBUG 门控）。
 * 参见 issue #113（2026-09-05）：曾在此处输出 SERVER ENTRY LOADED /
 * server() called 两行日志，MEN_DEBUG 被外部进程/用户环境设置时会污染宿主 stdout。
 */

export default {
  id: "men-sidebar",
  server: async () => {
    return {};
  },
};
