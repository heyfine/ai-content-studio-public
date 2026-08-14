import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, getMock, restoreMock, wpUntrashMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getMock: vi.fn(),
  restoreMock: vi.fn(),
  wpUntrashMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/article-service", () => ({
  getArticle: getMock,
  restoreArticle: restoreMock,
}));
vi.mock("@/lib/services/wordpress-service", () => ({
  untrashWordPressPost: wpUntrashMock,
}));

import { POST } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function syncedArticle(status = "PUBLISHED") {
  return {
    id: "a1",
    title: "T",
    status,
    siteConfigId: "cfg1",
    wpPostId: "123",
  };
}

describe("POST /api/articles/[id]/restore", () => {
  beforeEach(() => {
    authMock.mockReset();
    getMock.mockReset();
    restoreMock.mockReset();
    wpUntrashMock.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(new Request("https://x"), ctx("a1"))).status).toBe(401);
  });

  it("文章不存在 404", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(null);
    expect((await POST(new Request("https://x"), ctx("a1"))).status).toBe(404);
  });

  it("普通文章恢复成功（不同步博客）", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue({ id: "a1", siteConfigId: null, wpPostId: null });
    restoreMock.mockResolvedValue({ id: "a1", status: "DRAFT" });
    const res = await POST(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(200);
    expect(restoreMock).toHaveBeenCalledWith("a1");
    expect(wpUntrashMock).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.restored).toBe(true);
  });

  it("博客同步文章恢复并同步 WP untrash", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(syncedArticle());
    restoreMock.mockResolvedValue({ id: "a1", status: "PUBLISHED" });
    wpUntrashMock.mockResolvedValue({ trashed: false, trashStatus: "publish" });
    const res = await POST(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(200);
    expect(wpUntrashMock).toHaveBeenCalledWith("a1", "cfg1", "publish");
    const data = await res.json();
    expect(data.wpSynced).toBe(true);
  });

  it("WP 恢复失败时本地仍恢复并返回 wpError", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue(syncedArticle());
    restoreMock.mockResolvedValue({ id: "a1", status: "DRAFT" });
    wpUntrashMock.mockRejectedValue(new Error("WordPress 恢复失败（500）"));
    const res = await POST(new Request("https://x"), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wpSynced).toBe(false);
    expect(data.wpError).toContain("WordPress");
  });

  it("P2025 记录不存在 404", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue({ id: "a1" });
    restoreMock.mockRejectedValue(new Error("P2025 Record not found"));
    expect((await POST(new Request("https://x"), ctx("a1"))).status).toBe(404);
  });

  it("其他异常 500", async () => {
    authMock.mockResolvedValue({ user: {} });
    getMock.mockResolvedValue({ id: "a1" });
    restoreMock.mockRejectedValue(new Error("err"));
    expect((await POST(new Request("https://x"), ctx("a1"))).status).toBe(500);
  });
});
