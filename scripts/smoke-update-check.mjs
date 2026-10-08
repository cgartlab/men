#!/usr/bin/env node
/*
 * smoke-update-check.mjs — update-check 模块冒烟测试
 * 纯 Node（零第三方依赖），Windows pwsh 友好
 *
 * 用法：node scripts/smoke-update-check.mjs
 * 退出码：0 = 全部断言通过；1 = 有断言失败
 *
 * 被测模块为 OpenCode V2 形态：runUpdateCheck(ctx, currentVersion)（两参），
 * ctx 依赖 storage.store() → [state, mutate]、ui.dialog.confirm() → Promise<boolean>、
 * keymap.dispatch()、ui.toast.show()（见 update-check.mjs 文件头「V2 迁移对照」）。
 *
 * 覆盖：
 *   1. parseLatestTag 解析 Location 头
 *   2. compareVersions 语义化版本比较
 *   3. shouldNotify 通知判定
 *   4. runUpdateCheck 302 + 新 tag → confirm 弹窗 → 确认后 dispatch + toast
 *   5. runUpdateCheck 24h 缓存生效 → 不发请求、不弹窗
 *   6. runUpdateCheck ctx.ui.dialog 缺失 → 静默 return 不抛错
 *   7. runUpdateCheck 非 3xx → 已 fetch 但不弹窗
 *   8. runUpdateCheck 取消更新 → 记录 dismissed、不触发更新
 *   9. runUpdateCheck 该版本已被忽略 → 不弹窗
 *
 * 全程 mock 全局 fetch，零网络依赖 → 可安全纳入 node --test / CI。
 */
import { parseLatestTag, compareVersions, shouldNotify, runUpdateCheck } from "../.opencode/plugins/men-sidebar/update-check.mjs";

let passed = 0;
let failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`✅ PASS  ${name}`); }
  else { failed++; console.error(`❌ FAIL  ${name}`); }
}

/**
 * V2 ctx mock。
 * - storage.store(key, { initial }) → [state, mutate]：state() 返回快照对象，
 *   mutate(fn) 直接改同一对象（对齐 Solid store 的写入语义）
 * - ui.dialog.confirm(opts) → Promise<boolean>（记录每次调用的 opts）
 * - keymap.dispatch / ui.toast.show 记录调用
 * seed 覆盖 store 的 initial，用于预置 lastCheck / dismissed。
 */
function makeCtx({ dialog = true, seed = {}, confirmResult = true } = {}) {
  const calls = { confirm: [], toasts: [], commands: [] };
  const data = {};
  const ctx = {
    ui: {
      dialog: dialog
        ? {
            confirm: async (opts) => {
              calls.confirm.push(opts);
              return confirmResult;
            },
          }
        : undefined,
      toast: { show: (opts) => { calls.toasts.push(opts); } },
    },
    storage: {
      store: (_key, opts = {}) => {
        Object.assign(data, opts.initial || {}, seed);
        const state = () => data;
        const mutate = (fn) => { fn(data); };
        return [state, mutate];
      },
    },
    keymap: { dispatch: (name) => { calls.commands.push(name); } },
  };
  return { ctx, calls, data };
}

/** 替换全局 fetch（node >= 18 有全局 fetch），fn(net) 可读到 fetch 次数；测试后恢复 */
function withMockFetch(status, location, fn) {
  const orig = globalThis.fetch;
  const net = { fetches: 0 };
  globalThis.fetch = async () => {
    net.fetches++;
    return {
      status,
      headers: { get: (name) => (String(name).toLowerCase() === "location" ? location : null) },
    };
  };
  try { return fn(net); } finally { globalThis.fetch = orig; }
}

const LATEST_999 = "https://github.com/cgartlab/men/releases/tag/v9.9.9";

