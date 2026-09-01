/*
 * update-check.test.mjs — update-check.mjs 纯函数测试（Wave 3 首批测试）
 *
 * 约束：
 *   - 只 import node:* 与仓库内模块（update-check.mjs 位于
 *     .opencode/plugins/men-sidebar/，非 scripts/，但其仅依赖 node:*，符合零第三方 V7）
 *   - 只用 node:test 基础 API（test() + assert）
 */
import { test } from 'node:test';
import assert from 'node:assert';

import {
  parseLatestTag,
  compareVersions,
  shouldNotify,
} from '../.opencode/plugins/men-sidebar/update-check.mjs';

// ── parseLatestTag ───────────────────────────────────────
test('update-check parseLatestTag: valid tag', () => {
  assert.strictEqual(
    parseLatestTag('https://github.com/cgartlab/men/releases/tag/v0.3.4'),
    '0.3.4'
  );
});

test('update-check parseLatestTag: multi-segment version', () => {
  assert.strictEqual(
    parseLatestTag('https://github.com/cgartlab/men/releases/tag/v0.3.4.1'),
    '0.3.4.1'
  );
});

test('update-check parseLatestTag: missing v prefix → null', () => {
  assert.strictEqual(
    parseLatestTag('https://github.com/cgartlab/men/releases/tag/0.3.4'),
    null
  );
});

test('update-check parseLatestTag: non-tag URL → null', () => {
  assert.strictEqual(
    parseLatestTag('https://github.com/cgartlab/men/releases/latest'),
    null
  );
});

test('update-check parseLatestTag: null / non-string → null', () => {
  assert.strictEqual(parseLatestTag(null), null);
  assert.strictEqual(parseLatestTag(undefined), null);
  assert.strictEqual(parseLatestTag(123), null);
});

// ── compareVersions ──────────────────────────────────────
test('update-check compareVersions: greater / less / equal', () => {
  assert.strictEqual(compareVersions('1.2.4', '1.2.3'), 1);
  assert.strictEqual(compareVersions('1.2.3', '1.2.4'), -1);
  assert.strictEqual(compareVersions('1.2.3', '1.2.3'), 0);
});

test('update-check compareVersions: segment-wise ordering', () => {
  assert.strictEqual(compareVersions('1.10.0', '1.9.0'), 1);
  assert.strictEqual(compareVersions('2.0.0', '1.99.99'), 1);
});

test('update-check compareVersions: NaN segment → 0 (treated equal)', () => {
  assert.strictEqual(compareVersions('1.a.3', '1.2.3'), 0);
  assert.strictEqual(compareVersions('1.2.3', 'b.2.3'), 0);
});

test('update-check compareVersions: unequal length padded with 0', () => {
  assert.strictEqual(compareVersions('1.2', '1.2.0'), 0);
  assert.strictEqual(compareVersions('1.2.1', '1.2'), 1);
});

// ── shouldNotify ─────────────────────────────────────────
test('update-check shouldNotify: newer latest and not dismissed → true', () => {
  assert.strictEqual(shouldNotify('0.3.4', '0.4.0', ''), true);
});

test('update-check shouldNotify: latest not newer → false', () => {
  assert.strictEqual(shouldNotify('0.4.0', '0.3.4', ''), false);
  assert.strictEqual(shouldNotify('0.4.0', '0.4.0', ''), false);
});

test('update-check shouldNotify: dismissed version suppressed', () => {
  assert.strictEqual(shouldNotify('0.3.4', '0.4.0', '0.4.0'), false);
});

test('update-check shouldNotify: different dismissed version still notifies', () => {
  assert.strictEqual(shouldNotify('0.3.4', '0.4.0', '0.3.5'), true);
});
