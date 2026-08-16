import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), back: vi.fn() }),
}));

// Tiptap editor mock：测试无需真实 ProseMirror，只验证数据流与保存 payload
const editorMock = {
  getJSON: vi.fn(() => ({ type: "doc", content: [] })),
  getHTML: vi.fn(() => "<p>正文</p>"),
  commands: {
    setContent: vi.fn(() => ({ done: true })),
  },
};
vi.mock("@tiptap/react", () => ({
  EditorContent: ({ editor: _e }: { editor: unknown }) => <div data-testid="tiptap-editor-mount" />,
  useEditor: () => editorMock,
}));

// useMarkdownEditor 内部依赖这些扩展，mock 掉避免真实初始化
vi.mock("@/lib/editor/extensions/callout/callout", () => ({ Callout: {} }));
vi.mock("@/lib/editor/extensions/markdown", () => ({ Markdown: {} }));
// 工具栏行为由 editor-toolbar.test.tsx 独立覆盖；页面测试聚焦数据流
vi.mock("@/lib/editor/components/editor-toolbar", () => ({
  EditorToolbar: () => <div data-testid="editor-toolbar-mount" />,
}));

// AI 智能排版走流式 SSE；mock 掉避免真实网络
const streamMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/stream-client", () => ({
  streamGenerateRequest: (...args: unknown[]) => streamMock(...args),
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { TiptapEditorPage } from "./tiptap-editor-page";

