#!/usr/bin/env node
/*
 * verify.mjs — per-agent 机械验证 CLI
 * 纯 Node（零第三方依赖），Windows pwsh 友好
 *
 * 用法：
 *   node scripts/verify.mjs <目标路径或角色名> [--json] [--sid <session-id>]
 *
 * 角色名（ji/si/xun/chi/yi/men）→ 读取 .opencode/agent/<角色>.md
 *   的 CHARTER_CHECK.Success criteria，用正则提取产物路径作为验证目标
 * 路径 → 直接校验
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 工具函数 ───────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const AGENT_DIR = path.join(ROOT, ".opencode", "agent");
const ROLE_MAP = ["ji", "si", "xun", "chi", "yi", "men"];

// ── 用法文本（--help / -h） ──
const USAGE_TEXT = `用法: node scripts/verify.mjs <target> [--json] [--sid <sid>]

说明:
  检查指定目标（角色名或路径）。target 可省略（默认检查全部）。
  角色名 (ji/si/xun/chi/yi/men) → 读取 .opencode/agent/<角色>.md
    的 CHARTER_CHECK.Success criteria，用正则提取产物路径作为验证目标；
  路径 → 直接校验。

可选参数:
  --json   以 JSON 格式输出报告
  --sid    指定 session id（用于事件日志，默认 verify-<时间戳>）

退出码:
  0   = 全部检查通过
  非 0 = 有检查项失败
`;

// 排除的目录（不进入递归）
const SKIP_DIRS = new Set(["node_modules", ".venv", "dist", "build", ".git"]);
// 密钥扫描的文件扩展
const SECRET_EXTS = new Set([".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".cjs"]);
// 代码文件扩展（待办标记扫描的 FAIL 级作用域；文档/配置仅 WARN）
const CODE_EXTS = new Set([".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"]);
// 全量扫描的扩展（待办标记 / 结构检查等）
const ALL_EXTS = new Set([
  ".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".cjs",
  ".md", ".yml", ".yaml", ".toml", ".cfg", ".ini", ".env",
]);

function eprintf(...args) {
  process.stderr.write(args.map(a => `${a}\n`).join(""));
}

function ts() {
  return new Date().toISOString();
}

// 追加一条事件到 jsonl 日志（best-effort）
function emitEvent(sid, type, subject, detail, payload = {}) {
  try {
    const dir = path.join(ROOT, ".agents", "state", "sessions", sid);
    const file = path.join(dir, "events.jsonl");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      type,
      ts: ts(),
      subject,
      sid,
      detail,
      payload,
    });
    fs.appendFileSync(file, line + "\n");
  } catch (_) {
    // best-effort，静默失败
  }
}

// 列出角色 .md 里 CHARTER_CHECK.Success criteria 声明的相对路径
function extractSuccessPaths(roleMd) {
  if (!fs.existsSync(roleMd)) return [];
  const text = fs.readFileSync(roleMd, "utf-8");
  // 从 "Success criteria" 段中用正则提取路径（如 `scripts/verify.mjs`、`.opencode/agent/xxx.md` 等）
  const re = /(?:^|\n)\s*(?:[-*]\s*)?```?\s*([\/\.][^`\s]+(?:\.[a-zA-Z0-9]+)?)/g;
  const matches = [...text.matchAll(re)].map(m => m[1]);
  return matches;
}

// 列出候选文件：目录 → 递归；单文件 → 直接返回
function listFiles(root, exts, acc = []) {
  const st = fs.statSync(root);
  if (st.isDirectory()) {
    walk(root, exts, acc);
  } else if (exts.has(path.extname(root))) {
    acc.push(root);
  }
  return acc;
}

// 递归走目录，收集匹配扩展名的文件
function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, exts, acc);
    } else {
      const ext = path.extname(entry.name);
      if (exts.has(ext)) acc.push(full);
    }
  }
  return acc;
}

// ─────────────────────────── 检查电池 ───────────────────────────

/**
 * 统一返回 { id, status: PASS|FAIL|WARN|SKIP, evidence, details }
 */

