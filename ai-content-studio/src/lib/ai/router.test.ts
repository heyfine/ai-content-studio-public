import { describe, it, expect, vi, beforeEach } from "vitest";

const { decrypt } = vi.hoisted(() => ({ decrypt: vi.fn((s: string) => "decrypted:" + s) }));
const { getAdapter, genMock, streamGenMock } = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  genMock: vi.fn(),
  streamGenMock: vi.fn(),
}));
const { findRoute, findModel } = vi.hoisted(() => ({ findRoute: vi.fn(), findModel: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aITaskRoute: { findUnique: findRoute },
    aIModel: { findUnique: findModel },
    aIGeneration: { create: vi.fn() },
  },
}));
vi.mock("@/lib/crypto", () => ({ decrypt }));
vi.mock("./adapters", () => ({
  getAdapter: (...a: unknown[]) => {
    getAdapter(...(a as never[]));
    return { generate: genMock, streamGenerate: streamGenMock };
  },
}));

import { generateByTask, streamByTask, resolveRoute, NoRouteError } from "./router";

const modelWithProvider = {
  id: "m1",
  name: "deepseek-chat",
  enabled: true,
  provider: {
    id: "p1",
    type: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.deepseek.com",
    apiKey: "enc",
  },
};

async function consume(
  gen: AsyncGenerator<string, { inputTokens?: number; outputTokens?: number; context: unknown }>,
) {
  const out: string[] = [];
  let meta: { inputTokens?: number; outputTokens?: number; context: unknown } | undefined;
  while (true) {
    const r = await gen.next();
    if (r.done) {
      meta = r.value;
      break;
    }
    out.push(r.value);
  }
  return { out, meta };
}

describe("resolveRoute", () => {
  beforeEach(() => {
    findRoute.mockReset();
    findModel.mockReset();
    getAdapter.mockClear();
    decrypt.mockClear();
  });

  it("未配置任务路由抛 NoRouteError", async () => {
    findRoute.mockResolvedValue(null);
    await expect(resolveRoute("none")).rejects.toBeInstanceOf(NoRouteError);
  });

  it("模型不可用抛错", async () => {
    findRoute.mockResolvedValue({ id: "r1", task: "x", modelId: "m1" });
    findModel.mockResolvedValue(null);
    await expect(resolveRoute("x")).rejects.toThrow(/模型不可用/);
  });

  it("禁用模型抛错", async () => {
    findRoute.mockResolvedValue({ id: "r1", task: "x", modelId: "m1" });
    findModel.mockResolvedValue({ ...modelWithProvider, enabled: false });
    await expect(resolveRoute("x")).rejects.toThrow(/模型不可用/);
  });

  it("命中路由时解密 apiKey 并返回 adapter 与 context", async () => {
    findRoute.mockResolvedValue({ id: "r1", task: "article_generate", modelId: "m1" });
    findModel.mockResolvedValue(modelWithProvider);
    const r = await resolveRoute("article_generate");
    expect(decrypt).toHaveBeenCalledWith("enc");
    expect(getAdapter).toHaveBeenCalledWith({
      type: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.deepseek.com",
      apiKey: "decrypted:enc",
    });
    expect(r.model).toBe("deepseek-chat");
    expect(r.context.modelId).toBe("m1");
  });
});

describe("generateByTask", () => {
  beforeEach(() => {
    findRoute.mockReset();
    findModel.mockReset();
    genMock.mockReset();
  });

  it("无 systemPrompt 时仅 user 消息", async () => {
    findRoute.mockResolvedValue({ id: "r1", task: "t", modelId: "m1" });
    findModel.mockResolvedValue(modelWithProvider);
    genMock.mockResolvedValue({ content: "ok", inputTokens: 1, outputTokens: 2 });
    const r = await generateByTask({ task: "t", input: "写" });
    expect(r.content).toBe("ok");
    expect(genMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "写" }],
      }),
    );
  });

  it("带 systemPrompt 时前置 system 消息", async () => {
    findRoute.mockReset();
    findModel.mockReset();
    findRoute.mockResolvedValue({ id: "r1", task: "t", modelId: "m1" });
    findModel.mockResolvedValue(modelWithProvider);
    genMock.mockResolvedValue({ content: "ok" });
    await generateByTask({ task: "t", input: "hi", systemPrompt: "你是助手" });
    const msgs = genMock.mock.calls[0][0].messages;
    expect(msgs[0]).toEqual({ role: "system", content: "你是助手" });
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
  });
});

describe("streamByTask", () => {
  beforeEach(() => {
    findRoute.mockReset();
    findModel.mockReset();
    streamGenMock.mockReset();
  });

  it("逐个 yield 增量并返回 context 与 token 统计", async () => {
    findRoute.mockResolvedValue({ id: "r1", task: "t", modelId: "m1" });
    findModel.mockResolvedValue(modelWithProvider);
    streamGenMock.mockImplementation(async function* () {
      yield "a";
      yield "b";
      return { inputTokens: 1, outputTokens: 2 };
    });
    const { out, meta } = await consume(streamByTask({ task: "t", input: "y" }));
    expect(out).toEqual(["a", "b"]);
    expect(meta?.context).toMatchObject({ modelId: "m1" });
    expect(meta?.inputTokens).toBe(1);
    expect(meta?.outputTokens).toBe(2);
    expect(streamGenMock).toHaveBeenCalledWith(expect.objectContaining({ model: "deepseek-chat" }));
  });

  it("带 systemPrompt 时前置 system 消息透传给 streamGenerate", async () => {
    findRoute.mockResolvedValue({ id: "r1", task: "t", modelId: "m1" });
    findModel.mockResolvedValue(modelWithProvider);
    streamGenMock.mockImplementation(async function* () {
      return { inputTokens: 0, outputTokens: 0 };
    });
    await consume(streamByTask({ task: "t", input: "y", systemPrompt: "你是助手" }));
    const req = streamGenMock.mock.calls[0][0];
    expect(req.messages[0]).toEqual({ role: "system", content: "你是助手" });
    expect(req.messages[1]).toEqual({ role: "user", content: "y" });
  });

  it("未配置任务路由抛 NoRouteError", async () => {
    findRoute.mockResolvedValue(null);
    await expect(streamByTask({ task: "none", input: "y" }).next()).rejects.toBeInstanceOf(
      NoRouteError,
    );
  });
});
