/*
 * verify.test.mjs — verify.mjs 纯函数测试（Wave 3 首批测试）
 *
 * 约束：
 *   - 只 import node:* 与 ../scripts/verify.mjs（零第三方依赖，V7）
 *   - 不 spawn verify.mjs CLI（会触发 checkGate 跑 test 脚本 → 无限递归）
 *   - 只用 node:test 基础 API（test() + assert）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  parseArgs,
  clipErr,
  checkExists,
  checkSecrets,
  checkTodos,
  checkModelsSchema,
  checkBinExportsTargets,
  checkDepsImportConsistency,
  checkCodeHygiene,
  scanEmptyCatchesInText,
  scanSpawnNoTimeoutInText,
  scanBareConsoleLogInText,
} from '../scripts/verify.mjs';

// 临时目录辅助：每次创建独立 tmp 目录，测试后清理
function makeTmp(prefix = 'verify-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── parseArgs ────────────────────────────────────────────
test('verify parseArgs: empty argv', () => {
  const r = parseArgs(['node', 'scripts/verify.mjs']);
  assert.strictEqual(r.target, null);
  assert.strictEqual(r.json, false);
  assert.match(r.sid, /^verify-\d+$/);
});

test('verify parseArgs: target only', () => {
  const r = parseArgs(['node', 'scripts/verify.mjs', 'men']);
  assert.strictEqual(r.target, 'men');
  assert.strictEqual(r.json, false);
});

test('verify parseArgs: --json flag and --sid value', () => {
  const r = parseArgs(['node', 'scripts/verify.mjs', 'scripts/verify.mjs', '--json', '--sid', 'abc123']);
  assert.strictEqual(r.target, 'scripts/verify.mjs');
  assert.strictEqual(r.json, true);
  assert.strictEqual(r.sid, 'abc123');
});

test('verify parseArgs: --sid without value keeps default', () => {
  const r = parseArgs(['node', 'scripts/verify.mjs', 'men', '--sid']);
  assert.strictEqual(r.target, 'men');
  assert.match(r.sid, /^verify-\d+$/);
});

test('verify parseArgs: unknown flag treated as target (actual behavior)', () => {
  const r = parseArgs(['node', 'scripts/verify.mjs', '--bogus']);
  assert.strictEqual(r.target, '--bogus');
  assert.strictEqual(r.json, false);
});

// ── clipErr ──────────────────────────────────────────────
test('verify clipErr: empty / null input', () => {
  assert.strictEqual(clipErr(''), '');
  assert.strictEqual(clipErr(null), '');
  assert.strictEqual(clipErr(undefined), '');
});

test('verify clipErr: short text unchanged', () => {
  const s = 'short';
  assert.strictEqual(clipErr(s, 10), s);
});

test('verify clipErr: long text truncated with markers', () => {
  // 总长 120 > n*2 (100) 才触发截断；head/tail 各保留前 n=50 与后 n=50
  const head = 'A'.repeat(80);
  const tail = 'B'.repeat(40);
  const r = clipErr(head + tail, 50);
  assert.strictEqual(r.slice(0, 50), 'A'.repeat(50));
  assert.ok(r.endsWith('B'.repeat(40)));
  assert.ok(r.includes('（截断）'));
});

test('verify clipErr: exactly 2n length unchanged', () => {
  const s = 'x'.repeat(100);
  assert.strictEqual(clipErr(s, 50), s);
});

// ── checkExists ──────────────────────────────────────────
test('verify checkExists: existing non-empty file PASS', () => {
  const dir = makeTmp();
  try {
    const f = path.join(dir, 'a.txt');
    fs.writeFileSync(f, 'hello');
    const r = checkExists(f);
    assert.strictEqual(r.status, 'PASS');
    assert.match(r.evidence, /字节/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkExists: empty file FAIL', () => {
  const dir = makeTmp();
  try {
    const f = path.join(dir, 'empty.txt');
    fs.writeFileSync(f, '');
    const r = checkExists(f);
    assert.strictEqual(r.status, 'FAIL');
    assert.match(r.evidence, /空/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkExists: missing path FAIL', () => {
  const dir = makeTmp();
  try {
    const r = checkExists(path.join(dir, 'nope.txt'));
    assert.strictEqual(r.status, 'FAIL');
    assert.match(r.evidence, /不存在/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkExists: directory treated as PASS', () => {
  const dir = makeTmp();
  try {
    const r = checkExists(dir);
    assert.strictEqual(r.status, 'PASS');
    assert.match(r.evidence, /目录存在/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── checkSecrets ─────────────────────────────────────────
test('verify checkSecrets: no secrets PASS', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.js'), 'const x = 1;\nexport default x;\n');
    const r = checkSecrets(dir);
    assert.strictEqual(r.status, 'PASS');
    assert.match(r.evidence, /未发现/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkSecrets: hardcoded api key FAIL', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(
      path.join(dir, 'bad.js'),
      'const apiKey = "supersecretvalue123456789";\n'
    );
    const r = checkSecrets(dir);
    assert.strictEqual(r.status, 'FAIL');
    assert.match(r.evidence, /命中/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkSecrets: short value not flagged (>=8 chars required)', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'ok.js'), 'const token = "short";\n');
    const r = checkSecrets(dir);
    assert.strictEqual(r.status, 'PASS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── checkTodos ───────────────────────────────────────────
// 标签字符串用拼接构造，避免本测试文件自身被 todo-scan 命中
const TODO_TAG = `TO${'D'}O`;

test('verify checkTodos: no markers PASS', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'clean.js'), 'const a = 1;\n');
    fs.writeFileSync(path.join(dir, 'clean.md'), '# doc\n');
    const r = checkTodos(dir);
    assert.strictEqual(r.status, 'PASS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkTodos: code file marker FAIL with code type', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'code.js'), `// ${TODO_TAG}: fix later\nconst a = 1;\n`);
    const r = checkTodos(dir);
    assert.strictEqual(r.status, 'FAIL');
    assert.match(r.details, /"type": "code"/);
    assert.match(r.details, /"tag": "TODO"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkTodos: doc file marker WARN with doc type', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'note.md'), `# note\n\n${TODO_TAG}: 待补\n`);
    const r = checkTodos(dir);
    assert.strictEqual(r.status, 'WARN');
    assert.match(r.details, /"type": "doc"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkTodos: code marker wins FAIL over doc marker', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'code.js'), `// ${TODO_TAG}: code\n`);
    fs.writeFileSync(path.join(dir, 'doc.md'), `${TODO_TAG}: doc\n`);
    const r = checkTodos(dir);
    assert.strictEqual(r.status, 'FAIL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── checkModelsSchema ────────────────────────────────────
// 注：checkModelsSchema() 无参、读固定 config/models.json，
// 无法通过公开 API 注入「缺 provider/未知模型/非对象」样本，
// 此处仅测真实仓库配置的 PASS 分支。
test('verify checkModelsSchema: real config PASS', () => {
  const r = checkModelsSchema();
  assert.strictEqual(r.status, 'PASS');
  assert.match(r.details, /\d+ 个模型/);
});

// ── checkBinExportsTargets ───────────────────────────────
test('verify checkBinExportsTargets: real repo PASS', () => {
  const r = checkBinExportsTargets(process.cwd());
  assert.strictEqual(r.status, 'PASS');
  assert.match(r.evidence, /全部存在/);
});

test('verify checkBinExportsTargets: missing bin target FAIL', () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'tmp', bin: { 'tmp-cli': './missing.js' } })
    );
    const r = checkBinExportsTargets(dir);
    assert.strictEqual(r.status, 'FAIL');
    assert.match(r.evidence, /缺失/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify checkBinExportsTargets: no package.json SKIP', () => {
  const dir = makeTmp();
  try {
    const r = checkBinExportsTargets(dir);
    assert.strictEqual(r.status, 'SKIP');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── checkDepsImportConsistency ───────────────────────────
// 注：函数读固定根 package.json + 固定扫描目录，targetPath 参数未被使用，
// 无法注入自定义样本，仅测真实仓库 PASS 分支。
test('verify checkDepsImportConsistency: real repo PASS', () => {
  const r = checkDepsImportConsistency(process.cwd());
  assert.strictEqual(r.status, 'PASS');
});

// ── scanEmptyCatchesInText（空 catch 扫描）───────────────
test('verify scanEmptyCatchesInText: fully empty catch {} hit', () => {
  const hits = scanEmptyCatchesInText('try { foo(); } catch {}\n');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].line, 1);
});

test('verify scanEmptyCatchesInText: empty catch with spaces hit', () => {
  const hits = scanEmptyCatchesInText('try { foo(); } catch {   }\n');
  assert.strictEqual(hits.length, 1);
});

test('verify scanEmptyCatchesInText: multi-line empty catch hit', () => {
  const src = 'try {\n  foo();\n} catch {\n}\n';
  const hits = scanEmptyCatchesInText(src);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].line, 3);
});

test('verify scanEmptyCatchesInText: catch with err param empty hit', () => {
  const hits = scanEmptyCatchesInText('try { foo(); } catch (e) {}\n');
  assert.strictEqual(hits.length, 1);
});

test('verify scanEmptyCatchesInText: comment-only catch allowed', () => {
  const hits = scanEmptyCatchesInText('try { foo(); } catch { /* ignore */ }\n');
  assert.strictEqual(hits.length, 0);
});

