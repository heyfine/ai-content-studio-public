import { describe, it, expect, vi, beforeEach } from "vitest";

const { generateByTask, createGen } = vi.hoisted(() => ({
  generateByTask: vi.fn(),
  createGen: vi.fn(),
}));

vi.mock("./router", () => ({ generateByTask }));
vi.mock("@/lib/prisma", () => ({
  prisma: { aIGeneration: { create: createGen } },
}));

import { generate } from "./generate";

describe("generate", () => {
  beforeEach(() => {
    generateByTask.mockReset();
    createGen.mockReset();
  });

  it("成功后写入 AIGeneration 并返回 generationId", async () => {
    generateByTask.mockResolvedValue({
      content: "正文",
      inputTokens: 5,
      outputTokens: 8,
      context: { taskId: "t1", modelId: "m1", model: "x", providerType: "OPENAI_COMPATIBLE" },
    });
    createGen.mockResolvedValue({ id: "gen-9", output: "正文" });
    const r = await generate({
      task: "article_generate",
      input: "写",
      articleId: "a1",
      promptId: "p1",
    });
    expect(r.content).toBe("正文");
    expect(r.generationId).toBe("gen-9");
    expect(createGen).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          articleId: "a1",
          modelId: "m1",
          promptId: "p1",
          input: "写",
          output: "正文",
          inputTokens: 5,
          outputTokens: 8,
          duration: expect.any(Number),
        }),
      }),
    );
  });

  it("router 抛错时透传且不写记录", async () => {
    generateByTask.mockRejectedValue(new Error("boom"));
    await expect(generate({ task: "x", input: "y" })).rejects.toThrow("boom");
    expect(createGen).not.toHaveBeenCalled();
  });
});
