import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ render }: { render: React.ReactNode }) => <>{render}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: () => null,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogClose: ({ render }: { render: React.ReactNode }) => <>{render}</>,
}));

import { ArticlesClient } from "./articles-client";
import { ArticleEditorDialog, type ArticleRow } from "./article-editor-dialog";

const sampleRows: ArticleRow[] = [
  {
    id: "a1",
    title: "Next.js 教程",
    slug: "next",
    content: "正文",
    status: "DRAFT",
    seoScore: null,
    wpPostId: null,
    promptId: null,
    updatedAt: "2026-08-10T10:00:00.000Z",
  },
  {
    id: "a2",
    title: "SEO 指南",
    slug: "seo",
    content: "正文2",
    status: "PUBLISHED",
    seoScore: 88,
    wpPostId: "12",
    promptId: null,
    updatedAt: "2026-08-09T10:00:00.000Z",
  },
];

describe("ArticlesClient", () => {
  beforeEach(() => fetchMock.mockReset());

  it("加载中显示加载中…", () => {
    let resolveFetch!: (v: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        resolveFetch = r;
      }),
    );
    render(<ArticlesClient />);
    expect(screen.getByText("加载中…")).toBeInTheDocument();
    resolveFetch({ ok: true, json: async () => [] } as Response);
  });

  it("响应非 ok 时显示加载失败", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("加载失败"));
  });

  it("无数据显示空提示", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText(/暂无文章/)).toBeInTheDocument());
  });

  it("有数据渲染表格行含标题与状态徽章", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("已发布")).toBeInTheDocument();
  });

  it("确认删除后发送 DELETE", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getAllByLabelText("删除")[0]);
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith("/api/articles/a1", { method: "DELETE" });
    });
    confirmSpy.mockRestore();
  });

  it("取消删除不发送 DELETE", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getAllByLabelText("删除")[0]);
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("ArticleEditorDialog", () => {
  beforeEach(() => fetchMock.mockReset());

  it("无 initialValues 显示新建文章", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    expect(screen.getByText("新建文章")).toBeInTheDocument();
  });

  it("有 initialValues.id 显示编辑文章", () => {
    render(
      <ArticleEditorDialog
        trigger={<button type="button">t</button>}
        initialValues={{
          id: "a1",
          title: "X",
          slug: "x",
          content: "c",
          status: "DRAFT",
          seoScore: null,
          wpPostId: null,
          promptId: null,
        }}
      />,
    );
    expect(screen.getByText("编辑文章")).toBeInTheDocument();
    // 初始标题回填
    expect(screen.getByLabelText("标题")).toHaveValue("X");
  });

  it("提交创建调用 POST 并 onSaved", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a1" }) });
    const onSaved = vi.fn();
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "新文章" } });
    fireEvent.click(screen.getByText("创建"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({ method: "POST" }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("编辑提交调用 PUT", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <ArticleEditorDialog
        trigger={<button type="button">t</button>}
        initialValues={{
          id: "a1",
          title: "X",
          slug: "x",
          content: "c",
          status: "DRAFT",
          seoScore: null,
          wpPostId: null,
          promptId: null,
        }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles/a1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("提交失败显示错误信息", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "非法状态转换：ARCHIVED → PUBLISHED" }),
    });
    render(
      <ArticleEditorDialog
        trigger={<button type="button">t</button>}
        initialValues={{
          id: "a1",
          title: "X",
          slug: "x",
          content: "c",
          status: "ARCHIVED",
          seoScore: null,
          wpPostId: null,
          promptId: null,
        }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/非法状态转换/));
  });

  it("标题为空时提交按钮禁用", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    expect(screen.getByText("创建").closest("button")).toBeDisabled();
  });
});
