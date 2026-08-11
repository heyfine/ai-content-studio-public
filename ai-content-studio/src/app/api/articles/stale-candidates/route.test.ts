import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listArticlesMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listArticlesMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/article-service", () => ({ listArticles: listArticlesMock }));

import { GET } from "./route";

const now = new Date("2026-08-11T10:00:00Z");

describe("GET /api/articles/stale-candidates", () => {
  beforeEach(() => {
    authMock.mockReset();
    listArticlesMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request("https://localhost/api/articles/stale-candidates"));
    expect(res.status).toBe(401);
  });

  it("筛出过期/低质并按低分→最早排序，附 staleReasons", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listArticlesMock.mockResolvedValue([
      {
        id: "c",
        title: "新优质",
        status: "PUBLISHED",
        seoScore: 90,
        updatedAt: new Date("2026-08-10T00:00:00Z"),
      }, // fresh, 排除
      {
        id: "a",
        title: "旧低质A",
        status: "DRAFT",
        seoScore: 30,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "b",
        title: "低质B",
        status: "DRAFT",
        seoScore: 50,
        updatedAt: new Date("2026-08-09T00:00:00Z"),
      },
    ]);
    const res = await GET(new Request("https://localhost/api/articles/stale-candidates"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.map((d: { id: string }) => d.id)).toEqual(["a", "b"]);
    expect(data[0].staleReasons.aged).toBe(true);
    expect(data[0].staleReasons.lowSeo).toBe(true);
    expect(data[1].staleReasons.aged).toBe(false);
    expect(data[1].staleReasons.lowSeo).toBe(true);
  });

  it("无候选返回空数组", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listArticlesMock.mockResolvedValue([
      {
        id: "c",
        title: "新优质",
        status: "PUBLISHED",
        seoScore: 90,
        updatedAt: new Date("2026-08-10T00:00:00Z"),
      },
    ]);
    const res = await GET(new Request("https://localhost/api/articles/stale-candidates"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("支持自定义 maxAgeDays / lowSeoThreshold 查询参数", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listArticlesMock.mockResolvedValue([
      {
        id: "d",
        title: "30天",
        status: "DRAFT",
        seoScore: 80,
        updatedAt: new Date("2026-07-01T00:00:00Z"),
      }, // 41天
      { id: "e", title: "65分", status: "DRAFT", seoScore: 65, updatedAt: now },
    ]);
    const res = await GET(
      new Request(
        "https://localhost/api/articles/stale-candidates?maxAgeDays=30&lowSeoThreshold=70",
      ),
    );
    const data = await res.json();
    // d: 41 天 > 30 → aged；e: 65 < 70 → low；都入选
    expect(data.map((d: { id: string }) => d.id).sort()).toEqual(["d", "e"]);
  });
});
