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
};
vi.mock("@tiptap/react", () => ({
  EditorContent: ({ editor: _e }: { editor: unknown }) => (
    <div data-testid="tiptap-editor-mount" />
  ),
  useEditor: () => editorMock,
}));

// useMarkdownEditor 内部依赖这些扩展，mock 掉避免真实初始化
vi.mock("@/lib/editor/extensions/callout/callout", () => ({ Callout: {} }));
vi.mock("@/lib/editor/extensions/markdown", () => ({ Markdown: {} }));
// 工具栏行为由 editor-toolbar.test.tsx 独立覆盖；页面测试聚焦数据流
vi.mock("@/lib/editor/components/editor-toolbar", () => ({
  EditorToolbar: () => <div data-testid="editor-toolbar-mount" />,
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { TiptapEditorPage } from "./tiptap-editor-page";

describe("TiptapEditorPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pushMock.mockReset();
    editorMock.getJSON.mockClear();
    editorMock.getHTML.mockClear();
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
    await waitFor(() =>
      expect(screen.getByTestId("tiptap-editor-mount")).toBeInTheDocument(),
    );
  });
});
