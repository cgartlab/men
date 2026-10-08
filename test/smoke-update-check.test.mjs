/**
 * smoke-update-check.test.mjs — scripts/smoke-update-check.mjs 的黑盒回归测试
 *
 * 目的（审计 F3 连带）：冒烟脚本此前按 V1 API 调用 V2 的 runUpdateCheck，
 * 实跑 4 失败 exit 1，且既不在 npm test 也不在任何 workflow 中 → 长期无人发现。
 * 本测试把 smoke 挂进 `node --test`（= npm test）与 CI，且不改 package.json。
 *
 * smoke 全程 mock 全局 fetch，零网络依赖，纯本地执行。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SMOKE = `${REPO_ROOT}scripts/smoke-update-check.mjs`;

test('smoke-update-check: 语法检查通过', () => {
  const r = spawnSync(process.execPath, ['--check', SMOKE], {
    cwd: REPO_ROOT, encoding: 'utf-8', shell: false, timeout: 30_000,
  });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
});

test('smoke-update-check: 黑盒实跑退出码 0 且 0 失败', () => {
  const r = spawnSync(process.execPath, [SMOKE], {
    cwd: REPO_ROOT, encoding: 'utf-8', shell: false, timeout: 60_000,
  });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
  assert.match(r.stdout, /结果：\d+ 通过，0 失败/);
  assert.doesNotMatch(r.stdout, /FAIL/);
});
