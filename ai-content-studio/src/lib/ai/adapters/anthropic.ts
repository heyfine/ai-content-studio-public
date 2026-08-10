import Anthropic from "@anthropic-ai/sdk";
import type { AIAdapter, AIRequest, AIResponse, AIProviderConfig } from "../types";

export class AnthropicAdapter implements AIAdapter {
  private client: Anthropic;

  constructor(config: AIProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generate(req: AIRequest): Promise<AIResponse> {
    const system = req.messages.find((m) => m.role === "system")?.content;
    const turns = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      system: system,
      messages: turns,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });
    const content = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async listModels(): Promise<string[]> {
    const page = await this.client.models.list();
    return page.data.map((m) => m.id).sort();
  }
}
