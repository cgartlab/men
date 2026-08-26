/**
 * core-test.mjs — Phase 2 Core Engine 机械验证
 *
 * 前置：先运行 `npx tsc` 生成 dist/，再运行本脚本。
 * 运行：node scripts/core-test.mjs
 * 结果：全部断言通过打印 "CORE TEST PASS"；任一失败 exit 非 0。
 */

import { triage } from "../dist/core/triage.js";

let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failed += 1;
  }
}

console.log("== men core triage tests ==");

const r1 = triage("查一下新闻");
assert(r1.intent === "search", `triage("查一下新闻").intent === "search" (got "${r1.intent}")`);

const r2 = triage("你好");
assert(r2.intent === "unknown", `triage("你好").intent === "unknown" (got "${r2.intent}")`);

const r3 = triage("分析一下这份报告");
assert(r3.intent === "analyze", `triage("分析一下这份报告").intent === "analyze" (got "${r3.intent}")`);

if (failed === 0) {
  console.log("CORE TEST PASS");
} else {
  console.error(`CORE TEST FAIL (${failed} assertion(s) failed)`);
  process.exit(1);
}
