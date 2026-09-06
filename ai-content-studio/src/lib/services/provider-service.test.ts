import { describe, it, expect, vi, beforeEach } from "vitest";

const { encrypt, decrypt } = vi.hoisted(() => ({
  encrypt: vi.fn((s: string) => "enc:" + s),
  decrypt: vi.fn((s: string) => "dec:" + s),
}));
const { getAdapter, listModels, adapterGenerate } = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  listModels: vi.fn(),
  adapterGenerate: vi.fn(),
}));

const { providers, findUnique, create, update, del, aIModelFindMany } = vi.hoisted(() => ({
  providers: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  aIModelFindMany: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({ encrypt, decrypt }));
vi.mock("@/lib/ai", () => ({
  getAdapter: (...a: unknown[]) => {
    getAdapter(...(a as never[]));
    return { listModels, generate: adapterGenerate };
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aIProvider: { findMany: providers, findUnique, create, update, delete: del },
    aIModel: { findMany: aIModelFindMany },
  },
}));

import {
  createProvider,
  updateProvider,
  listProviders,
  testConnection,
  toProviderConfig,
  fetchModels,
  testProviderModel,
} from "./provider-service";

describe("provider-service", () => {
  beforeEach(() => {
    encrypt.mockClear();
    decrypt.mockClear();
    create.mockReset();
    update.mockReset();
    providers.mockReset();
    findUnique.mockReset();
    del.mockReset();
    getAdapter.mockClear();
    listModels.mockReset();
  });

  it("createProvider 加密 apiKey", async () => {
    create.mockResolvedValue({ id: "p1" });
    await createProvider({
      name: "DeepSeek",
      type: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-x",
    });
    expect(encrypt).toHaveBeenCalledWith("sk-x");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ apiKey: "enc:sk-x" }) }),
    );
  });

  it("updateProvider 仅在提供 apiKey 时加密", async () => {
    update.mockResolvedValue({ id: "p1" });
    await updateProvider("p1", { name: "New" });
    expect(encrypt).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: { name: "New" } }),
    );
  });

  it("listProviders 不回传密文 apiKey", async () => {
    providers.mockResolvedValue([{ id: "p1", apiKey: "enc:sk", name: "OpenAI", models: [] }]);
    const r = await listProviders();
    expect(r[0].apiKey).toBe("[encrypted]");
  });

  it("toProviderConfig 解密 apiKey 并规整 baseUrl", () => {
    const c = toProviderConfig({ type: "OPENAI_COMPATIBLE", baseUrl: "https://x", apiKey: "enc" });
    expect(c).toEqual({ type: "OPENAI_COMPATIBLE", baseUrl: "https://x", apiKey: "dec:enc" });
    const c2 = toProviderConfig({ type: "OPENAI", baseUrl: null, apiKey: "enc" });
    expect(c2.baseUrl).toBeUndefined();
  });

  it("testConnection 成功返回模型与延迟", async () => {
    findUnique.mockResolvedValue({ id: "p1", type: "OPENAI", baseUrl: null, apiKey: "enc" });
    listModels.mockResolvedValue(["gpt-4.1-mini", "gpt-4.1"]);
    const r = await testConnection("p1");
    expect(r.success).toBe(true);
    expect(r.models).toEqual(["gpt-4.1-mini", "gpt-4.1"]);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("testConnection 不存在的供应商", async () => {
    findUnique.mockResolvedValue(null);
    const r = await testConnection("missing");
    expect(r.success).toBe(false);
    expect(r.error).toContain("供应商不存在");
  });

  it("testConnection Gemini 返回未接入", async () => {
    findUnique.mockResolvedValue({ id: "p1", type: "GEMINI", baseUrl: null, apiKey: "enc" });
    const r = await testConnection("p1");
    expect(r.success).toBe(false);
    expect(r.error).toContain("Gemini");
  });

  it("testConnection 异常返回错误信息", async () => {
    findUnique.mockResolvedValue({ id: "p1", type: "OPENAI", baseUrl: null, apiKey: "enc" });
    listModels.mockRejectedValue(new Error("invalid key"));
    const r = await testConnection("p1");
    expect(r.success).toBe(false);
    expect(r.error).toBe("invalid key");
  });
});

