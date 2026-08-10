import { describe, it, expect, vi } from "vitest";

// mock 两个 SDK，工厂测试只验证分支选择，不真实实例化
const { OpenAIMock, AnthropicMock } = vi.hoisted(() => ({
  OpenAIMock: vi.fn(function MockOpenAI() {
    return { chat: {}, models: {} };
  }),
  AnthropicMock: vi.fn(function MockAnthropic() {
    return { messages: {}, models: {} };
  }),
}));

vi.mock("openai", () => ({ default: OpenAIMock as unknown as { new (o?: unknown): unknown } }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: AnthropicMock as unknown as { new (o?: unknown): unknown },
}));

import { getAdapter } from "./index";

describe("getAdapter factory", () => {
  it("OPENAI 与 OPENAI_COMPATIBLE 均返回 OpenAIAdapter", () => {
    const a = getAdapter({ type: "OPENAI", apiKey: "k" } as never);
    const b = getAdapter({ type: "OPENAI_COMPATIBLE", baseUrl: "x", apiKey: "k" } as never);
    expect(a.constructor.name).toBe("OpenAIAdapter");
    expect(b.constructor.name).toBe("OpenAIAdapter");
  });

  it("ANTHROPIC 返回 AnthropicAdapter", () => {
    const a = getAdapter({ type: "ANTHROPIC", apiKey: "k" } as never);
    expect(a.constructor.name).toBe("AnthropicAdapter");
  });

  it("GEMINI 抛错（后续 Phase）", () => {
    expect(() => getAdapter({ type: "GEMINI", apiKey: "k" } as never)).toThrow(/Gemini/);
  });
});
