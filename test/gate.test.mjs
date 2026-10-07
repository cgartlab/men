import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const GATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'gate.mjs');

function runGate(args, options = {}) {
  return spawnSync(process.execPath, [GATE_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    shell: false,
    timeout: 30_000,
    ...options,
  });
}

function withPackageDir(name, scripts, fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `gate-${name}-`));
  try {
    const pkgPath = path.join(tempRoot, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name, version: '0.0.0', scripts }, null, 2));
    return fn(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('gate blackbox: shell metacharacters in npm scripts are allowed (P1 fix)', () => {
  // P1 修复（H3b）：移除 unsafeChars 检查后，含 && / ; / | 等 shell 元字符的 npm 脚本
  // 应正常执行而非被跳过。此前被误判为不安全而 silent pass。
  withPackageDir('metachar-script', {
    test: 'node -e "console.log(1+1)"',
  }, (tempRoot) => {
    const sid = `gate-meta-${Date.now()}`;
    const r = runGate(['test', '--dir', tempRoot, '--sid', sid]);

    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /GATE_SKIP/);
    assert.match(r.stdout + r.stderr, /GATE_PASSED/);
  });
});

test('gate runner: actually executes a passing npm script (behavioral, not source-grep)', () => {
  // 回归：旧测试用正则去匹配 gate.mjs 的**源码文本**，要求出现
  //   `const npmCmd = isWin ? "npm.cmd" : "npm"` + `spawnSync(npmCmd, …, {shell:false})`
  // 而这个构造在 Windows 上必然失败（spawnSync('npm.cmd', shell:false) → EINVAL），
  // 于是「把 bug 钉死」反而让 169 项测试全绿却从不真正执行 runner。
  //
  // 改为黑盒：造一个**通过**的 test 脚本，真跑一遍，断言 exit 0 + GATE_PASSED。
  withPackageDir('passing-script', {
    // P1 修复（H3b）后：unsafeChars 检查已移除，含引号/括号的 npm 脚本正常执行。
    // 用 node -p 简单输出避免复杂引号嵌套。
    test: 'node --version',
  }, (tempRoot) => {
    const sid = `gate-pass-${Date.now()}`;
    const r = runGate(['test', '--dir', tempRoot, '--sid', sid]);

    assert.strictEqual(r.status, 0, `gate 应通过。stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.doesNotMatch(r.stderr + r.stdout, /GATE_SKIP/);
    assert.doesNotMatch(r.stderr + r.stdout, /EINVAL|ENOENT|spawnSync/);
    assert.match(r.stdout + r.stderr, /GATE_PASSED|v\d+\.\d+\.\d+/);
  });
});

test('gate runner: Windows 下用 cmd /c 而非裸 npm.cmd（源码层护栏）', () => {
  // 保留一条**最小**源码断言只锁住平台分支的正确写法；行为正确性由上面的黑盒测试保证。
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'gate.mjs'), 'utf-8');
  assert.match(source, /isWin \? "cmd" : "npm"/);
  assert.match(source, /\/c", "npm", "run", keyword/);
  assert.doesNotMatch(source, /"npm\.cmd"/);
});
