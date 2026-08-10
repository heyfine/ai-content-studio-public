import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, publishArticleMock, unpublishArticleMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  publishArticleMock: vi.fn(),
  unpublishArticleMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/wordpress-service", () => ({
  publishArticle: publishArticleMock,
  unpublishArticle: unpublishArticleMock,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/wordpress/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/wordpress/publish", () => {
  beforeEach(() => {
    authMock.mockReset();
    publishArticleMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ articleId: "a1" }));
    expect(res.status).toBe(401);
  });

  it("校验失败（无 articleId）返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("成功发布返回 wpPostId 与 link", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    publishArticleMock.mockResolvedValue({
      wpPostId: "99",
      link: "https://blog.example.com/?p=99",
      status: "publish",
      articleId: "a1",
    });
    const res = await POST(makeRequest({ articleId: "a1", configId: "c1", wpStatus: "publish" }));
    expect(res.status).toBe(200);
    expect(publishArticleMock).toHaveBeenCalledWith("a1", "c1", "publish");
    const data = await res.json();
    expect(data.wpPostId).toBe("99");
    expect(data.link).toContain("p=99");
  });

  it("文章不存在返回 404", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    publishArticleMock.mockRejectedValue(new Error("文章不存在"));
    const res = await POST(makeRequest({ articleId: "x" }));
    expect(res.status).toBe(404);
  });

  it("未配置站点返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    publishArticleMock.mockRejectedValue(new Error("未配置启用中的 WordPress 站点"));
    const res = await POST(makeRequest({ articleId: "a1" }));
    expect(res.status).toBe(400);
  });

  it("WP 接口失败返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    publishArticleMock.mockRejectedValue(
      new Error("WordPress 发布失败（403）：rest_cookie_disabled"),
    );
    const res = await POST(makeRequest({ articleId: "a1" }));
    expect(res.status).toBe(500);
  });
});
