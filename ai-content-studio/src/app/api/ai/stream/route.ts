import { auth } from "@/lib/auth";
import { generateStream } from "@/lib/ai";
import { generateSchema } from "@/lib/schemas/generate";
import { NoRouteError } from "@/lib/ai/router";

export const dynamic = "force-dynamic";

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "请求体非法" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "校验失败", issues: parsed.error.issues }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const gen = generateStream(parsed.data);
      try {
        let result:
          | { generationId?: string; modelId?: string; inputTokens?: number; outputTokens?: number }
          | undefined;
        while (true) {
          const res = await gen.next();
          if (res.done) {
            result = res.value;
            break;
          }
          controller.enqueue(encoder.encode(sse({ type: "delta", content: res.value })));
        }
        controller.enqueue(
          encoder.encode(
            sse({
              type: "done",
              generationId: result?.generationId,
              modelId: result?.modelId,
              inputTokens: result?.inputTokens,
              outputTokens: result?.outputTokens,
            }),
          ),
        );
      } catch (e) {
        const status = e instanceof NoRouteError ? "no_route" : "error";
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(sse({ type: "error", status, message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
