import { describe, it, expect, vi, beforeEach } from "vitest";

const { extractMock, validateMock, resolveMock, generateMock, streamMock } = vi.hoisted(() => ({
  extractMock: vi.fn(),
  validateMock: vi.fn(),
  resolveMock: vi.fn(),
  generateMock: vi.fn(),
  streamMock: vi.fn(),
}));

vi.mock("@/lib/services/relay-service", () => ({ validateRelayKey: validateMock }));
vi.mock("@/lib/relay/auth", () => ({ extractBearerKey: extractMock }));
vi.mock("@/lib/ai/router", () => ({
  resolveByModelId: resolveMock,
  ModelNotFoundError: class ModelNotFoundError extends Error {
    constructor(relayId: string) {
      super(`模型不存在：${relayId}`);
      this.name = "ModelNotFoundError";
    }
  },
}));

import { POST } from "./route";
import { ModelNotFoundError } from "@/lib/ai/router";

function makeRequest(body: unknown, auth?: string) {
  return new Request("https://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

function makeAdapter() {
  return {
    generate: generateMock,
    streamGenerate: streamMock,
  };
}

function okResolve(over: Partial<{ model: string }> = {}) {
  return {
    adapter: makeAdapter(),
    model: over.model ?? "deepseek-chat",
    context: {
      providerId: "p1",
      modelId: "m1",
      providerName: "基元律动",
      modelName: over.model ?? "deepseek-chat",
      providerType: "OPENAI_COMPATIBLE" as const,
    },
  };
}

async function* asyncChunks(chunks: string[], meta: { inputTokens: number; outputTokens: number }) {
  for (const c of chunks) yield c;
  return meta;
}

describe("POST /v1/chat/completions", () => {
  beforeEach(() => {
    extractMock.mockReset();
    validateMock.mockReset();
    resolveMock.mockReset();
    generateMock.mockReset();
    streamMock.mockReset();
  });

  it("缺 Bearer 返回 401", async () => {
    extractMock.mockReturnValue(null);
    const res = await POST(makeRequest({ model: "x", messages: [] }));
    expect(res.status).toBe(401);
  });

  it("无效 Key 返回 401", async () => {
    extractMock.mockReturnValue("sk-bad");
    validateMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ model: "x", messages: [] }, "Bearer sk-bad"));
    expect(res.status).toBe(401);
  });

  it("未知模型返回 404", async () => {
    extractMock.mockReturnValue("sk-good");
    validateMock.mockResolvedValue({ id: "k1" });
    resolveMock.mockRejectedValue(new ModelNotFoundError("基元律动/none"));
    const res = await POST(
      makeRequest(
        { model: "基元律动/none", messages: [{ role: "user", content: "hi" }] },
        "Bearer sk-good",
      ),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("非流式返回 OpenAI 形状", async () => {
    extractMock.mockReturnValue("sk-good");
    validateMock.mockResolvedValue({ id: "k1" });
    resolveMock.mockResolvedValue(okResolve());
    generateMock.mockResolvedValue({ content: "你好", inputTokens: 3, outputTokens: 2 });
    const res = await POST(
      makeRequest(
        { model: "基元律动/deepseek-chat", messages: [{ role: "user", content: "hi" }] },
        "Bearer sk-good",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message).toEqual({ role: "assistant", content: "你好" });
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage).toEqual({ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
    expect(body.model).toBe("基元律动/deepseek-chat");
  });

  it("reasoning_effort 透传到 adapter", async () => {
    extractMock.mockReturnValue("sk-good");
    validateMock.mockResolvedValue({ id: "k1" });
    resolveMock.mockResolvedValue(okResolve());
    generateMock.mockResolvedValue({ content: "ok" });
    await POST(
      makeRequest(
        {
          model: "基元律动/deepseek-chat",
          messages: [{ role: "user", content: "hi" }],
          reasoning_effort: "high",
        },
        "Bearer sk-good",
      ),
    );
    const req = generateMock.mock.calls[0][0];
    expect(req.reasoningEffort).toBe("high");
    expect(req.model).toBe("deepseek-chat");
  });

  it("非 system/user/assistant 角色降级为 user", async () => {
    extractMock.mockReturnValue("sk-good");
    validateMock.mockResolvedValue({ id: "k1" });
    resolveMock.mockResolvedValue(okResolve());
    generateMock.mockResolvedValue({ content: "ok" });
    await POST(
      makeRequest(
        {
          model: "基元律动/deepseek-chat",
          messages: [
            { role: "user", content: "q" },
            { role: "tool", content: "x" },
          ],
        },
        "Bearer sk-good",
      ),
    );
    const req = generateMock.mock.calls[0][0];
    expect(req.messages.map((m: { role: string }) => m.role)).toEqual(["user", "user"]);
  });

  it("数组 content 被拼接为字符串", async () => {
    extractMock.mockReturnValue("sk-good");
    validateMock.mockResolvedValue({ id: "k1" });
    resolveMock.mockResolvedValue(okResolve());
    generateMock.mockResolvedValue({ content: "ok" });
    await POST(
      makeRequest(
        {
          model: "基元律动/deepseek-chat",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "a" },
                { type: "text", text: "b" },
              ],
            },
          ],
        },
        "Bearer sk-good",
      ),
    );
    const req = generateMock.mock.calls[0][0];
    expect(req.messages[0].content).toBe("ab");
  });

  it("流式返回 SSE 含 delta 与 [DONE]", async () => {
    extractMock.mockReturnValue("sk-good");
    validateMock.mockResolvedValue({ id: "k1" });
    resolveMock.mockResolvedValue(okResolve());
    streamMock.mockReturnValue(asyncChunks(["你", "好"], { inputTokens: 1, outputTokens: 2 }));
    const res = await POST(
      makeRequest(
        {
          model: "基元律动/deepseek-chat",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        "Bearer sk-good",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("data: ");
    expect(text).toContain("chat.completion.chunk");
    expect(text).toContain('"delta":{"content":"你"}');
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain("usage");
    expect(text.trim().endsWith("data: [DONE]")).toBe(true);
  });

  it("缺少必填字段返回 400", async () => {
    extractMock.mockReturnValue("sk-good");
    validateMock.mockResolvedValue({ id: "k1" });
    const res = await POST(makeRequest({ messages: [] }, "Bearer sk-good"));
    expect(res.status).toBe(400);
  });
});
