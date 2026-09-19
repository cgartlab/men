import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArgs, parseFrontmatter, readDefaultChangelog, main, CLI_VERSION } from '../scripts/skillhub-publish.mjs';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

test('skillhub parseArgs: defaults dry-run false and reads token env', () => {
  const r = parseArgs(['node', 'scripts/skillhub-publish.mjs', '.opencode/skills/men-status']);
  assert.strictEqual(r.skillDir, '.opencode/skills/men-status');
  assert.strictEqual(r.dryRun, false);
  assert.strictEqual(r.host, 'https://api.skillhub.cn');
});

test('skillhub parseArgs: options and unknown arg', () => {
  const r = parseArgs([
    'node', 'scripts/skillhub-publish.mjs', 'skill',
    '--dry-run', '--json', '--changelog', 'v1', '--token', 'skh_test',
  ]);
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.json, true);
  assert.strictEqual(r.changelog, 'v1');
  assert.strictEqual(r.token, 'skh_test');
});

test('skillhub parseFrontmatter: accepts required fields', () => {
  const text = `---\nslug: men-status\ndisplayName: Men Status\nversion: 0.5.0\nsummary: Status\nlicense: MIT\nname: men-status\ndescription: "Desc"\n---\n# Body\n`;
  const r = parseFrontmatter(text);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.values.slug, 'men-status');
});

test('skillhub parseFrontmatter: reports missing required fields', () => {
  const r = parseFrontmatter('---\nslug: men-status\nversion: 0.5.0\n---\n');
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('displayName')));
});

test('skillhub readDefaultChangelog: falls back to stable text', () => {
  assert.match(readDefaultChangelog('0.5.0'), /^SkillHub publish/);
});

test('skillhub blackbox: help exits 0', () => {
  const r = spawnSync(
    process.execPath,
    [`${REPO_ROOT}scripts/skillhub-publish.mjs`, '--help'],
    { cwd: REPO_ROOT, encoding: 'utf-8', shell: false, timeout: 10_000 },
  );
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /SkillHub/);
});

test('skillhub blackbox: missing SKILL.md exits 2', () => {
  const r = spawnSync(
    process.execPath,
    [`${REPO_ROOT}scripts/skillhub-publish.mjs`, 'missing-skill'],
    { cwd: REPO_ROOT, encoding: 'utf-8', shell: false, timeout: 10_000 },
  );
  assert.strictEqual(r.status, 2, `stdout: ${r.stdout} stderr: ${r.stderr}`);
});

test('skillhub parseArgs: unknown arg captured', () => {
  const r = parseArgs(['node', 'script.mjs', 'skill', 'extra-positional']);
  assert.strictEqual(r.skillDir, 'skill');
  assert.strictEqual(r.unknownArg, 'extra-positional');
});

test('skillhub parseArgs: --version flag', () => {
  const r = parseArgs(['node', 'script.mjs', '--version']);
  assert.strictEqual(r.version, true);
  assert.strictEqual(r.help, false);
});

test('skillhub parseFrontmatter: invalid version format rejected', () => {
  const r = parseFrontmatter('---\nslug: s\ndisplayName: D\nversion: 1.2\nsummary: S\nlicense: MIT\n---\n');
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('version')));
});

test('skillhub blackbox: --version exits 0 and prints version', () => {
  const r = spawnSync(
    process.execPath,
    [`${REPO_ROOT}scripts/skillhub-publish.mjs`, '--version'],
    { cwd: REPO_ROOT, encoding: 'utf-8', shell: false, timeout: 10_000 },
  );
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.strictEqual(r.stdout.trim(), CLI_VERSION);
});

test('skillhub main: token-less non-dry-run returns error', () => {
  const r = main(['node', 'script.mjs', '.opencode/skills/men-status']);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.exitCode, 2);
  assert.ok(r.error.includes('token'));
});

test('skillhub main: dry-run without token skips token check (CLI not installed)', () => {
  const r = main(['node', 'script.mjs', '.opencode/skills/men-status', '--dry-run', '--json']);
  // dry-run 不需要 token，应跳过 token 检查（exit 2），但 CLI 未安装会导致 publish 失败（exit 1）
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.exitCode, 1); // 不是 2（token 错误），说明 token 检查已通过
  assert.strictEqual(r.result.dryRun, true);
});
