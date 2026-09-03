#!/usr/bin/env node
/**
 * setup.mjs — 新用户引导式模型配置
 *
 * 纯 Node（零第三方依赖），交互式对话引导新用户完成模型配置。
 *
 * 用法:
 *   node scripts/setup.mjs              # 交互式配置（默认）
 *   node scripts/setup.mjs --help       # 显示帮助
 *   node scripts/setup.mjs --reset      # 强制重新配置
 *   node scripts/setup.mjs --json       # JSON 输出模式
 *   node scripts/setup.mjs --preset <name>  # 使用预设跳过交互（同时写入全局 men.jsonc）
 *   node scripts/setup.mjs --dry-run    # 模拟运行，不写入文件
 *   node scripts/setup.mjs --no-interactive  # 非交互模式（CI/管道）
 *
 * men.jsonc 全局配置（~/.config/opencode/men.jsonc）：
 *   跨项目统一管理 6 个角色的模型预设；schema 见 config/men.schema.json。
 *   兼容行为：men.jsonc 不存在时回退到仅写当前项目 opencode.json。
 *
 * 设计文档: docs/guide/onboarding-design.md
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OPENCODE_JSON = path.join(ROOT, "opencode.json");
const MODELS_JSON = path.join(ROOT, "config", "models.json");
const BACKUP_PATH = path.join(ROOT, "opencode.json.bak");

// 全局 men.jsonc（跨项目模型预设），结构见 config/men.schema.json
const MEN_CONFIG_PATH = path.join(os.homedir(), ".config", "opencode", "men.jsonc");

const ROLES = ["men", "si", "ji", "chi", "yi", "xun"];

const PROVIDER_OPTIONS = [
  { key: "opencode-zen", label: "OpenCode Zen（免费+按量付费）", emoji: "1️⃣" },
  { key: "sensenova", label: "SenseNova（商汤）", emoji: "2️⃣" },
  { key: "huoshan", label: "火山引擎（豆包 / 方舟）", emoji: "3️⃣" },
  { key: "deepseek", label: "DeepSeek 官方", emoji: "4️⃣" },
];

const REGISTER_URLS = {
  "opencode-zen": "https://opencode.ai/zen",
  sensenova: "https://console.sensenova.cn",
  huoshan: "https://console.volcengine.com",
  deepseek: "https://platform.deepseek.com",
};

// ─────────────────────────── 工具函数 ───────────────────────────

function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3041 && code <= 0x33ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xa000 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function pad(str, width) {
  const w = displayWidth(str);
  if (w >= width) return str;
  return str + " ".repeat(width - w);
}

function menSay(text, indent = "") {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const prefix = i === 0 ? "men > " : "      ";
    process.stdout.write(`${indent}${prefix}${lines[i]}\n`);
  }
}

function blank() {
  process.stdout.write("\n");
}

function eprintf(...args) {
  process.stderr.write(args.map((a) => `${a}\n`).join(""));
}

// 剥离 JSONC 注释（// 行注释 与 /* 块注释），保留字符串字面量内的内容。
// JSON 字符串只用双引号；单引号也按字符串起始处理以兼容常见 JSONC 变体。
function stripJsoncComments(raw) {
  let out = "";
  let i = 0;
  let inString = false;
  let quote = "";
  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\" && next !== undefined) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === quote) inString = false;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// ─────────────────────────── 参数解析 ───────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    reset: false,
    json: false,
    preset: null,
    dryRun: false,
    verbose: false,
    noInteractive: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--reset") out.reset = true;
    else if (a === "--json") out.json = true;
    else if (a === "--dry-run") out.dryRun = true;
      else if (a === "--verbose") out.verbose = true;
      else if (a === "--no-interactive") out.noInteractive = true;
      else if (a === "--preset") {
      out.preset = args[++i];
      if (!out.preset) {
        eprintf("错误: --preset 需要参数（default | free）");
        process.exit(2);
      }
    } else {
      eprintf(`未知参数: ${a}（使用 --help 查看用法）`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`men（门）Agent 团队 — 模型配置引导

用法:
  node scripts/setup.mjs              交互式配置（默认）
  node scripts/setup.mjs --help       显示本帮助
  node scripts/setup.mjs --reset      强制重新配置
  node scripts/setup.mjs --json       JSON 输出模式
  node scripts/setup.mjs --preset <name>  使用预设方案
   node scripts/setup.mjs --dry-run    模拟运行，不写入文件
   node scripts/setup.mjs --verbose    打印详细调试信息
   node scripts/setup.mjs --no-interactive  非交互模式（CI/管道）

选项:
   --help, -h          显示帮助信息
   --reset             强制重新配置（忽略已有配置）
   --json              以 JSON 格式输出结果
   --preset <name>     使用预设方案，跳过交互（default | free）；同时写入全局 men.jsonc
   --dry-run           模拟运行，不修改任何文件
   --verbose           打印详细调试信息
   --no-interactive    非交互模式（适合 CI/管道/自动化，已有配置则打印表；无配置则用 default 预设）

men.jsonc 全局配置:
   位于 ~/.config/opencode/men.jsonc，可跨项目统一管理 6 个角色的模型预设。
   交互模式下会检测该文件：已存在则提供预设切换，不存在则询问是否创建。
   --preset 会同步写入/更新 men.jsonc（不存在则自动创建）。

流程: 检测已有配置 → 交互式问答 → 推荐算法 → 确认写入
`);
}

// ─────────────────────────── 数据加载 ───────────────────────────

function loadModels() {
  if (!fs.existsSync(MODELS_JSON)) {
    eprintf(`错误: 模型知识基不存在：${MODELS_JSON}`);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(MODELS_JSON, "utf-8"));
  } catch (e) {
    eprintf(`错误: 解析 models.json 失败：${e.message}`);
    process.exit(2);
  }
}

function readOpencodeJson() {
  if (!fs.existsSync(OPENCODE_JSON)) {
    eprintf(`错误: opencode.json 不存在：${OPENCODE_JSON}`);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf-8"));
  } catch (e) {
    eprintf(`错误: 解析 opencode.json 失败：${e.message}`);
    process.exit(2);
  }
}

function providerName(models, providerKey) {
  return models.providers[providerKey]?.name ?? providerKey;
}

function providerOf(modelId) {
  const idx = modelId.indexOf("/");
  return idx > 0 ? modelId.slice(0, idx) : modelId;
}

// ─────────────────────────── 配置检测 ───────────────────────────

function isConfigured(config) {
  if (!config.agent) return false;
  return ROLES.every((r) => config.agent[r]?.model);
}

function currentAssignment(config) {
  const out = {};
  for (const r of ROLES) {
    out[r] = config.agent?.[r]?.model ?? "";
  }
  return out;
}

// ─────────────────────────── 表格渲染 ───────────────────────────

function renderAssignmentTable(assignment, models, withProvider = true, withCost = true) {
  const headers = ["角色", "模型"];
  if (withProvider) headers.push("Provider");
  if (withCost) headers.push("费用");

  const rows = ROLES.map((role) => {
    const modelId = assignment[role];
    const model = findModel(models, modelId);
    const row = [role, modelId];
    if (withProvider) row.push(providerName(models, providerOf(modelId)));
    if (withCost) row.push(model?.free ? "免费" : "付费");
    return row;
  });

  const colWidths = headers.map((h, i) => {
    let max = displayWidth(h);
    for (const row of rows) {
      const w = displayWidth(row[i] ?? "");
      if (w > max) max = w;
    }
    return max;
  });

  const top = "┌" + colWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const mid = "├" + colWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const bot = "└" + colWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  const fmtRow = (cells) =>
    "│" + cells.map((c, i) => " " + pad(c, colWidths[i]) + " ").join("│") + "│";

  const out = [];
  out.push(top);
  out.push(fmtRow(headers));
  out.push(mid);
  for (const row of rows) out.push(fmtRow(row));
  out.push(bot);
  return out.join("\n");
}

function renderSimpleTable(assignment, models) {
  return renderAssignmentTable(assignment, models, false, false);
}

// ─────────────────────────── 推荐算法 ───────────────────────────

function findModel(models, modelId) {
  for (const provider of Object.values(models.providers)) {
    const m = provider.models.find((m) => m.id === modelId);
    if (m) return m;
  }
  return null;
}

function filterModels(subscriptions, hasPaid, models) {
  const candidates = [];
  for (const providerKey of subscriptions) {
    const provider = models.providers[providerKey];
    if (!provider) continue;
    for (const m of provider.models) {
      // 老用户：选了 opencode-zen 且已有付费套餐时，把 Zen 的付费模型也纳入候选
      if (providerKey === "opencode-zen" && !hasPaid && m.tier !== "free") continue;
      candidates.push(m);
    }
  }
  return candidates;
}

function recommendModel(role, candidates, roleDefaults, preferFree = false) {
  const defaults = roleDefaults[role];
  const candidateMap = {};
  for (const m of candidates) candidateMap[m.id] = m;
  const priority = defaults?.priority ?? [];

  // 优先免费模式：按 priority 顺序找 bestFor 包含该角色的 free 模型
  if (preferFree) {
    for (const modelId of priority) {
      const m = candidateMap[modelId];
      if (m && m.bestFor?.includes(role) && m.free === true) return modelId;
    }
  }

  // OpenCode Zen 付费启发式：若候选池含 Zen 的非免费（按量付费）模型，优先推荐
  // （models.json 后续加入 Zen 付费模型后，这里会自动优先采用）
  for (const m of candidates) {
    if (
      providerOf(m.id) === "opencode-zen" &&
      m.tier !== "free" &&
      m.free !== true &&
      m.bestFor?.includes(role)
    ) {
      return m.id;
    }
  }

  // 按 priority 顺序找 bestFor 包含该角色的 premium 模型
  for (const modelId of priority) {
    const m = candidateMap[modelId];
    if (m && m.bestFor?.includes(role) && m.tier === "premium") return modelId;
  }

  // 按 priority 顺序找 bestFor 包含该角色的 free 模型
  for (const modelId of priority) {
    const m = candidateMap[modelId];
    if (m && m.bestFor?.includes(role) && m.free === true) return modelId;
  }

  // 按 roleDefaults.priority 顺序直接匹配
  for (const modelId of priority) {
    if (candidateMap[modelId]) return modelId;
  }

  // 兜底：候选池中的第一个 premium 模型（按 priority 中的 provider 顺序）
  for (const modelId of priority) {
    const m = candidateMap[modelId];
    if (m && m.tier === "premium") return modelId;
  }
  // 如果 priority 里没有匹配的 premium，遍历所有候选找第一个 premium
  const firstPremium = candidates.find((m) => m.tier === "premium");
  if (firstPremium) return firstPremium.id;

  // 最终兜底：使用角色的 fallback
  return defaults?.fallback ?? "sensenova/sensenova-6.8-flash-lite";
}

function generateAssignment(subscriptions, hasPaid, models) {
  const candidates = filterModels(subscriptions, hasPaid, models);
  const assignment = {};
  const lightRoles = new Set(["yi", "xun"]);

  for (const role of ROLES) {
    const preferFree = !hasPaid || lightRoles.has(role);
    assignment[role] = recommendModel(
      role,
      candidates,
      models.roleDefaults,
      preferFree,
    );
  }
  return assignment;
}

function calcStats(assignment, models) {
  let premiumCount = 0;
  let freeCount = 0;
  const providers = new Set();
  const warnings = [];

  for (const role of ROLES) {
    const modelId = assignment[role];
    const m = findModel(models, modelId);
    if (m) {
      if (m.free) freeCount++;
      else premiumCount++;
    }
    providers.add(providerOf(modelId));
  }

  if (freeCount > 0 && premiumCount === 0) {
    warnings.push("全部使用免费模型，复杂推理、长文写作、代码生成等任务能力有限");
  }

  return {
    premiumCount,
    freeCount,
    providersUsed: [...providers],
    warnings,
  };
}

// ─────────────────────────── 配置写入 ───────────────────────────

function writeConfig(assignment, models, dryRun = false) {
  const result = { ok: false, backupPath: null, written: false, error: null };

  if (dryRun) {
    result.ok = true;
    return result;
  }

  const config = readOpencodeJson();

  // 备份
  try {
    fs.copyFileSync(OPENCODE_JSON, BACKUP_PATH);
    result.backupPath = BACKUP_PATH;
  } catch (e) {
    eprintf(`警告: 备份 opencode.json 失败：${e.message}`);
  }

  // 构建新配置（仅修改 agent 字段下的 model）
  const newConfig = { ...config };
  newConfig.agent = { ...(config.agent || {}) };
  for (const role of ROLES) {
    newConfig.agent[role] = { ...(newConfig.agent[role] || {}) };
    newConfig.agent[role].model = assignment[role];
  }

  // 写入
  try {
    fs.writeFileSync(OPENCODE_JSON, JSON.stringify(newConfig, null, 2) + "\n");
    result.written = true;
  } catch (e) {
    result.error = `写入 opencode.json 失败：${e.message}`;
    // 尝试回滚
    if (result.backupPath) {
      try {
        fs.copyFileSync(result.backupPath, OPENCODE_JSON);
        eprintf("已回滚到备份文件");
      } catch (rb) {
        eprintf(`回滚失败：${rb.message}`);
      }
    }
    return result;
  }

  // 验证写入结果
  try {
    const verifyConfig = JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf-8"));
    const verifyOk = ROLES.every((r) => verifyConfig.agent?.[r]?.model === assignment[r]);
    if (!verifyOk) {
      result.error = "写入后验证失败：内容不一致";
      if (result.backupPath) {
        try {
          fs.copyFileSync(result.backupPath, OPENCODE_JSON);
          eprintf("已回滚到备份文件");
        } catch (rb) {
          eprintf(`回滚失败：${rb.message}`);
        }
      }
      return result;
    }
  } catch (e) {
    result.error = `验证写入结果失败：${e.message}`;
    return result;
  }

  result.ok = true;
  return result;
}

// ─────────────────────────── men.jsonc 全局配置 ───────────────────────────
// 全局模型预设文件：~/.config/opencode/men.jsonc（结构见 config/men.schema.json）。
// 兼容行为：文件不存在时返回 null，调用方回退到仅写当前项目 opencode.json。

// 读取 men.jsonc：解析失败打印警告并返回 null（视为无配置）
function readMenConfig() {
  if (!fs.existsSync(MEN_CONFIG_PATH)) return null;
  try {
    const raw = fs.readFileSync(MEN_CONFIG_PATH, "utf8");
    return JSON.parse(stripJsoncComments(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));
  } catch (e) {
    eprintf(`警告: 解析 men.jsonc 失败（${MEN_CONFIG_PATH}）：${e.message}`);
    return null;
  }
}

// 写入 men.jsonc：自动创建目录；覆盖前备份为 men.jsonc.bak；失败回滚
function writeMenConfig(config, dryRun = false) {
  const result = { ok: false, path: MEN_CONFIG_PATH, backupPath: null, written: false, error: null };
  if (dryRun) {
    result.ok = true;
    return result;
  }
  try {
    fs.mkdirSync(path.dirname(MEN_CONFIG_PATH), { recursive: true });
  } catch (e) {
    result.error = `创建配置目录失败：${e.message}`;
    return result;
  }
  if (fs.existsSync(MEN_CONFIG_PATH)) {
    const bak = `${MEN_CONFIG_PATH}.bak`;
    try {
      fs.copyFileSync(MEN_CONFIG_PATH, bak);
      result.backupPath = bak;
    } catch (e) {
      eprintf(`警告: 备份 men.jsonc 失败：${e.message}`);
    }
  }
  try {
    fs.writeFileSync(MEN_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
    result.written = true;
    result.ok = true;
  } catch (e) {
    result.error = `写入 men.jsonc 失败：${e.message}`;
    if (result.backupPath) {
      try {
        fs.copyFileSync(result.backupPath, MEN_CONFIG_PATH);
        eprintf("已回滚 men.jsonc 到备份");
      } catch (rb) {
        eprintf(`回滚失败：${rb.message}`);
      }
    }
  }
  return result;
}

// 从 models.json 的预设提取 6 角色 model 映射（men.schema.json 要求 preset 只含角色 key）
function presetEntryFromModels(p) {
  const entry = {};
  for (const role of ROLES) {
    if (p?.[role]) entry[role] = p[role];
  }
  return entry;
}

// 用 models.json 的预设构建全新 men.jsonc 配置（仅角色 key，符合 schema）
function buildDefaultMenConfig(presetName, models) {
  const presets = {};
  for (const [name, p] of Object.entries(models.presets ?? {})) {
    presets[name] = presetEntryFromModels(p);
  }
  return { preset: presetName, presets, agents: {} };
}

// 把指定预设记录进 men.jsonc：已存在则更新 preset 字段并补入缺失的预设定义；不存在则创建。
// 仅操作 men.jsonc，不动 opencode.json（由调用方负责同步）。
function syncMenConfigPreset(presetName, models, dryRun = false) {
  const existing = readMenConfig();
  let cfg;
  let created = false;
  if (existing) {
    cfg = existing;
    if (!cfg.presets) cfg.presets = {};
    if (!cfg.presets[presetName] && models.presets?.[presetName]) {
      cfg.presets[presetName] = presetEntryFromModels(models.presets[presetName]);
    }
    cfg.preset = presetName;
  } else {
    cfg = buildDefaultMenConfig(presetName, models);
    created = true;
  }
  const wr = writeMenConfig(cfg, dryRun);
  return { ok: wr.ok, created, path: wr.path, backupPath: wr.backupPath, error: wr.error };
}

// 创建 men.jsonc（default/free 预设）并同步当前项目 opencode.json。先写 opencode.json（主目标），再写 men.jsonc。
function createMenConfigWithPreset(presetName, models, dryRun = false) {
  const preset = models.presets?.[presetName];
  if (!preset) {
    return { ok: false, error: `未知预设 "${presetName}"（models.json 中不存在）` };
  }
  const assignment = {};
  for (const role of ROLES) assignment[role] = preset[role];
  const owr = writeConfig(assignment, models, dryRun);
  if (!owr.ok) return { ok: false, error: owr.error };

  const cfg = buildDefaultMenConfig(presetName, models);
  const wr = writeMenConfig(cfg, dryRun);
  return {
    ok: wr.ok,
    created: true,
    path: wr.path,
    backupPath: wr.backupPath,
    opencodeJson: owr.ok,
    error: wr.ok ? null : wr.error,
  };
}

// 切换 men.jsonc 中的活动预设，并同步当前项目 opencode.json（agents 覆盖优先）。
function switchPreset(presetName, models, dryRun = false) {
  const result = { ok: false, preset: presetName, menFile: null, opencodeJson: false, backupPath: null, error: null };
  const menCfg = readMenConfig();
  if (!menCfg) {
    result.error = `men.jsonc 不存在（${MEN_CONFIG_PATH}），无法切换预设`;
    return result;
  }
  if (!menCfg.presets) menCfg.presets = {};
  let preset = menCfg.presets[presetName];
  if (!preset && models.presets?.[presetName]) {
    // men.jsonc 缺少该预设定义时，从 models.json 补入
    preset = presetEntryFromModels(models.presets[presetName]);
    menCfg.presets[presetName] = preset;
  }
  if (!preset) {
    result.error = `未知预设 "${presetName}"（men.jsonc 与 models.json 中均不存在）`;
    return result;
  }

  menCfg.preset = presetName;
  const wr = writeMenConfig(menCfg, dryRun);
  if (!wr.ok) {
    result.error = wr.error;
    return result;
  }
  result.menFile = wr.path;
  result.backupPath = wr.backupPath;

  // 同步 opencode.json：agents 显式覆盖优先于预设值
  const assignment = {};
  for (const role of ROLES) {
    assignment[role] =
      menCfg.agents?.[role]?.model ?? preset[role] ?? models.presets?.[presetName]?.[role] ?? "";
  }
  const missing = ROLES.filter((r) => !assignment[r]);
  if (missing.length > 0) {
    result.error = `预设 "${presetName}" 缺少角色模型：${missing.join(", ")}`;
    return result;
  }
  const owr = writeConfig(assignment, models, dryRun);
  result.opencodeJson = owr.ok;
  if (!owr.ok) {
    result.error = owr.error;
    return result;
  }
  result.ok = true;
  return result;
}

// 解析预设的有效分配：men.jsonc 中该预设优先（含 agents 覆盖），其次 models.json 预设。
// 未知预设时打印错误并退出（与 applyPreset 行为一致，供 --preset 路径使用）。
function resolveAssignment(presetName, models, menCfg = null) {
  const menPreset = menCfg?.presets?.[presetName];
  const modelPreset = models.presets?.[presetName];
  if (!menPreset && !modelPreset) {
    const supported = Object.keys(models.presets ?? {}).join(", ");
    eprintf(`错误: 未知预设 "${presetName}"（支持: ${supported}）`);
    process.exit(2);
  }
  const assignment = {};
  for (const role of ROLES) {
    assignment[role] =
      menCfg?.agents?.[role]?.model ?? menPreset?.[role] ?? modelPreset?.[role] ?? "";
  }
  const missing = ROLES.filter((r) => !assignment[r]);
  if (missing.length > 0) {
    eprintf(`错误: 预设 "${presetName}" 缺少角色模型：${missing.join(", ")}`);
    process.exit(2);
  }
  return assignment;
}

// ─────────────────────────── 交互式输入 ───────────────────────────

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

// ─────────────────────────── men.jsonc 交互 ───────────────────────────

// 已存在 men.jsonc：展示当前预设 + 分配，提供切换。返回 { status: "switched" | "skip" }
async function offerPresetSwitch(rl, menCfg, models, cfg) {
  const presetName = menCfg.preset ?? "default";
  const presetNames = Object.keys(menCfg.presets ?? {});

  menSay("检测到全局配置 men.jsonc。");
  blank();
  menSay(`当前预设: ${presetName}`);
  blank();

  const assignment = {};
  for (const role of ROLES) {
    assignment[role] =
      menCfg.agents?.[role]?.model ??
      menCfg.presets?.[presetName]?.[role] ??
      models.presets?.[presetName]?.[role] ??
      "";
  }
  const table = renderAssignmentTable(assignment, models, true, true);
  for (const line of table.split("\n")) menSay(line, "     ");
  blank();

  if (presetNames.length === 0) {
    menSay("men.jsonc 中没有任何预设定义，跳过。");
    return { status: "skip" };
  }

  menSay("可用预设：");
  for (let i = 0; i < presetNames.length; i++) {
    const name = presetNames[i];
    const label = models.presets?.[name]?.name ?? name;
    const current = name === presetName ? " ← 当前" : "";
    menSay(`${i + 1}️⃣ ${name}（${label}）${current}`, "     ");
  }
  blank();
  menSay("输入序号切换预设，或直接回车跳过。");
  blank();

  while (true) {
    const answer = await question(rl, "你的选择: ");
    if (answer.trim() === "") return { status: "skip" };
    const idx = parseInt(answer, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= presetNames.length) {
      const target = presetNames[idx - 1];
      if (target === presetName) {
        menSay("当前已是该预设，无需切换。");
        return { status: "skip" };
      }
      const sw = switchPreset(target, models, cfg.dryRun);
      if (!sw.ok) {
        eprintf(`错误: 切换预设失败：${sw.error}`);
        return { status: "skip" };
      }
      if (cfg.dryRun) {
        menSay(`[DRY RUN] 将切换预设: ${presetName} → ${target}`);
      } else {
        menSay(`✅ 已切换预设: ${presetName} → ${target}`);
        menSay("已同步 men.jsonc 与当前项目 opencode.json");
      }
      blank();
      return { status: "switched" };
    }
    menSay(`请输入 1-${presetNames.length}，或回车跳过。`);
  }
}

// 无 men.jsonc：询问是否创建（default / free 预设）。返回 { status: "created" | "declined" }
async function offerPresetCreate(rl, models, cfg) {
  menSay("未检测到全局配置 men.jsonc（~/.config/opencode/men.jsonc）。");
  blank();
  menSay("men.jsonc 是全局模型预设文件，可跨项目统一管理 6 个角色的模型分配，");
  menSay("创建后会以所选预设同步当前项目 opencode.json。");
  blank();
  menSay("是否现在创建？");
  menSay("1️⃣ default 预设（全功能推荐，需已有对应 provider 订阅）", "     ");
  menSay("2️⃣ free 预设（OpenCode Zen 全免费，适合新用户）", "     ");
  menSay("3️⃣ 跳过（不创建 men.jsonc）", "     ");
  blank();

  while (true) {
    const answer = await question(rl, "你的选择 (1-3): ");
    if (answer === "1" || answer === "2") {
      const presetName = answer === "1" ? "default" : "free";
      const created = createMenConfigWithPreset(presetName, models, cfg.dryRun);
      if (!created.ok) {
        eprintf(`错误: 创建 men.jsonc 失败：${created.error}`);
        return { status: "declined" };
      }
      if (cfg.dryRun) {
        menSay(`[DRY RUN] 将创建 men.jsonc（预设: ${presetName}）并同步 opencode.json`);
      } else {
        menSay(`✅ 已创建 men.jsonc（预设: ${presetName}）`);
        menSay("已同步写入当前项目 opencode.json");
      }
      blank();
      return { status: "created" };
    }
    if (answer === "3") return { status: "declined" };
    menSay("请输入 1、2 或 3。");
  }
}

// ─────────────────────────── 对话流程 ───────────────────────────

function printIntro() {
  blank();
  menSay("👋 你好！我是 **men（门）**，Men Agent 团队的编排核心。");
  blank();
  menSay("我们重新配置模型分配，让 Men Agent 团队以最合适的模型组合运行。");
  blank();
  menSay("我会问你几个简单的问题，帮你找到最适合你手上资源的模型组合。");
  menSay("整个过程大概 2-3 分钟，准备好了我们就开始。");
  blank();
}

/**
 * Q1: 询问订阅
 * @returns {Promise<Set<string>>} 用户订阅的 provider key 集合，空集合表示无套餐
 */
