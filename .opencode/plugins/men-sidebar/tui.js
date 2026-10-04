/**
 * men-sidebar — TUI entry (OpenCode V2 · @opencode/plugin/tui)
 *
 * 职责：在 OpenCode TUI 侧边栏渲染 MEN AGENTS 角色→模型分配卡片 + 版本号，
 * 并在后台做 24h 一次的版本更新提示。
 *
 * V2 迁移要点（对照 V1 TuiPluginApi）：
 *   - 插件形态：`export default { id, tui: async (api, options, meta) => … }`
 *              → `export default Plugin.define({ id, setup(ctx) })`
 *   - 侧边栏注册：`api.slots.register({ order, slots: { sidebar_content() } })`
 *              → `ctx.ui.slot({ append: "sidebar.content", render })`，返回 unclaim 函数
 *   - 生命周期：V1 由 `api.lifecycle.onDispose` 回调；V2 由 `setup` 返回 cleanup 函数
 *   - 项目目录：`api.state.path.directory` → `ctx.location?.directory`（LocationRef）
 *   - 运行时 agent：`api.state.config.agent`
 *              → `ctx.data.location.agent.list()`，返回 AgentInfo[]，
 *                其中 `model` 是 ModelRef `{ id, providerID, variant? }`（不再是 `{ provider, model }`）
 *   - 主题：`api.theme.current.{textMuted,border,accent}`（字符串色名）
 *              → `ctx.theme` 为 token 化 ResolvedTheme，`text.subdued` / `border.default` 是 RGBA 对象；
 *                @opentui 颜色属性同时接受 `string | RGBA`，可直接透传
 *   - 版本检查：见 ./update-check.mjs（签名改为 runUpdateCheck(ctx, version)）
 *   - 渲染方式：仍用 @opentui/solid 的 createElement/setProp/insert（V2 保留该命令式 API），
 *     因此无需 JSX 编译，.js 文件即可运行
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { Plugin } from "@opencode/plugin/tui";
import { runUpdateCheck } from "./update-check.mjs";

// 版本号统一变量：跟随项目根 package.json 的真实发布版本；
// 从插件目录向上遍历找最近的祖先 package.json（跳过插件自身），找不到才兜底用插件本地版本。
const __dirname = dirname(fileURLToPath(import.meta.url));

// 调试日志门控：MEN_DEBUG=1（或 true）时输出，默认静默，避免污染 host stdout
const dbg = (...a) => { if (process.env.MEN_DEBUG === "1" || process.env.MEN_DEBUG === "true") { console.log(...a); } };

function readPkg(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { dbg(`[men-sidebar] readPkg 失败: ${p} — ${e?.message ?? e}`); return null; } }
const PKG = (() => {
  // 优先：部署目录里的 VERSION 标记（install.mjs --global 写入，真实发布版本，不依赖 npm 缓存）
  const versionMark = join(__dirname, "VERSION");
  try {
    if (existsSync(versionMark)) {
      const v = readFileSync(versionMark, "utf8").trim();
      if (v) return { version: v, name: "men", source: versionMark };
    }
  } catch {
    dbg(`[men-sidebar] VERSION 读取失败: ${versionMark}`);
  }
  // 其次：从插件目录向上遍历找最近的祖先 package.json（跳过插件自身）
  let d = dirname(__dirname);
  for (let i = 0; i < 10 && d !== dirname(d); i++) {
    const pkg = existsSync(join(d, "package.json")) ? readPkg(join(d, "package.json")) : null;
    if (pkg && pkg.version) return { version: String(pkg.version), name: pkg.name || "", source: d };
    d = dirname(d);
  }
  const self = readPkg(join(__dirname, "package.json"));
  return { version: String(self?.version ?? ""), name: self?.name || "", source: "(plugin self)" };
})();
const VERSION = PKG.version;

dbg(`[men-sidebar] V2 TUI ENTRY LOADED · version source: ${PKG.source} -> ${PKG.name || "?"}@v${VERSION || "?"}`);

// ─────────────────────────── JSONC / men.jsonc 读取 ───────────────────────────

/** 去除 JSONC 注释（// 行注释与块注释），保留字符串字面量内部的内容 */
function stripJsoncComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let inString = false;
  while (i < n) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === "\\") { if (i + 1 < n) out += src[++i]; i++; continue; }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; i++; continue; }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** 安全读取 JSON / JSONC 文件；文件不存在或解析失败返回 null */
