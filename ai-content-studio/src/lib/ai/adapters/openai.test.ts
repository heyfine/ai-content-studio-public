import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const list = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(function MockOpenAI(opts) {
    return { __opts: opts, chat: { completions: { create } }, models: { list } };
  }),
}));

import { OpenAIAdapter } from "./openai";

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

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    create.mockReset();
    list.mockReset();
  });

  it("generate 返回 content 与 token", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hello" } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
    const a = new OpenAIAdapter({
      type: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.deepseek.com",
      apiKey: "k",
    });
    const r = await a.generate({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r).toEqual({ content: "hello", inputTokens: 3, outputTokens: 2 });
  });

  it("空 choices 内容回退空串", async () => {
    create.mockResolvedValue({ choices: [{ message: {} }] });
    const a = new OpenAIAdapter({ type: "OPENAI", apiKey: "k" });
    const r = await a.generate({ model: "gpt-4.1-mini", messages: [] });
    expect(r.content).toBe("");
  });

  it("listModels 返回排序后的模型 id 列表", async () => {
    list.mockResolvedValue({ data: [{ id: "b" }, { id: "a" }] });
    const a = new OpenAIAdapter({ type: "OPENAI", apiKey: "k" });
    expect(await a.listModels()).toEqual(["a", "b"]);
  });

  it("generate 错误透传", async () => {
    create.mockRejectedValue(new Error("rate limited"));
    const a = new OpenAIAdapter({ type: "OPENAI", apiKey: "k" });
    await expect(a.generate({ model: "x", messages: [] })).rejects.toThrow("rate limited");
  });

  it("streamGenerate 逐个 yield 增量并返回 token 统计", async () => {
    create.mockResolvedValue(
      asyncIter([
        { choices: [{ delta: { content: "你" } }] },
        { choices: [{ delta: { content: "好" } }] },
        {
          choices: [{ delta: { content: "" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        },
      ]),
    );
    const a = new OpenAIAdapter({ type: "OPENAI", apiKey: "k" });
    const { out, meta } = await consume(a.streamGenerate({ model: "gpt", messages: [] }));
    expect(out).toEqual(["你", "好"]);
    expect(meta).toEqual({ inputTokens: 3, outputTokens: 2 });
  });
});
