import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, updateModelMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  updateModelMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/model-service", () => ({ updateModel: updateModelMock }));

import { PATCH } from "./route";

function makeRequest(id: string, body: unknown) {
  return new Request(`https://localhost/api/models/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/models/:id", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateModelMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(makeRequest("m1", { enabled: false }), {
      params: Promise.resolve({ id: "m1" }),
    });
    expect(res.status).toBe(401);
  });

  it("成功更新模型返回 200 并透传", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    updateModelMock.mockResolvedValue({ id: "m1", enabled: false });
    const res = await PATCH(makeRequest("m1", { enabled: false }), {
      params: Promise.resolve({ id: "m1" }),
    });
    expect(res.status).toBe(200);
    expect(updateModelMock).toHaveBeenCalledWith("m1", { enabled: false });
    const data = await res.json();
    expect(data.id).toBe("m1");
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await PATCH(makeRequest("m1", { enabled: "yes" }), {
      params: Promise.resolve({ id: "m1" }),
    });
    expect(res.status).toBe(400);
  });
});
