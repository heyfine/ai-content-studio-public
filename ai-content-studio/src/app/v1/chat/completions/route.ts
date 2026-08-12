import { NextResponse } from "next/server";
import { validateRelayKey } from "@/lib/services/relay-service";
import { resolveByModelId, ModelNotFoundError } from "@/lib/ai/router";
import { extractBearerKey } from "@/lib/relay/auth";
import type { AIRequest, ChatMessage } from "@/lib/ai/types";

type IncomingRole = string;

function mapRole(role: IncomingRole): ChatMessage["role"] {
  if (role === "system" || role === "user" || role === "assistant") return role;
  return "user";
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .map((p) =>
        typeof p === "object" && p !== null && "text" in p
          ? String((p as { text: string }).text)
          : "",
      )
      .filter(Boolean);
    return texts.length > 0 ? texts.join("") : "";
  }
  return content == null ? "" : String(content);
}

function mapMessages(raw: { role: IncomingRole; content: unknown }[]): ChatMessage[] {
  return raw.map((m) => ({ role: mapRole(m.role), content: normalizeContent(m.content) }));
}

interface RelayChatBody {
  model: string;
  messages: { role: IncomingRole; content: unknown }[];
  temperature?: number;
  max_tokens?: number;
  reasoning_effort?: "low" | "medium" | "high";
  stream?: boolean;
}

function newCompletionId(): string {
  return "chatcmpl-relay-" + Math.random().toString(36).slice(2);
}

function usageBlock(inputTokens?: number, outputTokens?: number) {
  const pt = inputTokens ?? 0;
  const ct = outputTokens ?? 0;
  return { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct };
}

function errorResponse(status: number, message: string, type: string) {
  return NextResponse.json({ error: { message, type } }, { status });
}

export async function POST(request: Request) {
  const raw = extractBearerKey(request);
  const row = raw ? await validateRelayKey(raw) : null;
  if (!row) {
    return errorResponse(401, "无效或缺失的 API Key", "invalid_api_key");
  }

  let body: RelayChatBody;
  try {
    body = (await request.json()) as RelayChatBody;
  } catch {
    return errorResponse(400, "请求体不是合法 JSON", "invalid_request_error");
  }
  if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
    return errorResponse(400, "model 和 messages 为必填项", "invalid_request_error");
  }

  let resolved: Awaited<ReturnType<typeof resolveByModelId>>;
  try {
    resolved = await resolveByModelId(body.model);
  } catch (e) {
    if (e instanceof ModelNotFoundError) {
      return errorResponse(404, `模型不存在：${body.model}`, "invalid_request_error");
    }
    return errorResponse(500, e instanceof Error ? e.message : String(e), "server_error");
  }

  const aiReq: AIRequest = {
    model: resolved.model,
    messages: mapMessages(body.messages),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.max_tokens !== undefined ? { maxTokens: body.max_tokens } : {}),
    ...(body.reasoning_effort ? { reasoningEffort: body.reasoning_effort } : {}),
  };
  const completionId = newCompletionId();
  const created = Math.floor(Date.now() / 1000);

  if (body.stream) {
    return streamResponse(resolved, aiReq, body.model, completionId, created);
  }
  return nonStreamResponse(resolved, aiReq, body.model, completionId, created);
}

function streamResponse(
  resolved: Awaited<ReturnType<typeof resolveByModelId>>,
  aiReq: AIRequest,
  relayModel: string,
  completionId: string,
  created: number,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const gen = resolved.adapter.streamGenerate(aiReq);
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      try {
        while (true) {
          const r = await gen.next();
          if (r.done) {
            inputTokens = r.value?.inputTokens;
            outputTokens = r.value?.outputTokens;
            break;
          }
          const chunk = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: relayModel,
            choices: [{ index: 0, delta: { content: r.value }, finish_reason: null }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        const end = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: relayModel,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: usageBlock(inputTokens, outputTokens),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(end)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        const err = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: relayModel,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          error: { message: e instanceof Error ? e.message : String(e), type: "server_error" },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(err)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function nonStreamResponse(
  resolved: Awaited<ReturnType<typeof resolveByModelId>>,
  aiReq: AIRequest,
  relayModel: string,
  completionId: string,
  created: number,
) {
  try {
    const res = await resolved.adapter.generate(aiReq);
    return NextResponse.json({
      id: completionId,
      object: "chat.completion",
      created,
      model: relayModel,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: res.content },
          finish_reason: "stop",
        },
      ],
      usage: usageBlock(res.inputTokens, res.outputTokens),
    });
  } catch (e) {
    return errorResponse(500, e instanceof Error ? e.message : String(e), "server_error");
  }
}
