import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

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

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: () => null,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { RelayKeysClient } from "./relay-keys-client";

describe("RelayKeysClient", () => {
  beforeEach(() => fetchMock.mockReset());

  it("拉取并渲染列表", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "k1",
          name: "博客器",
          keyMasked: "sk-relay-aa••••",
          keyPrefix: "sk-relay-aa",
          enabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    render(<RelayKeysClient />);
    await waitFor(() => expect(screen.getByText("博客器")).toBeInTheDocument());
    expect(screen.getByTestId("relay-key-display")).toHaveTextContent("sk-relay-aa••••");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("列表为空时提示", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    render(<RelayKeysClient />);
    await waitFor(() => expect(screen.getByText(/暂无中转密钥/)).toBeInTheDocument());
  });

  it("拉取失败显示错误", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<RelayKeysClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("加载失败"));
  });

  it("删除前 confirm，确认后 DELETE 并刷新", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    // 首次拉取 + 删除后刷新
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "k1",
            name: "x",
            keyMasked: "m",
            keyPrefix: "p",
            enabled: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    render(<RelayKeysClient />);
    await waitFor(() => expect(screen.getByText("x")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("删除"));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find((c) => c[0] === "/api/relay-keys/k1");
      expect(deleteCall?.[1]).toMatchObject({ method: "DELETE" });
    });
    confirmSpy.mockRestore();
  });
});
