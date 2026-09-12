/*
 * agent-consistency.test.mjs — 跨 Agent 契约一致性（结构级断言，issue #120）
 *
 * 约束：
 *   - 只 import node:*（零第三方依赖）
 *   - 轻量 markdown 解析：提取 fenced code block、提取 event.mjs append 示例 JSON
 *   - 验证"结构存在 + 关键字段完整"，不只覆盖短语
 *   - 不 spawn 任何脚本，纯静态断言
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const AGENT_DIR = path.join(REPO, '.opencode', 'agent');
const CMD_DIR = path.join(REPO, '.opencode', 'command');

const AGENTS = ['men', 'si', 'ji', 'chi', 'yi', 'xun'];
const read = (p) => fs.readFileSync(p, 'utf-8');

// ── 轻量 markdown 解析辅助 ─────────────────────────────

// 提取所有 fenced code block：返回 [{lang, body}]
function codeBlocks(text) {
  const out = [];
  const re = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ lang: m[1], body: m[2] });
  }
  return out;
}

// 提取所有 event.mjs append 示例中的 --detail / --payload JSON 参数（单/双引号均捕获）
// 兼容多行续行（取命中点后 500 字符窗口）
function eventAppendJsonArgs(text) {
  const args = [];
  const re = /event\.mjs\s+append/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const slice = text.slice(m.index, m.index + 500);
    for (const flag of ['--detail', '--payload']) {
      for (const q of ["'", '"']) {
        const fr = new RegExp(flag + '\\s+' + q + '([^' + q + ']+)' + q);
        const fm = fr.exec(slice);
        if (fm) {
          try {
            const o = JSON.parse(fm[1]);
            if (o && typeof o === 'object') args.push(o);
          } catch {
            /* 非 JSON（纯字符串 detail），跳过 */
          }
        }
      }
    }
  }
  return args;
}

// 提取从某个 H2 标题到下一个 H2 标题之间的文本（结构级切片）
function section(text, heading) {
  const re = new RegExp('^##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm');
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^##\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

// ── 断言所用的规范字段集 ─────────────────────────────

// A. 子任务 Prompt 契约字段（men.md 与 ultrawork.md 必须全部出现）
const PROMPT_CONTRACT_FIELDS = [
  'task_id', 'sid', 'intent', 'category', 'upstream_artifacts',
  'skills', 'read_only_sources', 'allowed_write_scope',
  'output_paths', 'success_criteria', 'return_format',
];

// B. 临时产物协议路径
const SESSION_PROTOCOL_TOKENS = [
  '.agents/state/sessions/<sid>/', 'inputs/', 'outputs/', 'judge/', 'events.jsonl',
];

// C. 回传契约四项
const RETURN_CONTRACT_FIELDS = ['产物路径', '摘要', '证据', '持久化建议'];

// D. si plan 验收标准可消费字段
const SI_ACCEPTANCE_COLUMNS = ['id', 'scope', 'artifact', 'verification', 'pass_condition', 'evidence', 'owner', 'judge'];

// E. 事件字段契约（最小字段）
const EVENT_SCHEMA_KEYS = ['type', 'subject', 'sid', 'actor', 'attempt', 'outcome', 'reason', 'artifacts', 'criteria_ids', 'wave'];

// F. BLOCKED 归属 block_key 组成
const BLOCK_KEY_PARTS = ['sid', 'wave', 'task_id', 'criteria_id'];

// ── 测试 ─────────────────────────────────────────────

test('A. men.md 包含完整 subagent prompt contract 字段', () => {
  const men = read(path.join(AGENT_DIR, 'men.md'));
  for (const f of PROMPT_CONTRACT_FIELDS) {
    assert.ok(men.includes(f), `men.md 缺少 prompt contract 字段: ${f}`);
  }
});

test('A. ultrawork.md DISPATCH 复用同一 prompt contract（11 字段齐全）', () => {
  const uw = read(path.join(CMD_DIR, 'ultrawork.md'));
  for (const f of PROMPT_CONTRACT_FIELDS) {
    assert.ok(uw.includes(f), `ultrawork.md 缺少 prompt contract 字段: ${f}`);
  }
});

test('B. men.md 定义临时产物协议（sessionDir / inputs / outputs / judge / events.jsonl）', () => {
  const men = read(path.join(AGENT_DIR, 'men.md'));
  for (const t of SESSION_PROTOCOL_TOKENS) {
    assert.ok(men.includes(t), `men.md 缺少临时产物协议标记: ${t}`);
  }
});

test('B. xun/si/yi/ji/chi 回传均要求包含四项（产物路径/摘要/证据/持久化建议）', () => {
  for (const a of ['xun', 'si', 'yi', 'ji', 'chi']) {
    const t = read(path.join(AGENT_DIR, a + '.md'));
    for (const f of RETURN_CONTRACT_FIELDS) {
      assert.ok(t.includes(f), `${a}.md 回传契约缺少: ${f}`);
    }
  }
});

test('C. si.md plan 验收标准表具备可消费字段 + 禁止主观 PASS 条件', () => {
  const si = read(path.join(AGENT_DIR, 'si.md'));
  for (const c of SI_ACCEPTANCE_COLUMNS) {
    assert.ok(si.includes(c), `si.md 验收标准表缺少列: ${c}`);
  }
  assert.ok(si.includes('主观'), 'si.md 缺少"主观"禁止说明');
  assert.ok(si.includes('禁止'), 'si.md 缺少"禁止"说明');
});

test('D. chi.md 语义复核被限定为一致性检查（设计/内容检查 + 不替他者决策）', () => {
  const chi = read(path.join(AGENT_DIR, 'chi.md'));
  const required = ['一致性检查', 'dark mode', 'WCAG', '设计说明', '来源链接', '事实标注', '替 yi', '不替 ji/si'];
  for (const p of required) {
    assert.ok(chi.includes(p), `chi.md 语义复核边界缺少: ${p}`);
  }
});

test('E. men.md 事件字段契约为可解析 JSON 且含最小字段', () => {
  const men = read(path.join(AGENT_DIR, 'men.md'));
  const blocks = codeBlocks(men);
  const schema = blocks.find(
    (b) => b.lang === 'json' && /"actor"/.test(b.body) && /"outcome"/.test(b.body)
  );
  assert.ok(schema, 'men.md 未找到事件字段契约 JSON 块');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(schema.body); }, '事件字段契约 JSON 解析失败');
  for (const k of EVENT_SCHEMA_KEYS) {
    assert.ok(k in parsed, `事件字段契约缺少 key: ${k}`);
  }
});

