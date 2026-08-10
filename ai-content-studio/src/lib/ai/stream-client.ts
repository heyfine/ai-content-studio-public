export interface StreamDeltaEvent {
  type: "delta";
  content: string;
}
export interface StreamDoneEvent {
  type: "done";
  generationId?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
}
export interface StreamErrorEvent {
  type: "error";
  status: string;
  message: string;
}
export type StreamEvent = StreamDeltaEvent | StreamDoneEvent | StreamErrorEvent;

/**
 * 调用 /api/ai/stream 并解析 SSE，逐个 yield 事件。
 * 前端组件据此拼增量到消息/编辑区。
 */
export async function* streamGenerateRequest(
  body: Record<string, unknown>,
): AsyncGenerator<StreamEvent, void, void> {
  const res = await fetch("/api/ai/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `生成失败（${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // 响应体非 JSON，忽略
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error("流式响应为空");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const raw = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf("\n\n");
      if (raw.startsWith("data: ")) {
        const payload = raw.slice(6).trim();
        if (payload) yield JSON.parse(payload) as StreamEvent;
      }
    }
  }
}
