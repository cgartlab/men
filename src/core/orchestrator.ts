/**
 * opencode-men — 编排器（工作流状态机骨架）
 *
 * 纯逻辑模块：管理 certainty→triage→plan→dispatch→collect→evaluate→
 * verify→report→loop→learn→done 全流程。
 *
 * 零副作用：真实行为（agent 调用、gate 执行、用户问答）全部通过注入的
 * hooks 委托给调用方，本文件不调用外部 API、不 spawn 子进程、不写文件。
 */

import type { EventKind, EventRecord, TriageResult } from "../types.js";
import { triage } from "./triage.js";

/** 工作流状态 */
export type WorkflowState =
  | "certainty"
  | "triage"
  | "plan"
  | "dispatch"
  | "collect"
  | "evaluate"
  | "verify"
  | "report"
  | "loop"
  | "learn"
  | "done"
  | "blocked";

/** 待分发的子任务 */
export interface DispatchTask {
  agent: string;
  skill?: string;
  prompt: string;
  wave: number;
  expectedOutputs: string[];
  successCriteria: string[];
}

/** 分发结果 */
export interface DispatchResult {
  success: boolean;
  files: string[];
  output: string;
  error?: string;
}

/** 机械验证门禁结果 */
export interface GateResult {
  pass: boolean;
  keyword: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  exhausted: boolean;
}

/** 子 agent 产出结果 */
export interface SpawnResult {
  success: boolean;
  output: string;
  files: string[];
}

/** 子任务执行记录 */
export interface TaskResult {
  taskId: string;
  agent: string;
  wave: number;
  status: "completed" | "partial" | "failed" | "skipped";
  files: string[];
  errors: string[];
  verifyPassed: boolean;
  judgePassed: boolean;
}

/** 编排器注入钩子（副作用全部由此委托） */
export interface OrchestratorHooks {
  onEvent(event: EventRecord): void;
  askUser(question: string): Promise<string>;
  dispatchTask(task: DispatchTask): Promise<DispatchResult>;
  runGate(keyword: "lint" | "test" | "typecheck", dir: string): Promise<GateResult>;
  spawnAgent(agentId: string, prompt: string): Promise<SpawnResult>;
}

/** 编排器最终结果 */
export interface OrchestratorResult {
  success: boolean;
  state: WorkflowState;
  intent: string;
  verdict: "PASS" | "PARTIAL" | "FAIL" | "BLOCKED";
  taskResults: TaskResult[];
  report: string;
}

/** 需要产出代码产物（需过 typecheck gate）的意图 */
const CODE_OUTPUT_INTENTS: ReadonlySet<string> = new Set(["analyze", "team"]);
/** 需要先产出 plan envelope 的意图 */
const PLAN_INTENTS: ReadonlySet<string> = new Set(["team", "hyperplan"]);
/** 需要质量回评的意图 */
const EVALUATE_INTENTS: ReadonlySet<string> = new Set(["analyze", "team"]);

export class Orchestrator {
  private _state: WorkflowState = "certainty";
  private _task = "";
  private _intent = "unknown";
  private _taskResults: TaskResult[] = [];
  private _retryCount = 0;
  private readonly _maxRetries = 5;
  private readonly _maxParallel = 4;
  private readonly _sid: string;
  private _lastGate: GateResult | null = null;

