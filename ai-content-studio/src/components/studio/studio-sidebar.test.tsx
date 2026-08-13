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
    generations: [],
    selectedTask: "article_generate",
    lastPromptByTask: {},
    isGenerating: false,
    error: null,
    articleId: null,
    articleStatus: null,
    ...over,
  });
}

function mockRoute(prompts: unknown[], streamEvents: unknown[]) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/prompts") {
      return new Response(JSON.stringify(prompts), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "/api/wordpress/configs") {
      return new Response(
        JSON.stringify([
          { id: "c1", name: "技术博客", siteUrl: "https://tech.example.com", enabled: true },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/api/articles" || url.startsWith("/api/articles/")) {
      return new Response(JSON.stringify({ id: "a1", status: "DRAFT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return sseResponse(streamEvents);
  });
}

/** 打开对话框并点击「开始生成」（默认走「不使用模板」） */
async function runViaDialog(taskTestId: string) {
  fireEvent.click(screen.getByTestId(taskTestId));
  await waitFor(() => expect(screen.getByText("开始生成")).toBeInTheDocument());
  fireEvent.click(screen.getByText("开始生成"));
}

describe("StudioSidebar", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("渲染 ArticleActions、8 个 AI 操作按钮与当前任务，无模板下拉框", async () => {
    mockRoute([], []);
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
    expect(screen.getByTestId("article-actions")).toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((b) => b.dataset.action).length).toBe(9);
    expect(screen.getByText("当前任务")).toBeInTheDocument();
    expect(screen.queryByLabelText("选择 Prompt")).not.toBeInTheDocument();
  });

  it("点击 AI 操作弹出模板选择对话框，且只列出匹配任务类型的模板", async () => {
    mockRoute(
      [
        { id: "p1", name: "自然写作", type: "article_generate" },
        { id: "p2", name: "SEO 分析模板", type: "seo_analyze" },
      ],
      [],
    );
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(screen.getByText("选择 Prompt 模板")).toBeInTheDocument());
    expect(screen.getByText("为「文章生成」选择本次使用的提示词模板。")).toBeInTheDocument();
    expect(screen.getByLabelText("自然写作")).toBeInTheDocument();
    expect(screen.queryByLabelText("SEO 分析模板")).not.toBeInTheDocument();
  });

  it("确认所选模板后请求携带 promptId 并记忆到 lastPromptByTask", async () => {
    mockRoute(
      [{ id: "p1", name: "自然写作", type: "article_generate" }],
      [{ type: "delta", content: "正文" }, { type: "done" }],
    );
    resetStore({ title: "t", content: "原文" });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(screen.getByText("开始生成")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("自然写作"));
    fireEvent.click(screen.getByText("开始生成"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/stream",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"promptId":"p1"'),
        }),
      );
    });
    expect(useStudioStore.getState().lastPromptByTask["article_generate"]).toBe("p1");
  });

  it("确认「不使用模板」后请求不带 promptId 并记忆为 null", async () => {
    mockRoute(
      [{ id: "p1", name: "自然写作", type: "article_generate" }],
      [{ type: "delta", content: "正文" }, { type: "done" }],
    );
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(screen.getByText("开始生成")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("不使用模板"));
    fireEvent.click(screen.getByText("开始生成"));
    await waitFor(() =>
      expect(useStudioStore.getState().lastPromptByTask["article_generate"]).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/stream",
      expect.objectContaining({ body: expect.not.stringContaining("promptId") }),
    );
  });

  it("取消选择不触发生成", async () => {
    mockRoute([], []);
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(screen.getByText("取消")).toBeInTheDocument());
    fireEvent.click(screen.getByText("取消"));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/ai/stream", expect.anything());
    expect(useStudioStore.getState().generations).toHaveLength(0);
  });

  it("再次点击同一操作时自动预选上一次选择的模板（记忆状态）", async () => {
    mockRoute(
      [{ id: "p1", name: "自然写作", type: "article_generate" }],
      [{ type: "delta", content: "正文" }, { type: "done" }],
    );
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
    // 第一次：选自然写作并生成
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(screen.getByText("开始生成")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("自然写作"));
    fireEvent.click(screen.getByText("开始生成"));
    await waitFor(() =>
      expect(useStudioStore.getState().lastPromptByTask["article_generate"]).toBe("p1"),
    );
    // 第二次：点按钮，自然写作应被预选
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(screen.getByText("开始生成")).toBeInTheDocument());
    expect((screen.getByLabelText("自然写作") as HTMLInputElement).checked).toBe(true);
  });

  it("点击 AI 操作走流式接口；article_generate 追加到生成结果且拼到消息，不回填 content", async () => {
    mockRoute(
      [],
      [
        { type: "delta", content: "生成" },
        { type: "delta", content: "的正文" },
        { type: "done", generationId: "g" },
      ],
    );
    resetStore({ title: "我的主题", content: "原文内容" });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    await runViaDialog("article_generate");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/stream",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("我的主题"),
        }),
      );
      const g = useStudioStore.getState().generations;
      expect(g).toHaveLength(1);
      expect(g[0]).toMatchObject({ task: "article_generate", index: 1, content: "生成的正文" });
      expect(g[0].createdAt).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(useStudioStore.getState().content).toBe("原文内容");
      expect(useStudioStore.getState().messages.some((m) => m.content === "生成的正文")).toBe(true);
    });
  });

  it("渲染「一键发送到博客」按钮，点击打开发送对话框并列出生成结果", async () => {
    mockRoute([], []);
    resetStore({
      generations: [
        { id: "g1", task: "article_generate", index: 1, content: "第一次", createdAt: "14:32:05" },
        { id: "g2", task: "article_generate", index: 2, content: "第二次", createdAt: "14:35:11" },
      ],
    });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("blog-publish"));
    await waitFor(() => expect(screen.getByLabelText("发送到哪个博客")).toBeInTheDocument());
    const genSelect = screen.getByLabelText("选择生成结果") as HTMLSelectElement;
    expect(Array.from(genSelect.options).map((o) => o.textContent)).toEqual([
      "第1次 · 文章生成 · 14:32:05",
      "第2次 · 文章生成 · 14:35:11",
    ]);
  });

  it("非 article/outline 任务也追加生成结果且不回填 content", async () => {
    mockRoute([], [{ type: "delta", content: "SEO 建议" }, { type: "done" }]);
    resetStore({ title: "t", content: "原文" });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    await runViaDialog("seo_analyze");
    await waitFor(() => expect(useStudioStore.getState().selectedTask).toBe("seo_analyze"));
    const g = useStudioStore.getState().generations;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ task: "seo_analyze", index: 1, content: "SEO 建议" });
    expect(useStudioStore.getState().content).toBe("原文");
    expect(useStudioStore.getState().messages.some((m) => m.content === "SEO 建议")).toBe(true);
  });

  it("error 事件写入 store error", async () => {
    mockRoute([], [{ type: "error", status: "no_route", message: "路由未配置" }]);
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    await runViaDialog("article_generate");
    await waitFor(() => expect(useStudioStore.getState().error).toBe("路由未配置"));
  });
});