async function main() {
  // ── 1. parseLatestTag ──
  assert(
    'parseLatestTag(".../releases/tag/v1.2.3") === "1.2.3"',
    parseLatestTag("https://github.com/cgartlab/men/releases/tag/v1.2.3") === "1.2.3"
  );
  assert(
    'parseLatestTag(".../releases/tag/foo") === null',
    parseLatestTag("https://github.com/cgartlab/men/releases/tag/foo") === null
  );
  assert("parseLatestTag(null) === null", parseLatestTag(null) === null);

  // ── 2. compareVersions ──
  assert('compareVersions("1.2.0","1.1.9") === 1', compareVersions("1.2.0", "1.1.9") === 1);
  assert('compareVersions("0.2.1","0.2.1") === 0', compareVersions("0.2.1", "0.2.1") === 0);
  assert('compareVersions("0.3.0","0.2.1") === 1', compareVersions("0.3.0", "0.2.1") === 1);
  assert('compareVersions("1.0","1.0.0") === 0', compareVersions("1.0", "1.0.0") === 0);

  // ── 3. shouldNotify ──
  assert('shouldNotify("0.2.1","0.3.0","") === true', shouldNotify("0.2.1", "0.3.0", "") === true);
  assert('shouldNotify("0.2.1","0.3.0","0.3.0") === false', shouldNotify("0.2.1", "0.3.0", "0.3.0") === false);
  assert('shouldNotify("0.9.0","0.3.0","") === false', shouldNotify("0.9.0", "0.3.0", "") === false);

  // ── 4. runUpdateCheck：302 + 新 tag → confirm 弹窗 → 确认后触发更新 ──
  await withMockFetch(302, LATEST_999, async (net) => {
    const { ctx, calls, data } = makeCtx();
    await runUpdateCheck(ctx, "0.2.1");
    assert("302 + 新 tag → ui.dialog.confirm 被调用", net.fetches === 1 && calls.confirm.length === 1);
    assert("confirm message 含 v9.9.9", calls.confirm.length === 1 && String(calls.confirm[0].message).includes("v9.9.9"));
    assert("成功拿到 latest → 缓存 lastCheck", typeof data.lastCheck === "number" && data.lastCheck > 0);
    assert("confirm(true) → keymap.dispatch + toast 被触发", calls.commands.length > 0 && calls.toasts.length > 0);
  });

  // ── 5. runUpdateCheck：24h 缓存生效（1 分钟前刚检查）→ 不请求、不弹窗 ──
  await withMockFetch(302, LATEST_999, async (net) => {
    const { ctx, calls } = makeCtx({ seed: { lastCheck: Date.now() - 60 * 1000 } });
    await runUpdateCheck(ctx, "0.2.1");
    assert("24h 缓存生效 → 未发起 fetch", net.fetches === 0);
    assert("24h 缓存生效 → confirm 未被调用", calls.confirm.length === 0);
  });

  // ── 6. runUpdateCheck：ctx.ui.dialog 缺失 → 静默 return 不抛错 ──
  {
    const { ctx, calls } = makeCtx({ dialog: false });
    let threw = false;
    try { await runUpdateCheck(ctx, "0.2.1"); } catch { threw = true; }
    assert("ui.dialog 缺失 → 静默 return 不抛错", !threw && calls.confirm.length === 0);
  }

  // ── 7. runUpdateCheck：非 3xx 状态 → 已 fetch 但不弹窗 ──
  await withMockFetch(200, null, async (net) => {
    const { ctx, calls } = makeCtx();
    await runUpdateCheck(ctx, "0.2.1");
    assert("非 3xx（200）→ 已发起 fetch 且 confirm 未被调用", net.fetches === 1 && calls.confirm.length === 0);
  });

  // ── 8. runUpdateCheck：取消更新 → 记录 dismissed，不触发更新 ──
  await withMockFetch(302, LATEST_999, async () => {
    const { ctx, calls, data } = makeCtx({ confirmResult: false });
    await runUpdateCheck(ctx, "0.2.1");
    assert("confirm(false) → 记录 dismissed = 9.9.9", data.dismissed === "9.9.9");
    assert("confirm(false) → 不触发 keymap/toast", calls.commands.length === 0 && calls.toasts.length === 0);
  });

  // ── 9. runUpdateCheck：该版本已被忽略 → 不弹窗 ──
  await withMockFetch(302, LATEST_999, async (net) => {
    const { ctx, calls } = makeCtx({ seed: { dismissed: "9.9.9" } });
    await runUpdateCheck(ctx, "0.2.1");
    assert("已忽略版本 → 已发起 fetch 但 confirm 未被调用", net.fetches === 1 && calls.confirm.length === 0);
  });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("smoke 崩溃:", e);
  process.exit(1);
});
