import { describe, it, expect, vi, beforeEach } from "vitest";
import type React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: () => null,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

// 模板选择弹窗：mock 为可控组件，便于断言 open/task 与确认回调
vi.mock("@/components/studio/template-picker-dialog", () => ({
  TemplatePickerDialog: ({
    open,
    task,
    templates,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    task: string | null;
    templates: unknown[];
    onConfirm: (promptId: string | null) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="template-picker-dialog" data-open={String(open)} data-task={task ?? ""}>
      <span>templates:{templates.length}</span>
      <button type="button" onClick={() => onConfirm("p1")}>
        confirm-p1
      </button>
      <button type="button" onClick={() => onConfirm(null)}>
        confirm-none
      </button>
      <button type="button" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
  PromptOption: {},
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { ArticleEditorPage } from "./article-editor-page";

describe("ArticleEditorPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pushMock.mockReset();
    // 默认所有 fetch 返回空数组（prompts 列表等），具体请求再用 mockResolvedValueOnce 覆盖
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it("新建模式：标题为空时提交按钮禁用", () => {
    render(<ArticleEditorPage articleId={null} />);
    expect(screen.getByTestId("submit-article")).toBeDisabled();
  });

  it("新建模式：提交调用 POST 并跳转 /articles", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a9" }) });
    render(<ArticleEditorPage articleId={null} />);
    fireEvent.change(screen.getByTestId("article-title-input"), {
      target: { value: "新文章" },
    });
    fireEvent.click(screen.getByTestId("submit-article"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({ method: "POST" }),
      );
      expect(pushMock).toHaveBeenCalledWith("/articles");
    });
  });

  it("编辑模式：加载已有文章并回填", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }); // prompts 列表
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
    render(<ArticleEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
  });

  it("编辑模式：提交调用 PUT /api/articles/a1", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }); // prompts 列表
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
    render(<ArticleEditorPage articleId="a1" />);
    await waitFor(() => expect(screen.getByTestId("article-title-input")).toHaveValue("旧标题"));
    fireEvent.click(screen.getByTestId("submit-article"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles/a1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("预览/编辑切换", () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<ArticleEditorPage articleId={null} />);
    fireEvent.click(screen.getByTestId("toggle-preview"));
    expect(screen.getByTestId("toggle-preview")).toHaveTextContent("编辑");
  });

  it("编辑模式渲染卡片编辑区", () => {
    render(<ArticleEditorPage articleId={null} />);
    expect(screen.getByTestId("editable-content")).toBeInTheDocument();
    expect(screen.getByTestId("insert-callout-inline")).toBeInTheDocument();
  });

  it("AI 智能排版：点击后先弹出模板选择，确认后携带 promptId 请求", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "p1", name: "排版模板A", type: "layout_suggest" }],
    }); // prompts 列表
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: [] }),
    }); // suggest-layout 响应
    render(<ArticleEditorPage articleId={null} />);

    // 初始：弹窗关闭
    expect(screen.getByTestId("template-picker-dialog")).toHaveAttribute("data-open", "false");

    // 填正文（点击 AI 排版要求正文非空）
    fireEvent.change(screen.getByTestId("text-segment-0"), {
      target: { value: "第一段正文内容" },
    });

    // 点击「AI 智能排版」→ 弹出模板选择（task=layout_suggest）
    fireEvent.click(screen.getByTestId("ai-layout"));
    expect(screen.getByTestId("template-picker-dialog")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("template-picker-dialog")).toHaveAttribute(
      "data-task",
      "layout_suggest",
    );

    // 此时尚未发起排版请求
    expect(fetchMock).not.toHaveBeenCalledWith("/api/articles/suggest-layout", expect.anything());

    // 确认模板 → 请求带 promptId
    fireEvent.click(screen.getByText("confirm-p1"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles/suggest-layout",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"promptId":"p1"'),
        }),
      );
    });
    // 确认后弹窗关闭
    expect(screen.getByTestId("template-picker-dialog")).toHaveAttribute("data-open", "false");
  });

  it("AI 智能排版：正文为空时点击不弹模板选择", () => {
    render(<ArticleEditorPage articleId={null} />);
    fireEvent.click(screen.getByTestId("ai-layout"));
    expect(screen.getByTestId("template-picker-dialog")).toHaveAttribute("data-open", "false");
  });
});