async function askQ1(rl, models) {
  menSay("你目前订阅了哪些 AI 服务的套餐？可以多选。");
  blank();
  for (const opt of PROVIDER_OPTIONS) {
    menSay(`${opt.emoji} ${opt.label}`, "     ");
  }
  menSay("5️⃣ 还没有任何套餐", "     ");
  menSay("6️⃣ 我不太确定", "     ");
  blank();
  menSay("直接回复数字（如 1,3 表示选了 OpenCode + 火山引擎）。");
  blank();

  while (true) {
    const answer = await question(rl, "你的选择: ");
    const nums = answer
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (nums.length === 0) {
      menSay("请输入数字选项。");
      continue;
    }

    // 选项 5：无套餐
    if (nums.includes("5")) {
      return new Set();
    }

    // 选项 6：不确定 → 推荐默认方案（按无套餐处理）
    if (nums.includes("6")) {
      menSay("没问题，我先给你推荐一套全免费的组合，你可以之后再升级。");
      blank();
      return new Set();
    }

    // 解析 1-4
    const subs = new Set();
    let invalid = false;
    for (const n of nums) {
      const idx = parseInt(n, 10);
      if (isNaN(idx) || idx < 1 || idx > 4) {
        invalid = true;
        break;
      }
      subs.add(PROVIDER_OPTIONS[idx - 1].key);
    }

    if (invalid) {
      menSay("输入有误，请输入 1-6 之间的数字，多个用逗号分隔。");
      continue;
    }

    return subs;
  }
}

