import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, create, update, del } = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { aIModel: { findMany, create, update, delete: del } },
}));

import { createModel, listModels, updateModel, deleteModel } from "./model-service";

describe("model-service", () => {
  beforeEach(() => {
    findMany.mockReset();
    create.mockReset();
    update.mockReset();
    del.mockReset();
  });

  it("createModel 透传字段", async () => {
    create.mockResolvedValue({ id: "m1" });
    await createModel({ providerId: "p1", name: "deepseek-chat", displayName: "DeepSeek V3" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerId: "p1",
          name: "deepseek-chat",
          displayName: "DeepSeek V3",
        }),
      }),
    );
  });

  it("listModels 支持 providerId 过滤", async () => {
    findMany.mockResolvedValue([]);
    await listModels("p1");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { providerId: "p1" } }));
  });

  it("listModels 无过滤时带 include provider", async () => {
    findMany.mockResolvedValue([]);
    await listModels();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { provider: true } }));
  });

  it("updateModel 透传部分字段", async () => {
    update.mockResolvedValue({ id: "m1" });
    await updateModel("m1", { displayName: "Renamed" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m1" }, data: { displayName: "Renamed" } }),
    );
  });

  it("deleteModel 调 delete", async () => {
    del.mockResolvedValue({ id: "m1" });
    await deleteModel("m1");
    expect(del).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});
