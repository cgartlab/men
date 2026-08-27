/**
 * update-check.mjs — men 插件自动版本检查（TUI 侧）
 *
 * 纯 Node ESM 模块（仅用 node:* 内置，不 import @opentui），导出纯函数 + 编排函数便于测试。
 *
 * 流程：
 *   1. 24h 内已检查过 → 直接返回（不打扰）
 *   2. fetch GitHub releases/latest（redirect: manual，拿 302 Location）
 *   3. 解析最新 tag → 与当前版本比较 → 弹 DialogConfirm 询问是否更新
 *   4. 用户确认 → invokeMenUpdate 触发 men-update skill；取消 → 记录 dismissed
 *
 * 设计约束：
 *   - 任何错误只打日志，绝不向上抛（保证 OpenCode 启动不被卡住）
 *   - 插件进程内不执行 shell / git / npm —— 更新动作委托给 men-update skill
 */

// ─────────────────────────── 纯函数 ───────────────────────────

/**
 * 从 GitHub releases/latest 的 Location 响应头提取版本号。
 * 期望格式：https://github.com/<owner>/<repo>/releases/tag/vX.Y.Z
 * 返回去掉 v 前缀的版本号字符串；不匹配返回 null。
 *
 * @param {string | null} locationHeader
 * @returns {string | null}
 */
export function parseLatestTag(locationHeader) {
  if (typeof locationHeader !== "string") return null;
  const m = locationHeader.match(/\/releases\/tag\/v(\d+(?:\.\d+)*)/);
  return m ? m[1] : null;
}

/**
 * 语义化版本比较：a > b 返回 1，a < b 返回 -1，相等返回 0。
 * 非标准格式逐段按数字比；任一段无法解析为数字 → 整体返回 0（视为相等，不提示）。
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? 0);
    const nb = Number(pb[i] ?? 0);
    if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * 是否应该弹窗提示：latest 比 current 新，且该版本未被用户忽略。
 *
 * @param {string} current
 * @param {string} latest
 * @param {string} dismissed
 * @returns {boolean}
 */
export function shouldNotify(current, latest, dismissed) {
  return compareVersions(latest, current) > 0 && dismissed !== latest;
}

// ─────────────────────────── 编排逻辑 ───────────────────────────

/**
 * 触发 men-update skill（best-effort，绝不抛错）。
 *
 * 路径决策（基于实际 SDK 类型 @opencode-ai/sdk@1.18.23）：
 *   - 候选 A：`api.client.session.prompt({ sessionID, parts: [{ type: "text", text: "/men-update" }] })`
 *     类型上存在，但【不可靠】：slash command 由 TUI 输入层解析展开，经 HTTP API 直发 prompt
 *     不会被服务端当作 command 处理，只会作为普通文本发给模型；且 prompt 是流式请求，
 *     会在当前会话立即产生 AI 回复、打断用户；还需 sessionID（插件加载时可能不在 session 路由）。
 *   - 候选 B：`api.keymap.dispatchCommand("command.palette.show")` —— tui.d.ts 中
 *     `api.command` 的 deprecation 注释明确推荐此路径，无副作用、不依赖 sessionID。
 *
 * 最终采用：候选 B（dispatchCommand + toast 引导），兜底纯 toast 提示。
 *
 * @param {object} api TuiPluginApi
 */
async function invokeMenUpdate(api) {
  try {
    if (typeof api?.keymap?.dispatchCommand === "function") {
      api.keymap.dispatchCommand("command.palette.show");
      api.ui?.toast?.({
        variant: "info",
        title: "更新 men",
        message: "命令面板已打开，选择 men-update（或在聊天输入 /men-update）",
      });
      return;
    }
    // 兜底：无 keymap 时仅提示用户在聊天输入 /men-update
    api.ui?.toast?.({
      variant: "info",
      title: "更新 men",
      message: "请在聊天输入 /men-update 完成更新",
    });
  } catch (e) {
    console.error("[men-update-check] invokeMenUpdate failed:", e?.message ?? e);
  }
}

/**
 * 版本检查编排：24h 缓存 → fetch → 弹窗 → 触发更新 / 记录忽略。
 * 最外层 try/catch：任何错误只打日志，绝不向上抛。
 *
 * @param {object} api TuiPluginApi
 * @param {object} meta TuiPluginMeta（本实现未直接使用，保留签名兼容）
 * @param {string} currentVersion 当前插件版本
 * @returns {Promise<void>}
 */
export async function runUpdateCheck(api, meta, currentVersion) {
  try {
    // a. 防御：无 dialog API 直接返回，绝不抛错
    if (!api?.ui?.dialog) return;

    // b. 24h 缓存：距上次检查不足一天则不打扰
    const lastCheck = api.kv?.get ? Number(api.kv.get("men:lastCheck", 0)) : 0;
    if (api.kv?.ready && Date.now() - lastCheck < 24 * 3600 * 1000) return;

    // c. 用 ctrl.signal 做 fetch 超时/中断（生命周期销毁 + 10s 兜底超时）
    const ctrl = new AbortController();
    api.lifecycle?.onDispose?.(() => ctrl.abort());
    const timer = setTimeout(() => ctrl.abort(), 10000);

    let resp;
    try {
      // d. fetch GitHub releases/latest，手动重定向以拿 Location
      resp = await fetch("https://github.com/cgartlab/men/releases/latest", {
        redirect: "manual",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // e. 仅当 3xx 重定向时解析 Location；其余状态静默 return
    if (!resp || resp.status < 300 || resp.status >= 400) return;

    // f. 解析最新 tag；为 null → return
    const latest = parseLatestTag(resp.headers.get("location"));
    if (!latest) return;

    // g. 仅在成功拿到 latest 后缓存检查时间（网络错误可更快重试）
    try { api.kv?.set?.("men:lastCheck", Date.now()); } catch { /* 缓存失败不阻塞 */ }

    // h. 已被忽略或非更新 → return
    const dismissed = api.kv?.get ? String(api.kv.get("men:dismissed", "")) : "";
    if (!shouldNotify(currentVersion, latest, dismissed)) return;

    // i. 弹窗询问（避免覆盖已有 dialog）
    if (api.ui.dialog.open) return;
    api.ui.dialog.replace(() =>
      api.ui.DialogConfirm({
        title: "men 有新版本",
        message: `当前 v${currentVersion}，最新 v${latest}。是否更新？`,
        onConfirm: () => {
          api.ui.dialog.clear();
          invokeMenUpdate(api);
        },
        onCancel: () => {
          api.ui.dialog.clear();
          try { api.kv.set("men:dismissed", latest); } catch { /* 忽略失败不阻塞 */ }
        },
      })
    );
  } catch (e) {
    // j. 任何错误只打日志，绝不向上抛
    console.error("[men-update-check] skipped:", e?.message ?? e);
  }
}
