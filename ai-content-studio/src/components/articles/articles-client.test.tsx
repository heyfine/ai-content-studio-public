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

const staleRow: ArticleRow = {
  id: "s1",
  title: "低质文章",
  slug: "low",
  content: "老内容",
  status: "PUBLISHED",
  seoScore: 30,
  wpPostId: null,
  promptId: null,
  updatedAt: "2026-08-10T10:00:00.000Z",
};

const freshRow: ArticleRow = {
  id: "f1",
  title: "优质文章",
  slug: "fresh",
  content: "新内容",
  status: "PUBLISHED",
  seoScore: 92,
  wpPostId: null,
  promptId: null,
  updatedAt: "2026-08-10T10:00:00.000Z",
};

/** 按 URL+method 分流的 fetch mock：GET /api/articles 返回 rows，POST /api/articles/[id]/refresh 返回 refreshRes */
function setupFetchWithRefresh(
  rows: ArticleRow[],
  refreshRes: { ok: boolean; body: unknown } = { ok: true, body: {} },
) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const u = typeof url === "string" ? url : "";
    if (u === "/api/articles" && method === "GET") return { ok: true, json: async () => rows };
    if (u.startsWith("/api/articles/") && u.endsWith("/refresh") && method === "POST")
      return { ok: refreshRes.ok, json: async () => refreshRes.body };
    return { ok: false, json: async () => ({ error: "未知请求" }) };
  });
}

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

  it("低质文章（SEO<60）显示待刷新标记，优质文章不显示", async () => {
    setupFetchWithRefresh([staleRow, freshRow]);
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("低质文章")).toBeInTheDocument());
    expect(screen.getByTestId("stale-mark-s1")).toHaveTextContent("待刷新");
    expect(screen.queryByTestId("stale-mark-f1")).not.toBeInTheDocument();
  });

  it("点击 AI 刷新成功显示 SEO 评分 old→new 对比", async () => {
    setupFetchWithRefresh([staleRow], {
      ok: true,
      body: { articleId: "s1", oldSeoScore: 30, newSeoScore: 85 },
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("低质文章")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("refresh-s1"));
    await waitFor(() => expect(screen.getByTestId("refresh-outcome")).toBeInTheDocument());
    expect(screen.getByTestId("refresh-outcome")).toHaveTextContent("AI 刷新完成");
    expect(screen.getByTestId("refresh-outcome")).toHaveTextContent(/30.*85.*\+55/);
  });

  it("AI 刷新失败显示错误信息", async () => {
    setupFetchWithRefresh([staleRow], { ok: false, body: { error: "刷新文章失败" } });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("低质文章")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("refresh-s1"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("AI 刷新失败：刷新文章失败"),
    );
  });

  it("刷新中按钮禁用且图标旋转", async () => {
    let resolveRefresh!: (v: unknown) => void;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => [staleRow] };
      if (u.startsWith("/api/articles/") && method === "POST")
        return new Promise((r) => {
          resolveRefresh = r;
        });
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("低质文章")).toBeInTheDocument());
    const btn = screen.getByTestId("refresh-s1");
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn.querySelector("svg")?.getAttribute("class") ?? "").toMatch(/animate-spin/);
    resolveRefresh({
      ok: true,
      json: async () => ({ articleId: "s1", oldSeoScore: 30, newSeoScore: 85 }),
    });
    await waitFor(() => expect(screen.getByTestId("refresh-s1")).not.toBeDisabled());
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
