import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  refreshSource: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/source-service", () => ({ refreshSource: mocks.refreshSource }));

import { POST } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/sources/[id]/refresh", () => {
  it("未授权 → 401", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const r = await POST(new Request("http://localhost/api/sources/x/refresh", { method: "POST" }), ctx("x"));
    expect(r.status).toBe(401);
  });
  it("刷新成功 → 200", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.refreshSource.mockResolvedValueOnce({ source: { id: "s1" }, created: false, versionBumped: true, versionNumber: 2 });
    const r = await POST(new Request("http://localhost/api/sources/s1/refresh", { method: "POST" }), ctx("s1"));
    expect(r.status).toBe(200);
    expect(mocks.refreshSource.mock.calls[0][0]).toBe("s1");
  });
  it("来源不存在 → 404", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.refreshSource.mockRejectedValueOnce(new Error("来源不存在"));
    const r = await POST(new Request("http://localhost/api/sources/x/refresh", { method: "POST" }), ctx("x"));
    expect(r.status).toBe(404);
  });
});