describe("provider-service models", () => {
  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    findUnique.mockReset();
    aIModelFindMany.mockReset();
    getAdapter.mockClear();
    listModels.mockReset();
  });

  it("createProvider 携带 models 时嵌套 create（displayName 兜底）", async () => {
    create.mockResolvedValue({ id: "p1", models: [] });
    await createProvider({
      name: "DS",
      type: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.x.com",
      apiKey: "sk",
      models: [
        { name: "deepseek-chat", displayName: "DeepSeek V3" },
        { name: "deepseek-reasoner" },
      ],
    });
    const arg = create.mock.calls[0][0];
    expect(arg.data.models.create).toEqual([
      { name: "deepseek-chat", displayName: "DeepSeek V3" },
      { name: "deepseek-reasoner", displayName: "deepseek-reasoner" },
    ]);
    expect(arg.include).toEqual({ models: true });
  });

  it("updateProvider 提供 models 时按 name 同步（删多余/加缺失/更新同名）", async () => {
    aIModelFindMany.mockResolvedValue([
      { id: "m1", name: "deepseek-chat", displayName: "old" },
      { id: "m2", name: "gpt-4o", displayName: "GPT" },
    ]);
    update.mockResolvedValue({ id: "p1", models: [] });
    await updateProvider("p1", {
      models: [
        { name: "deepseek-chat", displayName: "DeepSeek V3" },
        { name: "claude", displayName: "Claude" },
      ],
    });
    const d = update.mock.calls[0][0].data;
    expect(d.models.deleteMany.id.in).toEqual(["m2"]);
    expect(d.models.create).toEqual([{ name: "claude", displayName: "Claude" }]);
    expect(d.models.update[0].where.id).toBe("m1");
    expect(d.models.update[0].data.displayName).toBe("DeepSeek V3");
  });

  it("fetchModels 用明文 config 调 adapter.listModels", async () => {
    listModels.mockResolvedValue(["m1", "m2"]);
    const r = await fetchModels({ type: "OPENAI_COMPATIBLE", baseUrl: "https://x", apiKey: "sk" });
    expect(r).toEqual(["m1", "m2"]);
    expect(getAdapter).toHaveBeenCalled();
  });

  it("fetchModels Gemini 抛未接入", async () => {
    await expect(fetchModels({ type: "GEMINI", apiKey: "sk" })).rejects.toThrow(/Gemini/);
  });
});

describe("provider-service testProviderModel", () => {
  beforeEach(() => {
    findUnique.mockReset();
    getAdapter.mockClear();
    adapterGenerate.mockReset();
    decrypt.mockClear();
  });

  it("缺少模型名直接失败", async () => {
    const r = await testProviderModel({ providerId: "p1" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("缺少模型名");
    expect(getAdapter).not.toHaveBeenCalled();
  });

  it("无凭证且无 providerId 报缺少 Key", async () => {
    const r = await testProviderModel({ model: "m1" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("缺少 API Key");
  });

  it("providerId 场景用库存加密 Key，并调用 adapter.generate 探测", async () => {
    findUnique.mockResolvedValue({ id: "p1", type: "OPENAI_COMPATIBLE", baseUrl: "https://x", apiKey: "enc" });
    adapterGenerate.mockResolvedValue({ content: "hi" });
    const r = await testProviderModel({ providerId: "p1", model: " deepseek-chat " });
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(decrypt).toHaveBeenCalledWith("enc");
    expect(adapterGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "deepseek-chat", maxTokens: 8 }),
    );
  });

  it("明文凭证优先，未知类型报错", async () => {
    const bad = await testProviderModel({ type: "BAD", apiKey: "sk", model: "m1" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("未知供应商类型");
    expect(getAdapter).not.toHaveBeenCalled();
  });

  it("明文凭证合法时直接探测，不读库", async () => {
    adapterGenerate.mockResolvedValue({ content: "hi" });
    const r = await testProviderModel({ type: "OPENAI", apiKey: "sk", model: "gpt-4o" });
    expect(r.ok).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("providerId 不存在返回失败", async () => {
    findUnique.mockResolvedValue(null);
    const r = await testProviderModel({ providerId: "nope", model: "m1" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("供应商不存在");
  });

  it("表单 baseUrl 覆盖库存值", async () => {
    findUnique.mockResolvedValue({ id: "p1", type: "OPENAI_COMPATIBLE", baseUrl: "https://old", apiKey: "enc" });
    adapterGenerate.mockResolvedValue({ content: "hi" });
    await testProviderModel({ providerId: "p1", baseUrl: "https://new", model: "m1" });
    const config = getAdapter.mock.calls[0][0];
    expect(config.baseUrl).toBe("https://new");
  });

  it("探测异常返回失败与错误信息", async () => {
    findUnique.mockResolvedValue({ id: "p1", type: "OPENAI", baseUrl: null, apiKey: "enc" });
    adapterGenerate.mockRejectedValue(new Error("quota exceeded"));
    const r = await testProviderModel({ providerId: "p1", model: "m1" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("quota exceeded");
  });

  it("Gemini 返回未接入", async () => {
    const r = await testProviderModel({ type: "GEMINI", apiKey: "sk", model: "m1" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Gemini");
  });
});
