import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { type BatchGridEntry, ImageBatchGrid } from "./image-batch-grid";
import { dayKeyOf } from "./image-format";
import { ImageLibraryClient } from "./image-library-client";

/** 取勾选框所在卡片容器（点击即切换选中） */
function cardOf(testId: string): HTMLElement {
  return screen.getByTestId(testId).closest("div") as HTMLElement;
}

const localImages = [
  { name: "a.png", url: "/uploads/a.png", size: 2048, mtime: "2026-09-06T10:00:00.000Z" },
];

const remoteImages = [
  {
    key: "acs/r1.png",
    url: "https://cdn.example.com/acs/r1.png",
    size: 4096,
    mtime: "2026-09-07T09:00:00.000Z",
  },
  {
    key: "acs/r2.png",
    url: "https://cdn.example.com/acs/r2.png",
    size: 4096,
    mtime: "2026-09-05T18:00:00.000Z",
  },
  {
    key: "acs/r3.png",
    url: "https://cdn.example.com/acs/r3.png",
    size: 4096,
    mtime: "2026-09-06T01:00:00.000Z",
  },
];

const trashEntries = [
  {
    id: "t1.png",
    backend: "local",
    url: "/uploads/trash/t1.png",
    size: 512,
    deletedAt: "2026-09-06T10:00:00.000Z",
    expiresAt: "2026-09-20T10:00:00.000Z",
    daysLeft: 12,
  },
];

const articleGroups = [
  {
    articleId: "a1",
    title: "文章一",
    images: [{ src: "/uploads/a.png", local: true }],
  },
];

function baseResponses(
  overrides: {
    localImages?: typeof localImages;
    remoteImages?: typeof remoteImages;
    remoteEnabled?: boolean;
    trash?: typeof trashEntries;
  } = {},
) {
  const res = (body: unknown, ok = true) => ({ ok, json: async () => body });
  return async (url: string, init?: RequestInit) => {
    if (url === "/api/uploads" && (init?.method ?? "GET") === "GET")
      return res(overrides.localImages ?? localImages);
    if (url === "/api/uploads/article-images") return res(articleGroups);
    if (url === "/api/uploads/trash") return res(overrides.trash ?? trashEntries);
    if (url === "/api/storage/images")
      return res({
        enabled: overrides.remoteEnabled ?? false,
        name: "缤纷云",
        images: (overrides.remoteEnabled ?? false) ? (overrides.remoteImages ?? remoteImages) : [],
      });
    if (url === "/api/storage/images/trash") return res({ enabled: false, images: [] });
    return res({ error: "未知请求" }, false);
  };
}