test('verify scanEmptyCatchesInText: multi-line comment-only catch allowed', () => {
  const src = 'try {\n  foo();\n} catch {\n  // best-effort\n}\n';
  const hits = scanEmptyCatchesInText(src);
  assert.strictEqual(hits.length, 0);
});

test('verify scanEmptyCatchesInText: catch with statement allowed', () => {
  const hits = scanEmptyCatchesInText('try { foo(); } catch { handle(); }\n');
  assert.strictEqual(hits.length, 0);
});

test('verify scanEmptyCatchesInText: promise .catch() not flagged', () => {
  const hits = scanEmptyCatchesInText('run().catch(() => {});\n');
  assert.strictEqual(hits.length, 0);
});

test('verify scanEmptyCatchesInText: catch in string/comment not flagged', () => {
  const src = '// try { x(); } catch {}\nconst s = "catch {}";\n';
  const hits = scanEmptyCatchesInText(src);
  assert.strictEqual(hits.length, 0);
});

// ── scanSpawnNoTimeoutInText（无 timeout spawnSync）──────
test('verify scanSpawnNoTimeoutInText: spawnSync without timeout hit', () => {
  const hits = scanSpawnNoTimeoutInText('spawnSync("git", ["status"]);\n');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].line, 1);
});

test('verify scanSpawnNoTimeoutInText: spawnSync without timeout in opts hit', () => {
  const hits = scanSpawnNoTimeoutInText('spawnSync("git", args, { cwd, encoding: "utf-8" });\n');
  assert.strictEqual(hits.length, 1);
});