function readJsonSafe(p, isJsonc = false) {
  try {
    if (!existsSync(p)) return null;
    let src = readFileSync(p, "utf8");
    if (isJsonc) src = stripJsoncComments(src);
    return JSON.parse(src);
  } catch (e) {
    dbg(`[men-sidebar] readJsonSafe 失败: ${p} — ${e?.message ?? e}`);
    return null;
  }
}

/**
 * 从 ~/.config/opencode/men.jsonc 读取 per-agent 模型分配：
 *   1) preset 字段 → 激活预设名
 *   2) presets[activePreset] → 各 agent 的模型分配
 *   3) agents 字段 → 覆盖预设分配
 * 返回归一化后的 { role: { model } } 结构；无有效分配时返回 null（调用方回退下一来源）。
 */
function readMenJsoncAgents() {
  const home = homedir() || process.env.USERPROFILE || process.env.HOME || "";
  if (!home) return null;
  const p = join(home, ".config", "opencode", "men.jsonc");
  if (!existsSync(p)) { dbg("[men-sidebar] men.jsonc NOT FOUND:", p); return null; }

  const cfg = readJsonSafe(p, true);
  if (!cfg || typeof cfg !== "object") { dbg("[men-sidebar] men.jsonc 解析失败:", p); return null; }

  const presetName = typeof cfg.preset === "string" && cfg.preset ? cfg.preset : null;
  let raw = {};
  if (presetName && cfg.presets && typeof cfg.presets === "object") {
    const preset = cfg.presets[presetName];
    if (preset && typeof preset === "object") raw = Object.assign({}, preset);
    else dbg(`[men-sidebar] men.jsonc 预设 "${presetName}" 不存在，忽略预设分配`);
  } else {
    dbg("[men-sidebar] men.jsonc 无 preset/presets 字段，仅使用 agents 覆盖");
  }

  if (cfg.agents && typeof cfg.agents === "object") {
    const keys = Object.keys(cfg.agents).filter((k) => cfg.agents[k] != null);
    if (keys.length) {
      raw = Object.assign({}, raw, cfg.agents);
      dbg("[men-sidebar] men.jsonc agents overrides:", keys.join(", "));
    }
  }

  const agents = {};
  for (const [name, val] of Object.entries(raw)) {
    if (typeof val === "string" && val) agents[name] = { model: val };
    else if (val && typeof val === "object" && (val.model || val.provider)) agents[name] = val;
  }

  if (!Object.keys(agents).length) { dbg("[men-sidebar] men.jsonc 无有效 agent 分配"); return null; }
  dbg(`[men-sidebar] readAgents from men.jsonc (preset: ${presetName ?? "(无)"}):`, Object.keys(agents).join(", "));
  return agents;
}

/**
 * 汇总 agent→model 分配。来源优先级：
 *   men.jsonc（用户 preset） 覆盖  运行时 agent（V2 ctx.data.location.agent.list）/ 磁盘 opencode.json
 */
function readAgents(dir, runtimeAgents) {
  const menAgents = readMenJsoncAgents();

  let fallbackAgents = {};
  if (runtimeAgents && typeof runtimeAgents === "object" && Object.keys(runtimeAgents).length) {
    dbg("[men-sidebar] readAgents fallback from runtime agents:", Object.keys(runtimeAgents).join(", "));
    fallbackAgents = Object.assign({}, runtimeAgents);
  } else {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const candidates = [];
    if (home) candidates.push(join(home, ".config", "opencode", "opencode.json"));
    candidates.push(join(dir, "opencode.json"));
    for (const p of candidates) {
      try {
        if (!existsSync(p)) { dbg("[men-sidebar] opencode.json NOT FOUND:", p); continue; }
        const cfg = JSON.parse(readFileSync(p, "utf8"));
        // V2 原生字段是 agents，V1 是 agent —— 两者都读，兼容两种配置形态
        const a = cfg.agents ?? cfg.agent ?? {};
        const keys = Object.keys(a);
        if (keys.length) {
          dbg("[men-sidebar] readAgents fallback from " + p + ":", keys.join(", "));
          fallbackAgents = Object.assign({}, fallbackAgents, a);
        }
      } catch (e) {
        console.error("[men-sidebar] readAgents fallback ERROR:", e && e.message ? e.message : String(e));
      }
    }
  }

  if (menAgents) {
    const merged = Object.assign({}, fallbackAgents, menAgents);
    dbg("[men-sidebar] readAgents merged:", Object.keys(merged).join(", "));
    return merged;
  }

  if (!Object.keys(fallbackAgents).length) dbg("[men-sidebar] WARN: no agents found in any source");
  return fallbackAgents;
}

