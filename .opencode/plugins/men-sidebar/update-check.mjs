/**
 * update-check.mjs — men 插件自动版本检查（TUI 侧，OpenCode V2）
 *
 * 纯 ESM 模块（仅用 node:* 内置，不 import @opentui），导出纯函数 + 编排函数便于测试。
 *
 * 流程：
 *   1. 24h 内已检查过 → 直接返回（不打扰）
 *   2. fetch GitHub releases/latest（redirect: manual，拿 302 Location）
 *   3. 解析最新 tag → 与当前版本比较 → 弹 dialog 询问是否更新
 *   4. 用户确认 → keymap.dispatch 打开命令面板 + toast 引导 men-update skill；取消 → 记录 dismissed
 *
 * V2 迁移对照（V1 TuiPluginApi → V2 @opencode/plugin/tui Context）：
 *   - `api.kv.get/set`            → `ctx.storage.store("men-update", {initial})` 返回 [store, mutate]
 *   - `api.lifecycle.onDispose`   → 由调用方（tui.js）的 cleanup 负责；本模块只用 fetch 兜底超时
 *   - `api.ui.dialog.replace(fn)` + `api.ui.DialogConfirm`
 *                               → `await ctx.ui.dialog.confirm({ title, message })` 返回 boolean|undefined
 *   - `api.keymap.dispatchCommand`→ `ctx.keymap.dispatch`
 *   - `api.ui.toast(opts)`        → `ctx.ui.toast.show(opts)`（message 为必填）
 *   - `api.ui.dialog.open`        → 无对应 getter，改为在调用方节流（24h 缓存已足够）
 *
 * 设计约束：任何错误只打日志，绝不向上抛（保证 OpenCode 启动不被卡住）；
 * 插件进程内不执行 shell / git / npm —— 更新动作委托给 men-update skill
 */

// 调试日志门控：MEN_DEBUG=1（或 true）时输出，默认静默（与 ../tui.js 一致），避免污染 host stdout
const dbg = (...a) => { if (process.env.MEN_DEBUG === "1" || process.env.MEN_DEBUG === "true") { console.log(...a); } };

// fetch 兜底超时（ms）：超过此时间仍未响应则 abort，避免插件启动被网络阻塞
const FETCH_TIMEOUT_MS = 10_000;

// 检查间隔（24h），与 V1 一致
const CHECK_INTERVAL_MS = 24 * 3600 * 1000;

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
 * V1 备注：`api.client.session.prompt(...)` 直发 slash command 不可靠（TUI 输入层才解析），
 * 且会在当前会话立即产生 AI 回复打断用户，故采用「打开命令面板 + toast 引导」路径。
 * V2 沿用同一策略：`ctx.keymap.dispatch("command.palette.show")`。
 *
 * @param {object} ctx @opencode/plugin/tui Context
 */
function invokeMenUpdate(ctx) {
  try {
    if (typeof ctx?.keymap?.dispatch === "function") {
      ctx.keymap.dispatch("command.palette.show");
      ctx.ui?.toast?.show({
        variant: "info",
        title: "更新 men",
        message: "命令面板已打开，选择 men-update（或在聊天输入 /men-update）",
      });
      return;
    }
    // 兜底：无 keymap 时仅提示用户在聊天输入 /men-update
    ctx.ui?.toast?.show({
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
 * @param {object} ctx @opencode/plugin/tui Context
 * @param {string} currentVersion 当前插件版本
 * @returns {Promise<void>}
 */
export async function runUpdateCheck(ctx, currentVersion) {
  try {
    // a. 防御：无 dialog API 直接返回，绝不抛错
    if (!ctx?.ui?.dialog) return;

    // b. 读取持久状态（V2: ctx.storage.store 返回 Solid store + mutate 器）
    const store = ctx.storage && typeof ctx.storage.store === "function"
      ? ctx.storage.store("men-update", { initial: { lastCheck: 0, dismissed: "" } })
      : null;
    if (!store) { dbg("[men-update-check] storage 不可用，跳过"); return; }
    const [state, mutate] = store;

    // c. 24h 缓存：距上次检查不足一天则不打扰
    if (Date.now() - Number(state().lastCheck) < CHECK_INTERVAL_MS) {
      dbg("[men-update-check] 24h 内已检查，跳过");
      return;
    }

    // d. fetch GitHub releases/latest，手动重定向以拿 Location（10s 兜底超时）
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch("https://github.com/cgartlab/men/releases/latest", {
        redirect: "manual",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // e. 仅当 3xx 重定向时解析 Location；其余状态静默 return
    if (!resp || resp.status < 300 || resp.status >= 400) {
      dbg(`[men-update-check] 跳过：非 3xx 重定向（status=${resp ? resp.status : "no-response"}）`);
      return;
    }

    // f. 解析最新 tag；为 null → return
    const latest = parseLatestTag(resp.headers.get("location"));
    if (!latest) return;

    // g. 仅在成功拿到 latest 后缓存检查时间（网络错误可更快重试）
    try { mutate((d) => { d.lastCheck = Date.now(); }); } catch (e) {
      dbg(`[men-update-check] 缓存写入失败: ${e.message}`);
    }

    // h. 已被忽略或非更新 → return
    const dismissed = String(state().dismissed || "");
    if (!shouldNotify(currentVersion, latest, dismissed)) return;

    dbg(`[men-update-check] latest=${latest} current=${currentVersion} → 弹窗`);

    // i. 弹窗询问（V2 dialog.confirm 返回 Promise<boolean|undefined>）
    let ok;
    try {
      ok = await ctx.ui.dialog.confirm({
        title: "men 有新版本",
        message: `当前 v${currentVersion}，最新 v${latest}。是否更新？`,
      });
    } catch (e) {
      dbg(`[men-update-check] dialog 失败: ${e.message}`);
      return;
    }

    if (ok) {
      invokeMenUpdate(ctx);
    } else {
      try { mutate((d) => { d.dismissed = latest; }); } catch (e) {
        dbg(`[men-update-check] 记录忽略失败: ${e.message}`);
      }
    }
  } catch (e) {
    // j. 任何错误只打日志，绝不向上抛
    console.error("[men-update-check] skipped:", e?.message ?? e);
    dbg("[men-update-check] skipped detail:", e?.stack ?? e);
  }
}
