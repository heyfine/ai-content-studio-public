import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

// mock Dialog 直接渲染 trigger+内容；Select 用原生 select
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
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (v: string | null) => void;
  }) => (
    <select data-testid="mock-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="OPENAI">o1</option>
      <option value="OPENAI_COMPATIBLE">o2</option>
      <option value="ANTHROPIC">o3</option>
      <option value="GEMINI">o4</option>
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: (p: { value: string; children: React.ReactNode }) => (
    <option value={p.value}>{p.children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

import { ProvidersTable } from "./providers-table";

describe("ProvidersTable", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("加载中显示 加载中…", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<ProvidersTable />);
    expect(screen.getByText("加载中…")).toBeInTheDocument();
  });

  it("加载失败显示错误 alert", async () => {
    fetchMock.mockRejectedValue(new Error("503"));
    render(<ProvidersTable />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("503"));
  });

  it("无数据时显示空提示", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<ProvidersTable />);
    await waitFor(() => expect(screen.getByText(/暂无供应商/)).toBeInTheDocument());
  });

  it("有数据时渲染表格行，含模型数与启用状态", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "p1",
          name: "DeepSeek",
          type: "OPENAI_COMPATIBLE",
          baseUrl: "x",
          apiKey: "k",
          enabled: true,
          models: [{ id: "m1" }],
        },
        {
          id: "p2",
          name: "Anthropic",
          type: "ANTHROPIC",
          baseUrl: null,
          apiKey: "k",
          enabled: false,
          models: [],
        },
      ],
    });
    render(<ProvidersTable />);
    await waitFor(() => expect(screen.getByText("DeepSeek")).toBeInTheDocument());
    expect(screen.getByText(/启/)).toBeInTheDocument();
    expect(screen.getByText(/禁/)).toBeInTheDocument();
  });

  it("确认删除后发送 DELETE 并刷新", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "p1",
          name: "DS",
          type: "OPENAI",
          baseUrl: null,
          apiKey: "k",
          enabled: true,
          models: [],
        },
      ],
    });
    render(<ProvidersTable />);
    await waitFor(() => expect(screen.getByText("DS")).toBeInTheDocument());
    const deleteBtn = screen.getByLabelText("删除");
    fetchMock.mockClear();
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith("/api/providers/p1", { method: "DELETE" });
    });
    confirmSpy.mockRestore();
  });

  it("取消删除不发送 DELETE", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "p1",
          name: "OK",
          type: "OPENAI",
          baseUrl: null,
          apiKey: "k",
          enabled: true,
          models: [],
        },
      ],
    });
    render(<ProvidersTable />);
    await waitFor(() => expect(screen.getByText("OK")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getByLabelText("删除"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