test('verify scanSpawnNoTimeoutInText: multi-line spawnSync without timeout hit', () => {
  const src = 'const r = spawnSync(\n  "cmd",\n  ["/c", "x"],\n  { cwd: dir }\n);\n';
  const hits = scanSpawnNoTimeoutInText(src);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].line, 1);
});

test('verify scanSpawnNoTimeoutInText: timeout numeric allowed', () => {
  const hits = scanSpawnNoTimeoutInText('spawnSync("git", args, { timeout: 30_000 });\n');
  assert.strictEqual(hits.length, 0);
});

test('verify scanSpawnNoTimeoutInText: timeout variable allowed', () => {
  const hits = scanSpawnNoTimeoutInText('spawnSync("git", args, { timeout: SCRIPT_TIMEOUT_MS });\n');
  assert.strictEqual(hits.length, 0);
});

test('verify scanSpawnNoTimeoutInText: multi-line timeout allowed', () => {
  const src = 'const r = spawnSync(\n  "cmd",\n  ["/c", "x"],\n  { cwd: dir, timeout: 60_000 }\n);\n';
  const hits = scanSpawnNoTimeoutInText(src);
  assert.strictEqual(hits.length, 0);
});

test('verify scanSpawnNoTimeoutInText: spawnSync in comment/string not flagged', () => {
  const src = '// cannot call spawnSync("npm") directly\nconst s = "spawnSync(\'x\')";\n';
  const hits = scanSpawnNoTimeoutInText(src);
  assert.strictEqual(hits.length, 0);
});

// ── scanBareConsoleLogInText（裸 console.log 扫描）──────
test('verify scanBareConsoleLogInText: bare console.log hit', () => {
  const hits = scanBareConsoleLogInText('console.log("hello");\n');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].line, 1);
});

test('verify scanBareConsoleLogInText: console.log inside non-MEN_DEBUG if hit', () => {
  const src = 'if (x) { console.log("hello"); }\n';
  const hits = scanBareConsoleLogInText(src);
  assert.strictEqual(hits.length, 1);
});

test('verify scanBareConsoleLogInText: MEN_DEBUG gated console.log allowed', () => {
  const src = 'if (process.env.MEN_DEBUG === "1") { console.log("hello"); }\n';
  const hits = scanBareConsoleLogInText(src);
  assert.strictEqual(hits.length, 0);
});

test('verify scanBareConsoleLogInText: dbg helper definition allowed', () => {
  const src = 'const dbg = (...a) => { if (process.env.MEN_DEBUG === "1") { console.log(...a); } };\n';
  const hits = scanBareConsoleLogInText(src);
  assert.strictEqual(hits.length, 0);
});

test('verify scanBareConsoleLogInText: console.error/warn/debug not flagged', () => {
  const src = 'console.error("err");\nconsole.warn("warn");\nconsole.debug("dbg");\n';
  const hits = scanBareConsoleLogInText(src);
  assert.strictEqual(hits.length, 0);
});

test('verify scanBareConsoleLogInText: console.log in string/comment not flagged', () => {
  const src = '// console.log("hidden")\nconst s = "console.log(\'x\')";\n';
  const hits = scanBareConsoleLogInText(src);
  assert.strictEqual(hits.length, 0);
});

// ── checkCodeHygiene（真实仓库自检）────────────────────
test('verify checkCodeHygiene: real repo PASS', () => {
  const r = checkCodeHygiene();
  assert.strictEqual(r.status, 'PASS');
  assert.match(r.evidence, /未发现/);
});
