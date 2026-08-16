import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, getMock, updateMock, trashMock, purgeMock, schemaParse, wpTrashMock, wpUntrashMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    getMock: vi.fn(),
    updateMock: vi.fn(),
    trashMock: vi.fn(),
    purgeMock: vi.fn(),
    schemaParse: vi.fn(),
    wpTrashMock: vi.fn(),
    wpUntrashMock: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/article-service", () => ({
  getArticle: getMock,
  updateArticle: updateMock,
  trashArticle: trashMock,
  purgeArticle: purgeMock,
}));
vi.mock("@/lib/schemas/article", () => ({
  updateArticleSchema: { safeParse: schemaParse },
}));
vi.mock("@/lib/services/wordpress-service", () => ({
  publishArticle: vi.fn(),
  trashWordPressPost: wpTrashMock,
  unpublishArticle: wpUntrashMock,
}));

import { GET, PUT, DELETE } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function syncedArticle() {
  return {
    id: "a1",
    title: "T",
    status: "PUBLISHED",
    siteConfigId: "cfg1",
    wpPostId: "123",
  };
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

describe("DELETE /api/articles/[id]（移入回收站）", () => {
  beforeEach(() => {
    authMock.mockReset();
    getMock.mockReset();
    trashMock.mockReset();
    purgeMock.mockReset();
    wpTrashMock.mockReset();
    wpUntrashMock.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await DELETE(new Request("https://x"), ctx("a1"))).status).toBe(401);
  });

  it("文章不存在 404", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(null);
    expect((await DELETE(new Request("https://x"), ctx("a1"))).status).toBe(404);
  });

  it("普通文章移入回收站成功（不同步博客）", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue({ id: "a1", siteConfigId: null, wpPostId: null });
    trashMock.mockResolvedValue({ id: "a1", deletedAt: new Date() });
    const res = await DELETE(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(200);
    expect(trashMock).toHaveBeenCalledWith("a1");
    expect(wpTrashMock).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.trashed).toBe(true);
  });

  it("博客同步文章移入回收站并同步 WP trash", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(syncedArticle());
    trashMock.mockResolvedValue({ id: "a1", deletedAt: new Date() });
    wpTrashMock.mockResolvedValue({ trashed: true, trashStatus: "trash" });
    const res = await DELETE(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(200);
    expect(trashMock).toHaveBeenCalledWith("a1");
    expect(wpTrashMock).toHaveBeenCalledWith("a1", "cfg1");
    const data = await res.json();
    expect(data.wpSynced).toBe(true);
  });

  it("WP 同步失败返回 502 且本地不移入回收站", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(syncedArticle());
    wpTrashMock.mockRejectedValue(new Error("WordPress 移入回收站失败（500）"));
    const res = await DELETE(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(502);
    expect(trashMock).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.error).toContain("WordPress");
    expect(data.error).toContain("本地文章未删除");
  });

  it("permanent=true 永久删除并同步 WP 彻底删除", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(syncedArticle());
    purgeMock.mockResolvedValue({ id: "a1" });
    wpUntrashMock.mockResolvedValue({ articleId: "a1", deleted: true });
    const res = await DELETE(
      new Request("https://x?permanent=true", { method: "DELETE" }),
      ctx("a1"),
    );
    expect(res.status).toBe(200);
    expect(purgeMock).toHaveBeenCalledWith("a1");
    expect(wpUntrashMock).toHaveBeenCalledWith("a1", "cfg1");
    const data = await res.json();
    expect(data.permanent).toBe(true);
  });

  it("P2025 记录不存在 404", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue({ id: "a1" });
    trashMock.mockRejectedValue(new Error("P2025 Record to delete does not exist"));
    expect((await DELETE(new Request("https://x"), ctx("a1"))).status).toBe(404);
  });

  it("其他异常 500", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue({ id: "a1" });
    trashMock.mockRejectedValue(new Error("err"));
    expect((await DELETE(new Request("https://x"), ctx("a1"))).status).toBe(500);
  });
});
