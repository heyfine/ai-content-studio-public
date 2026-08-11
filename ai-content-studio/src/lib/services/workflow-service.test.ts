import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  aiGenerate: vi.fn(),
  analyzeRaw: vi.fn(),
  publishArticle: vi.fn(),
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
}));

vi.mock("@/lib/ai/generate", () => ({ generate: m.aiGenerate }));
vi.mock("@/lib/services/seo-service", () => ({ analyzeRaw: m.analyzeRaw }));
vi.mock("@/lib/services/wordpress-service", () => ({ publishArticle: m.publishArticle }));
vi.mock("@/lib/services/article-service", () => ({
  createArticle: m.createArticle,
  updateArticle: m.updateArticle,
  slugify: (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: { create: m.runCreate, update: m.runUpdate },
  },
}));

import { runWorkflow } from "./workflow-service";

function baseRun() {
  m.runCreate.mockResolvedValue({
    id: "run-1",
    topic: "T",
    status: "RUNNING",
    steps: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  m.runUpdate.mockImplementation(async (a) => ({
    id: "run-1",
    topic: "T",
    steps: a.data.steps,
    status: a.data.status,
    error: a.data.error ?? null,
    articleId: a.data.articleId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  m.createArticle.mockResolvedValue({
    id: "art-1",
    title: "T",
    slug: "t-1",
    content: "正文",
    status: "DRAFT",
  });
  m.updateArticle.mockResolvedValue({});
  m.analyzeRaw.mockResolvedValue({
    score: 82,
    keywords: ["next"],
    issues: ["缺 Meta"],
    suggestions: ["补 Meta"],
    saved: false,
  });
  m.publishArticle.mockResolvedValue({
    wpPostId: "55",
    link: "https://blog/?p=55",
    status: "draft",
    articleId: "art-1",
  });
}

function aiByTask() {
  m.aiGenerate.mockImplementation(async (a) => {
    if (a.task === "outline_generate")
      return { content: "大纲：1.介绍\n2.进阶", generationId: "g1", modelId: "m1" };
    if (a.task === "article_generate")
      return { content: "正文内容，TypeStream。", generationId: "g2", modelId: "m1" };
    if (a.task === "review")
      return { content: "通过，质量良好。", generationId: "g3", modelId: "m1" };
    throw new Error("未 mock task " + a.task);
  });
}

describe("workflow-service.runWorkflow", () => {
  beforeEach(() => {
    m.aiGenerate.mockReset();
    m.analyzeRaw.mockReset();
    m.publishArticle.mockReset();
    m.createArticle.mockReset();
    m.updateArticle.mockReset();
    m.runCreate.mockReset();
    m.runUpdate.mockReset();
    baseRun();
  });

  it("成功全流程：5 步成功，建文章→REVIEW→PUBLISHED，发布 WP draft", async () => {
    aiByTask();
    const { run, result } = await runWorkflow("T");
    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every((s) => s.output.status === "success")).toBe(true);
    expect(m.createArticle).toHaveBeenCalledTimes(1);
    // review pass 推 REVIEW，publish 成功推 PUBLISHED
    expect(m.updateArticle).toHaveBeenCalledWith("art-1", { status: "REVIEW" });
    expect(m.updateArticle).toHaveBeenCalledWith("art-1", { status: "PUBLISHED" });
    // publish 用 draft（默认）
    expect(m.publishArticle).toHaveBeenCalledWith("art-1", undefined, "draft");
    // WorkflowRun 标 SUCCEEDED 且带 articleId
    expect(run.status).toBe("SUCCEEDED");
    expect(run.articleId).toBe("art-1");
    expect(m.runUpdate).toHaveBeenCalledTimes(1);
  });

  it("审核驳回：run FAILED，publish skipped，error 含审核驳回", async () => {
    m.aiGenerate.mockImplementation(async (a) => {
      if (a.task === "outline_generate")
        return { content: "大纲", generationId: "g1", modelId: "m1" };
      if (a.task === "article_generate")
        return { content: "正文", generationId: "g2", modelId: "m1" };
      if (a.task === "review")
        return { content: "驳回：质量差，事实有误", generationId: "g3", modelId: "m1" };
      throw new Error("x");
    });
    const { run, result } = await runWorkflow("T");
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("step_failed:review");
    const byId = Object.fromEntries(result.steps.map((s) => [s.id, s.output.status]));
    expect(byId.publish).toBe("skipped");
    expect(run.status).toBe("FAILED");
    expect(run.error).toContain("审核驳回");
    expect(run.error).toContain("质量差");
    expect(m.publishArticle).not.toHaveBeenCalled();
    // review 失败不推 REVIEW
    expect(m.updateArticle).not.toHaveBeenCalledWith("art-1", { status: "REVIEW" });
  });

  it("publish 可选步失败（未配置 WP）不短路：整体仍 SUCCEEDED", async () => {
    aiByTask();
    m.publishArticle.mockRejectedValue(new Error("未配置启用中的 WordPress 站点"));
    const { run, result } = await runWorkflow("T");
    expect(result.status).toBe("success");
    const byId = Object.fromEntries(result.steps.map((s) => [s.id, s.output.status]));
    expect(byId.outline).toBe("success");
    expect(byId.review).toBe("success");
    expect(byId.publish).toBe("failed");
    expect(run.status).toBe("SUCCEEDED");
  });

  it("outline 非可选失败：run FAILED，后续全 skipped", async () => {
    m.aiGenerate.mockRejectedValue(new Error("AI 超时"));
    const { run, result } = await runWorkflow("T");
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("step_failed:outline");
    const byId = Object.fromEntries(result.steps.map((s) => [s.id, s.output.status]));
    expect(byId.outline).toBe("failed");
    expect(byId.write).toBe("skipped");
    expect(byId.seo).toBe("skipped");
    expect(byId.review).toBe("skipped");
    expect(byId.publish).toBe("skipped");
    expect(run.status).toBe("FAILED");
  });

  it("SEO 步产出 data.score，写入步骤快照", async () => {
    aiByTask();
    const { result } = await runWorkflow("T");
    const seoStep = result.steps.find((s) => s.id === "seo");
    expect(seoStep?.output.data?.score).toBe(82);
    expect(m.analyzeRaw).toHaveBeenCalledWith({ title: "T", content: expect.any(String) });
  });

  it("显式 wpStatus=publish 透传给 publishArticle", async () => {
    aiByTask();
    await runWorkflow("T", { wpStatus: "publish", configId: "c1" });
    expect(m.publishArticle).toHaveBeenCalledWith("art-1", "c1", "publish");
    expect(m.runCreate).toHaveBeenCalled();
  });
});
