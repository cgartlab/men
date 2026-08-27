/**
 * men-sidebar — TUI entry (V8)
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
import { runUpdateCheck } from "./update-check.mjs";

// 版本号统一变量：跟随项目根 package.json 的真实发布版本；
// 从插件目录向上遍历找最近的祖先 package.json（跳过插件自身），找不到才兜底用插件本地版本。
const __dirname = dirname(fileURLToPath(import.meta.url));
function readPkg(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
const PKG = (() => {
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
console.log(`[men-sidebar] version source: ${PKG.source} -> ${PKG.name || "?"}@v${VERSION || "?"}`);

function readAgents(dir) {
  // 兜底链：项目级 opencode.json 优先；为空时合并全局 ~/.config/opencode/opencode.json
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [join(dir, "opencode.json")];
  if (home) candidates.push(join(home, ".config", "opencode", "opencode.json"));
  let merged = {};
  for (const p of candidates) {
    try {
      if (!existsSync(p)) { console.log("[men-sidebar] opencode.json NOT FOUND:", p); continue; }
      const cfg = JSON.parse(readFileSync(p, "utf8"));
      const a = cfg.agent ?? {};
      const keys = Object.keys(a);
      if (keys.length) {
        console.log("[men-sidebar] readAgents from " + p + ":", keys.join(", "));
        merged = Object.assign({}, merged, a); // 后读的覆盖先读的 → 全局在前、项目在后（项目优先）
      }
    } catch (e) {
      console.error("[men-sidebar] readAgents ERROR:", e && e.message ? e.message : String(e));
    }
  }
  if (!Object.keys(merged).length) console.log("[men-sidebar] WARN: no agents found in any candidate path");
  return merged;
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

function renderSidebar(dir, theme, el_fn, box_fn, txt_fn) {
  if (!el_fn || !box_fn || !txt_fn) {
    console.error("[men-sidebar] renderSidebar: VDOM helpers MISSING");
    return null;
  }
  const agents = readAgents(dir);
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

console.log("[men-sidebar] === ① TUI ENTRY LOADED (V8) ===");

export default {
  id: "men-sidebar:tui",
  tui: async (api, _options, meta) => {
    console.log("[men-sidebar] === ④ TUI PLUGIN CALLED ===");

    let createElement, setProp, insert;
    try {
      const solid = await import("@opentui/solid");
      createElement = solid.createElement;
      setProp = solid.setProp;
      insert = solid.insert;
      console.log("[men-sidebar] ② @opentui/solid IMPORTED OK");
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
      console.log("[men-sidebar] directory:", dir);

      if (!api || !api.slots || typeof api.slots.register !== "function") {
        console.error("[men-sidebar] ④ api.slots.register NOT AVAILABLE");
        return;
      }

      api.slots.register({
        order: 1000,
        slots: {
          sidebar_content() {
            console.log("[men-sidebar] === ⑤ sidebar_content() RENDER ===");
            return renderSidebar(dir, api.theme, el, box, txt);
          },
        },
      });
      console.log("[men-sidebar] ⑤ SLOT REGISTERED OK");

      // 自动版本检查：fire-and-forget，不 await，避免阻塞 UI 启动
      runUpdateCheck(api, meta, VERSION).catch(() => {});
    } catch (e) {
      console.error("[men-sidebar] SLOT REGISTER FAILED:", e && e.message ? e.message : String(e));
    }
  },
};

console.log("[men-sidebar] === ③ TUI PLUGIN EXPORT COMPLETE ===");
