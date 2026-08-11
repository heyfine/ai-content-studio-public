import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  aiGenerate: vi.fn(),
  analyzeAndSave: vi.fn(),
  getArticle: vi.fn(),
  updateArticle: vi.fn(),
}));

vi.mock("@/lib/ai/generate", () => ({ generate: m.aiGenerate }));
vi.mock("@/lib/services/seo-service", () => ({ analyzeAndSave: m.analyzeAndSave }));
vi.mock("@/lib/services/article-service", () => ({
  getArticle: m.getArticle,
  updateArticle: m.updateArticle,
}));

import { refreshArticle, refreshStaleArticles } from "./refresh-service";

const article = {
  id: "a1",
  title: "Next.js 指南",
  content: "## 概述\n旧正文偏短。",
  status: "DRAFT",
  seoScore: 45,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("refresh-service", () => {
  beforeEach(() => {
    m.aiGenerate.mockReset();
    m.analyzeAndSave.mockReset();
    m.getArticle.mockReset();
    m.updateArticle.mockReset();
  });

  it("refreshArticle 成功：AI 重写→更新 content→重新 SEO 评分，返回对比", async () => {
    m.getArticle.mockResolvedValue(article);
    m.aiGenerate.mockResolvedValue({
      content: "## 完整正文\n补充细节。",
      generationId: "g9",
      modelId: "m1",
    });
    m.analyzeAndSave.mockResolvedValue({
      score: 82,
      keywords: ["next"],
      issues: [],
      suggestions: [],
      saved: true,
      reportId: "r1",
      articleId: "a1",
    });
    m.updateArticle.mockResolvedValue({});

    const r = await refreshArticle("a1");
    expect(r.articleId).toBe("a1");
    expect(r.oldSeoScore).toBe(45);
    expect(r.newSeoScore).toBe(82);
    expect(r.oldContentLength).toBe(article.content.length);
    expect(r.newContentLength).toBe("## 完整正文\n补充细节。".length);
    expect(r.generationId).toBe("g9");
    expect(r.stale.aged).toBe(true);
    expect(m.updateArticle).toHaveBeenCalledWith("a1", { content: "## 完整正文\n补充细节。" });
    expect(m.analyzeAndSave).toHaveBeenCalledWith("a1");
  });

  it("文章不存在抛错", async () => {
    m.getArticle.mockResolvedValue(null);
    await expect(refreshArticle("x")).rejects.toThrow("文章不存在");
    expect(m.aiGenerate).not.toHaveBeenCalled();
  });

  it("AI 重写失败抛错，不更新文章", async () => {
    m.getArticle.mockResolvedValue(article);
    m.aiGenerate.mockRejectedValue(new Error("AI 超时"));
    await expect(refreshArticle("a1")).rejects.toThrow("AI 超时");
    expect(m.updateArticle).not.toHaveBeenCalled();
    expect(m.analyzeAndSave).not.toHaveBeenCalled();
  });

  it("SEO 重评失败不阻断：用旧分兜底返回", async () => {
    m.getArticle.mockResolvedValue(article);
    m.aiGenerate.mockResolvedValue({ content: "新正文", generationId: "g1", modelId: "m1" });
    m.updateArticle.mockResolvedValue({});
    m.analyzeAndSave.mockRejectedValue(new Error("SEO 解析失败"));
    const r = await refreshArticle("a1");
    expect(r.newSeoScore).toBe(45);
    expect(r.generationId).toBe("g1");
    expect(r.newContentLength).toBe("新正文".length);
  });

  it("refreshStaleArticles 批量：筛 stale → 全部刷新，返回汇总", async () => {
    const now = new Date("2026-08-11T10:00:00Z");
    const list = [
      { id: "a", updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: 30 },
      { id: "b", updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 50 },
      { id: "c", updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 90 }, // fresh, 排除
    ];
    m.getArticle.mockImplementation(async (id) => ({ ...article, id, title: id }));
    m.aiGenerate.mockImplementation(async () => ({
      content: "重写后",
      generationId: "g" + Math.random(),
      modelId: "m1",
    }));
    m.analyzeAndSave.mockImplementation(async (id) => ({
      score: 80,
      keywords: [],
      issues: [],
      suggestions: [],
      saved: true,
      reportId: "r",
      articleId: id,
    }));
    m.updateArticle.mockResolvedValue({});

    const res = await refreshStaleArticles(list, { now });
    expect(res.refreshed).toHaveLength(2);
    expect(res.failed).toEqual([]);
    expect(res.refreshed.map((r) => r.articleId)).toEqual(["a", "b"]);
  });

  it("refreshStaleArticles 单篇失败收集不阻断", async () => {
    const now = new Date("2026-08-11T10:00:00Z");
    const list = [
      { id: "a", updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: 30 },
      { id: "b", updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: 40 },
    ];
    m.getArticle.mockImplementation(async (id) => (id === "a" ? null : { ...article, id }));
    m.aiGenerate.mockResolvedValue({ content: "x", generationId: "g1", modelId: "m1" });
    m.analyzeAndSave.mockResolvedValue({
      score: 75,
      keywords: [],
      issues: [],
      suggestions: [],
      saved: true,
      reportId: "r",
      articleId: "b",
    });
    m.updateArticle.mockResolvedValue({});

    const res = await refreshStaleArticles(list, { now });
    expect(res.refreshed).toHaveLength(1);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].articleId).toBe("a");
    expect(res.failed[0].error).toContain("文章不存在");
  });

  it("refreshStaleArticles 无候选返回空", async () => {
    const now = new Date("2026-08-11T10:00:00Z");
    const res = await refreshStaleArticles([{ id: "c", updatedAt: now, seoScore: 90 }], { now });
    expect(res.refreshed).toEqual([]);
    expect(res.failed).toEqual([]);
    expect(m.aiGenerate).not.toHaveBeenCalled();
  });
});
