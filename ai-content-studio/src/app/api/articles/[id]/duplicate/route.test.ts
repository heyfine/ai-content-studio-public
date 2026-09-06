import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, duplicateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  duplicateMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/article-service", () => ({ duplicateArticle: duplicateMock }));

import { POST } from "./route";

function makeRequest() {
  return new Request("https://localhost/api/articles/a1/duplicate", { method: "POST" });
}

const params = { params: Promise.resolve({ id: "a1" }) };

describe("POST /api/articles/[id]/duplicate", () => {
  beforeEach(() => {
    authMock.mockReset();
    duplicateMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(401);
  });

  it("复制成功返回新 id 与标题（201）", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    duplicateMock.mockResolvedValue({ id: "a2", title: "T（副本）" });
    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "a2", title: "T（副本）" });
  });

  it("源文章不存在返回 404", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    duplicateMock.mockRejectedValue(new Error("文章不存在"));
    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(404);
  });
});
