/*
 * eval-report.mjs — 评估报告生成（L0 机械，零 LLM）
 *
 * 从 eval-metrics 的 KPI 数据生成人类可读的 Markdown 报告。
 * 写入 docs/eval/YYYY-MM-DD.md。
 *
 * CLI:
 *   eval-report [--date YYYY-MM-DD] [--json] [--dry-run]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeMetrics } from './eval-metrics.mjs';

const EVAL_DIR = 'docs/eval';
const HISTORY_FILE = '.agents/state/eval/history.json';

function ensureDir() {
  if (!fs.existsSync(EVAL_DIR)) fs.mkdirSync(EVAL_DIR, { recursive: true });
  const stateDir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

function saveHistory(history) {
  ensureDir();
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(history, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

function formatDate(d) {
  const date = d || new Date();
  return date.toISOString().slice(0, 10);
}

function trend(current, previous) {
  if (!previous) return 'new';
  const diff = current - previous;
  if (diff > 0.02) return 'improved';
  if (diff < -0.02) return 'degraded';
  return 'stable';
}

function generateReport(metrics, previousMetrics) {
  ensureDir();
  const date = formatDate(new Date());
  const rows = [];
  let improved = 0, degraded = 0, stable = 0;

  for (const [key, m] of Object.entries(metrics)) {
    const prev = previousMetrics ? previousMetrics[key] : null;
    const t = trend(m.value, prev ? prev.value : null);
    if (t === 'improved') improved++;
    else if (t === 'degraded') degraded++;
    else stable++;
    const icon = t === 'improved' ? '✅' : t === 'degraded' ? '❌' : '⚠️';
    rows.push(`| ${m.label} | ${m.display} | ${prev ? prev.display : '—'} | ${icon} ${t} |`);
  }

  const trendLine = `${improved}/8 改善，${stable}/8 稳定，${degraded}/8 退化`;
  const status = degraded === 0 ? '✅ 改善' : degraded === 1 ? '⚠️ 轻微退化' : '❌ 退化';

  const report = `# 团队评估报告 — ${date}

## 概述
评估周期：最近 10 次任务
整体趋势：**${status}**（${trendLine}）

## 指标详情

| 指标 | 当前值 | 上次值 | 趋势 |
|------|--------|--------|------|
${rows.join('\n')}

## 退化项详情

${degraded === 0 ? '无退化项。' : rows.filter(r => r.includes('❌')).join('\n')}

## 下周期目标

- 保持已有改善趋势
- 将退化项指标回正

---
*自动生成，零 LLM 参与*
`;
  return report;
}

function usage() {
  return `eval-report — 评估报告生成

用法:
  eval-report [--date YYYY-MM-DD] [--json] [--dry-run]

选项:
  --date      报告日期（默认今天）
  --json      输出 JSON 格式
  --dry-run   预览报告但不写入文件
  --help      显示此帮助

输出:
  docs/eval/YYYY-MM-DD.md
`;
}

export function main(argv) {
  const args = argv || [];
  if (args.includes('--help') || args.includes('-h')) return usage();

  const dateIdx = args.indexOf('--date');
  const date = dateIdx >= 0 ? args[dateIdx + 1] : null;
  const dryRun = args.includes('--dry-run');
  const jsonOut = args.includes('--json');

  ensureDir();
  const metrics = computeMetrics([], { windowSize: 10 });
  const history = loadHistory();
  const previousMetrics = history.length > 0 ? history[history.length - 1].metrics : null;

  const report = generateReport(metrics, previousMetrics);

  // 保存历史
  history.push({ date: formatDate(date), metrics });
  if (history.length > 30) history.shift();
  saveHistory(history);

  if (jsonOut) {
    return JSON.stringify({ ok: true, date: formatDate(date), dryRun, report: report.slice(0, 200) }, null, 2);
  }

  if (!dryRun) {
    const fileName = `docs/eval/${formatDate(date)}.md`;
    fs.writeFileSync(fileName, report, 'utf8');
    return JSON.stringify({ ok: true, file: fileName, length: report.length }, null, 2);
  }

  return JSON.stringify({ ok: true, dryRun: true, preview: report.slice(0, 200) }, null, 2);
}

if (process.argv[1] && process.argv[1].endsWith('eval-report.mjs')) {
  console.log(main(process.argv.slice(2)));
}
