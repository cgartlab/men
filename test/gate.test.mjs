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

test('gate blackbox: shell metacharacters in npm scripts are rejected', () => {
  withPackageDir('unsafe-script', {
    test: 'node --version; node -e "console.log(\'bad\')"',
  }, (tempRoot) => {
    const sid = `gate-unsafe-${Date.now()}`;
    const r = runGate(['test', '--dir', tempRoot, '--sid', sid]);

    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /scripts\.test 包含 shell 控制字符/);
    assert.doesNotMatch(r.stderr, /node --version|bad/);
  });
});

test('gate runner: uses fixed npm argv without shell', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'gate.mjs'), 'utf-8');

  assert.match(source, /const npmCmd = isWin \? "npm\.cmd" : "npm";/);
  assert.match(source, /const npmArgs = \["run", keyword\];/);
  assert.match(source, /spawnSync\(npmCmd, npmArgs, \{/);
  assert.match(source, /shell: false,/);
  assert.doesNotMatch(source, /spawnSync\(\s*isWin \? "cmd" : "sh"/);
});
