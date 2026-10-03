/**
 * men-sidebar — server entry (OpenCode V2)
 *
 * V2 迁移要点：
 *   - 插件形态从 V1 `export default { id, tui: async (api) => … }`
 *     改为 `export default Plugin.define({ id, setup(ctx) })`（@opencode/plugin）
 *   - server 入口不注册任何 hook / 输出：TUI 侧边栏在 ./tui 子路径单独导出，
 *     由 TUI 运行时按 host Entrypoints 的 `tui` 槽加载（dist/host.js）
 *
 * 兼容说明：V1 下本文件导出的对象同时被 TUI 消费；V2 下 server / TUI 是两条独立加载路径，
 * 因此 setup 保持空实现（无副作用），避免在纯 server 场景（`opencode run` / headless）多余开销。
 */

import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "men-sidebar",
  async setup() {
    /* 最小化 server 插件：无 hook，无输出。TUI 插件在 ./tui 子路径导出。 */
  },
});
