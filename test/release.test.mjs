/*
 * release.test.mjs — release.mjs 测试（Wave 3 首批测试）
 *
 * 约束：
 *   - 只 import node:* 与 ../scripts/release.mjs（零第三方依赖，V7）
 *   - 黑盒 spawn 两种模式：--dry-run（不写盘、不 git）+ 合成仓库真发版（F1/F2 主路径）
 *   - 合成仓库测试在 os.tmpdir 自建 git 仓库（本地 bare remote，零网络、不污染真实仓库）
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
  VERSION_JSON_FILES,
  VERSION_TEXT_FILES,
  syncVersionText,
} from '../scripts/release.mjs';
import { mdToHtml } from '../scripts/update-release-page.mjs';

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

test('release bumpChangelog: no blank-line buildup between theme and first heading', () => {
  const input = '# Changelog\n\n## [Unreleased]\n\n> 工程化加固 + MCP 归属回归\n\n### Added\n\n- feat: new thing\n\n## [v0.3.4] - 2026-08-01\n';
  const out = bumpChangelog(input, '0.4.0', '2026-09-01');
  const entryIdx = out.indexOf('## [v0.4.0]');
  const nextIdx = out.indexOf('## [v0.3.4]');
  const entrySection = out.slice(entryIdx, nextIdx);
  // theme 与首个 ### 之间不超过 1 个空行
  const gap = entrySection.match(/^> 工程化加固[\s\S]*?(?=### Added)/)?.[0] ?? '';
  assert.ok(!/\n{4,}/.test(gap), `不应出现 3+ 连续空行: ${JSON.stringify(gap)}`);
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

// ── 版本同步覆盖（防发版漏文件）─────────────────────────
test('release: 版本同步清单覆盖全部版本引用载体', () => {
  // 先例：v0.3.2 发版漏 6 处、v0.4.0 漏 2 处；清单被改窄时这里先红。
  assert.deepStrictEqual(VERSION_JSON_FILES, [
    'package-lock.json',
    'site/package-lock.json',
    'opencode.json',
    'site/package.json',
  ]);
  const textMust = [
    'site/src/pages/docs/configure.astro',
    'AGENTS.md',
    'docs/guide/milestones.md',
    'docs/governance.md',
    'knowledge/README.md',
    '.opencode/skills/men-status/SKILL.md',
    'docs/integrations/argus.md',
    'docs/integrations/skillhub.md',
    'docs/dsh-customization.md',
    'scripts/skillhub-publish.mjs',
  ];
  for (const f of textMust) {
    assert.ok(VERSION_TEXT_FILES.includes(f), `${f} 必须在 VERSION_TEXT_FILES，否则发版会漏同步`);
  }
});

// ── syncVersionText：精确上下文替换（防篡改历史/他项目版本）─────
test('release syncVersionText: 只改「当前版本」上下文，不动历史引用', () => {
  // 回归：v0.6.0 发版时全文件替换把 AGENTS.md 的先例句
  // 「v0.5.0 发版手动补 releases.astro」误改成 v0.6.0（篡改历史）。
  const text = [
    'v0.6.0（M0–M7 完成）。npm 包已发布。',
    '先例：v0.3.2 发版漏 6 处；v0.5.0 发版手动补 `releases.astro`。',
  ].join('\n');
  const out = syncVersionText(text, 'AGENTS.md', '0.6.0', '0.7.0');
  assert.ok(out.includes('v0.7.0（M0–M7 完成）'), '当前版本行应更新');
  assert.ok(out.includes('v0.5.0 发版手动补'), '历史先例句必须原样保留');
  assert.ok(!out.includes('v0.6.0（M0–M7 完成）'), '旧版本不应残留');
});

test('release syncVersionText: 不动他项目版本引用', () => {
  // 回归：argus.md 的「若 argus v0.5.0 后 License 更新」曾被改成 argus v0.6.0，
  // 而 argus 是另一个项目（当时实际 0.5.8）。
  const text = [
    '| `AGENTS.md` | 本项目 v0.6.0（版本号由 `release.mjs` 发版时同步） |',
    '| **License 追踪** | 若 argus 的 License 发生变更，请检查 §5。 |',
  ].join('\n');
  const out = syncVersionText(text, 'docs/integrations/argus.md', '0.6.0', '0.7.0');
  assert.ok(out.includes('本项目 v0.7.0（版本号由'), '本项目版本应更新');
  assert.ok(out.includes('若 argus 的 License 发生变更'), '他项目表述应原样保留');
});

test('release syncVersionText: 多站点文件全部更新（SKILL.md frontmatter + 表格）', () => {
  const text = ['version: 0.6.0', '| 版本 | v0.6.0 |'].join('\n');
  const out = syncVersionText(text, '.opencode/skills/men-status/SKILL.md', '0.6.0', '0.7.0');
  assert.ok(out.includes('version: 0.7.0'), 'frontmatter 应更新');
  assert.ok(out.includes('| 版本 | v0.7.0 |'), '版本表格应更新');
});

test('release syncVersionText: 幂等（已是新版本时不再改）', () => {
  const text = 'v0.7.0（M0–M7 完成）\n';
  const out = syncVersionText(text, 'AGENTS.md', '0.6.0', '0.7.0');
  assert.strictEqual(out, text);
});

test('release syncVersionText: 未登记文件回退到全文件替换（向后兼容）', () => {
  const text = 'a 0.6.0 b 0.6.0';
  const out = syncVersionText(text, 'not-registered.txt', '0.6.0', '0.7.0');
  assert.strictEqual(out, 'a 0.7.0 b 0.7.0');
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

// ── 黑盒：合成仓库真发版（覆盖 F1/F2，dry-run 永远走不到的主路径）──
//
// 审计背景（docs/reports/audit-release-install-2026-10-08.md）：
//   F1 — release.mjs 曾把多条 CHANGELOG 要点用 \x00 拼进 argv 交给 spawnSync，
//        Node 拒绝含 NUL 的参数 → 未捕获 TypeError 崩溃在「已写盘」与「git add/commit/tag」之间
//   F2 — 任一子步骤失败仍返回 exitCode 0 并打印「完成 ✓」
// 两个缺口在只跑 --dry-run 的黑盒下均为盲区，故在此用合成仓库真实触发。
//
// 测试只写 os.tmpdir：本地 git 仓库 + 本地 bare remote，零网络、零 git remote、不碰真实仓库。

const RELEASE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'release.mjs');
const UPDATE_PAGE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'update-release-page.mjs');

/** 写一条含 2 个列表项的 CHANGELOG（触发 F1 的 ≥2 bullet 条件） */
function writeChangelog(dir) {
  const text = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '> 合成仓库发版主题',
    '',
    '### Added',
    '',
    '- 要点一：正常发版的第一条 bullet',
    '- 要点二：正常发版的第二条 bullet',
    '',
    '## [v0.1.0] - 2026-08-20',
    '',
    '- 首发',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), text);
}

