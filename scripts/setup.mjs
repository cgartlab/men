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
 *   node scripts/setup.mjs --preset <name>  # 使用预设跳过交互
 *   node scripts/setup.mjs --dry-run    # 模拟运行，不写入文件
 *   node scripts/setup.mjs --no-interactive  # 非交互模式（CI/管道）
 *
 * 设计文档: docs/guide/onboarding-design.md
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 常量 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OPENCODE_JSON = path.join(ROOT, "opencode.json");
const MODELS_JSON = path.join(ROOT, "config", "models.json");
const BACKUP_PATH = path.join(ROOT, "opencode.json.bak");

const ROLES = ["men", "si", "ji", "chi", "yi", "xun"];

const PROVIDER_OPTIONS = [
  { key: "opencode-go", label: "OpenCode 套餐（opencode-go）", emoji: "1️⃣" },
  { key: "sensenova", label: "SenseNova（商汤）", emoji: "2️⃣" },
  { key: "huoshan", label: "火山引擎（豆包 / 方舟）", emoji: "3️⃣" },
  { key: "deepseek", label: "DeepSeek 官方", emoji: "4️⃣" },
];

const REGISTER_URLS = {
  "opencode-go": "https://opencode.ai/pricing",
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
   --preset <name>     使用预设方案，跳过交互（default | free）
   --dry-run           模拟运行，不修改任何文件
   --verbose           打印详细调试信息
   --no-interactive    非交互模式（适合 CI/管道/自动化，已有配置则打印表；无配置则用 default 预设）

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

// ─────────────────────────── 对话流程 ───────────────────────────

function printIntro() {
  blank();
  menSay("👋 你好！我是 **men（门）**，假维斯 Agent 团队的编排核心。");
  blank();
  menSay("我看到你是第一次使用这个项目，需要先配置 AI 模型才能让整个团队跑起来。");
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

/** 无套餐用户处理 */
async function handleFreeUser(rl, models) {
  const assignment = models.presets.free;

  menSay("没问题，没有套餐也可以使用这个项目。以下是推荐给你的免费模型组合：");
  blank();
  const table = renderSimpleTable(
    { men: "men", si: "si", ji: "ji", chi: "chi", yi: "yi", xun: "xun" },
    models,
  );
  // 用实际模型 id 重新渲染
  const realTable = renderSimpleTable(
    {
      men: "sensenova/sensenova-6.8-flash-lite（免费）",
      si: "sensenova/sensenova-6.8-flash-lite（免费）",
      ji: "sensenova/sensenova-6.8-flash-lite（免费）",
      chi: "sensenova/sensenova-6.8-flash-lite（免费）",
      yi: "sensenova/sensenova-6.8-flash-lite（免费）",
      xun: "sensenova/sensenova-6.8-flash-lite（免费）",
    },
    { providers: {} },
  );
  for (const line of realTable.split("\n")) {
    menSay(line, "     ");
  }
  blank();

  menSay("⚠️ 注意：免费模型在复杂推理、长文写作、代码生成等任务上");
  menSay("能力有限。如果你遇到以下场景，建议升级套餐：");
  blank();
  menSay("• 深度推理 → 推荐 OpenCode 套餐", "     ");
  menSay("• 代码生成 → 推荐火山引擎（有免费额度）", "     ");
  menSay("• 高质量写作 → 推荐 SenseNova 或 DeepSeek", "     ");
  blank();
  menSay("🔗 注册链接：", "     ");
  menSay("• OpenCode 套餐：https://opencode.ai/pricing", "     ");
  menSay("• SenseNova 控制台：https://console.sensenova.cn", "     ");
  menSay("• 火山引擎：https://console.volcengine.com", "     ");
  menSay("• DeepSeek：https://platform.deepseek.com", "     ");
  blank();

  return {
    men: "sensenova/sensenova-6.8-flash-lite",
    si: "sensenova/sensenova-6.8-flash-lite",
    ji: "sensenova/sensenova-6.8-flash-lite",
    chi: "sensenova/sensenova-6.8-flash-lite",
    yi: "sensenova/sensenova-6.8-flash-lite",
    xun: "sensenova/sensenova-6.8-flash-lite",
  };
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
    const assignment = applyPreset(cfg.preset, models);
    const stats = calcStats(assignment, models);

    if (cfg.json) {
      const result = {
        ok: true,
        mode: "preset",
        preset: cfg.preset,
        assignment,
        stats,
        warnings: stats.warnings,
        fileWritten: cfg.dryRun ? null : "opencode.json",
      };
      if (!cfg.dryRun) {
        const wr = writeConfig(assignment, models, false);
        result.ok = wr.ok;
        if (!wr.ok) result.error = wr.error;
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

    const wr = writeConfig(assignment, models, false);
    if (!wr.ok) {
      eprintf(`错误: ${wr.error}`);
      process.exit(1);
    }
    process.stdout.write(`✅ 预设方案已应用，已写入 opencode.json\n`);
    if (wr.backupPath) {
      process.stdout.write(`   原文件已备份为 opencode.json.bak\n`);
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
    if (configured && !cfg.reset) {
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

    printIntro();

    // Q1: 订阅
    const subscriptions = await askQ1(rl, models);
    blank();

    let assignment;
    let confirmed = false;

    if (subscriptions.size === 0) {
      // 无套餐用户
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
    process.stdout.write(`  • 运行 /ultrawork 开始使用假维斯团队\n`);
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

export { main, parseArgs, loadModels, generateAssignment, filterModels, recommendModel, findModel, calcStats, writeConfig, applyPreset, isConfigured, currentAssignment, renderAssignmentTable };