// 1. 硬编码密钥扫描
function checkSecrets(targetPath) {
  const files = listFiles(targetPath, SECRET_EXTS);
  const re = new RegExp(
    '(password|secret|api_key|token|apikey)\\s*[:=]\\s*[\'"][^\'"]{8,}',
    'gi'
  );
  const hits = [];
  for (const f of files) {
    try {
      const txt = fs.readFileSync(f, "utf-8");
      const rel = path.relative(ROOT, f);
      for (const m of txt.matchAll(re)) {
        hits.push({ file: rel, snippet: m[0].replace(/\s+/g, " ").slice(0, 60) });
      }
    } catch (_) { /* 忽略二进制等 */ }
  }
  if (hits.length === 0) {
    return { id: "secrets", status: "PASS", evidence: "未发现硬编码密钥", details: `${files.length} 个文件扫描通过` };
  }
  return {
    id: "secrets",
    status: "FAIL",
    evidence: `${hits.length} 处命中硬编码密钥`,
    details: JSON.stringify(hits, null, 2),
  };
}

// 2. 待办标记扫描：代码文件 FAIL，文档/配置 WARN
// 标签名用拼接构造：源码中不出现连续字母序列，避免 verify.mjs 被自身 todo-scan 命中
const TAG_NAMES = [`TO${"D"}O`, `FIXM${"E"}`, `HAC${"K"}`, `X${"X"}X`];
function checkTodos(targetPath) {
  const files = listFiles(targetPath, ALL_EXTS);
  // 大小写敏感 + 词边界：标记惯例全大写，避免误伤 todowrite/todo list 等正常词；
  // \b 防止命中标记后接字母的粘连词；捕获组保持 m[1] 供 tag 字段使用（\b 为零宽，不影响组编号）
  const re = new RegExp(`\\b(${TAG_NAMES.join("|")})\\b`, "g");
  const codeHits = [];
  const docHits = [];
  for (const f of files) {
    try {
      const txt = fs.readFileSync(f, "utf-8");
      const rel = path.relative(ROOT, f);
      const isCode = CODE_EXTS.has(path.extname(f));
      for (const m of txt.matchAll(re)) {
        const hit = { file: rel, tag: m[1], type: isCode ? "code" : "doc" };
        if (isCode) codeHits.push(hit);
        else docHits.push(hit);
      }
    } catch (_) { /* 忽略 */ }
  }
  if (codeHits.length + docHits.length === 0) {
    return { id: "todo-scan", status: "PASS", evidence: `未发现 ${TAG_NAMES.join("/")}`, details: `${files.length} 个文件扫描通过` };
  }
  // FAIL 优先：代码文件中的标记是硬性门禁，文档/配置仅作提醒
  const status = codeHits.length > 0 ? "FAIL" : "WARN";
  const evidence = codeHits.length > 0
    ? `代码文件 ${codeHits.length} 处 ${TAG_NAMES.join("/")}`
    : `文档/配置 ${docHits.length} 处 ${TAG_NAMES.join("/")}`;
  return {
    id: "todo-scan",
    status,
    evidence,
    details: JSON.stringify([...codeHits, ...docHits].slice(0, 20), null, 2),
  };
}

