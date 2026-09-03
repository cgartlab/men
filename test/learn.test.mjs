/*
 * learn.test.mjs — learn.mjs rebuildIndex() 测试
 *
 * 验证 learn.mjs 自动重建 knowledge/patterns/index.md：
 *   - 有 pattern + error 文件时生成表格行与统计数字
 *   - patterns 目录为空时统计为 0
 *
 * 使用临时目录 + chdir 隔离，避免污染工作区。
 * Zero-dep, Node ESM, Windows pwsh compatible.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ORIG_CWD = process.cwd();
let tmpDir;
let mod;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-test-'));
  process.chdir(tmpDir);
  // 在临时目录内 import，模块级常量（knowledge/patterns、errors）相对临时目录解析
  mod = await import('../scripts/learn.mjs');
});

after(() => {
  process.chdir(ORIG_CWD);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('learn: rebuildIndex generates index with table rows and stats', () => {
  fs.mkdirSync('knowledge/patterns', { recursive: true });
  fs.mkdirSync('errors', { recursive: true });

  // 两个 pattern（created 不同，用于验证排序）+ 一个 error
  const pattern = (id, created) => [
    '---',
    `id: ${id}`,
    'type: anti-pattern',
    `created: ${created}`,
    'status: active',
    '---',
    '',
    '## 模式',
    '',
    '内容',
    '',
  ].join('\n');
  fs.writeFileSync('knowledge/patterns/pattern-2026-09-01.md', pattern('pattern-2026-09-01', '2026-09-01'));
  fs.writeFileSync('knowledge/patterns/pattern-2026-09-02.md', pattern('pattern-2026-09-02', '2026-09-02'));
  fs.writeFileSync('errors/error-2026-09-01.md', '---\nid: error-2026-09-01\ncreated: 2026-09-01\n---\n');

  mod.rebuildIndex();

  const index = fs.readFileSync('knowledge/patterns/index.md', 'utf8');
  // 头部 + 表格行
  assert.ok(index.includes('# Knowledge Patterns Index'), 'has title');
  assert.ok(index.includes('| pattern-2026-09-02 |'), 'has row for newer pattern');
  assert.ok(index.includes('| pattern-2026-09-01 |'), 'has row for older pattern');
  assert.ok(index.includes('[link](pattern-2026-09-01.md)'), 'has file link');
  // 统计数字
  assert.ok(index.includes('- 模式：2 个'), 'pattern count = 2');
  assert.ok(index.includes('- 错误：1 个'), 'error count = 1');
  // created 降序：新 pattern 在前
  assert.ok(index.indexOf('pattern-2026-09-02') < index.indexOf('pattern-2026-09-01'), 'newer pattern first');
});

test('learn: rebuildIndex on empty patterns dir writes zero stats', () => {
  // 清空 patterns 目录（重建空索引，模拟首跑）
  fs.rmSync('knowledge/patterns', { recursive: true, force: true });
  fs.mkdirSync('knowledge/patterns', { recursive: true });
  fs.rmSync('errors', { recursive: true, force: true });

  mod.rebuildIndex();

  const index = fs.readFileSync('knowledge/patterns/index.md', 'utf8');
  assert.ok(index.includes('# Knowledge Patterns Index'), 'has title');
  assert.ok(index.includes('- 模式：0 个'), 'pattern count = 0');
  assert.ok(index.includes('- 错误：0 个'), 'error count = 0');
  // 空索引不应出现任何 pattern 表格行
  assert.ok(!index.includes('| pattern-'), 'no pattern rows when empty');
});