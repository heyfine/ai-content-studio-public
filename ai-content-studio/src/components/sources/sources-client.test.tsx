import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-open={open ? "true" : "false"}>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

import { SourcesClient } from "./sources-client";

function mkRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    url: "https://example.com/a",
    canonicalUrl: "https://example.com/a",
    domain: "example.com",
    title: `标题${id}`,
    fetchStatus: "parsed",
    httpStatus: 200,
    contentHash: "h",
    wordCount: 100,
    robotsStatus: "allowed",
    createdAt: "2026-08-12T00:00:00Z",
    updatedAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("SourcesClient", () => {
  it("加载并渲染来源列表", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [mkRow("1"), mkRow("2", { title: "标题2", wordCount: 50 })],
    } as Response);
    render(<SourcesClient />);
    await waitFor(() => expect(screen.getByText("标题1")).toBeInTheDocument());
    expect(screen.getByText("标题2")).toBeInTheDocument();
    expect(screen.getByTestId("status-1").textContent).toBe("parsed");
  });

  it("加载失败显示错误与重试", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);
    render(<SourcesClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toContain("加载失败");
  });

  it("添加来源：输入 URL → POST → 显示已新建", async () => {
    // 列表加载（空）
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);
    render(<SourcesClient />);
    await waitFor(() => expect(screen.getByText("暂无来源", { exact: false })).toBeInTheDocument());
    // 打开对话框
    fireEvent.click(screen.getByTestId("add-source-btn"));
    fireEvent.change(screen.getByTestId("src-url-input"), {
      target: { value: "https://example.com/x" },
    });
    // POST 新建
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        source: { id: "n1" },
        created: true,
        versionBumped: true,
        versionNumber: 1,
      }),
    } as Response);
    // 列表刷新
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [mkRow("n1")] } as Response);
    fireEvent.click(screen.getByTestId("submit-source"));
    await waitFor(() =>
      expect(screen.getByTestId("ingest-msg").textContent).toContain("已新建并抓取"),
    );
  });

  it("点击详情：GET 详情 → 显示 normalizedContent", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [mkRow("1")] } as Response);
    render(<SourcesClient />);
    await waitFor(() => expect(screen.getByText("标题1")).toBeInTheDocument());
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mkRow("1"),
        normalizedContent: "这是正文内容示例。",
        fetchError: null,
        versions: [{ versionNumber: 1, contentHash: "h", createdAt: "x" }],
      }),
    } as Response);
    fireEvent.click(screen.getByTestId("detail-1"));
    await waitFor(() =>
      expect(screen.getByTestId("detail-content").textContent).toContain("这是正文内容"),
    );
  });

  it("删除来源：confirm 后 DELETE → 刷新列表", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [mkRow("1")] } as Response);
    render(<SourcesClient />);
    await waitFor(() => expect(screen.getByText("标题1")).toBeInTheDocument());
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "1" }) } as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);
    fireEvent.click(screen.getByTestId("delete-1"));
    await waitFor(() => expect(screen.getByText("暂无来源", { exact: false })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/sources/1", { method: "DELETE" });
  });
});
