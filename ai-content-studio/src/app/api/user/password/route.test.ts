// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prismaMock, bcryptMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  bcryptMock: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("bcryptjs", () => ({ default: bcryptMock }));

import { PUT } from "./route";

function jsonRequest(body: unknown) {
  return new Request("https://x/api/user/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const session = { user: { id: "u1", email: "a@b.com", role: "ADMIN" } };
const dbUser = { id: "u1", email: "a@b.com", name: null, passwordHash: "hash-old" };

describe("PUT /api/user/password", () => {
  beforeEach(() => {
    authMock.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.update.mockReset();
    bcryptMock.compare.mockReset();
    bcryptMock.hash.mockReset();
  });

  it("未登录 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(
      jsonRequest({
        currentPassword: "x",
        newPassword: "y".repeat(8),
        confirmPassword: "y".repeat(8),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("参数不合法（新密码过短）400", async () => {
    authMock.mockResolvedValue(session);
    const res = await PUT(
      jsonRequest({ currentPassword: "x", newPassword: "short", confirmPassword: "short" }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("8");
  });

  it("两次新密码不一致 400", async () => {
    authMock.mockResolvedValue(session);
    const res = await PUT(
      jsonRequest({
        currentPassword: "x",
        newPassword: "newpass123",
        confirmPassword: "newpass999",
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("不一致");
  });

  it("用户不存在 404", async () => {
    authMock.mockResolvedValue(session);
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await PUT(
      jsonRequest({
        currentPassword: "x",
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("当前密码不正确 400", async () => {
    authMock.mockResolvedValue(session);
    prismaMock.user.findUnique.mockResolvedValue(dbUser);
    bcryptMock.compare.mockResolvedValue(false);
    const res = await PUT(
      jsonRequest({
        currentPassword: "wrong",
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("当前密码不正确");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("修改成功 200：bcrypt 验旧哈新并 update", async () => {
    authMock.mockResolvedValue(session);
    prismaMock.user.findUnique.mockResolvedValue(dbUser);
    bcryptMock.compare.mockResolvedValue(true);
    bcryptMock.hash.mockResolvedValue("hash-new");
    prismaMock.user.update.mockResolvedValue({ id: "u1" });
    const res = await PUT(
      jsonRequest({
        currentPassword: "old",
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
    expect(bcryptMock.compare).toHaveBeenCalledWith("old", "hash-old");
    expect(bcryptMock.hash).toHaveBeenCalledWith("newpass123", 10);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hash-new" },
      select: { id: true },
    });
  });
});
