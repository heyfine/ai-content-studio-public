import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

// Dialog 直接渲染内容（永久可见）；Select 用原生 select
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: () => null,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (v: string | null) => void;
  }) => (
    <select data-testid="type-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="OPENAI">OpenAI 官方</option>
      <option value="OPENAI_COMPATIBLE">OpenAI 兼容</option>
      <option value="ANTHROPIC">Anthropic (Claude)</option>
      <option value="GEMINI">Google Gemini</option>
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: (p: { value: string; children: React.ReactNode }) => (
    <option value={p.value}>{p.children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

import { ProvidersManager } from "./providers-manager";
import type { ProviderRow } from "./provider-types";

const rows: ProviderRow[] = [
  {
    id: "p1",
    name: "DeepSeek",
    type: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.deepseek.com",
    enabled: true,
    models: [
      { id: "m1", name: "deepseek-chat", displayName: "deepseek-chat" },
      { id: "m2", name: "deepseek-reasoner", displayName: "deepseek-reasoner" },
    ],
  },
  {
    id: "p2",
    name: "空模型",
    type: "OPENAI",
    baseUrl: null,
    enabled: false,
    models: [],
  },
];

function lastBody(url: string): Record<string, unknown> {
  const calls = fetchMock.mock.calls.filter((c) => String(c[0]) === url);
  return JSON.parse(calls[calls.length - 1][1].body);
}

describe("ProvidersManager", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("加载失败显示错误", async () => {
    fetchMock.mockRejectedValue(new Error("503"));
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("503"));
  });

  it("空列表显示引导文案", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByText(/还没有供应商/)).toBeInTheDocument());
  });

  it("渲染行：名称/类型/模型/启停状态", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => rows });
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByText("DeepSeek")).toBeInTheDocument());
    expect(screen.getByText("deepseek-chat, deepseek-reasoner")).toBeInTheDocument();
    const row1 = screen.getByText("DeepSeek").closest("tr") as HTMLElement;
    const row2 = screen.getByText("空模型").closest("tr") as HTMLElement;
    expect(within(row1).getByText("启用")).toBeInTheDocument();
    expect(within(row2).getByText("停用")).toBeInTheDocument();
    expect(screen.getByText(/连通测试 \(2 个模型\)/)).toBeInTheDocument();
  });

  it("启停切换发送 PUT enabled 取反", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (String(url) === "/api/providers" && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ ok: true, json: async () => rows });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByText("DeepSeek")).toBeInTheDocument());
    const row = screen.getByText("DeepSeek").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "停用" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody("/api/providers/p1").enabled).toBe(false);
  });

  it("删除需确认并调 DELETE", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (String(url) === "/api/providers" && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ ok: true, json: async () => rows });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByText("DeepSeek")).toBeInTheDocument());
    const row = screen.getByText("DeepSeek").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("DeepSeek"));
    const deleteCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]) === "/api/providers/p1" && c[1]?.method === "DELETE",
    );
    expect(deleteCalls.length).toBe(1);
  });

  it("复制供应商：取回 Key 并以「副本」名打开新建表单", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (String(url) === "/api/providers" && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ ok: true, json: async () => rows });
      }
      if (String(url) === "/api/providers/p1") {
        return Promise.resolve({ ok: true, json: async () => ({ apiKey: "sk-copy" }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByText("DeepSeek")).toBeInTheDocument());
    const row = screen.getByText("DeepSeek").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "复制" }));
    await waitFor(() =>
      expect(screen.getByTestId("api-key-input")).toHaveValue("sk-copy"),
    );
    expect(screen.getByLabelText("名称")).toHaveValue("DeepSeek 副本");
    // 弹窗标题为「新建供应商」（h2），区别于右上角同文案按钮
    expect(screen.getByRole("heading", { name: "新建供应商" })).toBeInTheDocument();
  });

  it("整渠道连通测试：显示进度与逐模型结果", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (String(url) === "/api/providers" && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ ok: true, json: async () => rows });
      }
      if (String(url).includes("/api/providers/test-model")) {
        const body = JSON.parse(String(options?.body));
        return Promise.resolve({
          ok: true,
          json: async () =>
            body.model === "deepseek-chat"
              ? { ok: true, latencyMs: 88 }
              : { ok: false, error: "超时" },
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByText("DeepSeek")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("test-channel-p1"));
    await waitFor(() => expect(screen.getByText("✓ 88ms")).toBeInTheDocument());
    expect(screen.getByText(/✗ 超时/)).toBeInTheDocument();
    expect(screen.getByText("可用 1 / 2")).toBeInTheDocument();
    // 探测只传 providerId + model，Key 走库存
    const body = lastBody("/api/providers/test-model");
    expect(body.providerId).toBe("p1");
    expect(Object.prototype.hasOwnProperty.call(body, "apiKey")).toBe(false);
  });

  it("无模型渠道测试显示未配置提示", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => rows });
    render(<ProvidersManager />);
    await waitFor(() => expect(screen.getByText("空模型")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("test-channel-p2"));
    await waitFor(() =>
      expect(screen.getByText("✗ 未配置任何模型")).toBeInTheDocument(),
    );
  });
});
