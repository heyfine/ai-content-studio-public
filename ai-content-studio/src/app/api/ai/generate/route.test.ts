import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, generateMock, NoRouteError } = vi.hoisted(() => ({
  authMock: vi.fn(),
  generateMock: vi.fn(),
  NoRouteError: class NoRouteError extends Error {
    constructor(task: string) {
      super(`未配置任务路由：${task}`);
      this.name = "NoRouteError";
    }
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/ai", () => ({ generate: generateMock }));
vi.mock("@/lib/ai/router", () => ({ NoRouteError }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/generate", () => {
  beforeEach(() => {
    authMock.mockReset();
    generateMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ task: "t", input: "x" }));
    expect(res.status).toBe(401);
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeRequest({ task: "", input: "" }));
    expect(res.status).toBe(400);
  });

  it("成功返回生成结果", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    generateMock.mockResolvedValue({
      content: "正文",
      modelId: "m1",
      generationId: "gen-1",
      inputTokens: 5,
      outputTokens: 8,
    });
    const res = await POST(makeRequest({ task: "article_generate", input: "写" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe("正文");
    expect(data.generationId).toBe("gen-1");
    expect(generateMock).toHaveBeenCalledWith({ task: "article_generate", input: "写" });
  });

  it("NoRouteError 返回 404", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    generateMock.mockRejectedValue(new NoRouteError("none"));
    const res = await POST(makeRequest({ task: "none", input: "x" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("未配置任务路由");
  });

  it("其他错误返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    generateMock.mockRejectedValue(new Error("provider 500"));
    const res = await POST(makeRequest({ task: "t", input: "x" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("生成失败");
  });
});
