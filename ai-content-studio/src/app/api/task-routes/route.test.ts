import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listRoutes, upsertRoute, listModels, schemaParse } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listRoutes: vi.fn(),
  upsertRoute: vi.fn(),
  listModels: vi.fn(),
  schemaParse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/task-route-service", () => ({
  listTaskRoutes: listRoutes,
  upsertTaskRoute: upsertRoute,
  listRouteableModels: listModels,
}));

import { GET, PUT } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/task-routes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/task-routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    listRoutes.mockReset();
    listModels.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("登录后返回 routes 与 models", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listRoutes.mockResolvedValue([{ id: "r1", task: "t", modelId: "m1" }]);
    listModels.mockResolvedValue([{ id: "m1", label: "M1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.routes).toHaveLength(1);
    expect(data.models).toHaveLength(1);
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listRoutes.mockRejectedValue(new Error("db"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/task-routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    upsertRoute.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makeRequest({ task: "t", modelId: "m1" }));
    expect(res.status).toBe(401);
  });

  it("成功返回 upsert 结果", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    upsertRoute.mockResolvedValue({ id: "r1", task: "t", modelId: "m1" });
    const res = await PUT(makeRequest({ task: "t", modelId: "m1" }));
    expect(res.status).toBe(200);
    expect(upsertRoute).toHaveBeenCalledWith("t", "m1");
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    upsertRoute.mockRejectedValue(new Error("err"));
    const res = await PUT(makeRequest({ task: "t", modelId: "m1" }));
    expect(res.status).toBe(500);
  });
});
