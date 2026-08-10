import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, generateStreamMock, NoRouteError } = vi.hoisted(() => ({
  authMock: vi.fn(),
  generateStreamMock: vi.fn(),
  NoRouteError: class NoRouteError extends Error {
    constructor(task: string) {
      super(`未配置任务路由：${task}`);
      this.name = "NoRouteError";
    }
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/ai", () => ({ generateStream: generateStreamMock }));
vi.mock("@/lib/ai/router", () => ({ NoRouteError }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/ai/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function* genYielding(deltas: string[], result: Record<string, unknown>) {
  for (const d of deltas) yield d;
  return result;
}

async function readStream(res: Response): Promise<string> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  buf += decoder.decode();
  return buf;
}

describe("POST /api/ai/stream", () => {
  beforeEach(() => {
    authMock.mockReset();
    generateStreamMock.mockReset();
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

  it("成功流式返回 delta 与 done 事件", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    generateStreamMock.mockImplementation(() =>
      genYielding(["你", "好"], {
        generationId: "gen-1",
        modelId: "m1",
        inputTokens: 3,
        outputTokens: 2,
      }),
    );
    const res = await POST(makeRequest({ task: "article_generate", input: "写" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const text = await readStream(res);
    expect(text).toContain(`data: ${JSON.stringify({ type: "delta", content: "你" })}`);
    expect(text).toContain(`data: ${JSON.stringify({ type: "delta", content: "好" })}`);
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"generationId":"gen-1"');
    expect(generateStreamMock).toHaveBeenCalledWith({ task: "article_generate", input: "写" });
  });

  it("NoRouteError 产生 error 事件且 status 为 no_route", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    generateStreamMock.mockImplementation(async function* () {
      throw new NoRouteError("none");
    });
    const res = await POST(makeRequest({ task: "none", input: "x" }));
    expect(res.status).toBe(200);
    const text = await readStream(res);
    expect(text).toContain('"status":"no_route"');
    expect(text).toContain("未配置任务路由");
  });

  it("其他错误产生 error 事件", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    generateStreamMock.mockImplementation(async function* () {
      throw new Error("provider 500");
    });
    const res = await POST(makeRequest({ task: "t", input: "x" }));
    const text = await readStream(res);
    expect(text).toContain('"status":"error"');
    expect(text).toContain("provider 500");
  });
});
