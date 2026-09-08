import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, revealMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  revealMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/storage-service", () => ({ revealStorageSecret: revealMock }));

import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/storage/config/[id]/reveal", () => {
  beforeEach(() => {
    authMock.mockReset();
    revealMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request("https://localhost/api/storage/config/s1/reveal"), ctx("s1"));
    expect(res.status).toBe(401);
  });

  it("登录后返回解密明文 secret", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    revealMock.mockResolvedValue("sk-s3-secret");
    const res = await GET(new Request("https://localhost/api/storage/config/s1/reveal"), ctx("s1"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; secret: string };
    expect(data.id).toBe("s1");
    expect(data.secret).toBe("sk-s3-secret");
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    revealMock.mockRejectedValue(new Error("存储配置不存在"));
    const res = await GET(new Request("https://localhost/api/storage/config/s1/reveal"), ctx("s1"));
    expect(res.status).toBe(500);
  });
});