/** Q2: 询问付费情况 */
async function askQ2(rl, subscriptions) {
  const names = [...subscriptions]
    .map((k) => PROVIDER_OPTIONS.find((o) => o.key === k)?.label ?? k)
    .join(" + ");

  menSay(`了解！你选了 ${names}。那目前是付费订阅还是免费额度？`);
  blank();
  menSay("1️⃣ 付费订阅", "     ");
  menSay("2️⃣ 免费额度/试用", "     ");
  blank();

  while (true) {
    const answer = await question(rl, "你的选择 (1-2): ");
    if (answer === "1") return true;
    if (answer === "2") return false;
    menSay("请输入 1 或 2。");
  }
}

/** Q3: 推荐 or 手动指定 */
async function askQ3(rl) {
  menSay("你想为每个角色指定模型，还是让我来推荐最佳组合？");
  blank();
  menSay("1️⃣ 你来推荐（推荐）", "     ");
  menSay("2️⃣ 我自己指定", "     ");
  blank();

  while (true) {
    const answer = await question(rl, "你的选择 (1-2): ");
    if (answer === "1") return "auto";
    if (answer === "2") return "manual";
    menSay("请输入 1 或 2。");
  }
}

/** 展示可用模型列表 */
function showAvailableModels(candidates, models) {
  menSay("以下是你可用的模型资源：");
  blank();
  for (const m of candidates) {
    const icon = m.free ? "🔶" : "🔷";
    const tag = m.free ? "免费" : "付费";
    const pName = providerName(models, providerOf(m.id));
    menSay(`${icon} ${m.id}（${pName}，${tag}）`, "     ");
    menSay(`   ${m.description}`, "          ");
  }
  blank();
}

