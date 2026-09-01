/*
 * release.test.mjs — release.mjs 测试（Wave 3 首批测试）
 *
 * 约束：
 *   - 只 import node:* 与 ../scripts/release.mjs（零第三方依赖，V7）
 *   - 黑盒 spawn 只跑 --dry-run（不写盘、不 git），cwd 用临时目录
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
  bumpVersion,
  bumpChangelog,
  parseArgs,
  procFailInfo,
} from '../scripts/release.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

function makeTmp(prefix = 'release-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── bumpVersion ──────────────────────────────────────────
test('release bumpVersion: patch', () => {
  assert.strictEqual(bumpVersion('1.2.3', 'patch'), '1.2.4');
});

test('release bumpVersion: minor', () => {
  assert.strictEqual(bumpVersion('1.2.3', 'minor'), '1.3.0');
});

test('release bumpVersion: major', () => {
  assert.strictEqual(bumpVersion('1.2.3', 'major'), '2.0.0');
});

test('release bumpVersion: carry 1.9.9 minor → 1.10.0', () => {
  assert.strictEqual(bumpVersion('1.9.9', 'minor'), '1.10.0');
});

test('release bumpVersion: carry 0.9.9 major → 1.0.0', () => {
  assert.strictEqual(bumpVersion('0.9.9', 'major'), '1.0.0');
});

test('release bumpVersion: v-prefixed input not stripped (documented limitation)', () => {
  // 实际行为：bumpVersion 不做 v 前缀剥离，Number('v1') = NaN → "NaN.2.4"
  assert.strictEqual(bumpVersion('v1.2.3', 'patch'), 'NaN.2.4');
});

// ── bumpChangelog ────────────────────────────────────────
test('release bumpChangelog: empty file → new entry only', () => {
  const out = bumpChangelog('', '0.4.0', '2026-09-01');
  assert.match(out, /^## \[v0\.4\.0\] - 2026-09-01/);
  assert.ok(!out.includes('[Unreleased]'));
});

test('release bumpChangelog: no Unreleased → entry inserted at head', () => {
  const input = '## [v0.3.4] - 2026-08-01\n\n### Fixed\n\n- x\n';
  const out = bumpChangelog(input, '0.4.0', '2026-09-01');
  assert.ok(out.indexOf('[v0.4.0]') < out.indexOf('[v0.3.4]'));
  assert.ok(out.includes('### Added'));
});

test('release bumpChangelog: Unreleased with items → migrate items to new entry', () => {
  const input = '# Changelog\n\n## [Unreleased]\n\n- feat: new thing\n\n## [v0.3.4] - 2026-08-01\n';
  const out = bumpChangelog(input, '0.4.0', '2026-09-01');
  // 新条目包含迁移条目
  const entryIdx = out.indexOf('## [v0.4.0]');
  const nextIdx = out.indexOf('## [v0.3.4]');
  const entrySection = out.slice(entryIdx, nextIdx);
  assert.ok(entrySection.includes('- feat: new thing'));
  // Unreleased 保留且复位为空占位
  assert.ok(out.includes('## [Unreleased]'));
  assert.ok(out.includes('### Added\n\n### Changed\n\n### Fixed'));
  // 顺序：Unreleased 在最顶，新条目其次，旧版本最后
  assert.ok(out.indexOf('[Unreleased]') < out.indexOf('[v0.4.0]'));
  assert.ok(out.indexOf('[v0.4.0]') < out.indexOf('[v0.3.4]'));
});

test('release bumpChangelog: Unreleased empty → placeholder subsections', () => {
  const input = '# Changelog\n\n## [Unreleased]\n\n## [v0.3.4] - 2026-08-01\n';
  const out = bumpChangelog(input, '0.4.0', '2026-09-01');
  const entryIdx = out.indexOf('## [v0.4.0]');
  const nextIdx = out.indexOf('## [v0.3.4]');
  const entrySection = out.slice(entryIdx, nextIdx);
  assert.ok(entrySection.includes('### Added'));
  assert.ok(entrySection.includes('### Changed'));
  assert.ok(entrySection.includes('### Fixed'));
});

test('release bumpChangelog: theme blockquote migrated once (no duplicate)', () => {
  const input = '# Changelog\n\n## [Unreleased]\n\n> 工程化加固 + MCP 归属回归\n\n### Added\n\n- feat: new thing\n\n## [v0.3.4] - 2026-08-01\n';
  const out = bumpChangelog(input, '0.4.0', '2026-09-01');
  const entryIdx = out.indexOf('## [v0.4.0]');
  const nextIdx = out.indexOf('## [v0.3.4]');
  const entrySection = out.slice(entryIdx, nextIdx);
  // 主题只出现一次
  const themeCount = (entrySection.match(/> 工程化加固/g) || []).length;
  assert.strictEqual(themeCount, 1);
  // 条目仍迁移
  assert.ok(entrySection.includes('- feat: new thing'));
});

// ── parseArgs ────────────────────────────────────────────
test('release parseArgs: default bump patch', () => {
  const r = parseArgs(['node', 'scripts/release.mjs']);
  assert.strictEqual(r.bump, 'patch');
  assert.strictEqual(r.dryRun, false);
  assert.strictEqual(r.json, false);
});

test('release parseArgs: bump segment + flags', () => {
  const r = parseArgs(['node', 'scripts/release.mjs', 'minor', '--dry-run', '--json']);
  assert.strictEqual(r.bump, 'minor');
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.json, true);
});

test('release parseArgs: --all expands push/ghRelease/npm', () => {
  const r = parseArgs(['node', 'scripts/release.mjs', '--all']);
  assert.strictEqual(r.push, true);
  assert.strictEqual(r.ghRelease, true);
  assert.strictEqual(r.npm, true);
});

test('release parseArgs: unknown arg captured, not thrown', () => {
  const r = parseArgs(['node', 'scripts/release.mjs', '--bogus']);
  assert.strictEqual(r.unknownArg, '--bogus');
});

test('release parseArgs: --help returns help flag', () => {
  const r = parseArgs(['node', 'scripts/release.mjs', '--help']);
  assert.strictEqual(r.help, true);
});

// ── procFailInfo ─────────────────────────────────────────
test('release procFailInfo: status null → timeout message', () => {
  assert.strictEqual(procFailInfo({ status: null }, 30_000), '子进程超时（30s）');
  assert.strictEqual(procFailInfo({ status: null }, 60_000), '子进程超时（60s）');
});

test('release procFailInfo: normal exit code', () => {
  assert.strictEqual(procFailInfo({ status: 0 }, 30_000), 'exit 0');
  assert.strictEqual(procFailInfo({ status: 1 }, 30_000), 'exit 1');
});

test('release procFailInfo: null result → exit -1', () => {
  assert.strictEqual(procFailInfo(null, 30_000), 'exit -1');
  assert.strictEqual(procFailInfo(undefined, 30_000), 'exit -1');
});

// ── 黑盒：dry-run ────────────────────────────────────────
test('release blackbox: --dry-run --json exits 0 with ok:true', () => {
  const tmp = makeTmp();
  try {
    const r = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'release.mjs'), '--dry-run', '--json'],
      { cwd: tmp, encoding: 'utf-8', shell: false, timeout: 30_000 }
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.dryRun, true);
    assert.match(j.newVersion, /^\d+\.\d+\.\d+$/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
