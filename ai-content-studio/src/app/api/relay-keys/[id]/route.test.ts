import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, enabledMock, delMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  enabledMock: vi.fn(),
  delMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/relay-service", () => ({
  setRelayKeyEnabled: enabledMock,
  deleteRelayKey: delMock,
}));

import { PUT, DELETE } from "./route";

function makePut(body: unknown) {
  return new Request("https://localhost/api/relay-keys/k1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PUT /api/relay-keys/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    enabledMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makePut({ enabled: true }), ctx("k1"));
    expect(res.status).toBe(401);
  });

  it("enabled 非 boolean 返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await PUT(makePut({}), ctx("k1"));
    expect(res.status).toBe(400);
  });

  it("透传 enabled 并返回新状态", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    enabledMock.mockResolvedValue({ id: "k1", enabled: false });
    const res = await PUT(makePut({ enabled: false }), ctx("k1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.enabled).toBe(false);
    expect(enabledMock).toHaveBeenCalledWith("k1", false);
  });
});

describe("DELETE /api/relay-keys/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    delMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request("https://localhost/api/relay-keys/k1", { method: "DELETE" }),
      ctx("k1"),
    );
    expect(res.status).toBe(401);
  });

  it("删除成功返回 204", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    delMock.mockResolvedValue({ id: "k1" });
    const res = await DELETE(
      new Request("https://localhost/api/relay-keys/k1", { method: "DELETE" }),
      ctx("k1"),
    );
    expect(res.status).toBe(204);
    expect(delMock).toHaveBeenCalledWith("k1");
  });
});