/** 自动推荐路径 */
async function autoRecommend(rl, subscriptions, hasPaid, models) {
  const candidates = filterModels(subscriptions, hasPaid, models);
  showAvailableModels(candidates, models);

  const assignment = generateAssignment(subscriptions, hasPaid, models);
  menSay("我的推荐方案是：");
  blank();
  const table = renderAssignmentTable(assignment, models, false, false);
  for (const line of table.split("\n")) {
    menSay(line, "     ");
  }
  blank();

  return assignment;
}

/** 手动指定路径 */
async function manualPick(rl, subscriptions, hasPaid, models) {
  const candidates = filterModels(subscriptions, hasPaid, models);
  const assignment = {};

  menSay("好的，我们来逐个角色配置。每个角色我会列出可用的模型供你选择。");
  blank();

  for (let i = 0; i < ROLES.length; i++) {
    const role = ROLES[i];
    const roleDef = models.roleDefaults[role];
    const recommendedId = recommendModel(role, candidates, models.roleDefaults, false);

    menSay(`--- 角色 ${i + 1}/6：${roleDef.roleName} ---`);
    menSay(roleDef.description);
    blank();
    menSay("可选模型：", "     ");

    for (let j = 0; j < candidates.length; j++) {
      const m = candidates[j];
      const rec = m.id === recommendedId ? "推荐 | " : "";
      const tier = m.tier === "premium" ? "付费" : "免费";
      menSay(`${j + 1}️⃣ ${m.id}（${rec}${tier}）`, "     ");
      menSay(`   ${m.description}`, "          ");
    }
    blank();

    while (true) {
      const answer = await question(rl, `请选择 (1-${candidates.length}): `);
      const idx = parseInt(answer, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= candidates.length) {
        assignment[role] = candidates[idx - 1].id;
        break;
      }
      menSay(`请输入 1-${candidates.length} 之间的数字。`);
    }
    blank();
  }

  return assignment;
}

