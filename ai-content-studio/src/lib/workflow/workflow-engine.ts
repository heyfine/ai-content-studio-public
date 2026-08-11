/**
 * Workflow 编排引擎（纯函数，零外部依赖，100% 可单测）。
 *
 * 职责：按步骤序列顺序执行，管理 outputs 与状态：
 * - 非可选步失败 → 该步标 failed，其后所有步骤标 skipped，整体 failed。
 * - 可选步失败 → 该步标 failed，后续步骤继续执行（不短路）。
 * - 执行抛错视为该步 failed。
 * 引擎不做任何副作用（AI/DB/fetch 全部由调用方通过 executeStep 回调注入）。
 */

import type { StepDef, StepOutput, WorkflowContext } from "./workflow-steps";

export interface WorkflowResult {
  status: "success" | "failed";
  steps: { id: string; name: string; output: StepOutput }[];
  /** 失败原因：非可选步失败为 step_failed:<id>；可选步仍继续，不在此标 */
  reason?: string;
}

export interface ExecuteStepDeps {
  executeStep: (step: StepDef, ctx: WorkflowContext) => Promise<StepOutput>;
}

export async function runWorkflow(
  steps: StepDef[],
  topic: string,
  deps: ExecuteStepDeps,
): Promise<WorkflowResult> {
  const ctx: WorkflowContext = { topic, outputs: {} };
  const results: WorkflowResult["steps"] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const start = Date.now();
    let output: StepOutput;
    try {
      output = await deps.executeStep(step, ctx);
      if (output.durationMs === undefined) {
        output = { ...output, durationMs: Date.now() - start };
      }
    } catch (e) {
      output = {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      };
    }

    ctx.outputs[step.id] = output;
    results.push({ id: step.id, name: step.name, output });

    // 仅非可选步失败短路：标剩余步骤 skipped 后整体 failed
    if (output.status === "failed" && !step.optional) {
      for (let j = i + 1; j < steps.length; j++) {
        const skipped: StepOutput = { status: "skipped", error: "前置步骤失败，已跳过" };
        ctx.outputs[steps[j].id] = skipped;
        results.push({ id: steps[j].id, name: steps[j].name, output: skipped });
      }
      return { status: "failed", steps: results, reason: "step_failed:" + step.id };
    }
  }

  return { status: "success", steps: results };
}
