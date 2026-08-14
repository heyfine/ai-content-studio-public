import { describe, it, expect, vi, beforeEach } from "vitest";

const { generateByTask, streamByTask, createGen, getPrompt, getActivePromptByType } = vi.hoisted(
  () => ({
    generateByTask: vi.fn(),
    streamByTask: vi.fn(),
    createGen: vi.fn(),
    getPrompt: vi.fn(),
    getActivePromptByType: vi.fn(),
  }),
);

vi.mock("./router", () => ({ generateByTask, streamByTask }));
vi.mock("@/lib/prisma", () => ({ prisma: { aIGeneration: { create: createGen } } }));
vi.mock("@/lib/services/prompt-service", () => ({ getPrompt, getActivePromptByType }));

import { generate, generateStream } from "./generate";

const ctx = {
  taskId: "t1",
  modelId: "m1",
  model: "x",
  providerType: "OPENAI_COMPATIBLE" as const,
};

describe("generate", () => {
  beforeEach(() => {
    generateByTask.mockReset();
    createGen.mockReset();
    getPrompt.mockReset();
    getActivePromptByType.mockReset();
  });

  it("成功后写入 AIGeneration 并返回 generationId，注入 selectedPrompt 作 systemPrompt", async () => {
    getPrompt.mockResolvedValue({ content: "你是专家" });
    generateByTask.mockResolvedValue({
      content: "正文",
      inputTokens: 5,
      outputTokens: 8,
      context: ctx,
    });
    createGen.mockResolvedValue({ id: "gen-9" });
    const r = await generate({
      task: "article_generate",
      input: "写",
      articleId: "a1",
      promptId: "p1",
    });
    expect(r.content).toBe("正文");
    expect(r.generationId).toBe("gen-9");
    expect(getPrompt).toHaveBeenCalledWith("p1");
    expect(generateByTask).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "你是专家" }),
    );
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
        }),
      }),
    );
  });

  it("router 抛错时透传且不写记录", async () => {
    generateByTask.mockRejectedValue(new Error("boom"));
    await expect(generate({ task: "x", input: "y" })).rejects.toThrow("boom");
    expect(createGen).not.toHaveBeenCalled();
  });

  it("resolveSystemPrompt：显式 systemPrompt 与 promptId 模板拼接", async () => {
    getPrompt.mockResolvedValue({ content: "模板" });
    generateByTask.mockResolvedValue({ content: "c", context: ctx });
    createGen.mockResolvedValue({ id: "g" });
    await generate({ task: "t", input: "y", systemPrompt: "显式", promptId: "p" });
    expect(generateByTask).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "模板\n\n显式" }),
    );
    expect(getPrompt).toHaveBeenCalledWith("p");
  });

  it("resolveSystemPrompt：有 promptId 无显式时用模板", async () => {
    getPrompt.mockResolvedValue({ content: "模板" });
    generateByTask.mockResolvedValue({ content: "c", context: ctx });
    createGen.mockResolvedValue({ id: "g" });
    await generate({ task: "t", input: "y", promptId: "p" });
    expect(generateByTask).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: "模板" }));
  });

  it("resolveSystemPrompt：有显式无 promptId 时优先显式", async () => {
    generateByTask.mockResolvedValue({ content: "c", context: ctx });
    createGen.mockResolvedValue({ id: "g" });
    await generate({ task: "t", input: "y", systemPrompt: "显式" });
    expect(generateByTask).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "显式" }),
    );
    expect(getActivePromptByType).not.toHaveBeenCalled();
  });

  it("resolveSystemPrompt 回退 active by type", async () => {
    getActivePromptByType.mockResolvedValue({ content: "active" });
    generateByTask.mockResolvedValue({ content: "c", context: ctx });
    createGen.mockResolvedValue({ id: "g" });
    await generate({ task: "t", input: "y" });
    expect(getActivePromptByType).toHaveBeenCalledWith("t");
    expect(generateByTask).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "active" }),
    );
  });

  it("resolveSystemPrompt 无任何模板时为 undefined", async () => {
    getActivePromptByType.mockResolvedValue(null);
    generateByTask.mockResolvedValue({ content: "c", context: ctx });
    createGen.mockResolvedValue({ id: "g" });
    await generate({ task: "t", input: "y" });
    expect(generateByTask).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: undefined }),
    );
  });
});

describe("generateStream", () => {
  beforeEach(() => {
    streamByTask.mockReset();
    createGen.mockReset();
    getPrompt.mockReset();
    getActivePromptByType.mockReset();
  });

  function makeGen(deltas: string[], meta: Record<string, unknown>) {
    return async function* () {
      for (const d of deltas) yield d;
      return meta;
    };
  }

  it("逐个 yield 增量，结束后写记录并返回结果", async () => {
    getPrompt.mockResolvedValue({ content: "P" });
    streamByTask.mockImplementation(
      makeGen(["你", "好"], { inputTokens: 1, outputTokens: 2, context: ctx }),
    );
    createGen.mockResolvedValue({ id: "gen-s" });
    const collected: string[] = [];
    const gen = generateStream({ task: "t", input: "y", promptId: "p1" });
    while (true) {
      const r = await gen.next();
      if (r.done) {
        expect(r.value.generationId).toBe("gen-s");
        break;
      }
      collected.push(r.value);
    }
    expect(collected).toEqual(["你", "好"]);
    expect(streamByTask).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: "P" }));
    expect(createGen).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          output: "你好",
          modelId: "m1",
          inputTokens: 1,
          outputTokens: 2,
        }),
      }),
    );
  });

  it("出错时不写记录", async () => {
    streamByTask.mockImplementation(async function* () {
      yield "部分";
      throw new Error("boom");
    });
    const gen = generateStream({ task: "t", input: "y" });
    await expect(
      (async () => {
        while (true) {
          const r = await gen.next();
          if (r.done) break;
        }
      })(),
    ).rejects.toThrow("boom");
    expect(createGen).not.toHaveBeenCalled();
  });
});
