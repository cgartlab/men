/**
 * men-sidebar — TUI entry (V9)
 *
 * V9 变更：agent 模型分配读取优先 men.jsonc
 *   （~/.config/opencode/men.jsonc：preset → presets[preset] → agents 覆盖），
 *   不存在或无效时回退到运行时配置 / 磁盘 opencode.json（行为同 V8）。
 *
 * 修复：
 *   1. 所有 static import 放文件顶部（ESM 规范）
 *   2. @opentui/solid 用 dynamic import 放在 tui() 函数内部（避免模块加载失败）
 *   3. 移除 top-level await
 *   4. 诊断日志保留（①-⑤）
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { runUpdateCheck } from "./update-check.mjs";

// 版本号统一变量：跟随项目根 package.json 的真实发布版本；
// 从插件目录向上遍历找最近的祖先 package.json（跳过插件自身），找不到才兜底用插件本地版本。
const __dirname = dirname(fileURLToPath(import.meta.url));

// 调试日志门控：MEN_DEBUG=1（或 true）时输出，默认静默，避免污染 host stdout
// （置于 readPkg 之前：PKG 初始化期间 readPkg 即会被调用，此处必须先于其定义，否则触发 TDZ）
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
    /* VERSION 标记读取失败，回退下一路径 */
    dbg(`[men-sidebar] VERSION 读取失败: ${versionMark}`);
  }
  // 其次：从插件目录向上遍历找最近的祖先 package.json（跳过插件自身），找不到才兜底用插件本地版本。
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

dbg(`[men-sidebar] version source: ${PKG.source} -> ${PKG.name || "?"}@v${VERSION || "?"}`);
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
 * 返回归一化后的 { role: { model } } 结构（与 opencode.json agent 结构一致）；
 * men.jsonc 不存在 / 解析失败 / 无有效分配时返回 null（调用方回退下一来源）。
 */
function readMenJsoncAgents() {
  const home = homedir() || process.env.USERPROFILE || process.env.HOME || "";
  if (!home) return null;
  const p = join(home, ".config", "opencode", "men.jsonc");
  if (!existsSync(p)) { dbg("[men-sidebar] men.jsonc NOT FOUND:", p); return null; }

  const cfg = readJsonSafe(p, true);
  if (!cfg || typeof cfg !== "object") { dbg("[men-sidebar] men.jsonc 解析失败:", p); return null; }

  // 1) 激活预设
  const presetName = typeof cfg.preset === "string" && cfg.preset ? cfg.preset : null;
  let raw = {};
  if (presetName && cfg.presets && typeof cfg.presets === "object") {
    const preset = cfg.presets[presetName];
    if (preset && typeof preset === "object") {
      raw = Object.assign({}, preset);
    } else {
      dbg(`[men-sidebar] men.jsonc 预设 "${presetName}" 不存在，忽略预设分配`);
    }
  } else {
    dbg("[men-sidebar] men.jsonc 无 preset/presets 字段，仅使用 agents 覆盖");
  }

  // 2) agents 覆盖
  if (cfg.agents && typeof cfg.agents === "object") {
    const keys = Object.keys(cfg.agents).filter((k) => cfg.agents[k] != null);
    if (keys.length) {
      raw = Object.assign({}, raw, cfg.agents);
      dbg("[men-sidebar] men.jsonc agents overrides:", keys.join(", "));
    }
  }

  // 归一化：扁平 "role": "modelId" → { role: { model: "modelId" } }；已是对象则原样保留
  const agents = {};
  for (const [name, val] of Object.entries(raw)) {
    if (typeof val === "string" && val) agents[name] = { model: val };
    else if (val && typeof val === "object" && (val.model || val.provider)) agents[name] = val;
  }

  if (!Object.keys(agents).length) { dbg("[men-sidebar] men.jsonc 无有效 agent 分配"); return null; }
  dbg(`[men-sidebar] readAgents from men.jsonc (preset: ${presetName ?? "(无)"}):`, Object.keys(agents).join(", "));
  return agents;
}