/** 写一张含版本历史表 / 当前版本亮点 / infobox 的最小 releases.astro */
function writeReleasesAstro(dir) {
  fs.mkdirSync(path.join(dir, 'site/src/pages/docs'), { recursive: true });
  const text = [
    '<div>',
    '  { k: \'当前版本\', v: \'<code>0.1.0</code>（2026-08-20 发布）\' },',
    '</div>',
    '<table>',
    '  <thead><tr><th>版本</th><th>日期</th><th>内容</th></tr></thead>',
    '  <tbody>',
    '    <tr>',
    '      <td><strong>v0.1.0</strong></td>',
    '      <td>2026-08-20</td>',
    '      <td>首发</td>',
    '    </tr>',
    '  </tbody>',
    '</table>',
    '<div class="wiki-note">',
    '  截至 2026-08-20，共发布 <strong>1 个正式版本</strong>（v0.1.0）。',
    '</div>',
    '<section>',
    '  <p>',
    '    当前版本 <code>v0.1.0</code> 于 2026-08-20 发布，主题为「首发」。',
    '  </p>',
    '  <h3>v0.1.0「首发」</h3>',
    '  <ul>',
    '    <li>首发要点</li>',
    '  </ul>',
    '</section>',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'site/src/pages/docs/releases.astro'), text);
}