describe("ImageLibraryClient 多选与批量", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
  });

  it("默认渲染网格与单张操作按钮；未选中时无批量条", async () => {
    fetchMock.mockImplementation(baseResponses());
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    expect(screen.queryByTestId("batch-bar-local-image")).not.toBeInTheDocument();
  });

  it("点击图片直接选中，无需进入多选模式；连续点选多张累积，再点取消", async () => {
    fetchMock.mockImplementation(
      baseResponses({
        localImages: [
          ...localImages,
          { name: "b.png", url: "/uploads/b.png", size: 1, mtime: "2026-09-06T11:00:00.000Z" },
        ],
      }),
    );
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(2));
    // 点击卡片本体即选中（勾选框所在卡片容器）
    fireEvent.click(cardOf("select-a.png"));
    expect(screen.getByTestId("batch-bar-local-image")).toBeInTheDocument();
    expect(screen.getByTestId("selection-count")).toHaveTextContent("已选 1");
    fireEvent.click(cardOf("select-b.png"));
    expect(screen.getByTestId("selection-count")).toHaveTextContent("已选 2");
    // 再点已选中的卡片 → 取消选中
    fireEvent.click(cardOf("select-a.png"));
    expect(screen.getByTestId("selection-count")).toHaveTextContent("已选 1");
  });

  it("卡片上的操作按钮不触发卡片选中切换", async () => {
    fetchMock.mockImplementation(baseResponses());
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("copy-a.png"));
    expect(screen.queryByTestId("batch-bar-local-image")).not.toBeInTheDocument();
  });

  it("批量条有「取消选择」一键清空", async () => {
    fetchMock.mockImplementation(baseResponses());
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    fireEvent.click(cardOf("select-a.png"));
    expect(screen.getByTestId("batch-bar-local-image")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("batch-clear-local-image"));
    expect(screen.queryByTestId("batch-bar-local-image")).not.toBeInTheDocument();
  });

  it("批量删除本地图片：确认后 POST batch-delete 并刷新", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads/batch-delete" && init?.method === "POST") {
        return { ok: true, json: async () => ({ results: [{ id: "a.png", ok: true }] }) };
      }
      return baseResponses()(url, init);
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(1));
    fireEvent.click(cardOf("select-a.png"));
    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/uploads/batch-delete");
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call as [string, RequestInit])[1].body))).toEqual({
        names: ["a.png"],
      });
    });
    await waitFor(() => expect(screen.getByTestId("copy-hint")).toHaveTextContent("批量删除成功"));
    confirmSpy.mockRestore();
  });

  it("批量部分失败：显示成功/失败计数", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads/batch-delete" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            results: [
              { id: "a.png", ok: true },
              { id: "b.png", ok: false, error: "不存在" },
            ],
          }),
        };
      }
      return baseResponses({
        localImages: [
          ...localImages,
          { name: "b.png", url: "/uploads/b.png", size: 1, mtime: "2026-09-06T11:00:00.000Z" },
        ],
      })(url, init);
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("local-image")).toHaveLength(2));
    fireEvent.click(cardOf("select-a.png"));
    fireEvent.click(cardOf("select-b.png"));
    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/成功 1 张，失败 1 张/),
    );
    confirmSpy.mockRestore();
  });

  it("回收站批量恢复/彻底删除走 POST op+names", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads/trash" && init?.method === "POST") {
        return { ok: true, json: async () => ({ results: [{ id: "t1.png", ok: true }] }) };
      }
      return baseResponses()(url, init);
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("trash-image")).toHaveLength(1));
    fireEvent.click(cardOf("select-t1.png"));
    fireEvent.click(screen.getByRole("button", { name: "批量恢复" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          c[0] === "/api/uploads/trash" && (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(JSON.parse(String((call as [string, RequestInit])[1].body))).toEqual({
        op: "restore",
        names: ["t1.png"],
      });
    });
    confirmSpy.mockRestore();
  });

  it("云端图片按日相册分组渲染", async () => {
    fetchMock.mockImplementation(baseResponses({ remoteEnabled: true }));
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("remote-image")).toHaveLength(3));
    const dayHeaders = screen.getAllByTestId("album-day");
    // 09-07 1 张 + 09-05 2 张 → 2 个相册日
    expect(dayHeaders).toHaveLength(2);
    expect(dayHeaders[0].textContent).toContain("2026-09-07");
    expect(dayHeaders[1].textContent).toContain("2026-09-06");
  });

  it("云端批量删除走 /api/storage/images/batch-delete", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/storage/images/batch-delete" && init?.method === "POST") {
        return { ok: true, json: async () => ({ results: [{ id: "acs/r1.png", ok: true }] }) };
      }
      return baseResponses({ remoteEnabled: true })(url, init);
    });
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("remote-image")).toHaveLength(3));
    fireEvent.click(cardOf("select-acs/r1.png"));
    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/storage/images/batch-delete");
      expect(JSON.parse(String((call as [string, RequestInit])[1].body))).toEqual({
        keys: ["acs/r1.png"],
      });
    });
    confirmSpy.mockRestore();
  });

  it("相册组头「全选/取消全选」一键切换当天照片", async () => {
    fetchMock.mockImplementation(baseResponses({ remoteEnabled: true }));
    render(<ImageLibraryClient />);
    await waitFor(() => expect(screen.getAllByTestId("remote-image")).toHaveLength(3));
    // 两个相册日：09-07（1 张）、09-06（2 张）
    fireEvent.click(screen.getByTestId("album-select-2026-09-06"));
    expect(screen.getByTestId("selection-count")).toHaveTextContent("已选 2");
    // 再点 → 取消全选
    fireEvent.click(screen.getByTestId("album-select-2026-09-06"));
    expect(screen.queryByTestId("selection-count")).not.toBeInTheDocument();
    // 全选按钮（批量条内）仍可用：组全选后点批量条「全选」补齐另一天
    fireEvent.click(screen.getByTestId("album-select-2026-09-06"));
    fireEvent.click(screen.getByTestId("album-select-2026-09-07"));
    expect(screen.getByTestId("selection-count")).toHaveTextContent("已选 3");
  });
});

describe("dayKeyOf（北京墙钟日分组）", () => {
  it("按北京墙钟取日、非法输入返回 null", () => {
    // UTC 2026-09-05T18:00 = 北京 09-06 凌晨
    expect(dayKeyOf("2026-09-05T18:00:00.000Z")).toBe("2026-09-06");
    expect(dayKeyOf("2026-09-07T09:00:00.000Z")).toBe("2026-09-07");
    expect(dayKeyOf("not-a-date")).toBeNull();
  });
});

describe("ImageBatchGrid 相册分组渲染", () => {
  const entries: BatchGridEntry[] = [
    { id: "1.png", url: "/u/1.png", alt: "1", caption: null, dayLabel: "2026-09-07" },
    { id: "2.png", url: "/u/2.png", alt: "2", caption: null, dayLabel: "2026-09-05" },
    { id: "3.png", url: "/u/3.png", alt: "3", caption: null, dayLabel: "2026-09-05" },
  ];

  function noopSelection() {}
  function noopAction() {}

  it("同日归组、组头带数量", () => {
    render(
      <ImageBatchGrid
        title="云端图片"
        count={3}
        entries={entries}
        emptyText=""
        selectedIds={[]}
        onSelectionChange={noopSelection}
        batchActions={[{ label: "批量删除", onClick: noopAction }]}
        gridTestId="grid"
        itemTestIdPrefix="item"
      />,
    );
    const headers = screen.getAllByTestId("album-day");
    expect(headers).toHaveLength(2);
    expect(headers[0].textContent).toContain("2026-09-07");
    expect(headers[1].textContent).toContain("（2 张）");
  });

  it("无 dayLabel 不渲染相册头", () => {
    render(
      <ImageBatchGrid
        title="本地图片"
        count={1}
        entries={[{ id: "x.png", url: "/u/x.png", alt: "x", caption: null }]}
        emptyText=""
        selectedIds={[]}
        onSelectionChange={noopSelection}
        batchActions={[]}
        gridTestId="grid"
        itemTestIdPrefix="item"
      />,
    );
    expect(screen.queryByTestId("album-day")).not.toBeInTheDocument();
    expect(screen.getByTestId("grid")).toBeInTheDocument();
  });
});
