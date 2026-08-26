/**
 * core-test.mjs — Phase 2 Core Engine 机械验证
 *
 * 前置：先运行 `npx tsc` 生成 dist/，再运行本脚本。
 * 运行：node scripts/core-test.mjs
 * 结果：全部断言通过打印 "CORE TEST PASS"；任一失败 exit 非 0。
 */

import { triage } from "../dist/core/triage.js";
import { Orchestrator } from "../dist/core/orchestrator.js";

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

console.log("== men core orchestrator retry-loop tests ==");

// 构造注入 hooks：前 2 次 gate 失败（触发 PARTIAL 重试），第 3 次通过（PASS）
function buildHooks({ failGates = 0 }) {
  let dispatchCalls = 0;
  let gateCalls = 0;
  const events = [];
  return {
    hooks: {
      onEvent(e) {
        events.push(e);
      },
      async askUser() {
        return "";
      },
      async dispatchTask(task) {
        dispatchCalls += 1;
        return { success: true, files: [], output: `ok:${task.wave}` };
      },
      async runGate() {
        gateCalls += 1;
        return {
          pass: gateCalls > failGates,
          keyword: "typecheck",
          exitCode: gateCalls > failGates ? 0 : 1,
          stdout: "",
          stderr: "",
          exhausted: false,
        };
      },
      async spawnAgent() {
        return { success: true, output: "", files: [] };
      },
    },
    dispatchCalls: () => dispatchCalls,
    gateCalls: () => gateCalls,
    events: () => events,
  };
}

// 场景 A：gate 一直失败 → 重试耗尽 → BLOCKED
{
  const { hooks, gateCalls, events } = buildHooks({ failGates: 99 });
  const orch = new Orchestrator(hooks);
  const res = await orch.run("分析一下这份报告");
  assert(
    res.verdict === "BLOCKED" && res.success === false,
    `retry exhausted → BLOCKED, success=false (verdict="${res.verdict}")`,
  );
  assert(gateCalls() === 5, `gate executed exactly maxRetries(5) times (got ${gateCalls()})`);
  const retries = events().filter((e) => e.type === "dispatch" && e.subject === "men.retry");
  // 重试事件在 canRetry() 检查前发出，故最后一次耗尽时不发 → maxRetries-1 个
  assert(retries.length === 4, `emitted 4 men.retry events before exhaustion (got ${retries.length})`);
}

// 场景 B：前 2 次失败、第 3 次通过 → PASS 且真实重新执行
{
  const { hooks, dispatchCalls, gateCalls } = buildHooks({ failGates: 2 });
  const orch = new Orchestrator(hooks);
  const res = await orch.run("分析一下这份报告");
  assert(res.verdict === "PASS" && res.success === true, `retry then pass → PASS, success=true (verdict="${res.verdict}")`);
  // analyze 意图路由 2 个 agent（si/chi），每轮 pass 各 dispatch 2 次；3 轮真实重执行 → 6 次
  assert(dispatchCalls() === 6, `dispatch re-executed 6 times across 3 loop passes (got ${dispatchCalls()})`);
  assert(gateCalls() === 3, `gate executed 3 times (got ${gateCalls()})`);
  assert(/retry: 2\/5/.test(res.report), `report reflects retry=2/5 (got "${res.report.match(/retry: \S+/)?.[0]}")`);
}

// 场景 C：parseWaves 中文/大小写容错
{
  const { hooks } = buildHooks({ failGates: 0 });
  const orch = new Orchestrator(hooks);
  const priv = (orch) => Object.getPrototypeOf(orch);
  // 通过 plan 输出触发中文波次解析（team 意图走 plan 分支）
  const planHooks = buildHooks({ failGates: 0 });
  let planOutput = "";
  planHooks.hooks.spawnAgent = async () => ({ success: true, output: planOutput, files: [] });
  // 无法直接断言私有方法，改为用 plan 输出驱动 dispatch 的 wave 数
  const seen = [];
  planHooks.hooks.dispatchTask = async (task) => {
    seen.push(task.wave);
    return { success: true, files: [], output: "" };
  };
  const planOrch = new Orchestrator(planHooks);
  // 直接调用私有 parseWaves（通过 prototype 访问）
  const parseWaves = Object.getPrototypeOf(planOrch).parseWaves;
  const waves = parseWaves.call(planOrch, "波次 1\n第 2 波\nwave: 3\nWAVE 4\nwave 5");
  assert(
    JSON.stringify(waves) === JSON.stringify([1, 2, 3, 4, 5]),
    `parseWaves 支持中英文/大小写混合 (got [${waves}])`,
  );
  const onlyDefault = parseWaves.call(planOrch, "无波次信息");
  assert(JSON.stringify(onlyDefault) === JSON.stringify([1]), `parseWaves 无匹配时默认单波次 (got [${onlyDefault}])`);
}

if (failed === 0) {
  console.log("CORE TEST PASS");
} else {
  console.error(`CORE TEST FAIL (${failed} assertion(s) failed)`);
  process.exit(1);
}
