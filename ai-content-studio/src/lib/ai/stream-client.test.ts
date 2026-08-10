import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamGenerateRequest } from "./stream-client";

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

describe("streamGenerateRequest", () => {
  beforeEach(() => fetchMock.mockReset());

  it("逐个 yield delta 与 done 事件", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: "delta", content: "你" },
        { type: "delta", content: "好" },
        { type: "done", generationId: "g1" },
      ]),
    );
    const types: string[] = [];
    for await (const ev of streamGenerateRequest({ task: "t", input: "x" })) {
      types.push(ev.type);
    }
    expect(types).toEqual(["delta", "delta", "done"]);
  });

  it("error 事件原样 yield", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([{ type: "error", status: "no_route", message: "未配置任务路由" }]),
    );
    const events: { status: string; message: string }[] = [];
    for await (const ev of streamGenerateRequest({ task: "none", input: "x" })) {
      if (ev.type === "error") events.push(ev);
    }
    expect(events).toHaveLength(1);
    expect(events[0].message).toContain("未配置任务路由");
  });

  it("HTTP 非 2xx 抛出含服务器 error 的异常", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      (async () => {
        for await (const _ev of streamGenerateRequest({ task: "t", input: "x" })) void _ev;
      })(),
    ).rejects.toThrow("未授权");
  });
});
