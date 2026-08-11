import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

import { useStudioStore } from "@/stores/studio-store";
import { AIChatPanel } from "./ai-chat-panel";

function resetStore(over: Partial<ReturnType<typeof useStudioStore.getState>> = {}) {
  useStudioStore.setState({
    title: "",
    content: "",
    messages: [],
    generations: [],
    selectedTask: "article_generate",
    selectedPromptId: null,
    isGenerating: false,
    error: null,
    reasoningEnabled: false,
    reasoningEffort: "medium",
    ...over,
  });
}

describe("AIChatPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("render 含任务选择、输入框、发送按钮", () => {
    render(<AIChatPanel />);
    expect(screen.getByTestId("ai-chat-panel")).toBeInTheDocument();
    expect(screen.getByLabelText("AI 输入")).toBeInTheDocument();
    expect(screen.getByText("发送")).toBeInTheDocument();
  });

  it("空消息列表显示占位提示", () => {
    render(<AIChatPanel />);
    expect(screen.getByText(/输入内容开始对话/)).toBeInTheDocument();
  });

  it("render 已有消息列表", () => {
    resetStore({
      messages: [
        { id: "1", role: "user", content: "hi" },
        { id: "2", role: "assistant", content: "你好" },
      ],
    });
    render(<AIChatPanel />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("切换任务选择更新 store", () => {
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("选择任务"), { target: { value: "seo_analyze" } });
    expect(useStudioStore.getState().selectedTask).toBe("seo_analyze");
  });

  it("发送成功流式拼接用户与助手消息", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: "delta", content: "AI " },
        { type: "delta", content: "回复" },
        { type: "done", generationId: "g1" },
      ]),
    );
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "写文章" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => {
      expect(screen.getByText("写文章")).toBeInTheDocument();
      expect(screen.getByText("AI 回复")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/stream",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"input":"写文章"'),
      }),
    );
    expect(screen.getByLabelText("AI 输入")).toHaveValue("");
  });

  it("article_generate 追加生成结果且不回填 content", async () => {
    resetStore({ selectedTask: "article_generate", content: "原文" });
    fetchMock.mockResolvedValue(
      sseResponse([{ type: "delta", content: "正文内容" }, { type: "done" }]),
    );
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => {
      const g = useStudioStore.getState().generations;
      expect(g).toHaveLength(1);
      expect(g[0]).toMatchObject({ task: "article_generate", index: 1, content: "正文内容" });
      expect(useStudioStore.getState().content).toBe("原文");
    });
  });

  it("非 article/outline 任务同样追加生成结果且不回填 content", async () => {
    resetStore({ selectedTask: "seo_analyze", content: "原文" });
    fetchMock.mockResolvedValue(
      sseResponse([{ type: "delta", content: "SEO 建议" }, { type: "done" }]),
    );
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByText("SEO 建议")).toBeInTheDocument());
    const g = useStudioStore.getState().generations;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ task: "seo_analyze", content: "SEO 建议" });
    expect(useStudioStore.getState().content).toBe("原文");
  });

  it("error 事件显示错误 alert", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([{ type: "error", status: "no_route", message: "未配置路由" }]),
    );
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("未配置路由"));
  });

  it("HTTP 失败显示错误 alert", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("未授权"));
  });

  it("生成中显示 加载提示", async () => {
    fetchMock.mockResolvedValue(sseResponse([{ type: "delta", content: "c" }, { type: "done" }]));
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByText("生成中…")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("生成中…")).not.toBeInTheDocument());
  });
});

describe("AIChatPanel reasoning", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("深度思考关闭时不传 reasoningEffort", async () => {
    fetchMock.mockResolvedValue(sseResponse([{ type: "delta", content: "c" }, { type: "done" }]));
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("reasoningEffort");
  });

  it("深度思考开启时 body 含 reasoningEffort", async () => {
    resetStore({ reasoningEnabled: true, reasoningEffort: "high" });
    fetchMock.mockResolvedValue(sseResponse([{ type: "delta", content: "c" }, { type: "done" }]));
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toHaveProperty("reasoningEffort", "high");
  });
});
