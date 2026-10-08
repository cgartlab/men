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

// F23：gate 会在真实仓库 .agents/state/sessions/<sid>/ 写事件——测试用完即清，
// 否则每次 npm test 都在仓库里留下一个新会话目录（此前已累积 30+）。
function cleanupSession(sid) {
  fs.rmSync(path.join(REPO_ROOT, '.agents', 'state', 'sessions', sid), { recursive: true, force: true });
}

test('gate blackbox: shell metacharacters in npm scripts are allowed (P1 fix)', () => {
  // P1 修复（H3b）：移除 unsafeChars 检查后，含 && / ; / | 等 shell 元字符的 npm 脚本
  // 应正常执行而非被跳过。此前被误判为不安全而 silent pass。
  withPackageDir('metachar-script', {
    test: 'node -e "console.log(1+1)"',
  }, (tempRoot) => {
    const sid = `gate-meta-${Date.now()}`;
    try {
      const r = runGate(['test', '--dir', tempRoot, '--sid', sid]);

      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.doesNotMatch(r.stderr, /GATE_SKIP/);
      assert.match(r.stdout + r.stderr, /GATE_PASSED/);
    } finally {
      cleanupSession(sid);
    }
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
    try {
      const r = runGate(['test', '--dir', tempRoot, '--sid', sid]);

      assert.strictEqual(r.status, 0, `gate 应通过。stderr: ${r.stderr}\nstdout: ${r.stdout}`);
      assert.doesNotMatch(r.stderr + r.stdout, /GATE_SKIP/);
      assert.doesNotMatch(r.stderr + r.stdout, /EINVAL|ENOENT|spawnSync/);
      assert.match(r.stdout + r.stderr, /GATE_PASSED|v\d+\.\d+\.\d+/);
    } finally {
      cleanupSession(sid);
    }
  });
});

test('gate runner: Windows 下用 cmd /c 而非裸 npm.cmd（源码层护栏）', () => {
  // 保留一条**最小**源码断言只锁住平台分支的正确写法；行为正确性由上面的黑盒测试保证。
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'gate.mjs'), 'utf-8');
  assert.match(source, /isWin \? "cmd" : "npm"/);
  assert.match(source, /\/c", "npm", "run", keyword/);
  assert.doesNotMatch(source, /"npm\.cmd"/);
});

test('gate F13: 缺关键字是用法错误 exit 2，不与「检查失败 exit 1」撞车', () => {
  const r = runGate([]);
  assert.strictEqual(r.status, 2, `stderr: ${r.stderr}`);
  assert.match(r.stderr, /用法/);
});

test('gate F13: 关键字不在白名单 exit 2（与用法错误同码）', () => {
  const r = runGate(['deploy']);
  assert.strictEqual(r.status, 2, `stderr: ${r.stderr}`);
  assert.match(r.stderr, /GATE_REJECTED/);
});

test('gate F14: 合法但形状不符的状态文件不得 fail-open（NaN/null 计数）', () => {
  // 把强化状态写成 {}（reinforcementCount undefined）——修复前 readState 原样返回，
  // 失败时 undefined+1 → NaN → JSON 序列化为 null，上限检查与计数双双失效。
  // 行为验证：跑一个必失败的 lint 脚本，断言计数落盘为 1（老代码会是 null）。
  const stateDir = path.join(REPO_ROOT, '.agents', 'state', 'gates');
  const stateFile = path.join(stateDir, 'gate-lint.json');
  const backup = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf-8') : null;
  const sid = `gate-shape-${Date.now()}`;
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, '{}');
    withPackageDir('failing-lint', {
      lint: 'node -e "process.exit(1)"',
    }, (tempRoot) => {
      const r = runGate(['lint', '--dir', tempRoot, '--sid', sid]);
      assert.strictEqual(r.status, 1, `必失败脚本应 exit 1。stderr: ${r.stderr}`);
      const after = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      assert.strictEqual(after.reinforcementCount, 1, `自增后计数必须是 1 而非 NaN/null: ${JSON.stringify(after)}`);
      assert.strictEqual(after.lastResult, 'failed');
    });
  } finally {
    cleanupSession(sid);
    if (backup !== null) fs.writeFileSync(stateFile, backup);
    else fs.rmSync(stateFile, { force: true });
  }
});

test('gate F6: 强化计数走锁内重读更新（源码层护栏）', () => {
  // 行为级并发测试耗时过长（需两个 300s 窗口对撞），用源码断言锁住关键构造：
  // spawnSync 之后的计数更新必须经 updateReinforcement（锁内重读），不得直接改启动时读到的 state。
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'gate.mjs'), 'utf-8');
  assert.match(source, /updateReinforcement\(keyword/);
  assert.match(source, /withStateLock/);
  // 旧模式（对启动时的 state 直接自增后整体写回）必须消失
  assert.doesNotMatch(source, /state\.reinforcementCount = state\.reinforcementCount \+ 1/);
  // 状态写入必须原子（tmp + rename）
  assert.match(source, /await rename\(tmp, path\)/);
});
