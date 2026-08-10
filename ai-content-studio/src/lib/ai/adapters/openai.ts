import OpenAI from "openai";
import type { AIAdapter, AIRequest, AIResponse, AIProviderConfig } from "../types";

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
    });
    const choice = completion.choices[0]?.message?.content ?? "";
    return {
      content: choice,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    };
  }

  async listModels(): Promise<string[]> {
    const page = await this.client.models.list();
    return page.data.map((m) => m.id).sort();
  }
}
