import type { AIAdapter, AIProviderConfig } from "../types";
import { OpenAIAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";

export function getAdapter(config: AIProviderConfig): AIAdapter {
  switch (config.type) {
    case "OPENAI":
    case "OPENAI_COMPATIBLE":
      return new OpenAIAdapter(config);
    case "ANTHROPIC":
      return new AnthropicAdapter(config);
    case "GEMINI":
      throw new Error("Gemini 适配器将在后续 Phase 接入");
    default: {
      const t: never = config.type;
      throw new Error(`未知的 provider 类型：${String(t)}`);
    }
  }
}