/** 新用户免费路径：首次配置直接应用 OpenCode Zen 免费方案 */
async function handleNewUser(rl, models) {
  const preset = models.presets.free;
  const assignment = {};
  for (const role of ROLES) assignment[role] = preset[role];

  menSay("👋 你好！我是 **men（门）**，Men Agent 团队的编排核心。");
  blank();
  menSay("检测到您是首次配置，将自动应用 **OpenCode Zen 免费模型**方案。");
  menSay("OpenCode Zen 是 OpenCode 官方模型网关，无需订阅即可使用免费模型，适合新用户快速上手。");
  blank();
  menSay("以下是 6 个角色的推荐模型：");
  blank();
  const table = renderAssignmentTable(assignment, models, true, true);
  for (const line of table.split("\n")) {
    menSay(line, "     ");
  }
  blank();

  menSay("⚠️ 免费模型限制说明：");
  menSay("• OpenCode Zen 免费模型在限免期间提供，可能随时变动", "     ");
  menSay("• 免费模型在复杂推理、长文写作、代码生成等任务上能力有限", "     ");
  blank();

  menSay("后续如需升级到付费模型，可选择：");
  menSay("1️⃣ OpenCode Zen 订阅（按量付费，https://opencode.ai/zen）", "     ");
  menSay("2️⃣ 其他 provider 注册（SenseNova / 火山引擎 / DeepSeek）", "     ");
  menSay("   届时可运行 node scripts/setup.mjs --reset 重新配置。", "     ");
  blank();

  while (true) {
    const answer = await question(rl, "确认使用此免费方案写入 opencode.json？(y/n) ");
    const low = answer.toLowerCase();
    if (low === "y" || low === "yes") return assignment;
    if (low === "n" || low === "no") {
      menSay("已取消配置。你可以随时重新运行 node scripts/setup.mjs。");
      process.exit(0);
    }
    menSay("请输入 y 或 n。");
  }
}

