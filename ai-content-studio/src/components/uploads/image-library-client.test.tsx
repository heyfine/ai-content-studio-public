import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { ImageLibraryClient } from "./image-library-client";
import { ImageTrashSection, type TrashImageEntry } from "./image-trash-section";

const localImages = [
  { name: "a.png", url: "/uploads/a.png", size: 2048, mtime: "2026-09-06T10:00:00.000Z" },
];

const trashEntries: TrashImageEntry[] = [
  {
    id: "t1.png",
    backend: "local",
    url: "/uploads/trash/t1.png",
    size: 512,
    deletedAt: "2026-09-06T10:00:00.000Z",
    expiresAt: "2026-09-20T10:00:00.000Z",
    daysLeft: 12,
  },
  {
    id: "t2.png",
    backend: "local",
    url: "/uploads/trash/t2.png",
    size: 256,
    deletedAt: "2026-08-20T10:00:00.000Z",
    expiresAt: "2026-09-03T10:00:00.000Z",
    daysLeft: 0,
  },
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

const remoteImages = [
  {
    key: "acs/r.png",
    url: "https://cdn.example.com/acs/r.png",
    size: 4096,
    mtime: "2026-09-07T09:00:00.000Z",
  },
];

function mockResponses(overrides: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const res = (body: unknown, ok = true) => ({ ok, json: async () => body });
    if (url === "/api/uploads" && (init?.method ?? "GET") === "GET")
      return res(overrides.localImages ?? localImages);
    if (url === "/api/uploads/article-images") return res(overrides.articles ?? articleGroups);
    if (url === "/api/uploads/trash") return res(overrides.trash ?? trashEntries);
    if (url === "/api/storage/images")
      return res(overrides.storage ?? { enabled: false, images: [] });
    if (url === "/api/uploads/a.png" && init?.method === "DELETE") return res({ ok: true });
    return res({ error: "未知请求" }, false);
  });
}

describe("ImageLibraryClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
  });

  it("加载并渲染本地图片、回收站与文章图片", async () => {
    mockResponses();
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    expect(screen.getAllByTestId("article-image")).toHaveLength(2);
    expect(screen.getByText("文章一")).toBeInTheDocument();
    expect(screen.getByText("外部链接")).toBeInTheDocument();
    expect(screen.getByText("本地图片库")).toBeInTheDocument();
    // 回收站渲染：两条 + 剩余天数提示
    expect(screen.getAllByTestId("trash-image")).toHaveLength(2);
    expect(screen.getAllByTestId("trash-expires")).toHaveLength(2);
    expect(screen.getByText("12 天后自动清除")).toBeInTheDocument();
    expect(screen.getByText("即将自动清除")).toBeInTheDocument();
  });

  it("删除本地图片改为进回收站：DELETE 成功后刷新", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockResponses();
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("delete-a.png"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/uploads/a.png", { method: "DELETE" }),
    );
    confirmSpy.mockRestore();
  });

  it("回收站恢复：调 POST op=restore 并提示成功", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    mockResponses();
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("trash-image")).toHaveLength(2));
    // 只替换 POST 路径的处理，其余保持原 mock
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads/trash" && init?.method === "POST")
        return { ok: true, json: async () => ({ ok: true }) };
      const res = (body: unknown, ok = true) => ({ ok, json: async () => body });
      if (url === "/api/uploads") return res(localImages);
      if (url === "/api/uploads/article-images") return res(articleGroups);
      if (url === "/api/uploads/trash") return res(trashEntries);
      if (url === "/api/storage/images") return res({ enabled: false, images: [] });
      return res({ error: "未知请求" }, false);
    });
    fireEvent.click(screen.getByTestId("trash-restore-t1.png"));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          c[0] === "/api/uploads/trash" && (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeTruthy();
      const payload = JSON.parse(String((call as [string, RequestInit])[1].body));
      expect(payload).toEqual({ op: "restore", name: "t1.png" });
    });
    await waitFor(() => expect(screen.getByTestId("copy-hint")).toHaveTextContent("已恢复"));
    confirmSpy.mockRestore();
  });

  it("回收站彻底删除：确认后调 POST op=purge", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockResponses();
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("trash-image")).toHaveLength(2));
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads/trash" && init?.method === "POST")
        return { ok: true, json: async () => ({ ok: true }) };
      const res = (body: unknown, ok = true) => ({ ok, json: async () => body });
      if (url === "/api/uploads") return res(localImages);
      if (url === "/api/uploads/article-images") return res(articleGroups);
      if (url === "/api/uploads/trash") return res(trashEntries);
      if (url === "/api/storage/images") return res({ enabled: false, images: [] });
      return res({ error: "未知请求" }, false);
    });
    fireEvent.click(screen.getByTestId("trash-purge-t2.png"));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          c[0] === "/api/uploads/trash" && (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeTruthy();
      const payload = JSON.parse(String((call as [string, RequestInit])[1].body));
      expect(payload).toEqual({ op: "purge", name: "t2.png" });
    });
    confirmSpy.mockRestore();
  });

  it("上传入口仍然可用", async () => {
    mockResponses({ localImages: [], trash: [] });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getByTestId("image-upload-btn")).toBeInTheDocument());
    const input = screen.getByTestId("image-upload-input");
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/uploads/image");
      expect(call).toBeTruthy();
      expect((call as [string, RequestInit])[1].method).toBe("POST");
    });
  });

  it("启用对象存储时渲染云端图片区", async () => {
    mockResponses({ storage: { enabled: true, name: "缤纷云", images: remoteImages } });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getByText("云端图片（缤纷云）")).toBeInTheDocument());
    expect(screen.getByTestId("remote-image")).toBeInTheDocument();
  });

  it("云端列表接口失败不拖垮本地图片区", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/uploads") return { ok: true, json: async () => localImages };
      if (url === "/api/uploads/article-images") return { ok: true, json: async () => [] };
      if (url === "/api/uploads/trash") return { ok: true, json: async () => [] };
      return { ok: false, json: async () => ({ error: "boom" }) };
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    expect(screen.queryByTestId("remote-image")).not.toBeInTheDocument();
  });
});

describe("ImageTrashSection", () => {
  it("空回收站显示占位文案", () => {
    render(
      <ImageTrashSection title="回收站" entries={[]} onRestore={() => {}} onPurge={() => {}} />,
    );
    expect(screen.getByText("回收站是空的。")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "回收站（0）")).toBeInTheDocument();
  });

  it("剩余天数 ≤3 标红提示即将清除", () => {
    const entries: TrashImageEntry[] = [
      {
        id: "s.png",
        backend: "local",
        url: "/uploads/trash/s.png",
        size: 1,
        deletedAt: "2026-08-30T00:00:00.000Z",
        expiresAt: "2026-09-10T00:00:00.000Z",
        daysLeft: 2,
      },
    ];
    render(
      <ImageTrashSection
        title="回收站"
        entries={entries}
        onRestore={() => {}}
        onPurge={() => {}}
      />,
    );
    expect(screen.getByText("2 天后自动清除")).toBeInTheDocument();
  });
});
