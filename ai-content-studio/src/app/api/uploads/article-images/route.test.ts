// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, articleFindMany } = vi.hoisted(() => ({
  authMock: vi.fn(),
  articleFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { article: { findMany: articleFindMany } },
}));

import { GET } from "./route";

describe("GET /api/uploads/article-images", () => {
  beforeEach(() => {
    authMock.mockReset();
    articleFindMany.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("聚合文章图片：markdown 与 HTML 图、本地/外部标记", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    articleFindMany.mockResolvedValue([
      {
        id: "a1",
        title: "文章一",
        content: '![本地](/uploads/x.png) <img src="https://cdn.example.com/1.jpg">',
      },
      { id: "a2", title: "无图文章", content: "纯文字" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const groups = (await res.json()) as Array<{
      articleId: string;
      images: Array<{ src: string; local: boolean }>;
    }>;
    expect(groups).toHaveLength(1);
    expect(groups[0].articleId).toBe("a1");
    expect(groups[0].images).toEqual([
      { src: "/uploads/x.png", local: true },
      { src: "https://cdn.example.com/1.jpg", local: false },
    ]);
  });
});
