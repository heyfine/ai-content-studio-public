import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSource: vi.fn(),
  deleteSource: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/source-service", () => ({
  getSource: mocks.getSource,
  deleteSource: mocks.deleteSource,
}));

import { DELETE, GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/sources/[id]", () => {
  it("未授权 → 401", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const r = await GET(new Request("http://localhost/api/sources/x"), ctx("x"));
    expect(r.status).toBe(401);
  });
  it("存在 → 200", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.getSource.mockResolvedValueOnce({ id: "s1", title: "T" });
    const r = await GET(new Request("http://localhost/api/sources/s1"), ctx("s1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: "s1", title: "T" });
  });
  it("不存在 → 404", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.getSource.mockResolvedValueOnce(null);
    const r = await GET(new Request("http://localhost/api/sources/x"), ctx("x"));
    expect(r.status).toBe(404);
  });
});

describe("DELETE /api/sources/[id]", () => {
  it("未授权 → 401", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const r = await DELETE(new Request("http://localhost/api/sources/x"), ctx("x"));
    expect(r.status).toBe(401);
  });
  it("成功 → 200", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.deleteSource.mockResolvedValueOnce({ id: "s1" });
    const r = await DELETE(new Request("http://localhost/api/sources/s1"), ctx("s1"));
    expect(r.status).toBe(200);
    expect(mocks.deleteSource.mock.calls[0][0]).toBe("s1");
  });
  it("删除不存在（P2025）→ 404", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.deleteSource.mockRejectedValueOnce(new Error("记录不存在"));
    const r = await DELETE(new Request("http://localhost/api/sources/x"), ctx("x"));
    expect(r.status).toBe(404);
  });
});