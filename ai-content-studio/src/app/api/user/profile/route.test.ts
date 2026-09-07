// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    user: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PUT } from "./route";

function jsonRequest(body: unknown) {
  return new Request("https://x/api/user/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const session = { user: { id: "u1", email: "a@b.com", role: "ADMIN" } };

describe("PUT /api/user/profile", () => {
  beforeEach(() => {
    authMock.mockReset();
    prismaMock.user.update.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await PUT(jsonRequest({ name: "张三" }))).status).toBe(401);
  });

  it("参数不合法（超长）400", async () => {
    authMock.mockResolvedValue(session);
    const res = await PUT(jsonRequest({ name: "长".repeat(51) }));
    expect(res.status).toBe(400);
  });

  it("修改成功 200：返回脱敏用户信息；空白名归一为 null", async () => {
    authMock.mockResolvedValue(session);
    prismaMock.user.update.mockResolvedValue({ id: "u1", email: "a@b.com", name: "张三" });
    const res = await PUT(jsonRequest({ name: "  张三  " }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { name: string }).toEqual({
      id: "u1",
      email: "a@b.com",
      name: "张三",
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "张三" },
      select: { id: true, email: true, name: true },
    });

    prismaMock.user.update.mockClear();
    prismaMock.user.update.mockResolvedValue({ id: "u1", email: "a@b.com", name: null });
    await PUT(jsonRequest({ name: "   " }));
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: null } }),
    );
  });
});
