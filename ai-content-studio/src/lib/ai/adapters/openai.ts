import OpenAI from "openai";
import type { AIAdapter, AIRequest, AIResponse, AIProviderConfig, StreamMeta } from "../types";

export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private baseUrl?: string;

  constructor(config: AIProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      // OpenAI 官方传 undefined 用 SDK 默认；兼容接口传自定义 baseUrl
      baseURL: config.baseUrl ?? undefined,
    });
  }

  async generate(req: AIRequest): Promise<AIResponse> {
    const completion = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}),
    });
    const choice = completion.choices[0]?.message?.content ?? "";
    return {
      content: choice,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    };
  }

  async *streamGenerate(req: AIRequest): AsyncGenerator<string, StreamMeta, void> {
    const stream = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: true,
      ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}),
      stream_options: { include_usage: true },
    });
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }
    return { inputTokens, outputTokens };
  }

  async listModels(): Promise<string[]> {
    const page = await this.client.models.list();
    return page.data.map((m) => m.id).sort();
  }
}
