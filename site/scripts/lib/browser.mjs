// lib/browser.mjs — 统一的浏览器启动器（带系统浏览器回退）
//
// 动机：站点审计脚本此前一律 `chromium.launch()`，依赖 playwright 已下载的
// 浏览器二进制。在未执行 `npx playwright install` 的机器上会直接失败，导致这批
// 审计长期无法运行（CI 也不覆盖）。
//
// 策略：先试 playwright 自带 chromium；失败则回退到系统已安装的 Edge / Chrome
// （channel），二者都不可用时汇总报错，便于一次性看清原因。
import { chromium } from 'playwright';

const CANDIDATES = [
  { label: 'bundled chromium', opts: {} },
  { label: 'msedge (系统)', opts: { channel: 'msedge' } },
  { label: 'chrome (系统)', opts: { channel: 'chrome' } },
];

let cached = null;

export async function launchBrowser(opts = {}) {
  if (cached) return cached;
  const errors = [];
  for (const c of CANDIDATES) {
    try {
      const br = await chromium.launch({ timeout: 60_000, ...c.opts, ...opts });
      cached = br;
      process.stderr.write(`[browser] using ${c.label}\n`);
      return br;
    } catch (e) {
      errors.push(`  ${c.label}: ${String(e && e.message || e).split('\n')[0]}`);
    }
  }
  throw new Error('无法启动浏览器，请先执行 `npx playwright install chromium` 或安装 Edge/Chrome。\n' + errors.join('\n'));
}

// DIST 统一基于脚本位置解析，避免依赖 CWD（脚本在 site/scripts/，约定从 site/ 运行）
export function distPath() {
  return new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
}