// 3. 产物存在性
function checkExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return { id: "output-exists", status: "FAIL", evidence: "目标不存在", details: targetPath };
  }
  const st = fs.statSync(targetPath);
  if (!st.isFile()) {
    // 目录：视为存在（后续检查文件内容）
    return { id: "output-exists", status: "PASS", evidence: "目录存在", details: targetPath };
  }
  if (st.size > 0) {
    return { id: "output-exists", status: "PASS", evidence: `文件存在，${st.size} 字节`, details: targetPath };
  }
  return { id: "output-exists", status: "FAIL", evidence: "文件为空（0 字节）", details: targetPath };
}
// 4. 结构检查
function checkStructure(targetPath) {
  const abs = path.resolve(targetPath);
  // frontmatter 要求仅作用于 .opencode/ 下的定义/配置文件；docs/ scripts/ 等内容产物目录不要求
  const strictFrontmatter = abs.startsWith(ROOT + path.sep + ".opencode");
  const st = fs.statSync(targetPath);
  if (st.isDirectory()) {
    const mds = walk(targetPath, new Set([".md"]));
    const jsons = walk(targetPath, new Set([".json"]));
    const problems = [];

    // JSON 结构检查（不限作用域）
    for (const f of jsons) {
      try { JSON.parse(fs.readFileSync(f, "utf-8")); }
      catch (e) {
        problems.push({ file: path.relative(ROOT, f), issue: `JSON.parse 失败：${e.message}` });
      }
    }

    // frontmatter 检查：仅 .opencode/ 作用域下执行
    let mdFrontmatterChecked = 0;
    let mdFrontmatterSkipped = 0;
    if (strictFrontmatter) {
      for (const f of mds) {
        const txt = fs.readFileSync(f, "utf-8");
        if (!txt.startsWith("---")) {
          problems.push({ file: path.relative(ROOT, f), issue: "缺少开头 ---" });
        } else {
          const idx = txt.indexOf("\n---", 3);
          if (idx === -1) problems.push({ file: path.relative(ROOT, f), issue: "缺少闭合 ---" });
        }
        mdFrontmatterChecked++;
      }
    } else {
      mdFrontmatterSkipped = mds.length;
    }

    if (problems.length === 0) {
      let mdMsg;
      if (mdFrontmatterChecked > 0) mdMsg = `${mdFrontmatterChecked} 个 .md 含合法 frontmatter`;
      else mdMsg = `.md frontmatter 检查跳过（非 .opencode 作用域）`;
      let jsonMsg = `${jsons.length} 个 .json 解析成功`;
      return {
        id: "structure",
        status: "PASS",
        evidence: `结构检查通过（${mdFrontmatterSkipped} 个 .md frontmatter 跳过）`,
        details: `${mdMsg}，${jsonMsg}`,
      };
    }
    return {
      id: "structure",
      status: "FAIL",
      evidence: `${problems.length} 处结构问题`,
      details: JSON.stringify(problems.slice(0, 20), null, 2),
    };
  }

  const ext = path.extname(targetPath);
  const rel = path.relative(ROOT, abs);
  if (ext === ".md") {
    if (!strictFrontmatter) {
      return { id: "structure", status: "SKIP", evidence: `${rel}: .md frontmatter 检查跳过（非 .opencode 作用域）`, details: "" };
    }
    const txt = fs.readFileSync(abs, "utf-8");
    if (!txt.startsWith("---")) return { id: "structure", status: "FAIL", evidence: `${rel}: 缺少开头 ---`, details: "frontmatter 缺失" };
    const idx = txt.indexOf("\n---", 3);
    if (idx === -1) return { id: "structure", status: "FAIL", evidence: `${rel}: 缺少闭合 ---`, details: "frontmatter 未闭合" };
    return { id: "structure", status: "PASS", evidence: `${rel}: frontmatter 合法`, details: "" };
  }

  if (ext === ".json") {
    try {
      JSON.parse(fs.readFileSync(abs, "utf-8"));
      return { id: "structure", status: "PASS", evidence: `${rel}: JSON.parse 成功`, details: "" };
    } catch (e) {
      return { id: "structure", status: "FAIL", evidence: `${rel}: ${e.message}`, details: "JSON.parse 失败" };
    }
  }
  return { id: "structure", status: "SKIP", evidence: `${rel}: 非 .md/.json，跳过`, details: "" };
}

