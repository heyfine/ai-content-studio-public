import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listMock, createMock, schemaParse } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listMock: vi.fn(),
  createMock: vi.fn(),
  schemaParse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/provider-service", () => ({
  listProviders: listMock,
  createProvider: createMock,
}));
vi.mock("@/lib/schemas/provider", () => ({
  createProviderSchema: { safeParse: schemaParse },
}));

import { GET, POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/providers", () => {
  beforeEach(() => authMock.mockReset());

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("登录后返回供应商列表", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockResolvedValue([{ id: "p1", name: "DeepSeek" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([{ id: "p1", name: "DeepSeek" }]);
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/providers", () => {
  beforeEach(() => {
    authMock.mockReset();
    schemaParse.mockReset();
    createMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: false, error: { issues: [] } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("校验通过创建返回 201", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const values = { name: "X", type: "OPENAI", apiKey: "k" };
    schemaParse.mockReturnValue({ success: true, data: values });
    createMock.mockResolvedValue({ id: "p1", name: "X" });
    const res = await POST(makeRequest(values));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(values);
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: true, data: {} });
    createMock.mockRejectedValue(new Error("dup"));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
  });
});
