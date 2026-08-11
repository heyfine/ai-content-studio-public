import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, fetchModelsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fetchModelsMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/provider-service", () => ({ fetchModels: fetchModelsMock }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/providers/fetch-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/providers/fetch-models", () => {
  beforeEach(() => {
    authMock.mockReset();
    fetchModelsMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ type: "OPENAI_COMPATIBLE", apiKey: "sk" }));
    expect(res.status).toBe(401);
  });

  it("缺少 type 或 apiKey 返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeRequest({ type: "OPENAI_COMPATIBLE" }));
    expect(res.status).toBe(400);
  });

  it("成功返回模型列表", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    fetchModelsMock.mockResolvedValue(["deepseek-chat", "deepseek-reasoner"]);
    const res = await POST(
      makeRequest({ type: "OPENAI_COMPATIBLE", baseUrl: "https://api.x.com", apiKey: "sk" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.models).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(fetchModelsMock).toHaveBeenCalledWith({
      type: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.x.com",
      apiKey: "sk",
    });
  });

  it("Gemini 错误返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    fetchModelsMock.mockRejectedValue(new Error("Gemini 适配器将在后续 Phase 接入"));
    const res = await POST(makeRequest({ type: "GEMINI", apiKey: "sk" }));
    expect(res.status).toBe(400);
  });

  it("其它错误返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    fetchModelsMock.mockRejectedValue(new Error("invalid key"));
    const res = await POST(makeRequest({ type: "OPENAI", apiKey: "bad" }));
    expect(res.status).toBe(500);
  });
});
