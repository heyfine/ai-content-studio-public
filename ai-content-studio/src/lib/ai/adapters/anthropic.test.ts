import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const list = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function MockAnthropic(opts) {
    return { __opts: opts, messages: { create }, models: { list } };
  }),
}));

import { AnthropicAdapter } from "./anthropic";

describe("AnthropicAdapter", () => {
  beforeEach(() => {
    create.mockReset();
    list.mockReset();
  });

  it("generate 拆分 system 消息并拼接文本块", async () => {
    create.mockResolvedValue({
      content: [
        { type: "text", text: "你好" },
        { type: "text", text: "世界" },
      ],
      usage: { input_tokens: 4, output_tokens: 2 },
    });
    const a = new AnthropicAdapter({ type: "ANTHROPIC", apiKey: "k" });
    const r = await a.generate({
      model: "claude-sonnet-4",
      messages: [
        { role: "system", content: "你是助手" },
        { role: "user", content: "写" },
      ],
    });
    expect(r).toEqual({ content: "你好世界", inputTokens: 4, outputTokens: 2 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4",
        system: "你是助手",
        messages: [{ role: "user", content: "写" }],
      }),
    );
  });

  it("无 system 时 system 字段为 undefined", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const a = new AnthropicAdapter({ type: "ANTHROPIC", apiKey: "k" });
    await a.generate({ model: "c", messages: [{ role: "user", content: "x" }] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ system: undefined }));
  });

  it("listModels 排序", async () => {
    list.mockResolvedValue({ data: [{ id: "z" }, { id: "a" }] });
    const a = new AnthropicAdapter({ type: "ANTHROPIC", apiKey: "k" });
    expect(await a.listModels()).toEqual(["a", "z"]);
  });
});
