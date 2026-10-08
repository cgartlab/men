/*
 * fix-b.test.mjs — audit-release-install-2026-10-08.md 修复回归测试（Wave B 修复批次）
 *
 * 覆盖 F7 F8 F9 F10 F14 F15 F16 F18 F19 F20（见 docs/reports/audit-release-install-2026-10-08.md）。
 *
 * 约束（与 test/install.test.mjs 一致）：
 *   - 只 import node:* 与 ../scripts/*.mjs（零第三方依赖）
 *   - 文件操作全在 os.tmpdir 临时目录内进行，不污染仓库；不用全局 OPENCODE_CONFIG_DIR
 *     （setup.mjs 的路径基于 import.meta.url 而非 cwd，必须把脚本整体复制到 <root>/scripts/ 下）
 *   - 黑盒 spawn 一律带 timeout；不触发网络写入（--preset free 会拉取 API，这里只用 --dry-run / 本地缓存路径）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  validateFlagCombos,
  backupConflicts,
  scaffoldConflictPaths,
  deployAssetGroup,
  restoreGlobalOpencodeJson,
} from '../scripts/install.mjs';
import { stripBom } from '../scripts/setup.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

function makeTmp(prefix = 'fixb-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(script, args, opts = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf-8',
    shell: false,
    timeout: 120_000,
    ...opts,
  });
  if (r.error) throw new Error(`spawn failed: ${r.error.message}`);
  return r;
}

// 建一个 setup.mjs 的隔离执行根：ROOT = <root>，脚本位于 <root>/scripts/setup.mjs，
// models.json 位于 <root>/config/models.json（setup.mjs 的路径基于 import.meta.url）。
function makeSetupRoot({ configured = true, bom = false, readonlyOpencode = false } = {}) {
  const base = makeTmp('fixb-setup-');
  const root = path.join(base, 'root');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'setup.mjs'), path.join(root, 'scripts', 'setup.mjs'));

  const modelsSrc = path.join(REPO_ROOT, 'config', 'models.json');
  const modelsBuf = fs.readFileSync(modelsSrc);
  fs.writeFileSync(path.join(root, 'config', 'models.json'), bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), modelsBuf]) : modelsBuf);

  if (configured) {
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'opencode.json'), 'utf8'));
    const buf = Buffer.from(JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(root, 'opencode.json'), bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf]) : buf);
    if (readonlyOpencode) fs.chmodSync(path.join(root, 'opencode.json'), 0o444);
  }
  return root;
}

function runSetup(root, args, opts = {}) {
  return run(path.join(root, 'scripts', 'setup.mjs'), args, opts);
}

// ─────────────────────────── F18：--help 不依赖 models.json ───────────────────────────
test('F18: --help exits 0 and prints help when config/models.json is missing', () => {
  const root = makeSetupRoot({ configured: true });
  fs.rmSync(path.join(root, 'config', 'models.json'));
  const r = runSetup(root, ['--help']);
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /--no-interactive/);
  assert.doesNotMatch(r.stderr, /模型知识基不存在|解析 models\.json 失败/);
});

test('F18: -h 短选项同样不依赖 models.json', () => {
  const root = makeSetupRoot({ configured: true });
  fs.rmSync(path.join(root, 'config', 'models.json'));
  const r = runSetup(root, ['-h']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /men（门）Agent 团队/);
});

// ─────────────────────────── F10：BOM 剥离 ───────────────────────────
test('F10: stripBom 剥离前导 BOM 且对无 BOM 输入幂等', () => {
  assert.deepStrictEqual(JSON.parse(stripBom('\uFEFF{"a":1}')), { a: 1 });
  assert.deepStrictEqual(JSON.parse(stripBom('{"a":2}')), { a: 2 });
  assert.strictEqual(stripBom(undefined), undefined);
});

test('F10: 带 BOM 的 models.json + opencode.json 不再 exit 2（回归：修复前直接报解析失败）', () => {
  const root = makeSetupRoot({ configured: true, bom: true });
  const r = runSetup(root, ['--json']);
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.mode, 'current');
});

test('F10: 未剥离的原始 BOM JSON 确实无法解析（证明测试探针有效）', () => {
  assert.throws(() => JSON.parse('\uFEFF{"a":1}'), SyntaxError);
});

// ─────────────────────────── F7：JSON 模式尊重写入结果 ───────────────────────────
test('F7: 写入失败时 --json 报 ok:false + exit 1，而非 ok:true exit 0', () => {
  const root = makeSetupRoot({ configured: true, readonlyOpencode: true });
  const r = runSetup(root, ['--json', '--reset']);
  assert.strictEqual(r.status, 1, `stdout: ${r.stdout}`);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, false);
  assert.ok(typeof j.error === 'string' && j.error.length > 0, 'error 必须非空');
  assert.strictEqual(j.fileWritten, null, '写失败不得声称 fileWritten: "opencode.json"');
});

test('F7: 正常写入路径仍为 ok:true exit 0（不被 F7 修复误伤）', () => {
  const root = makeSetupRoot({ configured: true });
  const r = runSetup(root, ['--json', '--reset']);
  assert.strictEqual(r.status, 0, `stdout: ${r.stdout}`);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.fileWritten, 'opencode.json');
});

// ─────────────────────────── F9：非 TTY 禁止进入交互 ───────────────────────────
test('F9: 非 TTY + stdin 关闭 → 非 0 退出并提示改用 --no-interactive', () => {
  const root = makeSetupRoot({ configured: true });
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'setup.mjs'), '--dry-run'], {
    encoding: 'utf-8', shell: false, timeout: 60_000,
    input: '', // stdin 立即 EOF（等价 < /dev/null）
  });
  assert.strictEqual(r.status, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, /--no-interactive/);
  assert.match(r.stderr, /TTY/);
});

test('F9: 多行管道输入不再静默 exit 0（审计报告探针 14 的回归）', () => {
  const root = makeSetupRoot({ configured: true });
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'setup.mjs'), '--reset', '--dry-run'], {
    encoding: 'utf-8', shell: false, timeout: 60_000, input: '5\ny\n',
  });
  assert.strictEqual(r.status, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.doesNotMatch(r.stdout, /已写入 opencode\.json/, '不得声称已写入');
});

// ─────────────────────────── F8：dry-run 三条写入路径都不谎报写入 ───────────────────────────
test('F8: --preset --dry-run 打印 [DRY RUN] 且不写盘', () => {
  const root = makeSetupRoot({ configured: true });
  const p = path.join(root, 'opencode.json');
  const before = fs.readFileSync(p);
  const r = runSetup(root, ['--preset', 'default', '--dry-run']);
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.strictEqual(fs.readFileSync(p).equals(before), true, 'dry-run 不得写盘');
  assert.match(`${r.stdout}${r.stderr}`, /\[DRY RUN\]/);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /已写入 opencode\.json/, '不得谎报已写入');
});

test('F8: --no-interactive --dry-run（未配置）打印 [DRY RUN] 且不写盘', () => {
  const root = makeSetupRoot({ configured: false });
  fs.writeFileSync(path.join(root, 'opencode.json'), JSON.stringify({ $schema: 'https://opencode.ai/config.json' }, null, 2));
  const p = path.join(root, 'opencode.json');
  const before = fs.readFileSync(p);
  const r = runSetup(root, ['--no-interactive', '--dry-run']);
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.strictEqual(fs.readFileSync(p).equals(before), true, 'dry-run 不得写盘');
  assert.match(r.stdout, /\[DRY RUN\]/);
  assert.doesNotMatch(r.stdout, /已写入 opencode\.json/);
});

test('F8: --json --dry-run 不写盘且 fileWritten 为 null', () => {
  const root = makeSetupRoot({ configured: false });
  fs.writeFileSync(path.join(root, 'opencode.json'), JSON.stringify({ $schema: 'https://opencode.ai/config.json' }, null, 2));
  const p = path.join(root, 'opencode.json');
  const before = fs.readFileSync(p);
  const r = runSetup(root, ['--json', '--dry-run', '--reset']);
  assert.strictEqual(r.status, 0, `stdout: ${r.stdout}`);
  assert.strictEqual(fs.readFileSync(p).equals(before), true, 'dry-run 不得写盘');
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.fileWritten, null);
});

// ─────────────────────────── F19：--reset 在非交互分支被尊重 ───────────────────────────

// F8 交互路径（writeConfig → 「已写入 opencode.json」的那一段）无法在非 PTY 环境驱动——
// F9 修复后非 TTY 已被 requireTtyForInteractive() 拒绝（这正是我们要的行为），而本机 Python/Node
// 都没有可用的 pty 模块。用源码结构守卫把「dry-run 分支必须在已写入提示之前」钉住，
// 防止将来有人把这段输出改回去。
test('F8: 交互路径源码结构守卫——[DRY RUN] 分支先于「已写入 opencode.json」提示', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'setup.mjs'), 'utf8');
  // 交互路径入口 `const rl = createRL();`（自执行段之前最后一处）到「── 自执行 ──」之间
  const entry = src.lastIndexOf('const rl = createRL();');
  const tail = src.indexOf('── 自执行 ──');
  assert.ok(entry > 0 && tail > entry, '应能定位交互模式段');
  const seg = src.slice(entry, tail);
  assert.ok(seg.includes('if (cfg.dryRun)'), '交互路径应有 dry-run 分支');
  // 交互路径必须把 dryRun 透传给 writeConfig（而非硬编码 false）
  assert.ok(seg.includes('writeConfig(assignment, models, cfg.dryRun)'), '交互路径应把 dryRun 传给 writeConfig');
  const outRe = /process\.stdout\.write\((?:"([^"]*)"|`([^`]*)`)\)/g;
  let m;
  let idxDry = -1;
  let idxClaim = -1;
  while ((m = outRe.exec(seg))) {
    const t = m[1] ?? m[2] ?? '';
    if (idxDry < 0 && t.includes('[DRY RUN]')) idxDry = m.index;
    if (idxClaim < 0 && t.includes('已写入 opencode.json')) idxClaim = m.index;
  }
  assert.ok(idxDry >= 0, '交互路径必须存在 [DRY RUN] 输出');
  assert.ok(idxClaim > idxDry, 'dry-run 输出必须排在「已写入」提示之前');
});
test('F19: --reset --no-interactive 会实际重写配置，而非只打印当前配置', () => {
  const root = makeSetupRoot({ configured: true });
  // 把全部角色改成可区分的自定义模型，reset 必须把 default 预设写回去
  const p = path.join(root, 'opencode.json');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const k of Object.keys(cfg.agent)) {
    if (cfg.agent[k] && typeof cfg.agent[k] === 'object') cfg.agent[k].model = 'opencode-zen/big-pickle';
  }
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');

  const r = runSetup(root, ['--reset', '--no-interactive']);
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /--reset/);
  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.notStrictEqual(after.agent.men.model, 'opencode-zen/big-pickle', 'reset 必须改写角色模型');
  assert.ok(fs.existsSync(`${p}.bak`), '重写前必须备份原文件');
});

test('F19: --no-interactive（无 reset）保持原语义：打印当前配置、不写盘', () => {
  const root = makeSetupRoot({ configured: true });
  const p = path.join(root, 'opencode.json');
  const before = fs.readFileSync(p);
  const r = runSetup(root, ['--no-interactive']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /当前模型配置/);
  assert.strictEqual(fs.readFileSync(p).equals(before), true);
});

// ─────────────────────────── F20：flag 互斥校验 ───────────────────────────
test('F20: validateFlagCombos 报告冲突组合', () => {
  const base = { dir: null, skipDeps: false, skipVerify: false, json: false, help: false, global: false, globalRemove: false, setup: false };
  assert.deepStrictEqual(validateFlagCombos({ ...base }), []);
  const gAndRemove = validateFlagCombos({ ...base, global: true, globalRemove: true });
  assert.strictEqual(gAndRemove.length, 1, '--global 与 --global-remove 应报 1 条冲突');
  assert.match(gAndRemove[0], /互斥/);
  for (const f of ['dir', 'setup', 'skipDeps', 'skipVerify']) {
    const c = validateFlagCombos({ ...base, global: true, [f]: true });
    assert.strictEqual(c.length, 1, `${f} 与 --global 应报 1 条冲突`);
    assert.match(c[0], /互斥/);
  }
  assert.strictEqual(validateFlagCombos({ ...base, globalRemove: true, setup: true }).length, 1);
  // 无全局 flag 时项目级 flag 全部合法
  assert.deepStrictEqual(validateFlagCombos({ ...base, dir: 'x', setup: true, skipDeps: true, skipVerify: true }), []);
});

test('F20: --help 优先，不参与互斥校验', () => {
  assert.deepStrictEqual(validateFlagCombos({ help: true, global: true, globalRemove: true, dir: 'x' }), []);
});

test('F20: 冲突组合黑盒 exit 2（--global 与 --global-remove 同给）', () => {
  const r = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), ['--global', '--global-remove'], { cwd: makeTmp() });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /参数冲突/);
});

test('F20: 冲突组合黑盒 exit 2（--global --skip-deps / --global-remove --skip-verify）', () => {
  for (const args of [['--global', '--skip-deps'], ['--global-remove', '--skip-verify'], ['--global', '--dir', 'C:\\tmp\\x'], ['--global', '--setup']]) {
    const r = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), args, { cwd: makeTmp() });
    assert.strictEqual(r.status, 2, `args=${args.join(' ')} stderr: ${r.stderr}`);
    assert.match(r.stderr, /参数冲突/);
  }
});

// ─────────────────────────── F15：全局模式失败可见 + 分支纳入 try ───────────────────────────
test('F15: deployAssetGroup 计入 failed 并在 errors 里记录失败源路径', () => {
  const src = makeTmp('f15-src-');
  const dst = makeTmp('f15-dst-');
  try {
    fs.mkdirSync(path.join(src, 'dirA'), { recursive: true });
    fs.writeFileSync(path.join(src, 'ok.txt'), 'ok');
    fs.writeFileSync(path.join(src, 'dirA', 'x.txt'), 'x');
    // 目标目录预置一个与同名单文件冲突的目录 → 必然触发 ENOTDIR
    fs.mkdirSync(path.join(dst, 'ok.txt'), { recursive: true });
    fs.writeFileSync(path.join(dst, 'ok.txt', 'nested'), 'n');

    const r = deployAssetGroup(src, dst);
    assert.strictEqual(r.copied, 1);
    assert.strictEqual(r.failed, 1);
    assert.strictEqual(r.errors.length, 1);
    assert.match(r.errors[0], /ok\.txt/);
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dst, { recursive: true, force: true });
  }
});

test('F15: 全局安装黑盒 exit 0 且 ok:true（OPENCODE_CONFIG_DIR 指向干净临时目录）', () => {
  const gdir = makeTmp('f15-global-');
  const r = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), ['--global', '--json'], {
    cwd: makeTmp(),
    env: { ...process.env, OPENCODE_CONFIG_DIR: gdir.replace(/\\/g, '/') },
  });
  try {
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.assetsFailed, 0);
    assert.strictEqual(j.mode, 'global');
    assert.ok(fs.existsSync(path.join(gdir, 'agent')), 'agents 应部署到全局目录');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8')).default_agent, 'men');
  } finally {
    fs.rmSync(gdir, { recursive: true, force: true });
  }
});

test('F15: --global-remove 走返回值（不再内联 process.exit(0)），退出码 0 + ok:true', () => {
  const gdir = makeTmp('f15-remove-');
  fs.mkdirSync(path.join(gdir, 'agent'), { recursive: true });
  fs.writeFileSync(path.join(gdir, 'opencode.json'), JSON.stringify({ default_agent: 'men', provider: { custom: {} } }));
  const r = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), ['--global-remove', '--json'], {
    cwd: makeTmp(),
    env: { ...process.env, OPENCODE_CONFIG_DIR: gdir.replace(/\\/g, '/') },
  });
  try {
    assert.strictEqual(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.mode, 'global-remove');
  } finally {
    fs.rmSync(gdir, { recursive: true, force: true });
  }
});

// ─────────────────────────── F16：卸载不吞用户安装后的配置 ───────────────────────────
test('F16: --global-remove 只移除 default_agent，用户安装后新增字段保留', () => {
  const gdir = makeTmp('f16-');
  try {
    // 安装前配置（备份内容）
    fs.writeFileSync(path.join(gdir, 'opencode.json'), JSON.stringify({ provider: { sensenova: { key: 'k' } } }));
    fs.writeFileSync(path.join(gdir, 'opencode.json.men-backup'), JSON.stringify({ provider: { sensenova: { key: 'k' } } }));
    // 安装：写入 default_agent
    const inst = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), ['--global', '--json'], {
      cwd: makeTmp(),
      env: { ...process.env, OPENCODE_CONFIG_DIR: gdir.replace(/\\/g, '/') },
    });
    assert.strictEqual(inst.status, 0, inst.stderr);
    // 用户安装后又新增字段
    const cur = JSON.parse(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8'));
    cur.mcp = { myserver: { command: 'my-mcp' } };
    cur.agent = { men: { model: 'sensenova/deepseek-v4-flash' } };
    fs.writeFileSync(path.join(gdir, 'opencode.json'), JSON.stringify(cur, null, 2));

    const rm = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), ['--global-remove', '--json'], {
      cwd: makeTmp(),
      env: { ...process.env, OPENCODE_CONFIG_DIR: gdir.replace(/\\/g, '/') },
    });
    assert.strictEqual(rm.status, 0, `stdout: ${rm.stdout}\nstderr: ${rm.stderr}`);
    const final = JSON.parse(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8'));
    assert.strictEqual(final.default_agent, undefined, 'default_agent=men 必须被移除');
    assert.deepStrictEqual(final.mcp, { myserver: { command: 'my-mcp' } }, '用户新增 mcp 不得丢失');
    assert.ok(final.agent.men.model.includes('deepseek'), '用户新增 agent 模型不得丢失');
    assert.deepStrictEqual(final.provider.sensenova, { key: 'k' }, '原有 provider 配置保留');
    assert.ok(fs.existsSync(`${path.join(gdir, 'opencode.json')}.before-restore`), '当前文件应留有一份副本');
  } finally {
    fs.rmSync(gdir, { recursive: true, force: true });
  }
});

test('F16: 无备份时仍只移除 default_agent；opencode.json 缺失/不可解析时不改动', () => {
  const gdir = makeTmp('f16b-');
  try {
    fs.writeFileSync(path.join(gdir, 'opencode.json'), JSON.stringify({ default_agent: 'men', mcp: { a: {} } }));
    let r = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), ['--global-remove', '--json'], {
      cwd: makeTmp(),
      env: { ...process.env, OPENCODE_CONFIG_DIR: gdir.replace(/\\/g, '/') },
    });
    assert.strictEqual(r.status, 0);
    let j = JSON.parse(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8'));
    assert.strictEqual(j.default_agent, undefined);
    assert.ok(j.mcp.a, '无备份分支保留其他字段');

    // 不可解析 → 不改动
    fs.writeFileSync(path.join(gdir, 'opencode.json'), '{not json');
    const r2 = run(path.join(REPO_ROOT, 'scripts', 'install.mjs'), ['--global-remove', '--json'], {
      cwd: makeTmp(),
      env: { ...process.env, OPENCODE_CONFIG_DIR: gdir.replace(/\\/g, '/') },
    });
    assert.strictEqual(r2.status, 0);
    assert.strictEqual(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8'), '{not json', '不可解析时不得覆盖');
  } finally {
    fs.rmSync(gdir, { recursive: true, force: true });
  }
});

test('F16: restoreGlobalOpencodeJson 单测——备份字段回填不覆盖用户新增值', () => {
  const gdir = makeTmp('f16c-');
  try {
    fs.writeFileSync(path.join(gdir, 'opencode.json'), JSON.stringify({ default_agent: 'men', provider: { user_edited: true } }));
    fs.writeFileSync(path.join(gdir, 'opencode.json.men-backup'), JSON.stringify({ provider: { user_edited: false } }));
    const r = restoreGlobalOpencodeJson(gdir);
    assert.strictEqual(r.restored, true);
    const j = JSON.parse(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8'));
    assert.strictEqual(j.default_agent, undefined);
    assert.strictEqual(j.provider.user_edited, true, '当前文件字段优先，不被安装前备份覆盖');
    assert.ok(!fs.existsSync(path.join(gdir, 'opencode.json.men-backup')), '还原后删除备份');
  } finally {
    fs.rmSync(gdir, { recursive: true, force: true });
  }
});

// ─────────────────────────── F14：scaffold 备份覆盖面 + .men.bak 不覆盖 ───────────────────────────
test('F14: scaffoldConflictPaths 覆盖 .opencode/ 整树（不再只有 package.json）', () => {
  const paths = scaffoldConflictPaths(REPO_ROOT, ['.opencode/', 'opencode.json']);
  assert.ok(paths.some((n) => n === path.join('.opencode', 'package.json')), '含 .opencode/package.json');
  const nested = paths.filter((n) => n.includes(path.join('.opencode', 'agent')));
  assert.ok(nested.length >= 1, '必须覆盖 .opencode/agent/** 下的已存在文件');
  assert.doesNotMatch(paths.join('\n'), /tui\.json/, '注释里点名的 tui.json 已废弃，清单不应再出现');
});

test('F14: 二次安装不覆盖既有 .men.bak（最初的用户原文件备份保留）', () => {
  const target = makeTmp('f14-');
  try {
    fs.mkdirSync(path.join(target, '.opencode', 'agent'), { recursive: true });
    // 第一次：内容与源不同 → 备份为 .men.bak
    fs.writeFileSync(path.join(target, 'opencode.json'), '{"agent":{"men":{"model":"first-user-config"}}}');
    const c1 = backupConflicts(target, scaffoldConflictPaths(REPO_ROOT, ['.opencode/', 'opencode.json']));
    assert.ok(c1.some((s) => s.includes('opencode.json')), '首次应备份 opencode.json');
    assert.ok(fs.existsSync(`${path.join(target, 'opencode.json')}.men.bak`));
    const firstBak = fs.readFileSync(`${path.join(target, 'opencode.json')}.men.bak`);

    // 第二次：内容仍与源不同 → 旧 .men.bak 必须不被覆盖
    fs.writeFileSync(path.join(target, 'opencode.json'), '{"agent":{"men":{"model":"second-user-config"}}}');
    const c2 = backupConflicts(target, scaffoldConflictPaths(REPO_ROOT, ['.opencode/', 'opencode.json']));
    assert.ok(c2.some((s) => s.includes('opencode.json')), '第二次也应备份');
    assert.strictEqual(fs.readFileSync(`${path.join(target, 'opencode.json')}.men.bak`).equals(firstBak), true, '旧 .men.bak 不得被覆盖');
    assert.ok(fs.existsSync(`${path.join(target, 'opencode.json')}.men.bak-2`), '第二次备份应落到 .men.bak-2');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('F14: 内容与源逐字节相同的已存在文件不产生备份（重装不产生噪音）', () => {
  const target = makeTmp('f14b-');
  try {
    fs.copyFileSync(path.join(REPO_ROOT, 'opencode.json'), path.join(target, 'opencode.json'));
    const c = backupConflicts(target, scaffoldConflictPaths(REPO_ROOT, ['opencode.json']));
    assert.deepStrictEqual(c, []);
    assert.ok(!fs.existsSync(`${path.join(target, 'opencode.json')}.men.bak`));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

// ─────────────────────────── 项目模式回归（含 scaffold 备份新路径）───────────────────────────
// 用「假 men 仓库根」（只有 scripts/install.mjs + .opencode/agent/）触发真实 scaffold 模式：
// ROOT = 假根，cwd 为空目录 → copyMode 为 scaffolded；真仓库根下 cwd 会被判为 in-place。
function makeFakeMenRoot() {
  const root = makeTmp('f14-fake-');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, '.opencode', 'agent'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'install.mjs'), path.join(root, 'scripts', 'install.mjs'));
  fs.writeFileSync(path.join(root, '.opencode', 'agent', 'men.md'), '# stub agent\n');
  // 顶层配置类白名单条目（会被 scaffold 复制 → 才可能与用户文件冲突）
  for (const f of ['opencode.json', 'AGENTS.md', '.env.example']) {
    const src = path.join(REPO_ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, f));
  }
  return root;
}

test('install 黑盒: scaffold 安装仍 exit 0（F14 改动不破坏主路径）', () => {
  const root = makeFakeMenRoot();
  const tmp = makeTmp('f14-target-');
  try {
    const r = run(path.join(root, 'scripts', 'install.mjs'), ['--skip-deps', '--skip-verify', '--json'], { cwd: tmp });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.copyMode, 'scaffolded');
    assert.deepStrictEqual(j.conflicts, [], '全新目录无冲突');
    assert.ok(fs.existsSync(path.join(tmp, '.opencode', 'agent', 'men.md')), '资产应复制到目标目录');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F14: scaffold 重装时用户改过的 opencode.json 与 .opencode/agent/** 都被备份', () => {
  const root = makeFakeMenRoot();
  const tmp = makeTmp('f14-target2-');
  try {
    const once = run(path.join(root, 'scripts', 'install.mjs'), ['--skip-deps', '--skip-verify', '--json'], { cwd: tmp });
    assert.strictEqual(once.status, 0, `stderr: ${once.stderr}`);

    fs.writeFileSync(path.join(tmp, 'opencode.json'), '{"agent":{"men":{"model":"user-config"}}}\n');
    fs.writeFileSync(path.join(tmp, '.opencode', 'agent', 'men.md'), '# user agent\n');
    // 第一次 scaffold 已把 scripts/ 复制进目标目录 → 第二次会被判为 in-place（幂等跳过）。
    // 删掉 scripts/ 让目标不再是 men 仓库根，从而真正走 scaffold 重装分支。
    fs.rmSync(path.join(tmp, 'scripts'), { recursive: true, force: true });

    const again = run(path.join(root, 'scripts', 'install.mjs'), ['--skip-deps', '--skip-verify', '--json'], { cwd: tmp });
    assert.strictEqual(again.status, 0, `stderr: ${again.stderr}`);
    const j = JSON.parse(again.stdout);
    assert.strictEqual(j.copyMode, 'scaffolded');
    const conflicts = j.conflicts.map(String);
    assert.ok(conflicts.some((s) => s.includes('opencode.json')), `opencode.json 应被备份: ${conflicts.join(' | ')}`);
    assert.ok(conflicts.some((s) => s.includes(path.join('.opencode', 'agent', 'men.md'))), '.opencode/agent/** 应被备份');
    assert.ok(fs.existsSync(`${path.join(tmp, 'opencode.json')}.men.bak`));
    assert.ok(fs.existsSync(`${path.join(tmp, '.opencode', 'agent', 'men.md')}.men.bak`), '用户 agent 文件必须有备份');
    // 备份内容是用户原文，不是源文件
    assert.match(fs.readFileSync(`${path.join(tmp, '.opencode', 'agent', 'men.md')}.men.bak`, 'utf8'), /user agent/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