describe("TiptapEditorPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // 默认响应：prompts 空列表 + 后续任意请求 ok
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    pushMock.mockReset();
    editorMock.getJSON.mockClear();
    editorMock.getHTML.mockClear();
    editorMock.commands.setContent.mockClear();
    streamMock.mockReset();
  });

  it("新建模式：标题为空时提交按钮禁用", () => {
    render(<TiptapEditorPage articleId={null} />);
    expect(screen.getByTestId("submit-article")).toBeDisabled();
  });

  it("新建模式：提交携带 content + 三字段并跳转", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a9" }) });
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.change(screen.getByTestId("article-title-input"), {
      target: { value: "新文章" },
    });
    fireEvent.click(screen.getByTestId("submit-article"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"contentJson"'),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"contentHtml"'),
        }),
      );
      expect(pushMock).toHaveBeenCalledWith("/articles");
    });
  });

  it("编辑模式：加载已有文章并回填标题", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "a1",
        title: "旧标题",
        slug: "x",
        content: "旧正文",
        status: "DRAFT",
        seoScore: null,
        wpPostId: null,
        promptId: null,
      }),
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
  });

  it("编辑模式：提交调用 PUT /api/articles/a1", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "a1",
        title: "旧标题",
        slug: "x",
        content: "旧正文",
        status: "DRAFT",
        seoScore: null,
        wpPostId: null,
        promptId: null,
      }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
    fireEvent.click(screen.getByTestId("submit-article"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles/a1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("编辑模式：渲染编辑器挂载点", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "a1",
        title: "旧标题",
        slug: "x",
        content: "旧正文",
        status: "DRAFT",
        seoScore: null,
        wpPostId: null,
        promptId: null,
      }),
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("tiptap-editor-mount")).toBeInTheDocument());
  });

  it("预览：切换后渲染 MarkdownPreview，再切回编辑器", () => {
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.click(screen.getByTestId("toggle-preview"));
    expect(screen.queryByTestId("tiptap-editor-host")).not.toBeInTheDocument();
    expect(document.querySelector(".callout-preview")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("toggle-preview"));
    expect(screen.getByTestId("tiptap-editor-host")).toBeInTheDocument();
  });

  it("AI 智能排版：正文为空时给出提示", () => {
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.click(screen.getByTestId("ai-layout"));
    expect(screen.getByTestId("layout-error")).toHaveTextContent("正文为空");
  });

  it("AI 智能排版：流式生成排版结果并应用到正文", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "a1",
        title: "旧标题",
        slug: "x",
        content: "重要内容",
        status: "DRAFT",
        seoScore: null,
        wpPostId: null,
        promptId: null,
      }),
    });
    // 内层挂载时 prompts 请求
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    streamMock.mockImplementation(async function* () {
      yield { type: "delta", content: "## 排好的标题\n\n排好版的内容。" };
      yield { type: "done" };
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
    fireEvent.click(screen.getByTestId("ai-layout"));
    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));
    await waitFor(() => expect(streamMock).toHaveBeenCalled());
    const args = streamMock.mock.calls[0][0];
    expect(args.task).toBe("layout_suggest");
    expect(args.input).toContain("标题：旧标题");
    expect(args.input).toContain("重要内容");
    await waitFor(() => expect(screen.getByTestId("layout-generate-panel")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("排好版的内容。")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("layout-apply-result"));
    await waitFor(() => expect(editorMock.commands.setContent).toHaveBeenCalled());
    expect(screen.queryByTestId("layout-generate-panel")).not.toBeInTheDocument();
  });

  it("AI 建议：正文为空时给出提示", () => {
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.click(screen.getByTestId("ai-suggest-callouts"));
    expect(screen.getByTestId("suggest-error")).toHaveTextContent("正文为空");
  });

  it("编辑模式：AI 建议接受后应用到编辑器", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "a1",
        title: "旧标题",
        slug: "x",
        content: "重要内容",
        status: "DRAFT",
        seoScore: null,
        wpPostId: null,
        promptId: null,
      }),
    });
    // 内层挂载时 prompts 请求
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        suggestions: [{ type: "tip", title: "提示", originalText: "重要内容", reason: "值得高亮" }],
      }),
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
    fireEvent.click(screen.getByTestId("ai-suggest-callouts"));
    await waitFor(() => expect(screen.getByTestId("suggestion-0")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("accept-suggestion-0"));
    await waitFor(() => expect(editorMock.commands.setContent).toHaveBeenCalled());
  });

  it("新建模式：显示「发送到 WordPress」按钮", () => {
    render(<TiptapEditorPage articleId={null} />);
    expect(screen.getByTestId("publish-to-wordpress")).toBeInTheDocument();
  });

  it("新建模式：点击「发送到 WordPress」先 POST 创建文章再发布", async () => {
    // 渲染时 prompts 请求
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    // 保存：POST 创建文章返回新 id
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new1", title: "新文章" }),
    });
    // 拉取启用站点（单站点直接发送）
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "w1", name: "博客A", siteUrl: "https://a.example", enabled: true }],
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ link: "https://a.example/?p=1", wpPostId: "1", status: "publish" }),
    });
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.change(screen.getByTestId("article-title-input"), {
      target: { value: "新文章" },
    });
    fireEvent.click(screen.getByTestId("publish-to-wordpress"));
    await waitFor(() => expect(screen.getByTestId("publish-result")).toBeInTheDocument());
    const createCall = fetchMock.mock.calls.find((c) => c[0] === "/api/articles");
    expect(createCall).toBeDefined();
    expect(createCall![1]).toEqual(expect.objectContaining({ method: "POST" }));
    const pubCall = fetchMock.mock.calls.find((c) => c[0] === "/api/wordpress/publish");
    expect(pubCall).toBeDefined();
    expect(JSON.parse((pubCall![1] as RequestInit).body as string)).toEqual({
      articleId: "new1",
      configId: "w1",
    });
  });

  it("编辑模式：单站点点击后直接发送", async () => {
    const articleRow = {
      id: "a1",
      title: "旧标题",
      slug: "x",
      content: "旧正文",
      status: "DRAFT",
      seoScore: null,
      wpPostId: null,
      promptId: null,
    };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => articleRow });
    // 内层挂载时 prompts 请求
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    // 发布流程：先保存 PUT，再拉站点，再发布
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "w1", name: "博客A", siteUrl: "https://a.example", enabled: true }],
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ link: "https://a.example/?p=1", wpPostId: "1", status: "publish" }),
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
    fireEvent.click(screen.getByTestId("publish-to-wordpress"));
    await waitFor(() => expect(screen.getByTestId("publish-result")).toBeInTheDocument());
    expect(screen.queryByTestId("publish-confirm")).not.toBeInTheDocument();
    const pubCall = fetchMock.mock.calls.find((c) => c[0] === "/api/wordpress/publish");
    expect(pubCall).toBeDefined();
    expect(JSON.parse((pubCall![1] as RequestInit).body as string)).toEqual({
      articleId: "a1",
      configId: "w1",
    });
  });

  it("编辑模式：多个站点弹下拉选择后发送", async () => {
    const articleRow = {
      id: "a1",
      title: "旧标题",
      slug: "x",
      content: "旧正文",
      status: "DRAFT",
      seoScore: null,
      wpPostId: null,
      promptId: null,
    };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => articleRow });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "w1", name: "博客A", siteUrl: "https://a.example", enabled: true },
        { id: "w2", name: "博客B", siteUrl: "https://b.example", enabled: true },
      ],
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ link: "https://b.example/?p=2", wpPostId: "2", status: "publish" }),
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
    fireEvent.click(screen.getByTestId("publish-to-wordpress"));
    const select = await screen.findByLabelText("发送到哪个站点");
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "w2" } });
    fireEvent.click(screen.getByTestId("publish-confirm"));
    await waitFor(() => expect(screen.getByTestId("publish-result")).toBeInTheDocument());
    const pubCall = fetchMock.mock.calls.find((c) => c[0] === "/api/wordpress/publish");
    expect(pubCall).toBeDefined();
    expect(JSON.parse((pubCall![1] as RequestInit).body as string)).toEqual({
      articleId: "a1",
      configId: "w2",
    });
  });

  it("编辑模式：无启用站点时提示未配置", async () => {
    const articleRow = {
      id: "a1",
      title: "旧标题",
      slug: "x",
      content: "旧正文",
      status: "DRAFT",
      seoScore: null,
      wpPostId: null,
      promptId: null,
    };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => articleRow });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
    fireEvent.click(screen.getByTestId("publish-to-wordpress"));
    await waitFor(() =>
      expect(screen.getByTestId("publish-error")).toHaveTextContent("未配置启用中的 WordPress"),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/wordpress/publish",
      expect.anything(),
    );
  });
});