/** 无套餐用户处理（兜底路径：老用户 Q1 未选 5/6 之外资源的免费方案） */
async function handleFreeUser(rl, models) {
  const preset = models.presets.free;
  const assignment = {};
  for (const role of ROLES) assignment[role] = preset[role];

  menSay("没问题，没有套餐也可以使用这个项目。以下是推荐给你的免费模型组合：");
  blank();
  const realTable = renderSimpleTable(assignment, models);
  for (const line of realTable.split("\n")) {
    menSay(line, "     ");
  }
  blank();

  menSay("⚠️ 注意：免费模型在复杂推理、长文写作、代码生成等任务上");
  menSay("能力有限，且 OpenCode Zen 免费模型为限免期间提供、可能随时变动。");
  menSay("如果你遇到以下场景，建议升级到按量付费：");
  blank();
  menSay("• 深度推理 / 代码生成 → 推荐 OpenCode Zen 订阅（按量计费）", "     ");
  menSay("• 高质量写作 → 推荐 SenseNova 或 DeepSeek", "     ");
  blank();
  menSay("🔗 注册链接：", "     ");
  menSay("• OpenCode Zen：https://opencode.ai/zen", "     ");
  menSay("• SenseNova 控制台：https://console.sensenova.cn", "     ");
  menSay("• 火山引擎：https://console.volcengine.com", "     ");
  menSay("• DeepSeek：https://platform.deepseek.com", "     ");
  blank();

  return assignment;
}