/**
 * 模型显示串。兼容三种形状：
 *   - V1 / 配置形态："provider/model" 字符串，或 { provider, model }
 *   - V2 AgentInfo.model（ModelRef）：{ id, providerID, variant? }
 *   - 嵌套形态：{ provider: { id }, model: { id } }
 */
function modelStr(m) {
  if (typeof m === "string") return m || "—";
  if (m && typeof m === "object") {
    const provider = typeof m.provider === "object" && m.provider ? m.provider.id : (m.provider ?? m.providerID);
    const model = typeof m.model === "object" && m.model ? m.model.id : (m.model ?? m.id);
    if (provider || model) return `${provider ?? "?"}/${model ?? "?"}`;
  }
  return "—";
}

/** 高亮徽章上的前景色：按背景亮度选黑/白（支持 #rgb / #rrggbb，其他格式默认白字） */
function contrastOn(bg) {
  const h = typeof bg === "string" ? bg.trim() : "";
  const lum6 = /^#[0-9a-fA-F]{6}$/.test(h)
    ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    : /^#[0-9a-fA-F]{3}$/.test(h)
      ? [1, 2, 3].map((i) => parseInt(h[i] + h[i], 16) / 255)
      : null;
  if (!lum6) return "#ffffff";
  const [r, g, b] = lum6;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? "#000000" : "#ffffff";
}

/**
 * 从 V2 ResolvedTheme 取卡片配色。
 * V2 主题是 token 化的 RGBA 对象（theme.text.subdued / theme.border.default），
 * @opentui 的颜色属性同时接受 string | RGBA，因此直接透传即可；取不到时返回 undefined（用默认色）。
 */
function themeColors(theme) {
  if (!theme || typeof theme !== "object") return { muted: undefined, border: undefined };
  const text = theme.text && typeof theme.text === "object" ? theme.text : {};
  const border = theme.border && typeof theme.border === "object" ? theme.border : {};
  return {
    muted: text.subdued || text.default || text.subduedColor,
    border: border.default || border.defaultColor,
  };
}

function renderSidebar(dir, theme, el, box, txt, runtimeAgents) {
  if (!el || !box || !txt) {
    console.error("[men-sidebar] renderSidebar: VDOM helpers MISSING");
    return null;
  }
  const agents = readAgents(dir, runtimeAgents);
  const names = Object.keys(agents).sort();
  const { muted, border } = themeColors(theme);
  const rows = names.map((n) =>
    box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      [txt(muted ? { fg: muted, width: 10 } : { width: 10 }, [n]), txt(muted ? { fg: muted } : {}, [modelStr(agents[n] && agents[n].model)])]
    )
  );
  // 标题行：MEN AGENTS 高亮徽章（固定橘黄）+ 版本号
  const badgeBg = "#ff8c00";
  const header = box(
    { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1 },
    [
      box({ paddingLeft: 1, paddingRight: 1, backgroundColor: badgeBg }, [
        txt({ fg: contrastOn(badgeBg) }, ["MEN AGENTS"]),
      ]),
      txt(muted ? { fg: muted } : {}, [`v${VERSION || "?"}`]),
    ]
  );
  const boxProps = { width: "100%", flexDirection: "column", border: { type: "single" }, paddingTop: 1, paddingBottom: 1, paddingLeft: 1, paddingRight: 1 };
  if (border) boxProps.borderColor = border;
  return box(boxProps, [header, ...rows]);
}

