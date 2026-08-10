import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, updateMock, deleteMock, schemaParse } = vi.hoisted(() => ({
  authMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  schemaParse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/provider-service", () => ({
  updateProvider: updateMock,
  deleteProvider: deleteMock,
}));
vi.mock("@/lib/schemas/provider", () => ({
  updateProviderSchema: { safeParse: schemaParse },
}));

import { PUT, DELETE } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PUT /api/providers/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    schemaParse.mockReset();
    updateMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("p1"));
    expect(res.status).toBe(401);
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: false, error: { issues: [] } });
    const res = await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("p1"));
    expect(res.status).toBe(400);
  });

  it("成功返回更新结果", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: true, data: { name: "New" } });
    updateMock.mockResolvedValue({ id: "p1", name: "New" });
    const res = await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith("p1", { name: "New" });
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: true, data: {} });
    updateMock.mockRejectedValue(new Error("err"));
    const res = await PUT(new Request("https://x", { method: "PUT", body: "{}" }), ctx("p1"));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/providers/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(new Request("https://x"), ctx("p1"));
    expect(res.status).toBe(401);
  });

  it("成功返回删除结果", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    deleteMock.mockResolvedValue({ id: "p1" });
    const res = await DELETE(new Request("https://x"), ctx("p1"));
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("p1");
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    deleteMock.mockRejectedValue(new Error("err"));
    const res = await DELETE(new Request("https://x"), ctx("p1"));
    expect(res.status).toBe(500);
  });
});
