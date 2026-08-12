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

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { ArticleEditorPage } from "./article-editor-page";

describe("ArticleEditorPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pushMock.mockReset();
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
});
