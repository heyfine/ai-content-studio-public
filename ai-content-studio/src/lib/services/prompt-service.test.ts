import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, findUnique, findFirst, create, update, del } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prompt: { findMany, findUnique, findFirst, create, update, delete: del },
  },
}));

import {
  listPrompts,
  getPrompt,
  createPrompt,
  updatePrompt,
  deletePrompt,
  getActivePromptByType,
} from "./prompt-service";

describe("prompt-service", () => {
  beforeEach(() => {
    findMany.mockReset();
    findUnique.mockReset();
    findFirst.mockReset();
    create.mockReset();
    update.mockReset();
    del.mockReset();
  });

  it("listPrompts 无 type 时不带 where，按更新时间倒序", async () => {
    findMany.mockResolvedValue([]);
    await listPrompts();
    expect(findMany).toHaveBeenCalledWith({ orderBy: { updatedAt: "desc" } });
  });

  it("listPrompts 带 type 时按 type 过滤", async () => {
    findMany.mockResolvedValue([]);
    await listPrompts("seo");
    expect(findMany).toHaveBeenCalledWith({
      where: { type: "seo" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("createPrompt 默认 active=true，空 description 转 null", async () => {
    create.mockResolvedValue({ id: "p1" });
    await createPrompt({ name: "X", type: "t", content: "c", description: "" });
    expect(create).toHaveBeenCalledWith({
      data: { name: "X", description: null, type: "t", content: "c", active: true },
    });
  });

  it("updatePrompt 不存在时抛错", async () => {
    findUnique.mockResolvedValue(null);
    await expect(updatePrompt("nope", { name: "Y" })).rejects.toThrow("Prompt 不存在");
  });

  it("updatePrompt content 变更时 version 自增", async () => {
    findUnique.mockResolvedValue({ id: "p1", content: "old", version: 2 });
    update.mockResolvedValue({ id: "p1", version: 3 });
    await updatePrompt("p1", { content: "new" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { content: "new", version: 3 },
    });
  });

  it("updatePrompt content 不变时不增 version", async () => {
    findUnique.mockResolvedValue({ id: "p1", content: "same", version: 2 });
    update.mockResolvedValue({ id: "p1" });
    await updatePrompt("p1", { content: "same" });
    expect(update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { content: "same" } });
  });

  it("updatePrompt 仅改 active 时不写 content/version", async () => {
    findUnique.mockResolvedValue({ id: "p1", content: "c", version: 1 });
    update.mockResolvedValue({ id: "p1" });
    await updatePrompt("p1", { active: false });
    expect(update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { active: false } });
  });

  it("deletePrompt 透传 id", async () => {
    del.mockResolvedValue({ id: "p1" });
    await deletePrompt("p1");
    expect(del).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it("getActivePromptByType 按 type+active 过滤并按 version 倒序", async () => {
    findFirst.mockResolvedValue({ id: "p1", version: 3 });
    await getActivePromptByType("seo");
    expect(findFirst).toHaveBeenCalledWith({
      where: { type: "seo", active: true },
      orderBy: { version: "desc" },
    });
  });
});