function readAgents(dir, runtimeAgents) {
  // 优先：men.jsonc（men 专属配置：preset → presets[preset] → agents 覆盖），
  // 合并：runtime/disk agents 作为兜底（men.jsonc 未列出的 role 保留完整 6 角色）。
  const menAgents = readMenJsoncAgents();

  // 收集兜底 agents（runtime → global opencode.json → local opencode.json）
  let fallbackAgents = {};
  if (runtimeAgents && typeof runtimeAgents === "object" && Object.keys(runtimeAgents).length) {
    dbg("[men-sidebar] readAgents fallback from runtime config:", Object.keys(runtimeAgents).join(", "));
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
        const a = cfg.agent ?? {};
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

  // 合并：men.jsonc 覆盖 fallback 中的同名 role，fallback 保留 men.jsonc 未列出的 role
  if (menAgents) {
    const merged = Object.assign({}, fallbackAgents, menAgents);
    dbg("[men-sidebar] readAgents merged:", Object.keys(merged).join(", "));
    return merged;
  }

  if (!Object.keys(fallbackAgents).length) dbg("[men-sidebar] WARN: no agents found in any source");
  return fallbackAgents;
}

function modelStr(m) {
  if (typeof m === "string") return m;
  if (m && typeof m === "object") return `${m.provider ?? "?"}/${m.model ?? "?"}`;
  return "—";
}

function contrastOn(bg) {
  // 高亮徽章上的前景色：按背景亮度选黑/白（支持 #rgb / #rrggbb，其他格式默认白字）
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

function renderSidebar(dir, theme, el_fn, box_fn, txt_fn, runtimeAgents) {
  if (!el_fn || !box_fn || !txt_fn) {
    console.error("[men-sidebar] renderSidebar: VDOM helpers MISSING");
    return null;
  }
  const agents = readAgents(dir, runtimeAgents);
  const names = Object.keys(agents).sort();
  const t = (theme && theme.current) || {};
  const muted = t.textMuted || t.text || "white";
  const border = t.border || "white";
  const accent = t.accent || t.primary || "blue";
  const rows = names.map((n) =>
    box_fn(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      [txt_fn({ fg: muted, width: 10 }, [n]), txt_fn({ fg: muted }, [modelStr(agents[n] && agents[n].model)])]
    )
  );
  // 标题行：MEN AGENTS 高亮徽章（固定橘黄）+ 版本号
  const badgeBg = "#ff8c00";
  const header = box_fn(
    { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1 },
    [
      box_fn({ paddingLeft: 1, paddingRight: 1, backgroundColor: badgeBg }, [
        txt_fn({ fg: contrastOn(badgeBg) }, ["MEN AGENTS"]),
      ]),
      txt_fn({ fg: muted }, [`v${VERSION || "?"}`]),
    ]
  );
  return box_fn(
    { width: "100%", flexDirection: "column", border: { type: "single" }, borderColor: border, paddingTop: 1, paddingBottom: 1, paddingLeft: 1, paddingRight: 1 },
    [header, ...rows]
  );
}

dbg("[men-sidebar] === ① TUI ENTRY LOADED (V9) ===");

export default {
  id: "men-sidebar:tui",
  tui: async (api, _options, meta) => {
    dbg("[men-sidebar] === ④ TUI PLUGIN CALLED ===");

    let createElement, setProp, insert;
    try {
      const solid = await import("@opentui/solid");
      createElement = solid.createElement;
      setProp = solid.setProp;
      insert = solid.insert;
      dbg("[men-sidebar] ② @opentui/solid IMPORTED OK");
    } catch (e) {
      console.error("[men-sidebar] ② @opentui/solid IMPORT FAILED:", e && e.message ? e.message : String(e));
      return;
    }

    const el = (tag, props = {}, children = []) => {
      const node = createElement(tag);
      for (const [k, v] of Object.entries(props)) if (v !== undefined) setProp(node, k, v);
      for (const c of children) if (c !== null && c !== undefined && c !== false) insert(node, c);
      return node;
    };
    const txt = (p, c = []) => el("text", p, c);
    const box = (p, c = []) => el("box", p, c);

    try {
      const dir = (api && api.state && api.state.path && api.state.path.directory) ? api.state.path.directory : process.cwd();
      dbg("[men-sidebar] directory:", dir);

      if (!api || !api.slots || typeof api.slots.register !== "function") {
        console.error("[men-sidebar] ④ api.slots.register NOT AVAILABLE");
        return;
      }

      api.slots.register({
        order: 1000,
        slots: {
          sidebar_content() {
            dbg("[men-sidebar] === ⑤ sidebar_content() RENDER ===");
            const runtimeAgents = (api.state && api.state.config && api.state.config.agent) || null;
            return renderSidebar(dir, api.theme, el, box, txt, runtimeAgents);
          },
        },
      });
      dbg("[men-sidebar] ⑤ SLOT REGISTERED OK");

      // 自动版本检查：fire-and-forget，不 await，避免阻塞 UI 启动
      runUpdateCheck(api, meta, VERSION).catch(e => console.error("[men-sidebar] update check failed:", e && e.message ? e.message : String(e)));
    } catch (e) {
      console.error("[men-sidebar] SLOT REGISTER FAILED:", e && e.message ? e.message : String(e));
    }
  },
};

dbg("[men-sidebar] === ③ TUI PLUGIN EXPORT COMPLETE ===");
