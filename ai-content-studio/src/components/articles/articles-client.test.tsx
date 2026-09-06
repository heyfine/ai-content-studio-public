import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import type { ArticleRow } from "@/lib/article-types";
import { ArticlesClient } from "./articles-client";

const sampleRows: ArticleRow[] = [
  {
    id: "a1",
    title: "Next.js 教程",
    slug: "next",
    content: "正文",
    status: "DRAFT",
    seoScore: null,
    wpPostId: null,
    siteConfigId: null,
    syncStatus: null,
    lastSyncedAt: null,
    wpModifiedAt: null,
    categories: null,
    tags: null,
    featuredImage: null,
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
    siteConfigId: "wp1",
    syncStatus: "SYNCED",
    lastSyncedAt: "2026-08-09T10:00:00.000Z",
    wpModifiedAt: "2026-08-09T09:00:00.000Z",
    categories: [1, 2],
    tags: ["seo", "guide"],
    featuredImage: "https://example.com/image.jpg",
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
  siteConfigId: null,
  syncStatus: null,
  lastSyncedAt: null,
  wpModifiedAt: null,
  categories: null,
  tags: null,
  featuredImage: null,
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
  siteConfigId: null,
  syncStatus: null,
  lastSyncedAt: null,
  wpModifiedAt: null,
  categories: null,
  tags: null,
  featuredImage: null,
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
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
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
    fireEvent.click(screen.getAllByLabelText("移入回收站")[0]);
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("确认将文章移入回收站？");
      expect(fetchMock).toHaveBeenCalledWith("/api/articles/a1", {
        method: "DELETE",
      });
    });
    confirmSpy.mockRestore();
  });

  it("取消删除不发送 DELETE", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getAllByLabelText("移入回收站")[0]);
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("DELETE 响应非 ok 显示错误提示", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => sampleRows };
      if (u === "/api/articles/a1" && method === "DELETE")
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "移入回收站失败" }),
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText("移入回收站")[0]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("移入回收站失败"));
    confirmSpy.mockRestore();
  });

  it("博客同步文章删除时 WP 移入回收站失败返回删除失败提示", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => sampleRows };
      if (u === "/api/articles/a1" && method === "DELETE")
        return {
          ok: false,
          status: 502,
          json: async () => ({
            error: "WordPress 移入回收站失败，本地文章未删除：WordPress 移入回收站失败（500）",
          }),
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText("移入回收站")[0]);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("WordPress 移入回收站失败"),
    );
    confirmSpy.mockRestore();
  });

  it("已移除待刷新标记列，低质文章不再显示待刷新标签", async () => {
    setupFetchWithRefresh([staleRow, freshRow]);
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("低质文章")).toBeInTheDocument());
    expect(screen.queryByTestId("stale-mark-s1")).not.toBeInTheDocument();
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
    setupFetchWithRefresh([staleRow], {
      ok: false,
      body: { error: "刷新文章失败" },
    });
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

  it("搜索框按标题过滤列表", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "SEO" },
    });
    await waitFor(() => expect(screen.getByText("SEO 指南")).toBeInTheDocument());
    expect(screen.queryByText("Next.js 教程")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "不存在的文章" },
    });
    await waitFor(() => expect(screen.getByText(/暂无文章/)).toBeInTheDocument());
  });

  it("状态筛选：选择草稿后只显示草稿文章", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("combobox", { name: /状态筛选/ }));
    await waitFor(() => expect(screen.getByRole("option", { name: "草稿" })).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole("option", { name: "草稿" }));
    fireEvent.click(screen.getByRole("option", { name: "草稿" }));
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    expect(screen.queryByText("SEO 指南")).not.toBeInTheDocument();
  });

  it("同步标记筛选：选择已同步后只显示已同步文章", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("combobox", { name: /同步标记/ }));
    await waitFor(() => expect(screen.getByRole("option", { name: "已同步" })).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole("option", { name: "已同步" }));
    fireEvent.click(screen.getByRole("option", { name: "已同步" }));
    await waitFor(() => expect(screen.getByText("SEO 指南")).toBeInTheDocument());
    expect(screen.queryByText("Next.js 教程")).not.toBeInTheDocument();
  });

  it("点击更新时间表头切换排序", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    // 默认降序（desc）：Next.js(08-10) 在 SEO 指南(08-09) 前
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Next.js 教程");
    fireEvent.click(screen.getByTestId("sort-updated-at"));
    await waitFor(() => {
      const sortedRows = screen.getAllByRole("row");
      expect(sortedRows[1]).toHaveTextContent("SEO 指南");
    });
  });

  it("文章归属筛选：选择博客站点后只显示该站点文章", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => sampleRows };
      if (u === "/api/wordpress/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [{ id: "wp1", name: "我的博客", enabled: true }],
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    // 展开文章归属下拉，勾选 wp1 站点
    fireEvent.click(screen.getByRole("combobox", { name: /文章归属/ }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "我的博客" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("option", { name: "我的博客" }));
    await waitFor(() => expect(screen.getByText("SEO 指南")).toBeInTheDocument());
    expect(screen.queryByText("Next.js 教程")).not.toBeInTheDocument();
  });

  it("文章归属筛选：选择本地文章后只显示本地文章", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => sampleRows };
      if (u === "/api/wordpress/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [{ id: "wp1", name: "我的博客", enabled: true }],
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("combobox", { name: /文章归属/ }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "本地文章" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("option", { name: "本地文章" }));
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    expect(screen.queryByText("SEO 指南")).not.toBeInTheDocument();
  });

  it("文章归属列显示博客名，本地文章显示本地", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => sampleRows };
      if (u === "/api/wordpress/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [{ id: "wp1", name: "我的博客", enabled: true }],
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("我的博客")).toBeInTheDocument());
    expect(screen.getByText("本地")).toBeInTheDocument();
  });

  it("博客归属文章显示为指向 WP 的超链接，本地文章不是链接", async () => {
    const syncedRowWithUrl: ArticleRow = {
      ...sampleRows[1],
      wpUrl: "https://blog.example.com/seo-guide/",
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => [sampleRows[0], syncedRowWithUrl] };
      if (u === "/api/wordpress/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [
            { id: "wp1", name: "我的博客", siteUrl: "https://blog.example.com", enabled: true },
          ],
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("SEO 指南")).toBeInTheDocument());
    const links = screen.getAllByRole("link");
    const wpLink = links.find(
      (a) => a.getAttribute("href") === "https://blog.example.com/seo-guide/",
    );
    expect(wpLink).toBeTruthy();
    expect(wpLink).toHaveAttribute("target", "_blank");
  });

  it("无 wpUrl 但有 wpPostId 时用 siteUrl/?p= 构造链接", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => sampleRows };
      if (u === "/api/wordpress/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [
            { id: "wp1", name: "我的博客", siteUrl: "https://blog.example.com", enabled: true },
          ],
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("SEO 指南")).toBeInTheDocument());
    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "https://blog.example.com/?p=12");
    expect(link).toBeTruthy();
  });

  it("勾选文章后发送按钮启用并可批量发布", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => sampleRows };
      if (u === "/api/wordpress/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [
            { id: "wp1", name: "我的博客", siteUrl: "https://blog.example.com", enabled: true },
          ],
        };
      if (u === "/api/wordpress/publish" && method === "POST")
        return { ok: true, json: async () => ({ success: true }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    const publishBtn = screen.getByTestId("publish-selected");
    expect(publishBtn).toBeDisabled();
    // 勾选两篇文章
    fireEvent.click(screen.getByTestId("row-checkbox-a1"));
    fireEvent.click(screen.getByTestId("row-checkbox-a2"));
    await waitFor(() => expect(publishBtn).not.toBeDisabled());
    expect(publishBtn).toHaveTextContent("发送到 WordPress（2）");
    // 打开弹窗
    fireEvent.click(publishBtn);
    await waitFor(() => expect(screen.getByText("发送到 WordPress")).toBeInTheDocument());
    // 选择目标站点
    fireEvent.click(screen.getByRole("combobox", { name: /目标站点/ }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "我的博客" })).toBeInTheDocument(),
    );
    fireEvent.pointerDown(screen.getByRole("option", { name: "我的博客" }));
    fireEvent.click(screen.getByRole("option", { name: "我的博客" }));
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByText(/发送完成：成功 2 篇/)).toBeInTheDocument());
  });

  it("全选按钮勾选当前列表全部文章", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleRows });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("select-all"));
    await waitFor(() => expect(screen.getByTestId("publish-selected")).not.toBeDisabled());
    expect(screen.getByTestId("publish-selected")).toHaveTextContent("发送到 WordPress（2）");
  });

  it("点击复制公众号格式：取文章 → 转内联样式 HTML → 写剪贴板并提示成功", async () => {
    let copiedHtml = "";
    const exec = vi.fn(() => {
      // 复制瞬间容器仍在 DOM 中，抓取选区内 HTML 验证格式
      copiedHtml = document.querySelector("div[contenteditable='true']")?.innerHTML ?? "";
      return true;
    });
    document.execCommand = exec as unknown as typeof document.execCommand;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => [sampleRows[0]] };
      if (u === "/api/articles/a1" && method === "GET")
        return {
          ok: true,
          json: async () => ({ title: "Next.js 教程", content: "# 标题\n\n正文" }),
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-wechat-a1"));
    await waitFor(() => expect(screen.getByTestId("copy-wechat-result")).toBeInTheDocument());
    expect(screen.getByTestId("copy-wechat-result")).toHaveTextContent("已复制公众号格式");
    // execCommand 兜底路径被调用（jsdom 无 ClipboardItem），选区内容为内联样式微信格式 HTML
    expect(exec).toHaveBeenCalledWith("copy");
    expect(copiedHtml).toMatch(/font-size:15px/);
    expect(copiedHtml).not.toMatch(/class=/);
  });

  it("复制失败（浏览器不支持）时显示错误提示", async () => {
    const exec = vi.fn(() => false);
    document.execCommand = exec as unknown as typeof document.execCommand;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => [sampleRows[0]] };
      if (u === "/api/articles/a1" && method === "GET")
        return { ok: true, json: async () => ({ title: "T", content: "正文" }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("Next.js 教程")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-wechat-a1"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("复制公众号格式失败"));
  });

  it("「已发到」列显示文章发布过的所有博客名", async () => {
    const multiPublishRow: ArticleRow = {
      ...sampleRows[1],
      publishes: [
        { configId: "wp1", wpUrl: "https://blog.example.com/a/", wpPostId: "12" },
        { configId: "wp2", wpUrl: "https://blog2.example.com/a/", wpPostId: "34" },
      ],
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => [sampleRows[0], multiPublishRow] };
      if (u === "/api/wordpress/configs" && method === "GET")
        return {
          ok: true,
          json: async () => [
            { id: "wp1", name: "博客A", siteUrl: "https://blog.example.com", enabled: true },
            { id: "wp2", name: "博客B", siteUrl: "https://blog2.example.com", enabled: true },
          ],
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesClient />);
    await waitFor(() => expect(screen.getByText("SEO 指南")).toBeInTheDocument());
    // 已发到列显示两个博客名链接
    const targetLinks = screen.getAllByTestId(/^publish-target-a2/);
    expect(targetLinks).toHaveLength(2);
    const linkTexts = targetLinks.map((l) => l.textContent);
    expect(linkTexts.some((t) => t?.includes("博客A"))).toBeTruthy();
    expect(linkTexts.some((t) => t?.includes("博客B"))).toBeTruthy();
    // 链接指向各自博客文章
    const links = screen.getAllByRole("link");
    expect(
      links.some((a) => a.getAttribute("href") === "https://blog.example.com/a/"),
    ).toBeTruthy();
    expect(
      links.some((a) => a.getAttribute("href") === "https://blog2.example.com/a/"),
    ).toBeTruthy();
  });
});
