import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import type { ArticleRow } from "@/lib/article-types";
import { ArticlesTrashClient } from "./articles-trash-client";

const trashedRows: ArticleRow[] = [
  {
    id: "t1",
    title: "已删除文章",
    slug: "trashed",
    content: "正文",
    status: "DRAFT",
    seoScore: null,
    wpPostId: "55",
    siteConfigId: "wp1",
    syncStatus: "SYNCED",
    lastSyncedAt: null,
    wpModifiedAt: null,
    categories: null,
    tags: null,
    featuredImage: null,
    promptId: null,
    updatedAt: "2026-08-11T10:00:00.000Z",
    deletedAt: "2026-08-12T10:00:00.000Z",
  },
];

function setupFetchWithActions() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const u = typeof url === "string" ? url : "";
    if (u === "/api/articles?trashed=true" && method === "GET")
      return { ok: true, json: async () => trashedRows };
    if (u === "/api/articles/t1/restore" && method === "POST")
      return {
        ok: true,
        json: async () => ({ restored: true, wpSynced: true }),
      };
    if (u === "/api/articles/t1?permanent=true" && method === "DELETE")
      return {
        ok: true,
        json: async () => ({ deleted: true, permanent: true, wpDeleted: true }),
      };
    return { ok: false, json: async () => ({ error: "未知请求" }) };
  });
}

describe("ArticlesTrashClient", () => {
  beforeEach(() => fetchMock.mockReset());

  it("加载回收站列表并显示标题与删除时间", async () => {
    setupFetchWithActions();
    render(<ArticlesTrashClient />);
    await waitFor(() => expect(screen.getByText("已删除文章")).toBeInTheDocument());
    expect(screen.getByTestId("articles-trash-client")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-12 10:00/)).toBeInTheDocument();
  });

  it("空回收站显示空提示", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<ArticlesTrashClient />);
    await waitFor(() => expect(screen.getByText("回收站是空的。")).toBeInTheDocument());
  });

  it("响应非 ok 显示错误并可重试", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    render(<ArticlesTrashClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("加载失败"));
  });

  it("确认后恢复文章并发送 restore 请求", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    setupFetchWithActions();
    render(<ArticlesTrashClient />);
    await waitFor(() => expect(screen.getByText("已删除文章")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getByTestId("restore-t1"));
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("确认恢复该文章？");
      expect(fetchMock).toHaveBeenCalledWith("/api/articles/t1/restore", {
        method: "POST",
      });
    });
    confirmSpy.mockRestore();
  });

  it("取消恢复不发送请求", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    setupFetchWithActions();
    render(<ArticlesTrashClient />);
    await waitFor(() => expect(screen.getByText("已删除文章")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getByTestId("restore-t1"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("确认后彻底删除并发送 permanent DELETE", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    setupFetchWithActions();
    render(<ArticlesTrashClient />);
    await waitFor(() => expect(screen.getByText("已删除文章")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getByTestId("purge-t1"));
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith("/api/articles/t1?permanent=true", {
        method: "DELETE",
      });
    });
    confirmSpy.mockRestore();
  });

  it("恢复时博客同步失败显示提示", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = typeof url === "string" ? url : "";
      if (u === "/api/articles?trashed=true" && method === "GET")
        return { ok: true, json: async () => trashedRows };
      if (u === "/api/articles/t1/restore" && method === "POST")
        return {
          ok: true,
          json: async () => ({
            restored: true,
            wpSynced: false,
            wpError: "WordPress 恢复失败（500）",
          }),
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ArticlesTrashClient />);
    await waitFor(() => expect(screen.getByText("已删除文章")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("restore-t1"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "博客同步失败：WordPress 恢复失败（500）",
      ),
    );
    confirmSpy.mockRestore();
  });
});
