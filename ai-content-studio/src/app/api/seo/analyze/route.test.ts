import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, analyzeAndSaveMock, analyzeRawMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  analyzeAndSaveMock: vi.fn(),
  analyzeRawMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/seo-service", () => ({
  analyzeAndSave: analyzeAndSaveMock,
  analyzeRaw: analyzeRawMock,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/seo/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/seo/analyze", () => {
  beforeEach(() => {
    authMock.mockReset();
    analyzeAndSaveMock.mockReset();
    analyzeRawMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ articleId: "a1" }));
    expect(res.status).toBe(401);
  });

  it("校验失败返回 400（既无 articleId 也无 title+content）", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("提供 articleId → analyzeAndSave 并返回结果", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    analyzeAndSaveMock.mockResolvedValue({
      score: 90,
      saved: true,
      reportId: "r1",
      articleId: "a1",
      keywords: [],
      issues: [],
      suggestions: [],
    });
    const res = await POST(makeRequest({ articleId: "a1" }));
    expect(res.status).toBe(200);
    expect(analyzeAndSaveMock).toHaveBeenCalledWith("a1");
    const data = await res.json();
    expect(data.saved).toBe(true);
  });

  it("提供 title+content → analyzeRaw 不写库", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    analyzeRawMock.mockResolvedValue({
      score: 75,
      saved: false,
      keywords: ["x"],
      issues: [],
      suggestions: [],
    });
    const res = await POST(makeRequest({ title: "标题", content: "正文" }));
    expect(res.status).toBe(200);
    expect(analyzeRawMock).toHaveBeenCalledWith({
      title: "标题",
      content: "正文",
      metaDescription: undefined,
    });
    expect(analyzeAndSaveMock).not.toHaveBeenCalled();
  });

  it("文章不存在返回 404", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    analyzeAndSaveMock.mockRejectedValue(new Error("文章不存在"));
    const res = await POST(makeRequest({ articleId: "x" }));
    expect(res.status).toBe(404);
  });

  it("其他错误返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    analyzeAndSaveMock.mockRejectedValue(new Error("db down"));
    const res = await POST(makeRequest({ articleId: "a1" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("SEO 分析失败");
  });
});