  constructor(private readonly hooks: OrchestratorHooks) {
    this._sid = `men-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
  }

  get currentState(): WorkflowState {
    return this._state;
  }

  /** 状态迁移：更新状态并广播 workflow.phase 事件 */
  private transitionTo(next: WorkflowState): void {
    this._state = next;
    this.emit("workflow.phase", "men.state", `state=${next}`, { state: next });
  }

  /** 构造并派发事件记录 */
  private emit(
    type: EventKind,
    subject: string,
    detail: string,
    payload?: Record<string, unknown>,
  ): void {
    const event: EventRecord = {
      ts: new Date().toISOString(),
      sid: this._sid,
      type,
      subject,
      detail,
    };
    if (payload !== undefined) {
      event.payload = payload;
    }
    this.hooks.onEvent(event);
  }

  /** 主流程：while 循环驱动重试，直到 PASS / BLOCKED */
  async run(task: string): Promise<OrchestratorResult> {
    this._task = task;
    this._taskResults = [];
    this._retryCount = 0;
    this._lastGate = null;

    while (true) {
      const { verdict, report } = await this.executeOnce();

      if (verdict === "PASS") {
        return this.finish("PASS", report);
      }

      if (verdict === "BLOCKED") {
        return this.finish("BLOCKED", report);
      }

      // verdict === "PARTIAL" → 重试
      this._retryCount++;
      if (!this.canRetry()) {
        this.emit("blocker.raised", "men.blocked", `retry exhausted (${this._retryCount}/${this._maxRetries})`);
        return this.finish("BLOCKED", `重试已达上限 ${this._maxRetries} 次`);
      }

      this.emit("dispatch", "men.retry", `retry=${this._retryCount}/${this._maxRetries}`);
      // 重置部分状态，保留 _task 和 _retryCount
      this._taskResults = [];
      this._lastGate = null;
    }
  }

  /** 单次执行：certainty→triage→plan→dispatch→collect→evaluate→verify→report→loop→learn，返回 verdict + report */
  private async executeOnce(): Promise<{ verdict: OrchestratorResult["verdict"]; report: string }> {
    // 1. certainty —— 确认任务可用
    this.transitionTo("certainty");
    this.emit("session.created", "men.session", `task_length=${this._task.length}`);
    if (!this._task.trim()) {
      const clarified = await this.hooks.askUser("任务描述为空，请补充需要完成的任务内容。");
      if (!clarified.trim()) {
        this.emit("blocker.raised", "men.blocked", "empty task after clarification");
        this.transitionTo("blocked");
        return { verdict: "BLOCKED", report: "任务为空，无法执行。" };
      }
      this._task = clarified;
    }

    // 2. triage —— 意图判定
    this.transitionTo("triage");
    const t: TriageResult = triage(this._task);
    this._intent = t.intent;
    this.emit("decision.made", "men.intent-classified", `intent=${t.intent}`, {
      intent: t.intent,
      confidence: t.confidence,
    });
    if (t.intent === "unknown") {
      this.emit("decision.missing", "men.intent-missing", `intent=unknown, confidence=${t.confidence}`);
    }

    // 3. plan —— 复杂意图产出规划（spawnAgent 由注入方实现）
    this.transitionTo("plan");
    let planOutput = "";
    if (PLAN_INTENTS.has(t.intent)) {
      const plan = await this.hooks.spawnAgent("si", "产出 plan envelope 规划任务");
      planOutput = plan.output;
    }

    // 4. dispatch —— 按波次分发，波内并行 ≤ maxParallel 分批
    this.transitionTo("dispatch");
    const waves = this.parseWaves(planOutput);
    for (const wave of waves) {
      const tasks = this.buildDispatchTasks(wave, t);
      for (let i = 0; i < tasks.length; i += this._maxParallel) {
        const chunk = tasks.slice(i, i + this._maxParallel);
        const results = await Promise.all(
          chunk.map(async (dt) => {
            const res = await this.hooks.dispatchTask(dt);
            const tr: TaskResult = {
              taskId: `task-${this._taskResults.length + 1}`,
              agent: dt.agent,
              wave: dt.wave,
              status: res.success ? "completed" : "failed",
              files: res.files,
              errors: res.error ? [res.error] : [],
              verifyPassed: false,
              judgePassed: false,
            };
            this.emit("dispatch", "men.dispatch", `agent=${dt.agent} wave=${dt.wave}`, {
              taskId: tr.taskId,
              agent: dt.agent,
              wave: dt.wave,
              success: res.success,
            });
            return tr;
          }),
        );
        this._taskResults.push(...results);
      }
    }

    // 5. collect —— 汇总产物文件（按任务去重）
    this.transitionTo("collect");
    for (const tr of this._taskResults) {
      tr.files = [...new Set(tr.files)];
    }

    // 6. evaluate —— 评审类意图做质量回评
    this.transitionTo("evaluate");
    if (EVALUATE_INTENTS.has(t.intent)) {
      await this.hooks.spawnAgent("si", "质量回评");
    }

    // 7. verify —— 代码类意图跑机械验证 gate
    this.transitionTo("verify");
    const hasCodeOutput = CODE_OUTPUT_INTENTS.has(t.intent);
    if (hasCodeOutput && this._taskResults.length > 0) {
      const gate = await this.hooks.runGate("typecheck", process.cwd());
      this._lastGate = gate;
      for (const tr of this._taskResults) {
        tr.verifyPassed = gate.pass;
      }
      if (!gate.pass) {
        this.emit("gate.failed", "men.gate", `keyword=typecheck exit=${gate.exitCode}`, {
          keyword: "typecheck",
          exitCode: gate.exitCode,
        });
      } else {
        this.emit("gate.passed", "men.gate", "keyword=typecheck pass");
      }
    }

    // 8. report —— 生成报告
    this.transitionTo("report");
    const report = this.buildReport();

    // 9. loop —— 判定本轮是否需重试（重试次数由 run() 循环统一管理）
    this.transitionTo("loop");
    let verdict: OrchestratorResult["verdict"] = "PASS";
    const hasFailingVerify = this._taskResults.some((tr) => !tr.verifyPassed);
    if (hasCodeOutput && hasFailingVerify) {
      verdict = "PARTIAL";
    }

    // 10. learn —— 学习事件并收尾（BLOCKED 由 run() 在重试耗尽时处理）
    this.transitionTo("learn");
    this.emit("boundary", "ultrawork.completed", `verdict=${verdict}`);
    this.transitionTo("done");

    return { verdict, report };
  }

  private canRetry(): boolean {
    return this._retryCount < this._maxRetries;
  }

  /** 从 plan 输出中解析波次编号；无匹配时默认单波次 */
  private parseWaves(planOutput: string): number[] {
    if (!planOutput.trim()) {
      return [1];
    }
    const waves = new Set<number>();
    const re = /(?:wave|波次|第)\s*(?:[#:：]?\s*)?(\d+)(?:\s*波)?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(planOutput)) !== null) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 1 && n <= 32) {
        waves.add(n);
      }
    }
    if (waves.size === 0) {
      return [1];
    }
    return [...waves].sort((a, b) => a - b);
  }

  /** 为指定波次构造分发任务（agent 取自意图路由，未知意图兜底 si） */
  private buildDispatchTasks(wave: number, t: TriageResult): DispatchTask[] {
    const agents = t.agents.length > 0 ? t.agents : ["si"];
    return agents.map((agent) => ({
      agent,
      prompt: `wave=${wave} 任务：${this._task}`,
      wave,
      expectedOutputs: [],
      successCriteria: [],
    }));
  }

  /** 拼装四段式报告：结论 / 关键信息 / 子任务状态 / 未决问题 */
  private buildReport(): string {
    const lines: string[] = [];
    lines.push("men 执行报告");
    lines.push("");
    lines.push("## 结论");
    lines.push(`- intent: ${this._intent}`);
    lines.push(`- state: ${this._state}`);
    lines.push(`- retry: ${this._retryCount}/${this._maxRetries}`);
    lines.push("");
    lines.push("## 关键信息");
    lines.push(`- 子任务数: ${this._taskResults.length}`);
    lines.push(`- gate: ${this._lastGate ? (this._lastGate.pass ? "PASS" : "FAIL") : "N/A"}`);
    lines.push("");
    lines.push("## 子任务状态");
    if (this._taskResults.length === 0) {
      lines.push("- （无子任务）");
    } else {
      for (const tr of this._taskResults) {
        lines.push(
          `- [${tr.taskId}] agent=${tr.agent} wave=${tr.wave} status=${tr.status} ` +
            `verify=${tr.verifyPassed ? "PASS" : "FAIL"} files=${tr.files.length}`,
        );
      }
    }
    lines.push("");
    lines.push("## 未决问题");
    const failed = this._taskResults.filter((tr) => tr.status === "failed");
    if (failed.length === 0) {
      lines.push("- 无");
    } else {
      for (const tr of failed) {
        lines.push(`- [${tr.taskId}] ${tr.agent} 失败: ${tr.errors.join("; ")}`);
      }
    }
    return lines.join("\n");
  }

  /** 组装最终结果 */
  private finish(verdict: OrchestratorResult["verdict"], report: string): OrchestratorResult {
    return {
      success: verdict !== "FAIL" && verdict !== "BLOCKED",
      state: this._state,
      intent: this._intent,
      verdict,
      taskResults: this._taskResults,
      report,
    };
  }
}