test('E. 所有 event.mjs append 示例统一字段（禁用 status / agent 作为角色键）', () => {
  const files = [
    ...AGENTS.map((a) => path.join(AGENT_DIR, a + '.md')),
    ...['ultrawork', 'verify', 'hyperplan', 'gh-issue'].map((c) => path.join(CMD_DIR, c + '.md')),
  ];
  for (const f of files) {
    const text = read(f);
    const args = eventAppendJsonArgs(text);
    for (const o of args) {
      assert.ok(!('status' in o), `${path.basename(f)} 事件示例使用了禁用字段 status（应使用 outcome）`);
      assert.ok(!('agent' in o), `${path.basename(f)} 事件示例使用了禁用字段 agent（应使用 actor）`);
    }
  }
});

test('F. men.md 定义 BLOCKED/重试归属 block_key', () => {
  const men = read(path.join(AGENT_DIR, 'men.md'));
  assert.ok(men.includes('block_key'), 'men.md 缺少 block_key 定义');
  for (const p of BLOCK_KEY_PARTS) {
    assert.ok(men.includes(p), `men.md block_key 组成缺少: ${p}`);
  }
});

test('G. 结构级：6 个 agent 定义均保留 CHARTER_CHECK 与全员红线段落', () => {
  for (const a of AGENTS) {
    const t = read(path.join(AGENT_DIR, a + '.md'));
    assert.ok(section(t, 'CHARTER_CHECK') !== null, `${a}.md 缺少 CHARTER_CHECK 章节`);
    assert.ok(/Success criteria/.test(section(t, 'CHARTER_CHECK') || ''), `${a}.md CHARTER_CHECK 缺少 Success criteria`);
    assert.ok(t.includes('全员红线'), `${a}.md 缺少全员红线段落`);
  }
});

test('H. 结构级：si.md 的 <plan> 代码块含验收标准表（结构存在）', () => {
  const si = read(path.join(AGENT_DIR, 'si.md'));
  const blocks = codeBlocks(si);
  const plan = blocks.find((b) => b.body.includes('<plan>') && b.body.includes('验收标准'));
  assert.ok(plan, 'si.md 未找到含验收标准的 <plan> 代码块');
  for (const c of ['id', 'scope', 'artifact', 'verification', 'pass_condition', 'evidence', 'owner', 'judge']) {
    assert.ok(plan.body.includes(c), `<plan> 验收标准表缺少列: ${c}`);
  }
});

test('H. 结构级：men.md 的 subagent prompt contract 为表格结构（字段齐全）', () => {
  const men = read(path.join(AGENT_DIR, 'men.md'));
  const sec = section(men, '子任务 Prompt 契约（Subagent Prompt Contract）');
  assert.ok(sec !== null, 'men.md 缺少 subagent prompt contract 章节');
  for (const f of PROMPT_CONTRACT_FIELDS) {
    assert.ok(sec.includes(f), `prompt contract 章节缺少字段: ${f}`);
  }
});
