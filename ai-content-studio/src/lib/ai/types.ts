export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIRequest {
  /** 模型标识，如 gpt-4.1-mini / deepseek-chat / claude-sonnet-4 */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** 流式生成结束时返回的元数据（token 统计） */
export interface StreamMeta {
  inputTokens?: number;
  outputTokens?: number;
}

/** AI 适配器：各 provider 实现统一 generate 接口 */
export interface AIAdapter {
  generate(request: AIRequest): Promise<AIResponse>;
  /** 流式生成：逐个 yield 文本增量，return 时给出 token 统计 */
  streamGenerate(request: AIRequest): AsyncGenerator<string, StreamMeta, void>;
  /** 探测可用模型，返回模型标识列表；用于连接测试 */
  listModels(): Promise<string[]>;
}

export interface AIProviderConfig {
  type: "OPENAI" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI";
  baseUrl?: string;
  apiKey: string;
}
