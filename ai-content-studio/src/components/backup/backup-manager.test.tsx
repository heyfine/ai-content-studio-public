import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { BackupManager } from "./backup-manager";

const domains = [
  { key: "prompts", label: "Prompt 模板", description: "提示词模板库", models: ["Prompt"] },
  { key: "articles", label: "文章", description: "文章与历史版本", models: ["Article"] },
];

const autoPayload = {
  settings: { enabled: false, webdavTargets: [] },
  status: {
    nextBackupAt: null,
    lastBackupAt: null,
    lastBackupStatus: null,
    lastBackupMessage: null,
  },
};

const backupFilePayload = {
  format: "acs-backup",
  formatVersion: 1,
  exportedAt: "2026-09-07T10:00:00.000Z",
  full: false,
  domains: ["prompts"],
  data: { Prompt: [{ id: "p1" }] },
};

function urlMock(url: string) {
  if (url === "/api/backup?domains=1")
    return Promise.resolve({ ok: true, json: async () => ({ domains }) });
  if (url === "/api/backup/auto")
    return Promise.resolve({ ok: true, json: async () => autoPayload });
  return Promise.resolve({ ok: false, json: async () => ({}) });
}

beforeEach(() => {
  fetchMock.mockReset();
  // 捕获下载 Blob 内容
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("BackupManager", () => {
  it("备份成功：下载的 JSON 是完整 BackupFile（非 undefined）", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url === "/api/backup") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ backup: backupFilePayload, totalRows: 1 }),
        });
      }
      return urlMock(url);
    });
    render(<BackupManager />);
    await waitFor(() => expect(screen.getByText("Prompt 模板")).toBeInTheDocument());

    // 先捕获 createObjectURL 的 Blob，再触发下载
    const clicks: Array<{ download: string }> = [];
    const originalCreate = document.createElement.bind(document);
    (document as unknown as { createElement: typeof document.createElement }).createElement = ((
      tag: string,
    ) => {
      if (tag === "a") {
        const anchor = {
          set href(_v: string) {},
          set download(v: string) {
            clicks.push({ download: v });
          },
          click: () => {},
        } as unknown as HTMLAnchorElement;
        return anchor;
      }
      return originalCreate(tag);
    }) as typeof document.createElement;

    fireEvent.click(screen.getByText("备份并下载"));
    await waitFor(() => expect(screen.getByText(/备份成功，共 1 行/)).toBeInTheDocument());

    // createObjectURL 收到的 Blob 内容应为完整 BackupFile（含 format 字段，而非 "undefined"）
    const createObj = globalThis.URL.createObjectURL as ReturnType<typeof vi.fn>;
    const blob = createObj.mock.calls[0][0] as Blob;
    const text = await blob.text();
    const parsed = JSON.parse(text) as { format?: string; exportedAt?: string };
    expect(parsed.format).toBe("acs-backup");
    expect(parsed.exportedAt).toBe("2026-09-07T10:00:00.000Z");
    expect(text).not.toBe("undefined");
    expect(clicks[0].download).toBe("acs-backup-2026-09-07T10-00-00-000Z.json");
  });
});
