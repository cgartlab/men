/**
 * opencode-v2-compat.test.mjs — V2 API 形态回归守护
 *
 * 黑盒源码扫描（零依赖），断言 men 的插件 / 配置 / 依赖保持 OpenCode V2 native 形态，
 * 防止回退到 V1 写法。审计依据见 docs/research/opencode-v2-compat-audit.md。
 *
 * 守护范围：
 *   - 3 插件用 Plugin.define + @opencode/plugin（非 V1 @opencode-ai/plugin）
 *   - 各插件用对应 V2 Context API（ctx.tool.hook / ctx.event.subscribe / ctx.ui.slot）
 *   - agent frontmatter 无 V1 tools 字段，men.md 用 permission
 *   - 配置 $schema 指向 opencode.ai
 *   - .opencode/package.json 含 V2 包、无 V1 类型包
 *   - install.mjs 兜底 / verify.mjs 白名单 / README badge 无 V1 残留
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function readFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}
function readDir(rel) {
  return fs.readdirSync(path.join(REPO_ROOT, rel));
}

// ── 插件 API 形态：V2 Plugin.define + @opencode/plugin ──────────────────

test("V2 compat: 3 插件用 Plugin.define from @opencode/plugin（非 V1 @opencode-ai/plugin）", () => {
  const plugins = [
    ".opencode/plugins/men-verify.ts",
    ".opencode/plugins/men-learn.ts",
    ".opencode/plugins/men-sidebar/index.js",
    ".opencode/plugins/men-sidebar/tui.js",
  ];
  for (const p of plugins) {
    const src = readFile(p);
    assert.ok(src.includes('from "@opencode/plugin'), `${p} 应 import @opencode/plugin`);
    assert.ok(
      !/from\s+["']@opencode-ai\/plugin["']/.test(src),
      `${p} 不应 import V1 @opencode-ai/plugin`
    );
    assert.ok(src.includes("Plugin.define("), `${p} 应用 Plugin.define`);
  }
});

test("V2 compat: men-verify 用 ctx.tool.hook(\"execute.after\")", () => {
  const src = readFile(".opencode/plugins/men-verify.ts");
  assert.ok(src.includes('ctx.tool.hook("execute.after"'), "men-verify 应用 ctx.tool.hook");
});

test("V2 compat: men-learn 用 ctx.event.subscribe + AbortController signal", () => {
  const src = readFile(".opencode/plugins/men-learn.ts");
  assert.ok(src.includes("ctx.event.subscribe("), "men-learn 应用 ctx.event.subscribe");
  assert.ok(src.includes("AbortController"), "men-learn 应用 AbortController");
  assert.ok(src.includes("signal"), "men-learn 传 signal 给 subscribe");
});

test("V2 compat: men-sidebar/tui.js 用 ctx.ui.slot + ctx.data.location.agent", () => {
  const src = readFile(".opencode/plugins/men-sidebar/tui.js");
  assert.ok(src.includes("ctx.ui.slot("), "tui.js 应用 ctx.ui.slot");
  assert.ok(src.includes("ctx.data.location.agent"), "tui.js 应用 ctx.data.location.agent");
});

test("V2 compat: 插件解析 node 二进制（V2 Bun 运行时 process.execPath 是 opencode.exe）", () => {
  for (const p of [".opencode/plugins/men-verify.ts", ".opencode/plugins/men-learn.ts"]) {
    const src = readFile(p);
    assert.ok(src.includes("resolveNodeBin"), `${p} 应有 resolveNodeBin（V2 Bun 下显式解析 node）`);
  }
});

// ── agent frontmatter：V2 permission（无 V1 tools）──────────────────────

test("V2 compat: agent frontmatter 无 V1 tools 字段", () => {
  const agents = readDir(".opencode/agent").filter((f) => f.endsWith(".md"));
  assert.ok(agents.length >= 6, "应有 6 个 agent 定义");
  for (const f of agents) {
    const src = readFile(`.opencode/agent/${f}`);
    assert.ok(!/^\s*tools:\s/m.test(src), `${f} 不应有 V1 tools 字段（V2 已废弃，改用 permission）`);
  }
});

// ── 配置 $schema 指向 opencode.ai ────────────────────────────────────────

test("V2 compat: 配置文件 $schema 指向 opencode.ai（tui.json 已移除）", () => {
  const configs = ["opencode.json", "gh-flow/opencode.gh-flow.json"];
  for (const c of configs) {
    const src = readFile(c);
    assert.ok(
      src.includes('"$schema": "https://opencode.ai/'),
      `${c} $schema 应指向 opencode.ai`
    );
  }
  // V2 迁移：.opencode/tui.json 已移除（V1 机制，V2 靠 .opencode/plugins/ 自动发现）
  assert.ok(
    !fs.existsSync(path.join(REPO_ROOT, ".opencode/tui.json")),
    ".opencode/tui.json 应已移除（V2 靠自动发现）"
  );
});

// ── 依赖：V2 包存在，V1 类型包已移除 ─────────────────────────────────────

test("V2 compat: .opencode/package.json 含 @opencode/plugin，无 V1 @opencode-ai/plugin", () => {
  const pkg = JSON.parse(readFile(".opencode/package.json"));
  assert.ok(pkg.dependencies && pkg.dependencies["@opencode/plugin"], "应有 @opencode/plugin");
  assert.strictEqual(
    pkg.dependencies["@opencode-ai/plugin"],
    undefined,
    "不应有 V1 类型包 @opencode-ai/plugin（V2 自带类型）"
  );
});

test("V2 compat: install.mjs 兜底不含 V1 @opencode-ai/plugin 版本", () => {
  const src = readFile("scripts/install.mjs");
  assert.ok(
    !/['"]@opencode-ai\/plugin['"]\s*:\s*['"][\d.]+['"]/.test(src),
    "install.mjs 兜底不应含 V1 @opencode-ai/plugin 版本号"
  );
});

test("V2 compat: verify.mjs DEP_IMPORT_WHITELIST 不含 V1 @opencode-ai/plugin", () => {
  const src = readFile("scripts/verify.mjs");
  assert.ok(
    !/DEP_IMPORT_WHITELIST\s*=\s*\[[^\]]*["@']\s*@opencode-ai\/plugin/.test(src),
    "白名单不应含 V1 @opencode-ai/plugin"
  );
});

// ── 对外声明：README badge 是 V2 ────────────────────────────────────────

test("V2 compat: README OpenCode badge 是 v2（非 v1.18）", () => {
  const src = readFile("README.md");
  assert.ok(/badge\/OpenCode-v2-/.test(src), "README badge 应为 OpenCode-v2");
  assert.ok(!/badge\/OpenCode-v1\.18-/.test(src), "README badge 不应为 v1.18");
});

// ── men-sidebar 目录结构符合 V2 自动发现约定 ────────────────────────────

test("V2 compat: men-sidebar 目录结构符合 V2 自动发现（index.js + tui.js）", () => {
  const entries = readDir(".opencode/plugins/men-sidebar");
  assert.ok(entries.includes("index.js"), "应有 index.js（server 入口，V2 自动发现约定）");
  assert.ok(entries.includes("tui.js"), "应有 tui.js（TUI 入口，V2 自动发现约定）");
});

// ── 权限 native V2：permissions 数组（非 V1 permission 对象）──────────

test("V2 compat: opencode.json men 权限转 native V2 permissions 数组", () => {
  const oc = JSON.parse(readFile("opencode.json"));
  const men = (oc.agent && oc.agent.men) || (oc.agents && oc.agents.men);
  assert.ok(Array.isArray(men && men.permissions), "men 应有 permissions 数组");
  assert.strictEqual(men.permission, undefined, "men 不应有 V1 permission 对象");
  const hasQuestionAllow = (men.permissions || []).some(
    (r) => r.action === "question" && r.effect === "allow"
  );
  assert.ok(hasQuestionAllow, "men permissions 应含 question allow 规则");
});

test("V2 compat: gh-flow gh-runner 权限转 native V2（shell/subagent，非 bash/task）", () => {
  const gh = JSON.parse(readFile("gh-flow/opencode.gh-flow.json"));
  const runner = (gh.agent && gh.agent["gh-runner"]) || (gh.agents && gh.agents["gh-runner"]);
  assert.ok(Array.isArray(runner && runner.permissions), "gh-runner 应有 permissions 数组");
  assert.strictEqual(runner.permission, undefined, "gh-runner 不应有 V1 permission 对象");
  const perms = runner.permissions || [];
  assert.ok(perms.some((r) => r.action === "shell"), "应用 V2 shell action（非 bash）");
  assert.ok(perms.some((r) => r.action === "subagent"), "应用 V2 subagent action（非 task）");
  // 安全关键 deny 仍存在（git push --force / gh pr merge / npm publish）
  assert.ok(perms.some((r) => r.resource === "git push --force*"), "git push --force deny 应保留");
  assert.ok(perms.some((r) => r.resource === "gh pr merge*"), "gh pr merge deny 应保留");
  assert.ok(perms.some((r) => r.resource === "npm publish*"), "npm publish deny 应保留");
});

test("V2 compat: men.md frontmatter 用 permissions 数组（非 V1 permission）", () => {
  const men = readFile(".opencode/agent/men.md");
  assert.ok(/^permissions:/m.test(men), "men.md 应有 permissions 字段");
  assert.ok(!/^permission:/m.test(men), "men.md 不应有 V1 permission 字段（permissions 不算）");
  assert.ok(men.includes("- action: question"), "men.md permissions 应含 question action");
});

test("V2 compat: install.mjs writeTuiPlugin/unregisterTuiPlugin 已改 no-op", () => {
  const src = readFile("scripts/install.mjs");
  const writeFn = src.match(/function writeTuiPlugin[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(!writeFn.includes("writeFileSync"), "writeTuiPlugin 不应再 writeFileSync tui.json");
  assert.ok(writeFn.includes("return { path: null"), "writeTuiPlugin 应返回 no-op");
  const unregFn = src.match(/function unregisterTuiPlugin[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(!unregFn.includes("writeFileSync"), "unregisterTuiPlugin 不应再 writeFileSync");
  assert.ok(!unregFn.includes("rmSync"), "unregisterTuiPlugin 不应再 rmSync tui.json");
});
