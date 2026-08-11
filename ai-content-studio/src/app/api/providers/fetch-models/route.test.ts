import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, fetchModelsMock, getProviderMock, toProviderConfigMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fetchModelsMock: vi.fn(),
  getProviderMock: vi.fn(),
  toProviderConfigMock: vi.fn((r: { type: string; baseUrl: string | null; apiKey: string }) => ({
    type: r.type,
    baseUrl: r.baseUrl ?? undefined,
    apiKey: r.apiKey,
  })),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/provider-service", () => ({
  fetchModels: fetchModelsMock,
  getProvider: getProviderMock,
  toProviderConfig: toProviderConfigMock,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/providers/fetch-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const session = () => authMock.mockResolvedValue({ user: { email: "a@b.com" } });

describe("POST /api/providers/fetch-models", () => {
  beforeEach(() => {
    authMock.mockReset();
    fetchModelsMock.mockReset();
    getProviderMock.mockReset();
    toProviderConfigMock.mockClear();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ type: "OPENAI_COMPATIBLE", apiKey: "sk" }));
    expect(res.status).toBe(401);
  });

  it("缺少 providerId 或 type/apiKey 返回 400", async () => {
    session();
    const res = await POST(makeRequest({ type: "OPENAI_COMPATIBLE" }));
    expect(res.status).toBe(400);
  });

  it("明文凭证成功返回模型列表", async () => {
    session();
    fetchModelsMock.mockResolvedValue(["deepseek-chat"]);
    const res = await POST(
      makeRequest({ type: "OPENAI_COMPATIBLE", baseUrl: "https://api.x.com", apiKey: "sk" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).models).toEqual(["deepseek-chat"]);
    expect(fetchModelsMock).toHaveBeenCalledWith({
      type: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.x.com",
      apiKey: "sk",
    });
  });

  it("providerId 模式：用库里加密 Key 拉取（无需明文 apiKey）", async () => {
    session();
    getProviderMock.mockResolvedValue({
      type: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.x.com",
      apiKey: "enc:sk",
    });
    fetchModelsMock.mockResolvedValue(["deepseek-chat", "deepseek-reasoner"]);
    const res = await POST(makeRequest({ providerId: "p1" }));
    expect(res.status).toBe(200);
    expect(getProviderMock).toHaveBeenCalledWith("p1");
    expect(toProviderConfigMock).toHaveBeenCalled();
    expect(fetchModelsMock).toHaveBeenCalled();
    expect((await res.json()).models).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("providerId 模式：供应商不存在返回 404", async () => {
    session();
    getProviderMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ providerId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("providerId 模式：Gemini 返回 400", async () => {
    session();
    getProviderMock.mockResolvedValue({ type: "GEMINI", baseUrl: null, apiKey: "enc" });
    const res = await POST(makeRequest({ providerId: "p1" }));
    expect(res.status).toBe(400);
  });

  it("Gemini 错误（明文模式）返回 400", async () => {
    session();
    fetchModelsMock.mockRejectedValue(new Error("Gemini 适配器将在后续 Phase 接入"));
    const res = await POST(makeRequest({ type: "GEMINI", apiKey: "sk" }));
    expect(res.status).toBe(400);
  });

  it("其它错误返回 500", async () => {
    session();
    fetchModelsMock.mockRejectedValue(new Error("invalid key"));
    const res = await POST(makeRequest({ type: "OPENAI", apiKey: "bad" }));
    expect(res.status).toBe(500);
  });
});
