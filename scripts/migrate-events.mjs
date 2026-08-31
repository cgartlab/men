#!/usr/bin/env node
/*
 * migrate-events.mjs — 迁移 .agents/state/sessions 下各 events.jsonl 的历史脏数据
 *
 * 背景: 早期版本将学习跳过事件写为 type="decision"（不在 event.mjs KINDS 枚举中，
 * 导致 event.mjs validate exit=1 且 eval-metrics 误统计）。合法枚举是 decision.made。
 * 本脚本将每行 JSON 中 "type":"decision"（精确匹配，不含 .made/.missing 后缀）替换为
 * "type":"decision.made"，保留其余字段与行尾符不变。
 *
 * 注意: .agents/ 未被 git 跟踪，本脚本只迁移本地数据；脚本本身纳入版本控制。
 *
 * CLI:
 *   node scripts/migrate-events.mjs [--dry-run]
 *
 * --dry-run  只报告受影响行数，不改写任何文件
 *
 * 退出码: 0 = 成功（含 dry-run）；非 0 = 目录不可读等致命错误
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = process.cwd();
const EVENTS_DIR = path.join(ROOT, '.agents', 'state', 'sessions');

// 精确匹配：只命中 "type":"decision"，不会命中 "decision.made" / "decision.missing"
const LEGACY_TYPE = '"type":"decision"';
const TARGET_TYPE = '"type":"decision.made"';

function usage() {
  return `migrate-events — 迁移历史脏事件数据（type=decision → decision.made）

用法:
  migrate-events [--dry-run]

选项:
  --dry-run  只报告受影响行数，不改写任何文件

说明:
  遍历 .agents/state/sessions/*/events.jsonl，将每行 JSON 中
  "type":"decision"（精确匹配）替换为 "type":"decision.made"。
`;
}

/**
 * 扫描并（可选）修复单个 session 的 events.jsonl
 * @returns {number} 修复行数（dry-run 时为检测到的行数）
 */
function processSession(file, dryRun) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let sessionFixed = 0;
  const fixedLines = lines.map(line => {
    if (line.includes(LEGACY_TYPE)) {
      sessionFixed++;
      return line.replace(LEGACY_TYPE, TARGET_TYPE);
    }
    return line;
  });
  if (sessionFixed > 0 && !dryRun) {
    fs.writeFileSync(file, fixedLines.join(eol), 'utf8');
  }
  return sessionFixed;
}

export function main(argv) {
  const args = argv || [];
  if (args.includes('--help') || args.includes('-h')) return usage();
  const dryRun = args.includes('--dry-run');

  if (!fs.existsSync(EVENTS_DIR)) {
    const rel = path.relative(ROOT, EVENTS_DIR);
    console.log(`[migrate-events] 未找到 ${rel}，无会话数据可迁移`);
    return '0 sessions scanned, 0 rows fixed, 0 unchanged';
  }

  const sessionDirs = fs.readdirSync(EVENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let scanned = 0;
  let fixed = 0;
  let unchanged = 0;
  const perSession = [];

  for (const sid of sessionDirs) {
    const file = path.join(EVENTS_DIR, sid, 'events.jsonl');
    if (!fs.existsSync(file)) continue;
    scanned++;
    const n = processSession(file, dryRun);
    if (n > 0) {
      fixed += n;
      perSession.push(`${sid}: ${n}`);
    } else {
      unchanged++;
    }
  }

  const mode = dryRun ? '[dry-run]' : '';
  console.log(`[migrate-events]${mode} 扫描 ${scanned} 个 session，修复 ${fixed} 行，无变化 ${unchanged} 个 session`);
  if (perSession.length > 0) {
    console.log(`受影响 session:\n  ${perSession.join('\n  ')}`);
  } else {
    console.log('无受影响 session');
  }
  if (dryRun) {
    console.log('dry-run 模式：未改写任何文件');
  }

  const summary = `${scanned} sessions scanned, ${fixed} rows fixed, ${unchanged} unchanged`;
  return summary;
}

if (process.argv[1] && process.argv[1].endsWith('migrate-events.mjs')) {
  console.log(main(process.argv.slice(2)));
}