import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { VersionHistoryDialog } from "./version-history-dialog";

const sampleVersions = [
  { id: "v1", title: "T", source: "save", size: 2048, createdAt: "2026-09-06T10:00:00.000Z" },
  { id: "v2", title: "T", source: "refresh", size: 512, createdAt: "2026-09-05T09:00:00.000Z" },
];

describe("VersionHistoryDialog", () => {
  beforeEach(() => fetchMock.mockReset());

  it("加载并渲染版本列表（时间/来源/大小）", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleVersions });
    render(<VersionHistoryDialog articleId="a1" onClose={() => {}} onRestored={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId("version-row")).toHaveLength(2));
    expect(screen.getByText("2026-09-06 10:00")).toBeInTheDocument();
    expect(screen.getByText("编辑保存")).toBeInTheDocument();
    expect(screen.getByText("AI 刷新")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("无版本时显示空提示", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<VersionHistoryDialog articleId="a1" onClose={() => {}} onRestored={() => {}} />);
    await waitFor(() => expect(screen.getByText(/还没有历史版本/)).toBeInTheDocument());
  });

  it("预览：拉取版本详情并显示正文", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/articles/a1/versions")
        return { ok: true, json: async () => sampleVersions };
      if (url === "/api/articles/a1/versions/v1")
        return {
          ok: true,
          json: async () => ({ ...sampleVersions[0], content: "# 旧正文内容", contentMd: null }),
        };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<VersionHistoryDialog articleId="a1" onClose={() => {}} onRestored={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId("version-row")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("version-preview-v1"));
    await waitFor(() => expect(screen.getByTestId("version-preview")).toBeInTheDocument());
    expect(screen.getByText(/旧正文内容/)).toBeInTheDocument();
  });

  it("确认后恢复版本并回调 onRestored", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onRestored = vi.fn();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/articles/a1/versions")
        return { ok: true, json: async () => sampleVersions };
      if (url === "/api/articles/a1/versions/v1/restore" && init?.method === "POST")
        return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<VersionHistoryDialog articleId="a1" onClose={() => {}} onRestored={onRestored} />);
    await waitFor(() => expect(screen.getAllByTestId("version-row")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("version-restore-v1"));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("当前内容会自动存档"));
    confirmSpy.mockRestore();
  });

  it("确认后删除版本并刷新列表", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/articles/a1/versions" && method === "GET")
        return { ok: true, json: async () => sampleVersions };
      if (url === "/api/articles/a1/versions/v1" && method === "DELETE")
        return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<VersionHistoryDialog articleId="a1" onClose={() => {}} onRestored={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId("version-row")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("version-delete-v1"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/articles/a1/versions/v1", {
        method: "DELETE",
      });
    });
    confirmSpy.mockRestore();
  });
});