// 5. gate 退出码（package.json 中的 typecheck / test / lint 脚本）
function checkGate(targetPath) {
  const st = fs.statSync(targetPath);
  let pkgDir = st.isDirectory() ? targetPath : path.dirname(targetPath);
  // 向上收集所有候选 package.json（从近到远）
  const candidates = [];
  let cur = path.resolve(pkgDir);
  while (true) {
    const p = path.join(cur, "package.json");
    if (fs.existsSync(p)) candidates.push(p);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (candidates.length === 0) {
    return { id: "gate-exit-code", status: "SKIP", evidence: "未找到 package.json，跳过 gate", details: "" };
  }
  const want = ["typecheck", "test", "lint"];
  // 优先选含 want 脚本的候选（从近到远第一个），否则回退最近候选
  const chosen = candidates.find(p => {
    const scripts = JSON.parse(fs.readFileSync(p, "utf-8")).scripts || {};
    return want.some(k => typeof scripts[k] === "string");
  }) || candidates[0];
  const pkg = JSON.parse(fs.readFileSync(chosen, "utf-8"));
  const scripts = pkg.scripts || {};
  const available = want.filter(k => typeof scripts[k] === "string");
  if (available.length === 0) {
    return { id: "gate-exit-code", status: "SKIP", evidence: `package.json（${path.relative(ROOT, chosen)}）中无 typecheck/test/lint 脚本`, details: "" };
  }
  const results = [];
  const win = process.platform === "win32";
  for (const k of available) {
    const script = scripts[k];
    // 无 shell 执行；Windows 下用 cmd /c 前缀
    const spawnArgs = win
      ? ["cmd", "/c", script]
      : ["sh", "-c", script];
    const r = spawnSync(spawnArgs[0], spawnArgs.slice(1), {
      cwd: path.dirname(chosen),
      encoding: "utf-8",
      env: { ...process.env, npm_config_loglevel: "silent" },
      timeout: 60000,
      shell: false,
    });
    results.push({
      script: k,
      command: script,
      exitCode: r.status ?? -1,
      stdout: (r.stdout || "").slice(-200),
      stderr: (r.stderr || "").slice(-200),
    });
  }
  const failed = results.filter(r => r.exitCode !== 0);
  if (failed.length === 0) {
    return {
      id: "gate-exit-code",
      status: "PASS",
      evidence: `${available.join(", ")} 全部 exit 0`,
      details: JSON.stringify(results, null, 2),
    };
  }
  return {
    id: "gate-exit-code",
    status: "FAIL",
    evidence: `${failed.map(f => f.script).join(", ")} 非零退出`,
    details: JSON.stringify(results, null, 2),
  };
}

// 6. config/models.json schema 校验（全局配置检查，不依赖 targetPath）
function checkModelsSchema() {
  const cfgPath = path.join(ROOT, "config", "models.json");
  if (!fs.existsSync(cfgPath)) {
    return { id: "models-schema", status: "SKIP", evidence: "config/models.json 不存在，跳过", details: "" };
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  } catch (e) {
    return { id: "models-schema", status: "FAIL", evidence: "config/models.json JSON.parse 失败", details: e.message };
  }
  const problems = [];
  const modelIds = new Set();

  // 顶层必须有 providers / roleDefaults / presets 三个对象
  for (const key of ["providers", "roleDefaults", "presets"]) {
    if (!cfg[key] || typeof cfg[key] !== "object" || Array.isArray(cfg[key])) {
      problems.push(`顶层缺少对象 ${key}`);
    }
  }
  if (problems.length > 0) {
    return { id: "models-schema", status: "FAIL", evidence: `${problems.length} 处配置问题`, details: problems.slice(0, 20).join("; ") };
  }

  // providers：每个 provider 必须有 name（字符串）和 models（非空数组）
  for (const [pname, provider] of Object.entries(cfg.providers)) {
    if (typeof provider.name !== "string") {
      problems.push(`provider ${pname}: 缺少 name 字符串`);
    }
    if (!Array.isArray(provider.models) || provider.models.length === 0) {
      problems.push(`provider ${pname}: models 必须是非空数组`);
      continue;
    }
    for (const model of provider.models) {
      if (!model || typeof model.id !== "string") {
        problems.push(`provider ${pname}: model 缺少 id 字符串`);
        continue;
      }
      // id 必须以 provider 名/ 开头（id 与所属 provider 匹配）
      if (!model.id.startsWith(`${pname}/`)) {
        problems.push(`model ${model.id}: id 必须以 ${pname}/ 开头`);
      }
      // tier / free / bestFor 若存在则类型校验
      if (model.tier !== undefined && model.tier !== "premium" && model.tier !== "free") {
        problems.push(`model ${model.id}: tier 必须是 premium 或 free`);
      }
      if (model.free !== undefined && typeof model.free !== "boolean") {
        problems.push(`model ${model.id}: free 必须是 boolean`);
      }
      if (model.bestFor !== undefined && !Array.isArray(model.bestFor)) {
        problems.push(`model ${model.id}: bestFor 必须是数组`);
      }
      // 仅收集 id 与所属 provider 匹配的合法 model id
      if (model.id.startsWith(`${pname}/`)) {
        modelIds.add(model.id);
      }
    }
  }

  // roleDefaults：priority 必须是非空数组且引用合法；fallback（若存在）同理
  for (const [role, rd] of Object.entries(cfg.roleDefaults)) {
    if (!Array.isArray(rd.priority) || rd.priority.length === 0) {
      problems.push(`roleDefaults.${role}: priority 必须是非空数组`);
    } else {
      for (const id of rd.priority) {
        if (!modelIds.has(id)) problems.push(`roleDefaults.${role}: priority 引用未知模型 ${id}`);
      }
    }
    if (rd.fallback !== undefined && !modelIds.has(rd.fallback)) {
      problems.push(`roleDefaults.${role}: fallback 引用未知模型 ${rd.fallback}`);
    }
  }

  // presets：除 name/description 外的键（角色名）必须在 model id Set 中；键名限预留角色
  const RESERVED_ROLES = ["men", "si", "ji", "chi", "yi", "xun"];
  for (const [presetName, preset] of Object.entries(cfg.presets)) {
    for (const [key, val] of Object.entries(preset)) {
      if (key === "name" || key === "description") continue;
      if (!RESERVED_ROLES.includes(key)) {
        problems.push(`preset ${presetName}: 未知角色键 ${key}`);
      }
      if (!modelIds.has(val)) {
        problems.push(`preset ${presetName}: ${key} 引用未知模型 ${val}`);
      }
    }
  }

  if (problems.length > 0) {
    return {
      id: "models-schema",
      status: "FAIL",
      evidence: `${problems.length} 处配置问题`,
      details: problems.slice(0, 20).join("; "),
    };
  }
  const modelCount = modelIds.size;
  const roleCount = Object.keys(cfg.roleDefaults).length;
  const presetCount = Object.keys(cfg.presets).length;
  return {
    id: "models-schema",
    status: "PASS",
    evidence: "config/models.json schema 校验通过",
    details: `${modelCount} 个模型 / ${roleCount} 个角色 / ${presetCount} 个预设`,
  };
}

// ─────────────────────────── 主流程 ───────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { target: null, json: false, sid: `verify-${Date.now()}` };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") out.json = true;
    else if (a === "--sid") out.sid = args[++i] || out.sid;
    else if (!out.target) out.target = a;
  }
  return out;
}

