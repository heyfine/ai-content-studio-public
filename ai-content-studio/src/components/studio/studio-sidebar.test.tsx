import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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
import { StudioSidebar } from "./studio-sidebar";

function resetStore(over: Partial<ReturnType<typeof useStudioStore.getState>> = {}) {
  useStudioStore.setState({
    title: "",
    content: "",
    messages: [],
    selectedTask: "article_generate",
    selectedPromptId: null,
    isGenerating: false,
    error: null,
    ...over,
  });
}

function mockRoute(prompts: unknown[], streamEvents: unknown[]) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/api/prompts")) {
      return new Response(JSON.stringify(prompts), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return sseResponse(streamEvents);
  });
}

describe("StudioSidebar", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("渲染 6 个 AI 操作按钮 与 Prompt 模板选择", async () => {
    mockRoute([], []);
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByLabelText("选择 Prompt")).not.toBeDisabled());
    expect(screen.getByText("AI 操作")).toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((b) => b.dataset.action).length).toBe(6);
  });

  it("Prompt 列表加载后填充选项", async () => {
    mockRoute([{ id: "p1", name: "技术文章", type: "article_write" }], []);
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("技术文章")).toBeInTheDocument());
  });

  it("选择 Prompt 更新 store", async () => {
    mockRoute([{ id: "p1", name: "技术文章", type: "article_write" }], []);
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("技术文章")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择 Prompt"), { target: { value: "p1" } });
    expect(useStudioStore.getState().selectedPromptId).toBe("p1");
  });

  it("点击 AI 操作走流式接口；article_generate 回填 content 且拼到消息", async () => {
    mockRoute(
      [{ id: "p1", name: "x", type: "t" }],
      [
        { type: "delta", content: "生成" },
        { type: "delta", content: "的正文" },
        { type: "done", generationId: "g" },
      ],
    );
    resetStore({ title: "我的主题", content: "" });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/stream",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("我的主题"),
        }),
      );
      expect(useStudioStore.getState().content).toBe("生成的正文");
      expect(useStudioStore.getState().messages.some((m) => m.content === "生成的正文")).toBe(true);
    });
  });

  it("非 article/outline 任务不回填 content", async () => {
    mockRoute(
      [{ id: "p1", name: "x", type: "t" }],
      [{ type: "delta", content: "SEO 建议" }, { type: "done" }],
    );
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("seo_analyze"));
    await waitFor(() => expect(useStudioStore.getState().selectedTask).toBe("seo_analyze"));
    expect(useStudioStore.getState().content).toBe("");
    expect(useStudioStore.getState().messages.some((m) => m.content === "SEO 建议")).toBe(true);
  });

  it("error 事件写入 store error", async () => {
    mockRoute(
      [{ id: "p1", name: "x", type: "t" }],
      [{ type: "error", status: "no_route", message: "路由未配置" }],
    );
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(useStudioStore.getState().error).toBe("路由未配置"));
  });
});
