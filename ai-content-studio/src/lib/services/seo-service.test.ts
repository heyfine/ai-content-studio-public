import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, seoCreate, articleUpdate, seoFindFirst } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  seoCreate: vi.fn(),
  articleUpdate: vi.fn(),
  seoFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    article: { findUnique, update: articleUpdate },
    seoReport: { create: seoCreate, findFirst: seoFindFirst },
  },
}));

import { analyzeRaw, analyzeAndSave, getLatestReport } from "./seo-service";

describe("seo-service", () => {
  beforeEach(() => {
    findUnique.mockReset();
    seoCreate.mockReset();
    articleUpdate.mockReset();
    seoFindFirst.mockReset();
  });

  it("analyzeRaw 仅分析不写库", async () => {
    const r = await analyzeRaw({ title: "Next.js 部署指南", content: "## 概述\n正文。" });
    expect(r.saved).toBe(false);
    expect(seoCreate).not.toHaveBeenCalled();
    expect(typeof r.score).toBe("number");
    expect(Array.isArray(r.issues)).toBe(true);
  });

  it("analyzeAndSave 写 SeoReport 并回填 seoScore", async () => {
    findUnique.mockResolvedValue({ id: "a1", title: "测试", content: "## 概述\n正文" });
    seoCreate.mockResolvedValue({ id: "rep-1" });
    const r = await analyzeAndSave("a1");
    expect(r.saved).toBe(true);
    expect(r.reportId).toBe("rep-1");
    expect(r.articleId).toBe("a1");
    expect(seoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ articleId: "a1", keywords: expect.any(Array) }),
      }),
    );
    expect(articleUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { seoScore: r.score },
    });
  });

  it("文章不存在抛错且不写", async () => {
    findUnique.mockResolvedValue(null);
    await expect(analyzeAndSave("x")).rejects.toThrow("文章不存在");
    expect(seoCreate).not.toHaveBeenCalled();
  });

  it("getLatestReport 按时间倒序取首条", async () => {
    seoFindFirst.mockResolvedValue({ id: "rep-9", score: 88 });
    const r = await getLatestReport("a1");
    expect(r).toMatchObject({ id: "rep-9", score: 88 });
    expect(seoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { articleId: "a1" }, orderBy: { createdAt: "desc" } }),
    );
  });
});
