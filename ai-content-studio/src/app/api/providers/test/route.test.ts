import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, testConn } = vi.hoisted(() => ({
  authMock: vi.fn(),
  testConn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/provider-service", () => ({ testConnection: testConn }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/providers/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/providers/test", () => {
  beforeEach(() => {
    authMock.mockReset();
    testConn.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ id: "p1" }));
    expect(res.status).toBe(401);
  });

  it("缺少 id 返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("成功返回连接测试结果", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    testConn.mockResolvedValue({ success: true, latencyMs: 50, models: ["a"] });
    const res = await POST(makeRequest({ id: "p1" }));
    expect(res.status).toBe(200);
    expect(testConn).toHaveBeenCalledWith("p1");
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    testConn.mockRejectedValue(new Error("timeout"));
    const res = await POST(makeRequest({ id: "p1" }));
    expect(res.status).toBe(500);
  });
});
