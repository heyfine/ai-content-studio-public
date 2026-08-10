import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, getMock, updateMock, deleteMock, schemaParse } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  schemaParse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/article-service", () => ({
  getArticle: getMock,
  updateArticle: updateMock,
  deleteArticle: deleteMock,
}));
vi.mock("@/lib/schemas/article", () => ({
  updateArticleSchema: { safeParse: schemaParse },
}));

import { GET, PUT, DELETE } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/articles/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    getMock.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET(new Request("https://x"), ctx("a1"))).status).toBe(401);
  });

  it("不存在返回 404", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(null);
    expect((await GET(new Request("https://x"), ctx("a1"))).status).toBe(404);
  });

  it("存在返回文章", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue({ id: "a1", title: "T" });
    const res = await GET(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("a1");
  });
});

describe("PUT /api/articles/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    schemaParse.mockReset();
    updateMock.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    expect(
      (await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("a1"))).status,
    ).toBe(401);
  });

  it("校验失败 400", async () => {
    authMock.mockResolvedValue({ user: {} });
    schemaParse.mockReturnValue({ success: false, error: { issues: [] } });
    expect(
      (await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("a1"))).status,
    ).toBe(400);
  });

  it("文章不存在 404", async () => {
    authMock.mockResolvedValue({ user: {} });
    schemaParse.mockReturnValue({ success: true, data: { title: "Y" } });
    updateMock.mockRejectedValue(new Error("文章不存在"));
    const res = await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("a1"));
    expect(res.status).toBe(404);
    expect(updateMock).toHaveBeenCalledWith("a1", { title: "Y" });
  });

  it("非法状态转换 409", async () => {
    authMock.mockResolvedValue({ user: {} });
    schemaParse.mockReturnValue({ success: true, data: { status: "PUBLISHED" } });
    updateMock.mockRejectedValue(new Error("非法状态转换：ARCHIVED → PUBLISHED"));
    const res = await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("a1"));
    expect(res.status).toBe(409);
  });

  it("成功返回更新结果", async () => {
    authMock.mockResolvedValue({ user: {} });
    schemaParse.mockReturnValue({ success: true, data: { status: "REVIEW" } });
    updateMock.mockResolvedValue({ id: "a1", status: "REVIEW" });
    const res = await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("a1"));
    expect(res.status).toBe(200);
  });

  it("其他异常 500", async () => {
    authMock.mockResolvedValue({ user: {} });
    schemaParse.mockReturnValue({ success: true, data: {} });
    updateMock.mockRejectedValue(new Error("boom"));
    expect(
      (await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("a1"))).status,
    ).toBe(500);
  });
});

describe("DELETE /api/articles/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteMock.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await DELETE(new Request("https://x"), ctx("a1"))).status).toBe(401);
  });

  it("成功 200", async () => {
    authMock.mockResolvedValue({ user: {} });
    deleteMock.mockResolvedValue({ id: "a1" });
    const res = await DELETE(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("a1");
  });

  it("P2025 记录不存在 404", async () => {
    authMock.mockResolvedValue({ user: {} });
    deleteMock.mockRejectedValue(new Error("P2025 Record to delete does not exist"));
    expect((await DELETE(new Request("https://x"), ctx("a1"))).status).toBe(404);
  });

  it("其他异常 500", async () => {
    authMock.mockResolvedValue({ user: {} });
    deleteMock.mockRejectedValue(new Error("err"));
    expect((await DELETE(new Request("https://x"), ctx("a1"))).status).toBe(500);
  });
});
