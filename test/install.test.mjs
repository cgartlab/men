/*
 * install.test.mjs — install.mjs 测试（Wave 3 首批测试）
 *
 * 约束：
 *   - 只 import node:* 与 ../scripts/install.mjs（零第三方依赖，V7）
 *   - 文件操作全在 os.tmpdir 临时目录内进行，不污染仓库
 *   - 黑盒 spawn 加 --skip-deps --skip-verify 避免外部副作用
 *   - 只用 node:test 基础 API（test() + assert）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  checkNode,
  buildOpencodePkgTemplate,
  FALLBACK_OPENCODE_DEPS,
  isMenRepoRoot,
  copyAllowlist,
  copyTree,
  parseArgs,
  runShim,
} from '../scripts/install.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

function makeTmp(prefix = 'install-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── checkNode ────────────────────────────────────────────
test('install checkNode: current node version ok', () => {
  const r = checkNode();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(typeof r.major, 'number');
  assert.ok(r.major >= 18, 'current node major should be >= 18');
  assert.match(r.version, /^v\d+\.\d+\.\d+$/);
});

// 注：checkNode() 无参，读取 process.versions.node（只读），
// 无法注入「过低/非法 NaN」版本样本 —— 仅能测真实环境的合法分支。
// 过低/NaN 分支在函数签名上不可测（无参数）。

// ── buildOpencodePkgTemplate ─────────────────────────────
test('install buildOpencodePkgTemplate: includes plugin dep', () => {
  const tpl = buildOpencodePkgTemplate();
  assert.ok(tpl.dependencies);
  assert.strictEqual(typeof tpl.dependencies['@opencode-ai/plugin'], 'string');
  assert.ok(tpl.dependencies['@opencode-ai/plugin'].length > 0);
});

test('install FALLBACK_OPENCODE_DEPS: 与 .opencode/package.json 逐字一致（防版本漂移）', () => {
  // 先例：兜底停在 @opencode-ai/plugin 1.18.25，而实际已 1.18.34 —— 新装用户拿到旧依赖。
  // 原测试只断言「是非空字符串」，版本漂移完全不可见；这里改为逐字比对。
  const repoOpencode = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.opencode/package.json'), 'utf8'),
  );
  assert.deepStrictEqual(
    { ...FALLBACK_OPENCODE_DEPS },
    repoOpencode.dependencies,
    'FALLBACK_OPENCODE_DEPS 必须与 .opencode/package.json 的 dependencies 一致',
  );
});

// ── runShim ───────────────────────────────────────────────
test('install runShim: 解析 .cmd shim（Windows）与可执行文件（POSIX）', () => {
  // 回归：install.mjs 曾用 spawnSync("opencode", {shell:false})，而 Windows 上
  // npm 全局包是 .cmd shim，libuv 不解析 → ENOENT。于是 checkOpenCode() 在
  // 每台 Windows 机器上都误报「未安装」。用 npm 断言：它在 Windows 是 .cmd、
  // 在 POSIX 是可执行文件，两边都应解析成功。
  const r = runShim('npm', ['--version']);
  assert.strictEqual(
    r.error && r.error.code,
    undefined,
    `runShim 应能解析 npm，实际错误：${r.error && r.error.code}`,
  );
  assert.strictEqual(r.status, 0, `npm --version 应退出 0，stderr: ${r.stderr}`);
  assert.match(String(r.stdout).trim(), /^\d+\.\d+\.\d+/);
});

// ── isMenRepoRoot ────────────────────────────────────────
test('install isMenRepoRoot: repo root true', () => {
  assert.strictEqual(isMenRepoRoot(REPO_ROOT), true);
});

test('install isMenRepoRoot: empty tmp dir false', () => {
  const tmp = makeTmp();
  try {
    assert.strictEqual(isMenRepoRoot(tmp), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install isMenRepoRoot: nonexistent dir false', () => {
  const tmp = makeTmp();
  try {
    assert.strictEqual(isMenRepoRoot(path.join(tmp, 'nope')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── copyTree ─────────────────────────────────────────────
test('install copyTree: copies tree respecting excludes', () => {
  const src = makeTmp('src-');
  const dst = makeTmp('dst-');
  try {
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(src, 'a.txt'), 'a');
    fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'b');
    fs.mkdirSync(path.join(src, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(src, 'node_modules', 'x.js'), 'x');

    copyTree(src, dst, new Set(['node_modules']));

    assert.ok(fs.existsSync(path.join(dst, 'a.txt')));
    assert.ok(fs.existsSync(path.join(dst, 'sub', 'b.txt')));
    assert.ok(!fs.existsSync(path.join(dst, 'node_modules')), 'excluded dir should not be copied');
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dst, { recursive: true, force: true });
  }
});

// ── copyAllowlist ────────────────────────────────────────
test('install copyAllowlist: only allowlist entries copied', () => {
  const src = makeTmp('src-');
  const dst = makeTmp('dst-');
  try {
    fs.mkdirSync(path.join(src, 'dirA'), { recursive: true });
    fs.writeFileSync(path.join(src, 'dirA', 'keep.txt'), 'keep');
    fs.writeFileSync(path.join(src, 'fileB.txt'), 'file');
    fs.writeFileSync(path.join(src, 'skip.txt'), 'skip');
    fs.mkdirSync(path.join(src, 'dirC'), { recursive: true });
    fs.writeFileSync(path.join(src, 'dirC', 'nested.txt'), 'nested');

    copyAllowlist(src, dst, ['dirA', 'fileB.txt'], new Set(['.env']));

    assert.ok(fs.existsSync(path.join(dst, 'dirA', 'keep.txt')), 'dir in allowlist copied');
    assert.ok(fs.existsSync(path.join(dst, 'fileB.txt')), 'file in allowlist copied');
    assert.ok(!fs.existsSync(path.join(dst, 'skip.txt')), 'non-allowlist file not copied');
    assert.ok(!fs.existsSync(path.join(dst, 'dirC')), 'non-allowlist dir not copied');
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dst, { recursive: true, force: true });
  }
});

test('install copyAllowlist: missing allowlist entries skipped', () => {
  const src = makeTmp('src-');
  const dst = makeTmp('dst-');
  try {
    copyAllowlist(src, dst, ['nonexistent.txt'], new Set([]));
    assert.strictEqual(fs.readdirSync(dst).length, 0);
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dst, { recursive: true, force: true });
  }
});

// ── parseArgs ────────────────────────────────────────────
test('install parseArgs: defaults', () => {
  const r = parseArgs(['node', 'scripts/install.mjs']);
  assert.strictEqual(r.dir, null);
  assert.strictEqual(r.skipDeps, false);
  assert.strictEqual(r.skipVerify, false);
  assert.strictEqual(r.json, false);
  assert.strictEqual(r.help, false);
});

test('install parseArgs: flags', () => {
  const r = parseArgs([
    'node', 'scripts/install.mjs',
    '--dir', 'some/dir',
    '--skip-deps', '--skip-verify', '--json',
  ]);
  assert.strictEqual(r.dir, 'some/dir');
  assert.strictEqual(r.skipDeps, true);
  assert.strictEqual(r.skipVerify, true);
  assert.strictEqual(r.json, true);
});

test('install parseArgs: --dir without value → null', () => {
  const r = parseArgs(['node', 'scripts/install.mjs', '--dir']);
  assert.strictEqual(r.dir, null);
});

test('install parseArgs: --help flag', () => {
  const r = parseArgs(['node', 'scripts/install.mjs', '--help']);
  assert.strictEqual(r.help, true);
});

// 注：parseArgs 遇未知参数会 process.exit(2)，无法在测试进程内安全调用，
// 该分支通过下方黑盒测试覆盖（spawn 子进程断言 exit 2）。

// ── 黑盒：spawn CLI ──────────────────────────────────────
test('install blackbox: --skip-deps --skip-verify --json exits 0', () => {
  const tmp = makeTmp();
  try {
    const r = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'install.mjs'), '--skip-deps', '--skip-verify', '--json'],
      { cwd: tmp, encoding: 'utf-8', shell: false, timeout: 60_000 }
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.copyMode, 'scaffolded');
    assert.strictEqual(j.deps.skipped, true);
    assert.strictEqual(j.verify.skipped, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install blackbox: unknown arg exits 2', () => {
  const tmp = makeTmp();
  try {
    const r = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'install.mjs'), '--bogus'],
      { cwd: tmp, encoding: 'utf-8', shell: false, timeout: 30_000 }
    );
    assert.strictEqual(r.status, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