export default Plugin.define({
  id: "men-sidebar:tui",
  async setup(ctx) {
    dbg("[men-sidebar] === TUI SETUP CALLED (V2) ===");

    // @opentui/solid 用 dynamic import（避免模块加载失败拖垮整个插件）
    let createElement, setProp, insert;
    try {
      const solid = await import("@opentui/solid");
      createElement = solid.createElement;
      setProp = solid.setProp;
      insert = solid.insert;
      dbg("[men-sidebar] @opentui/solid IMPORTED OK");
    } catch (e) {
      console.error("[men-sidebar] @opentui/solid IMPORT FAILED:", e && e.message ? e.message : String(e));
      return;
    }
    if (typeof createElement !== "function" || typeof setProp !== "function" || typeof insert !== "function") {
      console.error("[men-sidebar] @opentui/solid 缺少 createElement/setProp/insert");
      return;
    }

    const el = (tag, props = {}, children = []) => {
      const node = createElement(tag);
      for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null) setProp(node, k, v);
      for (const c of children) if (c !== null && c !== undefined && c !== false) insert(node, c);
      return node;
    };
    const txt = (p, c = []) => el("text", p, c);
    const box = (p, c = []) => el("box", p, c);

    // 项目目录（V2：ctx.location 是 LocationRef | undefined）
    let dir = undefined;
    try {
      dir = (ctx && ctx.location && ctx.location.directory)
        || (typeof ctx?.data?.location?.default === "function" ? ctx.data.location.default() && ctx.data.location.default().directory : undefined);
    } catch (e) {
      dbg(`[men-sidebar] location 解析失败: ${e && e.message ? e.message : String(e)}`);
    }
    if (!dir) dir = process.cwd();
    dbg("[men-sidebar] directory:", dir);

    // 运行时 agent 分配（V2 原生来源；读不到时回退磁盘配置）
    function readRuntimeAgents() {
      try {
        const list = ctx && ctx.data && ctx.data.location && typeof ctx.data.location.agent?.list === "function"
          ? ctx.data.location.agent.list()
          : undefined;
        if (!Array.isArray(list) || !list.length) return null;
        const out = {};
        for (const a of list) {
          if (a && typeof a.name === "string" && a.name) out[a.name] = { model: a.model };
        }
        return Object.keys(out).length ? out : null;
      } catch (e) {
        dbg(`[men-sidebar] readRuntimeAgents 失败: ${e && e.message ? e.message : String(e)}`);
        return null;
      }
    }

    // 认领侧边栏插槽
    let unclaim;
    try {
      if (!ctx || !ctx.ui || typeof ctx.ui.slot !== "function") {
        console.error("[men-sidebar] ctx.ui.slot NOT AVAILABLE");
        return;
      }
      unclaim = ctx.ui.slot({
        append: "sidebar.content",
        // 渲染失败不能拖垮整个 TUI：记录后返回 null（Solid 中 null = 不渲染任何内容）
        render: () => {
          try {
            return renderSidebar(dir, ctx.theme, el, box, txt, readRuntimeAgents());
          } catch (e) {
            console.error("[men-sidebar] render failed:", e && e.message ? e.message : String(e));
            return null;
          }
        },
      });
      dbg("[men-sidebar] sidebar.content SLOT CLAIMED OK");
    } catch (e) {
      console.error("[men-sidebar] SLOT CLAIM FAILED:", e && e.message ? e.message : String(e));
      return;
    }
    if (typeof unclaim !== "function") {
      dbg("[men-sidebar] WARN: ui.slot 未返回 unclaim 函数");
    }

    // 自动版本检查：fire-and-forget，不 await，避免阻塞 UI 启动
    runUpdateCheck(ctx, VERSION).catch((e) =>
      console.error("[men-sidebar] update check failed:", e && e.message ? e.message : String(e))
    );

    dbg("[men-sidebar] === SETUP COMPLETE ===");

    // 生命周期：TUI 退出 / 插件卸载时取消插槽认领
    return () => {
      if (typeof unclaim === "function") {
        try { unclaim(); } catch { /* best-effort */ }
      }
    };
  },
});
