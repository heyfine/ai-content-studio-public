import { describe, it, expect, vi, beforeEach } from "vitest";

const { routesFindMany, upsert, modelsFindMany } = vi.hoisted(() => ({
  routesFindMany: vi.fn(),
  upsert: vi.fn(),
  modelsFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aITaskRoute: { findMany: routesFindMany, upsert },
    aIModel: { findMany: modelsFindMany },
  },
}));

import { listTaskRoutes, upsertTaskRoute, listRouteableModels } from "./task-route-service";

describe("task-route-service", () => {
  beforeEach(() => {
    routesFindMany.mockReset();
    upsert.mockReset();
    modelsFindMany.mockReset();
  });

  it("listTaskRoutes 带 model.provider include", async () => {
    routesFindMany.mockResolvedValue([]);
    await listTaskRoutes();
    expect(routesFindMany).toHaveBeenCalledWith({
      include: { model: { include: { provider: true } } },
    });
  });

  it("upsertTaskRoute 按 task upsert modelId", async () => {
    upsert.mockResolvedValue({ id: "r1" });
    await upsertTaskRoute("article_generate", "m1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { task: "article_generate" },
        update: { modelId: "m1" },
        create: { task: "article_generate", modelId: "m1" },
      }),
    );
  });

  it("listRouteableModels 过滤禁用 provider 并产出 label", async () => {
    modelsFindMany.mockResolvedValue([
      { id: "m1", name: "chat", displayName: "V3", provider: { name: "DeepSeek", enabled: true } },
      { id: "m2", name: "x", displayName: "X", provider: { name: "Old", enabled: false } },
    ]);
    const opts = await listRouteableModels();
    expect(opts).toEqual([{ id: "m1", label: "DeepSeek · V3 (chat)" }]);
  });
});
