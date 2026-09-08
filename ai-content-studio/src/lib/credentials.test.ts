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
    await expect(authorizeCredentials({ email: "", password: "x" })).resolves.toBeNull();
    await expect(authorizeCredentials({ email: "   ", password: "" })).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("用户不存在返回 null", async () => {
    findUnique.mockResolvedValue(null);
    await expect(authorizeCredentials({ email: "nobody", password: "p" })).resolves.toBeNull();
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

  it("自定义账号（非邮箱）按 email 唯一字段查询", async () => {
    findUnique.mockResolvedValue({
      id: "u2",
      email: "xiaowang",
      name: "小王",
      passwordHash: "h",
      role: "ADMIN",
    });
    compare.mockResolvedValue(true);
    await expect(authorizeCredentials({ email: "xiaowang", password: "right" })).resolves.toEqual({
      id: "u2",
      email: "xiaowang",
      name: "小王",
      role: "ADMIN",
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "xiaowang" } });
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
