import { describe, it, expect } from "vitest";
import {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_IDS,
  buildOutlineInput,
  buildWriteInput,
  buildReviewInput,
  parseReviewVerdict,
  type WorkflowContext,
} from "./workflow-steps";

function ctxWith(
  outputs: Partial<Record<string, { content?: string; data?: Record<string, unknown> }>>,
): WorkflowContext {
  return { topic: "Next.js 16", outputs: outputs as WorkflowContext["outputs"] };
}

describe("workflow-steps", () => {
  it("5 步定义顺序正确且 id 唯一", () => {
    const ids = WORKFLOW_STEPS.map((s) => s.id);
    expect(ids).toEqual(["outline", "write", "seo", "review", "publish"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WORKFLOW_STEP_IDS).toEqual(ids);
  });

  it("outline/write/review 为 ai，seo 为 seo，publish 为 publish", () => {
    const byId = Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.id, s]));
    expect(byId.outline.kind).toBe("ai");
    expect(byId.write.kind).toBe("ai");
    expect(byId.review.kind).toBe("ai");
    expect(byId.seo.kind).toBe("seo");
    expect(byId.publish.kind).toBe("publish");
  });

  it("task 名对齐：outline/article_generate/review + seo_optimize 已在 task-routes", () => {
    const byId = Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.id, s]));
    expect(byId.outline.task).toBe("outline_generate");
    expect(byId.write.task).toBe("article_generate");
    expect(byId.review.task).toBe("review");
    expect(byId.seo.task).toBeUndefined();
  });

  it("seo/publish 为可选步，其余必选", () => {
    const byId = Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.id, s]));
    expect(byId.seo.optional).toBe(true);
    expect(byId.publish.optional).toBe(true);
    expect(byId.outline.optional).toBeFalsy();
    expect(byId.write.optional).toBeFalsy();
    expect(byId.review.optional).toBeFalsy();
  });

  it("buildOutlineInput 仅含主题", () => {
    expect(buildOutlineInput({ topic: "TypeScript", outputs: {} })).toBe("主题：TypeScript");
  });

  it("buildWriteInput 拼主题+大纲产出", () => {
    const ctx = ctxWith({ outline: { content: "1. 介绍\n2. 进阶" } });
    expect(buildWriteInput(ctx)).toBe("主题：Next.js 16\n\n大纲：\n1. 介绍\n2. 进阶");
  });

  it("buildWriteInput 缺大纲抛错", () => {
    expect(() => buildWriteInput({ topic: "x", outputs: {} })).toThrow(/缺少大纲/);
    expect(() => buildWriteInput(ctxWith({ outline: { content: "  " } }))).toThrow(/缺少大纲/);
  });

  it("buildReviewInput 拼正文+SEO 摘要", () => {
    const ctx = ctxWith({
      write: { content: "正文内容" },
      seo: { data: { score: 72, issues: ["缺 Meta", "缺内链"] } },
    });
    const out = buildReviewInput(ctx);
    expect(out).toContain("SEO 评分：72");
    expect(out).toContain("缺 Meta；缺内链");
    expect(out).toContain("正文：\n正文内容");
  });

  it("buildReviewInput 无 SEO 产出时标注未分析", () => {
    const ctx = ctxWith({ write: { content: "正文" } });
    expect(buildReviewInput(ctx)).toContain("未做 SEO 分析");
  });

  it("buildReviewInput 缺正文抛错", () => {
    expect(() => buildReviewInput({ topic: "x", outputs: {} })).toThrow(/缺少正文/);
  });

  it("parseReviewVerdict 识别 fail / pass", () => {
    expect(parseReviewVerdict("结论：fail，存在事实错误").verdict).toBe("fail");
    expect(parseReviewVerdict("驳回：格式不达标").verdict).toBe("fail");
    expect(parseReviewVerdict("通过，质量良好").verdict).toBe("pass");
    expect(parseReviewVerdict("pass").verdict).toBe("pass");
  });

  it("parseReviewVerdict 默认 pass（容错）", () => {
    expect(parseReviewVerdict("文章整体不错").verdict).toBe("pass");
    expect(parseReviewVerdict("").verdict).toBe("pass");
  });
});
