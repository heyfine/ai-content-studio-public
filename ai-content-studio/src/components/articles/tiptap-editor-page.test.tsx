import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    localStorage.clear();
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
    expect(createCall?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    const pubCall = fetchMock.mock.calls.find((c) => c[0] === "/api/wordpress/publish");
    if (!pubCall) throw new Error("未调用 /api/wordpress/publish");
    expect(JSON.parse((pubCall[1] as RequestInit).body as string)).toEqual({
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
    if (!pubCall) throw new Error("未调用 /api/wordpress/publish");
    expect(JSON.parse((pubCall[1] as RequestInit).body as string)).toEqual({
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
    expect(JSON.parse((pubCall?.[1] as RequestInit).body as string)).toEqual({
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
    expect(fetchMock).not.toHaveBeenCalledWith("/api/wordpress/publish", expect.anything());
  });

  it("发送到微信公众号：先保存再单账号直发，展示草稿成功提示", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "POST")
        return { ok: true, json: async () => ({ id: "a9" }) };
      if (u === "/api/wechat/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [{ id: "wc1", name: "我的订阅号", appId: "wx123", enabled: true }],
        };
      if (u === "/api/wechat/draft" && method === "POST")
        return { ok: true, json: async () => ({ mediaId: "DRAFT_MID" }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.change(screen.getByTestId("article-title-input"), {
      target: { value: "新文章" },
    });
    fireEvent.click(screen.getByTestId("send-to-wechat"));
    await waitFor(() =>
      expect(screen.getByTestId("wechat-result")).toHaveTextContent(/已进入公众号草稿箱/),
    );
    const draftCall = fetchMock.mock.calls.find((c) => c[0] === "/api/wechat/draft");
    expect(draftCall).toBeTruthy();
    const body = JSON.parse(draftCall?.[1]?.body as string);
    expect(body).toMatchObject({ articleId: "a9", configId: "wc1" });
    // content 为内联样式的微信格式 HTML
    expect(body.content).toMatch(/font-size:15px/);
    expect(body.content).not.toMatch(/class=/);
  });

  it("发送到微信公众号：多账号时弹选择框确认发送", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "POST")
        return { ok: true, json: async () => ({ id: "a9" }) };
      if (u === "/api/wechat/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [
            { id: "wc1", name: "订阅号A", appId: "wx1", enabled: true },
            { id: "wc2", name: "订阅号B", appId: "wx2", enabled: true },
          ],
        };
      if (u === "/api/wechat/draft" && method === "POST")
        return { ok: true, json: async () => ({ mediaId: "D2" }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.change(screen.getByTestId("article-title-input"), {
      target: { value: "新文章" },
    });
    fireEvent.click(screen.getByTestId("send-to-wechat"));
    await waitFor(() => expect(screen.getByText("发送到微信公众号")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("wechat-send-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("wechat-result")).toHaveTextContent(/已进入公众号草稿箱/),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls.find((c) => c[0] === "/api/wechat/draft")?.[1] as RequestInit)
        .body as string,
    );
    expect(body.configId).toBe("wc1");
  });

  it("发送到微信公众号：无账号时提示先配置", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "POST")
        return { ok: true, json: async () => ({ id: "a9" }) };
      if (u === "/api/wechat/configs" && method === "GET")
        return { ok: true, json: async () => [] };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<TiptapEditorPage articleId={null} />);
    fireEvent.change(screen.getByTestId("article-title-input"), {
      target: { value: "新文章" },
    });
    fireEvent.click(screen.getByTestId("send-to-wechat"));
    await waitFor(() =>
      expect(screen.getByTestId("wechat-error")).toHaveTextContent(/未配置公众号账号/),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api/wechat/draft", expect.anything());
  });

  it("历史版本：编辑模式显示按钮，点击打开弹窗", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.startsWith("/api/articles/a1/versions"))
        return { ok: true, json: async () => [] };
      if (url === "/api/articles/a1")
        return {
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
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toBeInTheDocument());
    expect(screen.getByTestId("open-versions")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("open-versions"));
    await waitFor(() => expect(screen.getByText(/每次正文被覆盖前自动存档/)).toBeInTheDocument());
  });

  it("历史版本：新建模式不显示入口", () => {
    render(<TiptapEditorPage articleId={null} />);
    expect(screen.queryByTestId("open-versions")).not.toBeInTheDocument();
  });

  it("自动保存：填写标题停顿 2 秒后自动创建文章并显示指示器", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a9" }) });
      render(<TiptapEditorPage articleId={null} />);
      fireEvent.change(screen.getByTestId("article-title-input"), {
        target: { value: "自动保存标题" },
      });
      expect(fetchMock).not.toHaveBeenCalledWith("/api/articles", expect.anything());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByTestId("autosave-indicator")).toHaveTextContent("已自动保存");
    } finally {
      vi.useRealTimers();
    }
  });

  it("自动保存：切换预览选项卡立即保存当前内容", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles/a1" && method === "GET")
        return {
          ok: true,
          json: async () => ({
            id: "a1",
            title: "原标题",
            slug: "x",
            content: "旧正文",
            status: "DRAFT",
            seoScore: null,
            wpPostId: null,
            promptId: null,
          }),
        };
      if (u === "/api/articles/a1" && method === "PUT")
        return { ok: true, json: async () => ({ id: "a1" }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<TiptapEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("原标题"));
    fireEvent.change(screen.getByTestId("article-title-input"), {
      target: { value: "改过的标题" },
    });
    // 未到 2s 防抖即切选项卡 → 立即保存
    fireEvent.click(screen.getByTestId("toggle-preview"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles/a1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("自动保存：无有效标题的新建内容暂存 localStorage（不落库）", async () => {
    vi.useFakeTimers();
    try {
      render(<TiptapEditorPage articleId={null} />);
      // 仅空格标题：trim 为空 → 不创建文章，走 localStorage 暂存分支
      fireEvent.change(screen.getByTestId("article-title-input"), { target: { value: " " } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({ method: "POST" }),
      );
      const draft = JSON.parse(localStorage.getItem("article-new-draft") ?? "null") as {
        title?: string;
      } | null;
      expect(draft?.title).toBe(" ");
      expect(screen.getByTestId("autosave-indicator")).toHaveTextContent("已暂存本地");
    } finally {
      vi.useRealTimers();
      localStorage.clear();
    }
  });

  it("自动保存：本地暂存草稿在新建模式打开时恢复", () => {
    localStorage.setItem(
      "article-new-draft",
      JSON.stringify({
        title: "暂存标题",
        content: "暂存正文",
        savedAt: "2026-09-06T00:00:00.000Z",
      }),
    );
    render(<TiptapEditorPage articleId={null} />);
    expect(screen.getByTestId("article-title-input")).toHaveValue("暂存标题");
    localStorage.clear();
  });

  it("自动保存：新建文章创建成功后清除本地暂存", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(
        "article-new-draft",
        JSON.stringify({ title: "旧暂存", content: "x", savedAt: "2026-09-06T00:00:00.000Z" }),
      );
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a9" }) });
      render(<TiptapEditorPage articleId={null} />);
      fireEvent.change(screen.getByTestId("article-title-input"), {
        target: { value: "正式标题" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({ method: "POST" }),
      );
      expect(localStorage.getItem("article-new-draft")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
