import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const PrismaClient = vi.fn(function PrismaClient() {
  return { user: { findUnique } };
});

vi.mock("@prisma/client", () => ({ PrismaClient }));

describe("prisma lazy client", () => {
  beforeEach(() => {
    PrismaClient.mockClear();
    findUnique.mockClear();
    (globalThis as { __prisma?: unknown }).__prisma = undefined;
  });

  it("import 时不实例化 PrismaClient", async () => {
    await import("./prisma");
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it("首次属性访问触发实例化并复用", async () => {
    const { prisma } = await import("./prisma");
    prisma.user.findUnique({ where: { email: "a@" } });
    prisma.user.findUnique({ where: { email: "b@" } });
    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