/** Q4: 确认分配 */
async function confirmAssignment(rl, assignment, models) {
  menSay("最终配置如下：");
  blank();
  const table = renderAssignmentTable(assignment, models, true, true);
  for (const line of table.split("\n")) {
    menSay(line, "     ");
  }
  blank();

  const stats = calcStats(assignment, models);
  menSay(`付费模型: ${stats.premiumCount}  |  免费模型: ${stats.freeCount}`, "     ");
  blank();

  while (true) {
    const answer = await question(rl, "确认写入 opencode.json？(y/n) ");
    const low = answer.toLowerCase();
    if (low === "y" || low === "yes") return true;
    if (low === "n" || low === "no") return false;
    menSay("请输入 y 或 n。");
  }
}

// ─────────────────────────── 预设方案 ───────────────────────────

function applyPreset(presetName, models) {
  const preset = models.presets?.[presetName];
  if (!preset) {
    eprintf(`错误: 未知预设 "${presetName}"（支持: default, free）`);
    process.exit(2);
  }
  const assignment = {};
  for (const role of ROLES) {
    assignment[role] = preset[role];
  }
  return assignment;
}

// ─────────────────────────── 主流程 ───────────────────────────

async function main(argv = process.argv) {
  const cfg = parseArgs(argv);
  const models = loadModels();

  if (cfg.help) {
    printHelp();
    process.exit(0);
  }

  // ── 预设模式：直接应用，跳过交互 ──
  if (cfg.preset) {
    // 有效分配 = men.jsonc 自定义预设优先（含 agents 覆盖），其次 models.json 预设
    const assignment = resolveAssignment(cfg.preset, models, readMenConfig());
    const stats = calcStats(assignment, models);

    let wr = null;
    let menSync = null;
    if (!cfg.dryRun) {
      wr = writeConfig(assignment, models, false);
      if (wr.ok) menSync = syncMenConfigPreset(cfg.preset, models, false);
    }

    if (cfg.json) {
      const result = {
        ok: wr ? wr.ok : true,
        mode: "preset",
        preset: cfg.preset,
        assignment,
        stats,
        warnings: stats.warnings,
        fileWritten: cfg.dryRun ? null : "opencode.json",
        menJsonc: !cfg.dryRun ? (menSync?.ok ? (menSync.created ? "created" : "updated") : "failed") : null,
      };
      if (!cfg.dryRun && !wr.ok) {
        result.ok = false;
        result.error = wr.error;
      } else if (!cfg.dryRun && menSync && !menSync.ok) {
        result.ok = false;
        result.error = menSync.error;
      }
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      process.exit(result.ok ? 0 : 1);
    }

    process.stdout.write(`men（门）Agent 团队 — 应用预设：${cfg.preset}\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    const table = renderAssignmentTable(assignment, models);
    process.stdout.write(table + "\n");
    process.stdout.write(`${"=".repeat(54)}\n`);

    if (cfg.dryRun) {
      process.stdout.write("[DRY RUN] 未写入文件\n");
      process.exit(0);
    }

    if (!wr.ok) {
      eprintf(`错误: ${wr.error}`);
      process.exit(1);
    }
    process.stdout.write(`✅ 预设方案已应用，已写入 opencode.json\n`);
    if (wr.backupPath) {
      process.stdout.write(`   原文件已备份为 opencode.json.bak\n`);
    }
    if (menSync?.ok) {
      process.stdout.write(`✅ men.jsonc 已${menSync.created ? "创建" : "更新"}（全局预设: ${cfg.preset}）\n`);
    } else if (menSync) {
      eprintf(`警告: men.jsonc 同步失败：${menSync.error ?? "未知错误"}`);
    }
    process.exit(0);
  }

  // ── 读取当前配置 ──
  const config = readOpencodeJson();
  const configured = isConfigured(config);

  // ── JSON 模式：非交互，输出当前或推荐 ──
  if (cfg.json) {
    let assignment;
    let mode;
    // dry-run 时始终输出默认推荐（OpenCode Zen 免费预设），便于自动化校验 free 预设
    if (configured && !cfg.reset && !cfg.dryRun) {
      assignment = currentAssignment(config);
      mode = "current";
    } else {
      // JSON 模式下无交互 → 使用 free 预设作为默认
      assignment = applyPreset("free", models);
      mode = "default-free";
      if (!cfg.dryRun) {
        writeConfig(assignment, models, false);
      }
    }
    const stats = calcStats(assignment, models);
    const result = {
      ok: true,
      mode,
      assignment,
      stats,
      warnings: stats.warnings,
      fileWritten: cfg.dryRun ? null : "opencode.json",
    };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(0);
  }

   // ── 非交互模式：跳过 readline，适合 CI/管道 ──
  if (cfg.noInteractive) {
    if (configured) {
      const assignment = currentAssignment(config);
      process.stdout.write(`men（门）Agent 团队 — 当前模型配置\n`);
      process.stdout.write(`${"=".repeat(54)}\n`);
      const table = renderAssignmentTable(assignment, models);
      process.stdout.write(table + "\n");
      process.stdout.write(`${"=".repeat(54)}\n`);
      process.exit(0);
    }

    // 无配置 → 自动使用 default 预设
    const assignment = applyPreset("default", models);
    process.stdout.write(`men（门）Agent 团队 — 非交互模式（使用 default 预设）\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    const table = renderAssignmentTable(assignment, models);
    process.stdout.write(table + "\n");
    process.stdout.write(`${"=".repeat(54)}\n`);

    if (cfg.dryRun) {
      process.stdout.write("[DRY RUN] 未写入文件\n");
      process.exit(0);
    }

    const wr = writeConfig(assignment, models, false);
    if (!wr.ok) {
      eprintf(`错误: ${wr.error}`);
      process.exit(1);
    }
    process.stdout.write(`✅ 默认配置已应用，已写入 opencode.json\n`);
    if (wr.backupPath) {
      process.stdout.write(`   原文件已备份为 opencode.json.bak\n`);
    }
    process.exit(0);
  }

  // ── 已配置 & 未 reset → 打印当前并退出 ──
  if (configured && !cfg.reset) {
    const menCfg = readMenConfig();
    if (menCfg) {
      // 有 men.jsonc → 展示当前预设并提供切换
      const rl = createRL();
      try {
        const outcome = await offerPresetSwitch(rl, menCfg, models, cfg);
        if (outcome.status === "switched") process.exit(0);
      } finally {
        rl.close();
      }
      blank();
    } else {
      // 无 men.jsonc → 询问是否创建（default / free 预设）
      const rl = createRL();
      try {
        const outcome = await offerPresetCreate(rl, models, cfg);
        if (outcome.status === "created") process.exit(0);
      } finally {
        rl.close();
      }
      blank();
    }
    const assignment = currentAssignment(config);
    process.stdout.write(`men（门）Agent 团队 — 当前模型配置\n`);
    process.stdout.write(`${"=".repeat(54)}\n`);
    const table = renderAssignmentTable(assignment, models);
    process.stdout.write(table + "\n");
    process.stdout.write(`${"=".repeat(54)}\n`);
    process.stdout.write(`如需重新配置，请使用 --reset 参数\n`);
    process.exit(0);
  }

  // ── 交互模式 ──
  const rl = createRL();

  try {
    if (cfg.reset && configured) {
      menSay("检测到已有配置，--reset 强制重新配置。");
      blank();
    }

    // ① men.jsonc 全局预设管理（可选）：仅非 reset 场景询问。
    //    新用户/未配置 → 询问是否创建；已有 men.jsonc（如换机同步）→ 展示并提供切换。
    let menOutcome = null;
    if (!cfg.reset) {
      const menCfg = readMenConfig();
      if (menCfg) {
        menOutcome = await offerPresetSwitch(rl, menCfg, models, cfg);
      } else {
        menOutcome = await offerPresetCreate(rl, models, cfg);
      }
    }

    let assignment;
    let confirmed = false;

    if (menOutcome?.status === "switched" || menOutcome?.status === "created") {
      // 已通过 men.jsonc 完成预设应用并同步 opencode.json → 无需再走引导流程
      const fresh = readOpencodeJson();
      assignment = currentAssignment(fresh);
      confirmed = true;
    } else if (!configured) {
      // 新用户：直接进入免费路径，跳过 Q1-Q4
      assignment = await handleNewUser(rl, models);
      confirmed = true;
    } else {
      // 老用户（--reset）：走完整问答流程
      printIntro();
      // Q1: 订阅
      const subscriptions = await askQ1(rl, models);
      blank();

      if (subscriptions.size === 0) {
        // Q1 选 5（无套餐）或 6（不确定）→ 兜底免费路径（OpenCode Zen 免费方案）
        assignment = await handleFreeUser(rl, models);
        confirmed = await confirmAssignment(rl, assignment, models);
      } else {
        // Q2: 付费情况
        const hasPaid = await askQ2(rl, subscriptions);
        blank();

        while (!confirmed) {
          // Q3: 推荐 or 手动
          const mode = await askQ3(rl);
          blank();

          if (mode === "auto") {
            assignment = await autoRecommend(rl, subscriptions, hasPaid, models);
          } else {
            assignment = await manualPick(rl, subscriptions, hasPaid, models);
          }

          confirmed = await confirmAssignment(rl, assignment, models);
          if (!confirmed) {
            menSay("好的，我们重新选择。");
            blank();
          }
        }
      }
    }

    if (!confirmed) {
      menSay("已取消配置。你可以随时重新运行 node scripts/setup.mjs。");
      process.exit(0);
    }

    // 写入
    const wr = writeConfig(assignment, models, cfg.dryRun);
    if (!wr.ok) {
      eprintf(`错误: ${wr.error}`);
      process.exit(1);
    }

    blank();
    process.stdout.write(`✅ 配置完成！已写入 opencode.json\n`);
    blank();
    if (wr.backupPath) {
      process.stdout.write(`  原文件已备份为 opencode.json.bak（如需恢复）\n`);
      blank();
    }
    process.stdout.write(`  你现在可以：\n`);
    process.stdout.write(`  • 重启 OpenCode 加载新配置\n`);
    process.stdout.write(`  • 运行 /ultrawork 开始使用 Men Agent 团队\n`);
    process.stdout.write(`  • 运行 node scripts/setup.mjs --reset 重新配置\n`);
    blank();
    process.exit(0);
  } finally {
    rl.close();
  }
}

// ── 自执行 ──
if (process.argv[1] && process.argv[1].includes("setup.mjs")) {
  main().catch((e) => {
    eprintf(`致命错误: ${e.message}`);
    if (e.stack) eprintf(e.stack);
    process.exit(1);
  });
}

export {
  main,
  parseArgs,
  loadModels,
  generateAssignment,
  filterModels,
  recommendModel,
  findModel,
  calcStats,
  writeConfig,
  applyPreset,
  resolveAssignment,
  isConfigured,
  currentAssignment,
  renderAssignmentTable,
  stripJsoncComments,
  readMenConfig,
  writeMenConfig,
  switchPreset,
  syncMenConfigPreset,
  createMenConfigWithPreset,
  buildDefaultMenConfig,
  MEN_CONFIG_PATH,
};
