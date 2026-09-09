import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { ImageTrashPageClient } from "./image-trash-page-client";

const localTrash = [
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

const remoteTrash = [
  {
    id: "acs/trash/r1.png",
    backend: "remote",
    url: "https://cdn.example.com/acs/trash/r1.png",
    size: 1024,
    deletedAt: "2026-09-06T09:00:00.000Z",
    expiresAt: "2026-09-20T09:00:00.000Z",
    daysLeft: 12,
  },
];

function baseResponses(overrides: { remoteEnabled?: boolean } = {}) {
  const res = (body: unknown, ok = true) => ({ ok, json: async () => body });
  return async (url: string, init?: RequestInit) => {
    if (url === "/api/uploads/trash" && (init?.method ?? "GET") === "GET") return res(localTrash);
    if (url === "/api/storage/images/trash" && (init?.method ?? "GET") === "GET")
      return res({
        enabled: overrides.remoteEnabled ?? false,
        name: "缤纷云",
        images: (overrides.remoteEnabled ?? false) ? remoteTrash : [],
      });
    return res({ error: "未知请求" }, false);
  };
}

/** 取勾选框所在卡片容器（点击即切换选中） */
function cardOf(testId: string): HTMLElement {
  return screen.getByTestId(testId).closest("div") as HTMLElement;
}

describe("ImageTrashPageClient（独立回收站页）", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
  });

  it("渲染本地回收站条目与剩余天数", async () => {
    fetchMock.mockImplementation(baseResponses());
    render(<ImageTrashPageClient />);
    await waitFor(() => expect(screen.getAllByTestId("trash-image")).toHaveLength(1));
    expect(screen.getByText("12 天后自动清除")).toBeInTheDocument();
  });

  it("云端启用时渲染云端回收站区", async () => {
    fetchMock.mockImplementation(baseResponses({ remoteEnabled: true }));
    render(<ImageTrashPageClient />);
    await waitFor(() => expect(screen.getAllByTestId("remote-trash-image")).toHaveLength(1));
    expect(screen.getByText(/云端图片回收站（缤纷云）/)).toBeInTheDocument();
  });

  it("恢复：点击卡片选中 → 批量恢复 POST op+names 后刷新", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads/trash" && init?.method === "POST") {
        return { ok: true, json: async () => ({ results: [{ id: "t1.png", ok: true }] }) };
      }
      return baseResponses()(url, init);
    });
    render(<ImageTrashPageClient />);
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
    await waitFor(() => expect(screen.getByTestId("trash-hint")).toHaveTextContent("批量恢复成功"));
    confirmSpy.mockRestore();
  });

  it("单张彻底删除：确认后 POST op=purge", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads/trash" && init?.method === "POST") {
        return { ok: true, json: async () => ({ results: [{ id: "t1.png", ok: true }] }) };
      }
      return baseResponses()(url, init);
    });
    render(<ImageTrashPageClient />);
    await waitFor(() => expect(screen.getAllByTestId("trash-image")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("trash-purge-t1.png"));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          c[0] === "/api/uploads/trash" && (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(JSON.parse(String((call as [string, RequestInit])[1].body))).toEqual({
        op: "purge",
        names: ["t1.png"],
      });
    });
    confirmSpy.mockRestore();
  });

  it("云端恢复走 /api/storage/images/trash 批量 op", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/storage/images/trash" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ results: [{ id: "acs/trash/r1.png", ok: true }] }),
        };
      }
      return baseResponses({ remoteEnabled: true })(url, init);
    });
    render(<ImageTrashPageClient />);
    await waitFor(() => expect(screen.getAllByTestId("remote-trash-image")).toHaveLength(1));
    fireEvent.click(cardOf("select-acs/trash/r1.png"));
    fireEvent.click(screen.getByRole("button", { name: "批量恢复" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          c[0] === "/api/storage/images/trash" &&
          (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(JSON.parse(String((call as [string, RequestInit])[1].body))).toEqual({
        op: "restore",
        keys: ["acs/trash/r1.png"],
      });
    });
    confirmSpy.mockRestore();
  });
});
