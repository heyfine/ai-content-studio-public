import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, revealMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  revealMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/relay-service", () => ({ revealRelayKey: revealMock }));

import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/relay-keys/[id]/reveal", () => {
  beforeEach(() => {
    authMock.mockReset();
    revealMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request("https://localhost/api/relay-keys/k1/reveal"), ctx("k1"));
    expect(res.status).toBe(401);
  });

  it("返回明文 key", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    revealMock.mockResolvedValue("sk-relay-secret");
    const res = await GET(new Request("https://localhost/api/relay-keys/k1/reveal"), ctx("k1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("sk-relay-secret");
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    revealMock.mockRejectedValue(new Error("不存在"));
    const res = await GET(new Request("https://localhost/api/relay-keys/k1/reveal"), ctx("k1"));
    expect(res.status).toBe(500);
  });
});
