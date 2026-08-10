import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, compare } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique } },
}));
vi.mock("bcryptjs", () => ({
  default: { compare, hash: vi.fn() },
}));

import { authorizeCredentials } from "./credentials";

describe("authorizeCredentials", () => {
  beforeEach(() => {
    findUnique.mockReset();
    compare.mockReset();
  });

  it("非法输入返回 null", async () => {
    await expect(authorizeCredentials({ email: "bad", password: "x" })).resolves.toBeNull();
    await expect(authorizeCredentials({ email: "", password: "" })).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("用户不存在返回 null", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      authorizeCredentials({ email: "nobody@x.com", password: "p" }),
    ).resolves.toBeNull();
  });

  it("密码错误返回 null", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      passwordHash: "h",
      role: "ADMIN",
    });
    compare.mockResolvedValue(false);
    await expect(authorizeCredentials({ email: "a@b.com", password: "wrong" })).resolves.toBeNull();
  });

  it("用户存在且密码匹配返回 user", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      passwordHash: "h",
      role: "ADMIN",
    });
    compare.mockResolvedValue(true);
    await expect(authorizeCredentials({ email: "a@b.com", password: "right" })).resolves.toEqual({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "ADMIN",
    });
  });
});