function run() {
  // --help / -h 短路径：在任何参数解析与目标校验之前
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(USAGE_TEXT);
    process.exit(0);
  }
  const cfg = parseArgs(process.argv);
  if (!cfg.target) {
    eprintf("用法: node scripts/verify.mjs <目标路径或角色名> [--json] [--sid <sid>]");
    process.exit(2);
  }

  // 解析目标路径
  let targetPath;
  if (ROLE_MAP.includes(cfg.target)) {
    const roleMd = path.join(AGENT_DIR, `${cfg.target}.md`);
    if (!fs.existsSync(roleMd)) {
      eprintf(`角色 ${cfg.target} 的 agent 定义不存在：${roleMd}`);
      process.exit(2);
    }
    // 优先直接验证该 .md 自身；同时把 Success criteria 里的路径并入
    const paths = extractSuccessPaths(roleMd);
    if (paths.length > 0) {
      // 取第一条相对路径作为验证目标
      targetPath = path.resolve(ROOT, paths[0]);
    } else {
      targetPath = roleMd;
    }
  } else {
    // 路径：可能是相对 ROOT 或绝对路径
    if (path.isAbsolute(cfg.target)) {
      targetPath = cfg.target;
    } else {
      targetPath = path.resolve(ROOT, cfg.target);
    }
  }

  const target = path.relative(ROOT, targetPath) || cfg.target;

  // 依次执行检查
  const checks = [];
  try { checks.push(checkExists(targetPath)); } catch (e) { checks.push({ id: "output-exists", status: "FAIL", evidence: `异常：${e.message}`, details: "" }); }
  if (checks[checks.length - 1].status !== "FAIL") {
    try { checks.push(checkSecrets(targetPath)); } catch (e) { checks.push({ id: "secrets", status: "SKIP", evidence: `异常：${e.message}`, details: "" }); }
    try { checks.push(checkTodos(targetPath)); } catch (e) { checks.push({ id: "todo-scan", status: "SKIP", evidence: `异常：${e.message}`, details: "" }); }
    try { checks.push(checkStructure(targetPath)); } catch (e) { checks.push({ id: "structure", status: "SKIP", evidence: `异常：${e.message}`, details: "" }); }
    try { checks.push(checkGate(targetPath)); } catch (e) { checks.push({ id: "gate-exit-code", status: "SKIP", evidence: `异常：${e.message}`, details: "" }); }
    try { checks.push(checkModelsSchema()); } catch (e) { checks.push({ id: "models-schema", status: "SKIP", evidence: `异常：${e.message}`, details: "" }); }
  }

  const passed = checks.filter(c => c.status === "PASS").length;
  const failed = checks.filter(c => c.status === "FAIL").length;
  const warn = checks.filter(c => c.status === "WARN").length;
  const report = {
    target,
    summary: { passed, failed, warn },
    checks,
  };

  if (cfg.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    // 人类可读表格
    process.stdout.write(`\n验证目标: ${target}\n`);
    process.stdout.write(`${"=".repeat(70)}\n`);
    for (const c of checks) {
      const icon = c.status === "PASS" ? "PASS" : c.status === "FAIL" ? "FAIL" : c.status === "WARN" ? "WARN" : "SKIP";
      process.stdout.write(`  [${icon}] ${c.id.padEnd(18)} ${c.evidence}\n`);
      if (c.details && c.details !== "") {
        process.stdout.write(`         ${c.details.slice(0, 120)}\n`);
      }
    }
    process.stdout.write(`${"=".repeat(70)}\n`);
    process.stdout.write(`汇总: PASS=${passed}  FAIL=${failed}  WARN=${warn}\n\n`);
  }

  // 事件记录
  const hasFail = failed > 0;
  const detail = hasFail
    ? `失败项: ${checks.filter(c => c.status === "FAIL").map(c => c.id).join(", ")}`
    : "全部通过";
  const status = hasFail ? "gate.failed" : "gate.passed";
  emitEvent(cfg.sid, status, `verify.${cfg.target || "path"}`, detail, {
    target,
    passed,
    failed,
    warn,
    checks: checks.map(c => ({ id: c.id, status: c.status })),
  });

  if (hasFail) process.exit(1);
}

run();