/** 造一个可发版的合成仓库（含本地 bare remote），返回 { repo, origin, cleanup } */
function makeSyntheticRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-repo-'));
  const repo = path.join(root, 'repo');
  const origin = path.join(root, 'origin.git');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(origin, { recursive: true });

  const sh = (args, opts = {}) => {
    const r = spawnSync(args[0], args.slice(1), {
      cwd: repo, encoding: 'utf-8', shell: false, timeout: 60_000, ...opts,
    });
    if (r.status !== 0) {
      throw new Error(`git ${args.join(' ')} 失败：${(r.stderr || r.stdout || '').trim()}`);
    }
    return r.stdout || '';
  };

  // 先 git init 再写文件 —— sh() 用 cwd: repo，目录必须先存在并完成 init，
  // 否则 package.json 会被写进不存在的目录、或 git config 失败。
  sh(['git', 'init', '--bare', '-q', origin]);
  sh(['git', 'init', '-q']);
  sh(['git', 'config', 'user.email', 'test@example.com']);
  sh(['git', 'config', 'user.name', 'synthetic-test']);
  sh(['git', 'remote', 'add', 'origin', origin]);

  // release.mjs 的 ROOT 由脚本自身路径推导，spawn 真实仓库的脚本时无论 cwd 指向哪里，
  // ROOT 都还是真实仓库 —— 实测曾因此把 0.6.12→0.6.15 的真实发布推上 origin。
  // 现在要求合成仓库自带 package.json（版本基线）与 scripts/，并把 MEN_ROOT 注入
  // 子进程，让脚本的 ROOT 落到这里。缺少任一者都会让隔离失效。
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ name: 'synthetic-men', version: '0.1.0', private: true }, null, 2) + '\n'
  );
  // release.mjs 内部会调 ROOT/scripts/update-release-page.mjs，缺失时该步骤被静默跳过，
  // 测试就验证不到页面更新（F11/F12/F17 全部落空）。
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  for (const s of ['release.mjs', 'update-release-page.mjs', 'release-notes.mjs']) {
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts', s), path.join(repo, 'scripts', s));
  }

  return { repo, origin, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function runRelease(repo, extraArgs) {
  return spawnSync(
    process.execPath,
    [RELEASE_SCRIPT, ...extraArgs],
    {
      cwd: repo,
      // 见 makeSyntheticRepo 注释：不注入则脚本 ROOT 回落真实仓库，会在真仓库上发版。
      env: { ...process.env, MEN_ROOT: repo },
      encoding: 'utf-8',
      shell: false,
      timeout: 120_000,
    }
  );
}

function gitShow(repo, ...args) {
  const r = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf-8', shell: false, timeout: 30_000, env: { ...process.env, MEN_ROOT: repo },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// F1 + F21：≥2 bullet 真发版 --push 不得崩溃，notes 走 stdin，版本/tag/push 全部落地
test('release blackbox synthetic: --push with 2 bullets no longer throws (F1) + tag & push land', () => {
  const { repo, cleanup } = makeSyntheticRepo();
  try {
    writeChangelog(repo);
    writeReleasesAstro(repo);
    const r = runRelease(repo, ['--push', '--json']);

    // F1：不得崩溃为未捕获异常（stderr 不应含 ERR_INVALID_ARG_VALUE / null bytes）
    assert.strictEqual(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(
      !/ERR_INVALID_ARG_VALUE|null bytes/i.test(r.stderr),
      `argv 仍含 NUL：${r.stderr}`
    );

    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, true, `failures=${JSON.stringify(j.failures)}`);
    assert.deepStrictEqual(j.failures, []);
    assert.match(j.newVersion, /^0\.1\.\d+$/);
    const tag = `v${j.newVersion}`;

    // 版本真的 bump 到写盘
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf-8')).version, j.newVersion);
    // CHANGELOG 新版本节含全部 2 条 bullet（stdin 通道未丢内容）
    const cl = fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf-8');
    assert.ok(cl.includes(`## [${tag}] - `), 'CHANGELOG 应插入新版本节');
    assert.ok(cl.includes('- 要点一：正常发版的第一条 bullet'));
    assert.ok(cl.includes('- 要点二：正常发版的第二条 bullet'));
    // releases.astro 被更新并纳入同一次提交
    const astro = fs.readFileSync(path.join(repo, 'site/src/pages/docs/releases.astro'), 'utf-8');
    assert.ok(astro.includes(`<td><strong>${tag}</strong></td>`), '发布页应有新版本行');
    assert.ok(astro.includes(`<li>要点一：正常发版的第一条 bullet</li>`));
    assert.ok(astro.includes(`<li>要点二：正常发版的第二条 bullet</li>`));
    assert.strictEqual(gitShow(repo, 'ls-files', 'site/src/pages/docs/releases.astro').stdout.trim(), 'site/src/pages/docs/releases.astro');
    // tag 已创建且已推送到本地 bare remote（真发版闭环）
    assert.ok(gitShow(repo, 'tag', '--list', tag).stdout.trim().includes(tag));
    assert.ok(
      gitShow(repo, '--git-dir', repo + '/../origin.git', 'tag', '--list', tag).stdout.trim().includes(tag),
      'tag 应已 push 到远端'
    );
  } finally {
    cleanup();
  }
});

// F2：任一子步骤失败必须 ok:false + exit 1，不得谎报「完成 ✓」
test('release blackbox synthetic: failing substep → ok:false + exit 1 (F2)', () => {
  const { repo, cleanup } = makeSyntheticRepo();
  try {
    writeChangelog(repo);
    // 不写 releases.astro → update-release-page.mjs 文件不存在 exit 1（探针 #2 复现）
    const r = runRelease(repo, ['--push', '--json']);

    assert.strictEqual(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.match(j.summary, /完成 ✗/, 'JSON 模式失败时应给出「完成 ✗」摘要（而非沉默）');
    assert.ok(!/完成 ✓/.test(j.summary), '失败时摘要不得是「完成 ✓」');
    assert.strictEqual(j.ok, false);
    assert.ok(j.failures.includes('update-release-page.mjs'), `failures=${JSON.stringify(j.failures)}`);
    assert.ok(r.stdout.includes('releases.astro 更新 FAIL'));
  } finally {
    cleanup();
  }
});

// F1 回归：notes 不再进 argv（否则 2 条 bullet 必崩），dry-run 亦不再携带
test('release blackbox synthetic: notes no longer passed through argv (F1, dry-run)', () => {
  const { repo, cleanup } = makeSyntheticRepo();
  try {
    writeChangelog(repo);
    writeReleasesAstro(repo);
    const script = fs.readFileSync(RELEASE_SCRIPT, 'utf-8');
    // 只检查实际调用 sites，不扫注释——脚本注释里必然提到「旧实现用 \\x00」，
    // 旧断言扫全文导致测试永远失败（注释误报）。
    assert.ok(!script.includes("join('\\\\x00')") && !script.includes('join("\\\\x00")'),
      'release.mjs 不应再用 NUL 拼接 notes（检查 join 调用）');
    const r = runRelease(repo, ['--dry-run', '--json']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).ok, true);
  } finally {
    cleanup();
  }
});

// F11 / F13 / F21：同一版本重复执行必须幂等；「截至 YYYY-MM-DD」同步更新
test('update-release-page blackbox synthetic: repeat run is idempotent + summary date updates (F11/F13)', () => {
  const { repo, cleanup } = makeSyntheticRepo();
  try {
    writeReleasesAstro(repo);
    const args = ['--version', '9.9.9', '--date', '2099-01-01', '--theme', '合成主题', '--notes-stdin', '--json'];
    const stdin = '- 要点一\n- 要点二\n';

    const r1 = spawnSync(process.execPath, [UPDATE_PAGE_SCRIPT, ...args], {
      cwd: repo, encoding: 'utf-8', shell: false, timeout: 30_000, env: { ...process.env, MEN_ROOT: repo }, input: stdin,
    });
    assert.strictEqual(r1.status, 0, r1.stderr);
    const j1 = JSON.parse(r1.stdout);
    assert.strictEqual(j1.ok, true);
    assert.strictEqual(j1.changes.length, 6, `changes=${JSON.stringify(j1.changes)}`);
    assert.deepStrictEqual(j1.skipped, []);

    const a1 = fs.readFileSync(path.join(repo, 'site/src/pages/docs/releases.astro'), 'utf-8');
    assert.strictEqual((a1.match(/<td><strong>v9\.9\.9<\/strong><\/td>/g) || []).length, 1, '版本行应恰好 1 行');
    assert.ok(a1.includes('共发布 <strong>2 个正式版本</strong>'));
    assert.ok(a1.includes('截至 2099-01-01'), '截至日期应同步更新（F13）');
    assert.ok(a1.includes('2099-01-01 发布'), 'infobox 日期应更新');

    const r2 = spawnSync(process.execPath, [UPDATE_PAGE_SCRIPT, ...args], {
      cwd: repo, encoding: 'utf-8', shell: false, timeout: 30_000, env: { ...process.env, MEN_ROOT: repo }, input: stdin,
    });
    assert.strictEqual(r2.status, 0, r2.stderr);
    const j2 = JSON.parse(r2.stdout);
    // F11：不重复插行、计数不虚增
    assert.strictEqual(j2.changed, false);
    assert.deepStrictEqual(j2.changes, []);
    const a2 = fs.readFileSync(path.join(repo, 'site/src/pages/docs/releases.astro'), 'utf-8');
    assert.strictEqual((a2.match(/<td><strong>v9\.9\.9<\/strong><\/td>/g) || []).length, 1, '重跑后仍应恰好 1 行');
    assert.ok(a2.includes('共发布 <strong>2 个正式版本</strong>'), '计数不得虚增');
  } finally {
    cleanup();
  }
});

// F12：--theme 缺省不得写入字面 null，回退为 v<version>
test('update-release-page blackbox synthetic: missing --theme falls back to v<version>, no literal null (F12)', () => {
  const { repo, cleanup } = makeSyntheticRepo();
  try {
    writeReleasesAstro(repo);
    const r = spawnSync(
      process.execPath,
      [UPDATE_PAGE_SCRIPT, '--version', '9.9.9', '--date', '2099-01-01', '--json'],
      { cwd: repo, encoding: 'utf-8', shell: false, timeout: 30_000, env: { ...process.env, MEN_ROOT: repo } }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const out = `${r.stdout}${r.stderr}`;
    assert.ok(!out.includes('null'), `输出含字面 null：${out}`);
    const a = fs.readFileSync(path.join(repo, 'site/src/pages/docs/releases.astro'), 'utf-8');
    assert.ok(!a.includes('null'), `页面含字面 null：${a}`);
    assert.ok(a.includes('<h3>v9.9.9「v9.9.9」</h3>'), '应回退为 v<version> 作主题');
  } finally {
    cleanup();
  }
});

// F17：关键变更项结构未命中必须 ok:false + 非 0 退出，不得静默半更新
test('update-release-page blackbox synthetic: missing highlight section → ok:false + exit 1 (F17)', () => {
  const { repo, cleanup } = makeSyntheticRepo();
  try {
    writeReleasesAstro(repo);
    // 破坏亮点区结构：亮点区的 <h3> 被删掉 → highlightRe（<p>+<h3>+<ul> 三段严格相邻）整体不匹配
    const p = path.join(repo, 'site/src/pages/docs/releases.astro');
    const before = fs.readFileSync(p, 'utf-8');
    const mutated = before.replace('<h3>v0.1.0「首发」</h3>\n', '');
    assert.notStrictEqual(mutated, before, '破坏性突变未生效，请同步更新本测试');
    fs.writeFileSync(p, mutated);

    const r = spawnSync(
      process.execPath,
      [UPDATE_PAGE_SCRIPT, '--version', '9.9.9', '--date', '2099-01-01', '--theme', '合成主题', '--json'],
      { cwd: repo, encoding: 'utf-8', shell: false, timeout: 30_000, env: { ...process.env, MEN_ROOT: repo } }
    );
    assert.strictEqual(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, false);
    assert.ok(j.skipped.includes('highlight'), `skipped=${JSON.stringify(j.skipped)}`);
  } finally {
    cleanup();
  }
});
