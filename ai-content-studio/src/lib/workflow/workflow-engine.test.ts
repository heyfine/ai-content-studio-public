import { describe, it, expect, vi } from "vitest";
import { runWorkflow } from "./workflow-engine";
import {
  WORKFLOW_STEPS,
  type StepDef,
  type StepOutput,
  type WorkflowContext,
} from "./workflow-steps";

function ok(content: string, data?: Record<string, unknown>): StepOutput {
  return { status: "success", content, data };
}

describe("workflow-engine", () => {
  it("全部成功 → status=success，按顺序执行并持久化 outputs", async () => {
    const calls: string[] = [];
    const result = await runWorkflow(WORKFLOW_STEPS, "Next.js", {
      async executeStep(step, ctx) {
        calls.push(step.id);
        if (step.id === "outline") return ok("大纲：1.介绍");
        if (step.id === "write") {
          expect(ctx.outputs.outline.content).toBe("大纲：1.介绍");
          return ok("正文内容");
        }
        if (step.id === "seo") return ok("", { score: 88, issues: [] });
        if (step.id === "review") {
          expect(ctx.outputs.write.content).toBe("正文内容");
          return ok("通过，质量良好");
        }
        return ok("", { wpPostId: "42", link: "https://blog/?p=42" });
      },
    });
    expect(calls).toEqual(["outline", "write", "seo", "review", "publish"]);
    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every((s) => s.output.status === "success")).toBe(true);
  });

  it("非可选步失败 → 该步 failed，其后步骤 skipped，整体 failed", async () => {
    const calls: string[] = [];
    const result = await runWorkflow(WORKFLOW_STEPS, "topic", {
      async executeStep(step) {
        calls.push(step.id);
        if (step.id === "write") throw new Error("AI 写作超时");
        return ok("x");
      },
    });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("step_failed:write");
    expect(calls).toEqual(["outline", "write"]); // review/publish 未执行
    const byId = Object.fromEntries(result.steps.map((s) => [s.id, s.output.status]));
    expect(byId.outline).toBe("success");
    expect(byId.write).toBe("failed");
    expect(byId.seo).toBe("skipped");
    expect(byId.review).toBe("skipped");
    expect(byId.publish).toBe("skipped");
  });

  it("可选步失败不短路：该步 failed，后续继续执行，整体仍 success", async () => {
    const calls: string[] = [];
    const result = await runWorkflow(WORKFLOW_STEPS, "topic", {
      async executeStep(step) {
        calls.push(step.id);
        if (step.id === "seo") throw new Error("SEO 分析异常");
        if (step.id === "publish") return ok("", { wpPostId: "9" });
        return ok("内容");
      },
    });
    expect(result.status).toBe("success");
    const byId = Object.fromEntries(result.steps.map((s) => [s.id, s.output.status]));
    expect(byId.seo).toBe("failed");
    expect(byId.review).toBe("success");
    expect(byId.publish).toBe("success");
    expect(calls).toEqual(["outline", "write", "seo", "review", "publish"]);
  });

  it("executeStep 返回 failed（不抛错）也等同失败", async () => {
    const result = await runWorkflow(WORKFLOW_STEPS, "topic", {
      async executeStep(step) {
        if (step.id === "review") return { status: "failed", error: "审核驳回" };
        return ok("x");
      },
    });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("step_failed:review");
    const byId = Object.fromEntries(result.steps.map((s) => [s.id, s.output.status]));
    expect(byId.publish).toBe("skipped");
  });

  it("空步骤列表 → 直接 success", async () => {
    const result = await runWorkflow([], "topic", {
      async executeStep() {
        return ok("x");
      },
    });
    expect(result.status).toBe("success");
    expect(result.steps).toEqual([]);
  });

  it("durationMs 由引擎补全（实现方未给）", async () => {
    const result = await runWorkflow(WORKFLOW_STEPS.slice(0, 1), "t", {
      async executeStep() {
        return ok("大纲");
      },
    });
    expect(result.steps[0].output.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("实现方提供的 durationMs 不被覆盖", async () => {
    const result = await runWorkflow(WORKFLOW_STEPS.slice(0, 1), "t", {
      async executeStep() {
        return { status: "success", content: "x", durationMs: 999 };
      },
    });
    expect(result.steps[0].output.durationMs).toBe(999);
  });
});
