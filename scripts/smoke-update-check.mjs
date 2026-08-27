#!/usr/bin/env node
/*
 * smoke-update-check.mjs — update-check 模块冒烟测试
 * 纯 Node（零第三方依赖），Windows pwsh 友好
 *
 * 用法：node scripts/smoke-update-check.mjs
 * 退出码：0 = 全部断言通过；1 = 有断言失败
 *
 * 覆盖：
 *   1. parseLatestTag 解析 Location 头
 *   2. compareVersions 语义化版本比较
 *   3. shouldNotify 通知判定
 *   4. runUpdateCheck 302 + 新 tag → 弹窗 → onConfirm 触发更新
 *   5. runUpdateCheck 24h 缓存生效 → 不弹窗
 *   6. runUpdateCheck api.ui.dialog undefined → 静默 return 不抛错
 *   7. runUpdateCheck 非 3xx → 静默 return
 */
import { parseLatestTag, compareVersions, shouldNotify, runUpdateCheck } from "../.opencode/plugins/men-sidebar/update-check.mjs";

let passed = 0;
let failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`✅ PASS  ${name}`); }
  else { failed++; console.error(`❌ FAIL  ${name}`); }
}

/** mock api 工厂：kv 用 Map，dialog.replace 记录并立即调用 render，client 给 null 走兜底 */
function makeApi({ dialog = true, kvEntries = [], ready = true } = {}) {
  const store = new Map(kvEntries);
  const calls = { dialogReplace: [], toasts: [], commands: [], lastDialog: null, disposals: 0 };
  const api = {
    ui: {
      dialog: dialog
        ? {
            open: false,
            replace(render) {
              calls.dialogReplace.push(1);
              const el = render();
              calls.lastDialog = el;
              return el;
            },
            clear() {},
          }
        : undefined,
      DialogConfirm: (props) => props,
      toast: (input) => { calls.toasts.push(input); },
    },
    kv: {
      get: (key, fb) => (store.has(key) ? store.get(key) : fb),
      set: (key, value) => { store.set(key, value); },
      ready,
    },
    lifecycle: {
      signal: new AbortController().signal,
      onDispose: () => { calls.disposals++; return () => {}; },
    },
    keymap: { dispatchCommand: (name) => { calls.commands.push(name); } },
    client: null,
  };
  return { api, calls, store };
}

/** 替换全局 fetch（node >= 18 有全局 fetch），测试后恢复 */
function withMockFetch(status, location, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({
    status,
    headers: { get: (name) => (String(name).toLowerCase() === "location" ? location : null) },
  });
  try { return fn(); } finally { globalThis.fetch = orig; }
}

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

  // ── 4. runUpdateCheck：302 + 新 tag → 弹窗 → onConfirm 触发更新 ──
  await withMockFetch(302, "https://github.com/cgartlab/men/releases/tag/v9.9.9", async () => {
    const { api, calls, store } = makeApi();
    await runUpdateCheck(api, { state: "first" }, "0.2.1");
    assert("302 + 新 tag → dialog.replace 被调用", calls.dialogReplace.length === 1);
    assert("弹窗 message 含 v9.9.9", !!calls.lastDialog && calls.lastDialog.message.includes("v9.9.9"));
    assert("成功拿到 latest → 缓存 men:lastCheck", typeof store.get("men:lastCheck") === "number");
    // 模拟点 onConfirm → 触发更新路径（dispatchCommand 或 toast）
    if (calls.lastDialog && typeof calls.lastDialog.onConfirm === "function") calls.lastDialog.onConfirm();
    assert("onConfirm → dispatchCommand 或 toast 被触发", calls.commands.length > 0 || calls.toasts.length > 0);
  });

  // ── 5. runUpdateCheck：24h 缓存生效（1 分钟前刚检查）→ 不弹窗 ──
  await withMockFetch(302, "https://github.com/cgartlab/men/releases/tag/v9.9.9", async () => {
    const { api, calls } = makeApi({ kvEntries: [["men:lastCheck", Date.now() - 60 * 1000]] });
    await runUpdateCheck(api, {}, "0.2.1");
    assert("24h 缓存生效 → dialog.replace 未被调用", calls.dialogReplace.length === 0);
  });

  // ── 6. runUpdateCheck：api.ui.dialog undefined → 静默 return 不抛错 ──
  {
    const { api, calls } = makeApi({ dialog: false });
    let threw = false;
    try { await runUpdateCheck(api, {}, "0.2.1"); } catch { threw = true; }
    assert("api.ui.dialog undefined → 静默 return 不抛错", !threw && calls.dialogReplace.length === 0);
  }

  // ── 7. runUpdateCheck：非 3xx 状态 → 静默 return ──
  await withMockFetch(200, null, async () => {
    const { api, calls } = makeApi();
    await runUpdateCheck(api, {}, "0.2.1");
    assert("非 3xx（200）→ 静默 return 不弹窗", calls.dialogReplace.length === 0);
  });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("smoke 崩溃:", e);
  process.exit(1);
});
