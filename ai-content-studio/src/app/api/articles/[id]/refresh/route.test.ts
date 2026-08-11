import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, refreshArticleMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  refreshArticleMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/refresh-service", () => ({ refreshArticle: refreshArticleMock }));

import { POST } from "./route";

function makeRequest(id: string, body?: string) {
  return new Request("https://localhost/api/articles/" + id + "/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ?? "",
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/articles/[id]/refresh", () => {
  beforeEach(() => {
    authMock.mockReset();
    refreshArticleMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest("a1"), ctx("a1"));
    expect(res.status).toBe(401);
  });

  it("成功返回对比结果", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    refreshArticleMock.mockResolvedValue({
      articleId: "a1",
      title: "Next.js 指南",
      generationId: "g1",
      oldSeoScore: 45,
      newSeoScore: 82,
      oldContentLength: 20,
      newContentLength: 200,
      stale: { aged: true, lowSeo: true, ageDays: 220 },
    });
    const res = await POST(makeRequest("a1", JSON.stringify({ maxTokens: 1024 })), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newSeoScore).toBe(82);
    expect(refreshArticleMock).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ maxTokens: 1024 }),
    );
  });

  it("无 body 也成功（用默认 opts）", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    refreshArticleMock.mockResolvedValue({
      articleId: "a1",
      title: "t",
      generationId: "g",
      oldSeoScore: null,
      newSeoScore: 70,
      oldContentLength: 1,
      newContentLength: 2,
      stale: { aged: false, lowSeo: false, ageDays: 1 },
    });
    const res = await POST(makeRequest("a1"), ctx("a1"));
    expect(res.status).toBe(200);
    expect(refreshArticleMock).toHaveBeenCalledTimes(1);
  });

  it("文章不存在返回 404", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    refreshArticleMock.mockRejectedValue(new Error("文章不存在"));
    const res = await POST(makeRequest("x"), ctx("x"));
    expect(res.status).toBe(404);
  });

  it("未配置路由返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    refreshArticleMock.mockRejectedValue(new Error("未配置任务路由：article_generate"));
    const res = await POST(makeRequest("a1"), ctx("a1"));
    expect(res.status).toBe(400);
  });

  it("AI 失败返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    refreshArticleMock.mockRejectedValue(new Error("AI 超时"));
    const res = await POST(makeRequest("a1"), ctx("a1"));
    expect(res.status).toBe(500);
  });
});
