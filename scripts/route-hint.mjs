/*
 * route-hint.mjs — 路由决策辅助脚本
 *
 * 从 knowledge/patterns/ 读取已知模式，输出路由提示，
 * 帮助 men 在路由前避免重复错误、复用历史经验。
 *
 * CLI:
 *   route-hint [--json] [--verbose]
 *
 * 输出: JSON 格式的路由提示（active patterns 摘要）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const PATTERNS_DIR = 'knowledge/patterns';

/** 读取所有 pattern 文件的 frontmatter */
function readPatterns() {
  if (!fs.existsSync(PATTERNS_DIR)) return [];
  const files = fs.readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.md') && f !== 'index.md');
  const patterns = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(PATTERNS_DIR, file), 'utf8');
      const fm = {};
      const lines = content.split('\n');
      let inFrontmatter = false;
      for (const line of lines) {
        if (line.trim() === '---') { inFrontmatter = !inFrontmatter; continue; }
        if (inFrontmatter) {
          const [key, ...rest] = line.split(':');
          if (key) fm[key.trim()] = rest.join(':').trim();
        }
      }
      patterns.push({
        id: fm.id || file.replace('.md', ''),
        type: fm.type || 'unknown',
        status: fm.status || 'active',
        created: fm.created || '',
        file: file,
        // 提取模式标题（第一个 ## 行）
        title: (content.match(/^## (.+)$/m) || ['', ''])[1],
      });
    } catch { /* skip malformed */ }
  }
  return patterns;
}

/** 生成路由提示 */
function generateHints(patterns) {
  const active = patterns.filter(p => p.status === 'active');
  const hints = [];

  for (const p of active) {
    const hint = {
      patternId: p.id,
      type: p.type,
      title: p.title,
    };
    // 按类型生成提示
    if (p.type.includes('error') || p.type.includes('anti')) {
      hint.action = 'avoid';
      hint.note = `已知错误模式: ${p.title}，路由时避开类似路径`;
    } else if (p.type.includes('collaboration') || p.type.includes('wave')) {
      hint.action = 'leverage';
      hint.note = `协作模式: ${p.title}，可复用此模式优化并行编排`;
    } else {
      hint.action = 'consider';
      hint.note = `参考模式: ${p.title}`;
    }
    hints.push(hint);
  }
  return hints;
}

function usage() {
  return `route-hint — 路由决策辅助

用法:
  route-hint [--json] [--verbose]

选项:
  --json     输出 JSON
  --verbose  输出完整 pattern 内容摘要
  --help     显示此帮助

说明:
  从 knowledge/patterns/ 读取已知模式，输出路由提示。
  men 在路由前调用此脚本，获取历史经验避免重复错误。
`;
}

export function main(argv) {
  const args = argv || [];
  if (args.includes('--help') || args.includes('-h')) return usage();

  const jsonOut = args.includes('--json');
  const verbose = args.includes('--verbose');

  const patterns = readPatterns();
  const hints = generateHints(patterns);

  const output = {
    timestamp: new Date().toISOString(),
    patternCount: patterns.length,
    activeCount: patterns.filter(p => p.status === 'active').length,
    hints,
  };

  if (verbose) {
    output.patterns = patterns;
  }

  return JSON.stringify(output, null, 2);
}

if (process.argv[1] && process.argv[1].endsWith('route-hint.mjs')) {
  console.log(main(process.argv.slice(2)));
}
