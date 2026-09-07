import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { ImageLibraryClient } from "./image-library-client";

const localImages = [
  { name: "a.png", url: "/uploads/a.png", size: 2048, mtime: "2026-09-06T10:00:00.000Z" },
];

const articleGroups = [
  {
    articleId: "a1",
    title: "文章一",
    images: [
      { src: "/uploads/a.png", local: true },
      { src: "https://cdn.example.com/x.jpg", local: false },
    ],
  },
];

describe("ImageLibraryClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
  });

  it("加载并渲染本地图片与文章图片", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/uploads") return { ok: true, json: async () => localImages };
      if (url === "/api/uploads/article-images")
        return { ok: true, json: async () => articleGroups };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    expect(screen.getAllByTestId("article-image")).toHaveLength(2);
    expect(screen.getByText("文章一")).toBeInTheDocument();
    expect(screen.getByText("外部链接")).toBeInTheDocument();
    expect(screen.getByText("本地图片库")).toBeInTheDocument();
  });

  it("选择文件触发上传并刷新列表", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads") return { ok: true, json: async () => [] };
      if (url === "/api/uploads/article-images") return { ok: true, json: async () => [] };
      if (url === "/api/uploads/image" && init?.method === "POST")
        return { ok: true, json: async () => ({ url: "/uploads/new.png" }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getByTestId("image-upload-btn")).toBeInTheDocument());
    const input = screen.getByTestId("image-upload-input");
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/uploads/image");
      expect(call).toBeTruthy();
      expect((call?.[1] as RequestInit).method).toBe("POST");
    });
  });

  it("复制链接调用剪贴板", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/uploads") return { ok: true, json: async () => localImages };
      if (url === "/api/uploads/article-images") return { ok: true, json: async () => [] };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("copy-a.png"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/uploads/a.png`),
    );
  });

  it("确认后删除本地图片", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads" && (init?.method ?? "GET") === "GET")
        return { ok: true, json: async () => localImages };
      if (url === "/api/uploads/article-images") return { ok: true, json: async () => [] };
      if (url === "/api/uploads/a.png" && init?.method === "DELETE")
        return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("delete-a.png"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/uploads/a.png", { method: "DELETE" }),
    );
    confirmSpy.mockRestore();
  });

  it("外部文章图可转存到本地", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads") return { ok: true, json: async () => [] };
      if (url === "/api/uploads/article-images")
        return { ok: true, json: async () => articleGroups };
      if (url === "/api/uploads/import" && init?.method === "POST")
        return { ok: true, json: async () => ({ url: "/uploads/imported.jpg" }) };
      return { ok: false, json: async () => ({ error: "未知请求" }) };
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("article-image")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("import-a1"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/uploads/import",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("copy-hint")).toHaveTextContent("已转存到本地图片库"),
    );
  });
});
