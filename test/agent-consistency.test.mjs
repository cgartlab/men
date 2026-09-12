/*
 * agent-consistency.test.mjs — Agent 定义与文档自洽性机械检查
 *
 * 约束：
 *   - 只 import node:*（零第三方依赖）
 *   - 只用 node:test 基础 API（test() + assert）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const AGENTS = ['men', 'si', 'ji', 'chi', 'yi', 'xun'];
const FOOTER = '> 见 AGENTS.md「全员红线」段落（7 条），所有 agent 逐字遵守。';

test('全部 agent 定义包含逐字一致的全员红线引用', () => {
  for (const name of AGENTS) {
    const text = read(`.opencode/agent/${name}.md`);
    assert.ok(text.includes('## 全员红线'), `${name}.md 缺少全员红线段落`);
    assert.ok(text.includes(FOOTER), `${name}.md 缺少统一红线引用`);
  }
});

test('AGENTS.md 提供全员红线最小锚点', () => {
  const text = read('AGENTS.md');
  assert.ok(text.includes('## 全员红线'));
  assert.ok(text.includes('docs/guide/quickstart.md'));
});

test('agent frontmatter model 与 opencode.json 一致', () => {
  const config = JSON.parse(read('opencode.json'));
  for (const name of AGENTS) {
    const text = read(`.opencode/agent/${name}.md`);
    const m = text.match(/^model:\s*(.+)$/m);
    assert.ok(m, `${name}.md 缺少 model`);
    assert.strictEqual(m[1].trim(), config.agent[name].model, `${name}.md model 与 opencode.json 不一致`);
  }
});

test('yi 协作边界：chi 不作为视觉意图来源', () => {
  const text = read('.opencode/agent/yi.md');
  assert.ok(!text.includes('chi（研究/分析需求）'));
  assert.ok(text.includes('chi（评审判断）'));
  assert.ok(text.includes('chi 不作为视觉意图来源'));
});

test('xun 只读边界与临时落盘自洽', () => {
  const text = read('.opencode/agent/xun.md');
  assert.ok(text.includes('临时产物落盘'));
  assert.ok(text.includes('会话临时目录'));
  assert.ok(text.includes('回传'));
  assert.ok(!text.includes('结果落盘为 .md 文件'));
});

test('si 落盘标准允许临时目录或保存建议', () => {
  const text = read('.opencode/agent/si.md');
  assert.ok(text.includes('临时目录'));
  assert.ok(text.includes('保存建议'));
  assert.ok(!text.includes('写作产物落盘为 `.md` 文件'));
});

test('chi 每轮复验所有标准', () => {
  const text = read('.opencode/agent/chi.md');
  assert.ok(text.includes('每轮复验所有标准'));
});

test('ultrawork 意图门先行且复验所有标准', () => {
  const text = read('.opencode/command/ultrawork.md');
  assert.ok(text.includes('意图门永远先行'));
  assert.ok(text.includes('每轮复验所有标准'));
  assert.ok(!text.includes('只需重新验证失败项'));
});

test('men 定义含技能表与意图门先行', () => {
  const text = read('.opencode/agent/men.md');
  assert.ok(text.includes('`men-status`'));
  assert.ok(text.includes('`men-update`'));
  assert.ok(text.includes('意图门永远先行'));
});

test('chi-judge 技能不把语义/视觉评审推给其他角色', () => {
  const text = read('.opencode/skills/chi-judge/SKILL.md');
  assert.ok(!text.includes('内容风格评审（由 si 负责）'));
  assert.ok(!text.includes('视觉设计评审（由 yi 负责）'));
});

test('yi-design 技能将内容写作转交 ji', () => {
  const text = read('.opencode/skills/yi-design/SKILL.md');
  assert.ok(text.includes('内容写作（由 ji 负责）'));
  assert.ok(!text.includes('内容写作（由 si 负责）'));
});

test('si-plan-compose 示例不使用框架文件', () => {
  const text = read('.opencode/skills/si-plan-compose/SKILL.md');
  assert.ok(!text.includes('.tsx'));
  assert.ok(text.includes('index.html 文件非空'));
});

test('men-update 技能不再强制清理 npm 缓存', () => {
  const text = read('.opencode/skills/men-update/SKILL.md');
  assert.ok(text.includes('无需删除缓存'));
  assert.ok(!text.includes('更新后必须删除该缓存'));
});

test('xun 相关文件对 Exa MCP 的描述与 CC Switch 一致', () => {
  for (const rel of ['.opencode/agent/xun.md', '.opencode/skills/xun-search/SKILL.md']) {
    const text = read(rel);
    assert.ok(text.includes('CC Switch'), `${rel} 未提及 CC Switch`);
    assert.ok(!text.includes('已由 opencode.json 原生接入'), `${rel} 仍声称 opencode.json 原生接入`);
  }
});

test('release.md 不再要求 opencode.json 声明 MCP', () => {
  const text = read('docs/guide/release.md');
  assert.ok(text.includes('CC Switch 统一管理'));
  assert.ok(!text.includes('MCP 服务器一律在 `opencode.json` 中声明'));
});
