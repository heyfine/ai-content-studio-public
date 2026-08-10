import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const stream = vi.fn();
const list = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function MockAnthropic(opts) {
    return { __opts: opts, messages: { create, stream }, models: { list } };
  }),
}));

import { AnthropicAdapter } from "./anthropic";

function asyncIter<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const i of items) yield i;
    },
  };
}

async function consume(
  gen: AsyncGenerator<string, { inputTokens?: number; outputTokens?: number }>,
) {
  const out: string[] = [];
  let meta: { inputTokens?: number; outputTokens?: number } | undefined;
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

describe("AnthropicAdapter", () => {
  beforeEach(() => {
    create.mockReset();
    stream.mockReset();
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

  it("streamGenerate 逐个 yield 文本增量并返回 token 统计", async () => {
    stream.mockReturnValue(
      asyncIter([
        { type: "message_start", message: { usage: { input_tokens: 4 } } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "你好" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "世界" } },
        { type: "message_delta", usage: { output_tokens: 2 } },
        { type: "message_stop" },
      ]),
    );
    const a = new AnthropicAdapter({ type: "ANTHROPIC", apiKey: "k" });
    const { out, meta } = await consume(
      a.streamGenerate({
        model: "claude-sonnet-4",
        messages: [
          { role: "system", content: "你是助手" },
          { role: "user", content: "写" },
        ],
      }),
    );
    expect(out).toEqual(["你好", "世界"]);
    expect(meta).toEqual({ inputTokens: 4, outputTokens: 2 });
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ system: "你是助手" }));
  });
});
