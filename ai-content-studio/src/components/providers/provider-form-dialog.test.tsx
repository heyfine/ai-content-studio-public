import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

// Dialog 直接渲染内容（永久可见）；Select 用原生 select
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

import { ProviderFormDialog } from "./provider-form-dialog";
import type { ProviderFormTarget } from "./provider-types";

const editTarget: ProviderFormTarget = {
  id: "p1",
  name: "DeepSeek",
  type: "OPENAI_COMPATIBLE",
  baseUrl: "https://api.deepseek.com",
  enabled: true,
  models: [{ name: "deepseek-chat" }],
};

function lastBody(url: string): Record<string, unknown> {
  const calls = fetchMock.mock.calls.filter((c) => String(c[0]) === url);
  return JSON.parse(calls[calls.length - 1][1].body);
}

describe("ProviderFormDialog", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("新建标题与编辑标题", () => {
    const { rerender } = render(
      <ProviderFormDialog open onOpenChange={() => {}} target={null} />,
    );
    expect(screen.getByText("新建供应商")).toBeInTheDocument();
    rerender(<ProviderFormDialog open onOpenChange={() => {}} target={editTarget} />);
    expect(screen.getByText("编辑供应商")).toBeInTheDocument();
  });

  it("编辑时模型文本框初始化为已有模型", () => {
    render(<ProviderFormDialog open onOpenChange={() => {}} target={editTarget} />);
    expect(screen.getByTestId("models-textarea")).toHaveValue("deepseek-chat");
  });

  it("新建保存：POST 携带 apiKey 与模型列表", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "p2" }) });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(<ProviderFormDialog open onOpenChange={onOpenChange} target={null} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "DS" } });
    fireEvent.change(screen.getByLabelText(/Base URL/), { target: { value: "https://x" } });
    fireEvent.change(screen.getByTestId("api-key-input"), { target: { value: "sk-1" } });
    fireEvent.change(screen.getByTestId("models-textarea"), {
      target: { value: "deepseek-chat\n deepseek-chat \ndeepseek-reasoner" },
    });
    fireEvent.click(screen.getByTestId("save-provider"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const body = lastBody("/api/providers");
    expect(body.name).toBe("DS");
    expect(body.apiKey).toBe("sk-1");
    // 重复模型去重
    expect(body.models).toEqual([{ name: "deepseek-chat" }, { name: "deepseek-reasoner" }]);
    expect(onSaved).toHaveBeenCalled();
  });

  it("编辑保存：Key 留空表示不修改（payload 不含 apiKey）", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ProviderFormDialog open onOpenChange={() => {}} target={editTarget} />);
    fireEvent.click(screen.getByTestId("save-provider"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = lastBody("/api/providers/p1");
    expect(body.name).toBe("DeepSeek");
    expect(Object.prototype.hasOwnProperty.call(body, "apiKey")).toBe(false);
    expect(body.models).toEqual([{ name: "deepseek-chat" }]);
  });

  it("编辑时眼睛图标取回已保存 Key", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ apiKey: "sk-saved" }) });
    render(<ProviderFormDialog open onOpenChange={() => {}} target={editTarget} />);
    fireEvent.click(screen.getByTestId("toggle-reveal"));
    await waitFor(() =>
      expect(screen.getByTestId("api-key-input")).toHaveValue("sk-saved"),
    );
  });

  it("缺模型保存报错，不发请求", async () => {
    render(<ProviderFormDialog open onOpenChange={() => {}} target={null} />);
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "DS" } });
    fireEvent.change(screen.getByLabelText(/Base URL/), { target: { value: "https://x" } });
    fireEvent.click(screen.getByTestId("save-provider"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("至少填写一个支持的模型"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("获取模型 → 勾选 → 确定并入文本框", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/providers/fetch-models")) {
        return Promise.resolve({ ok: true, json: async () => ({ models: ["m1", "m2", "m3"] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(
      <ProviderFormDialog open onOpenChange={() => {}} target={null} />,
    );
    fireEvent.change(screen.getByLabelText(/Base URL/), { target: { value: "https://x" } });
    fireEvent.click(screen.getByTestId("fetch-models"));
    await waitFor(() => expect(screen.getByTestId("fetched-models-panel")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("选择模型 m1"));
    fireEvent.click(screen.getByLabelText("选择模型 m3"));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(screen.getByTestId("models-textarea")).toHaveValue("m1\nm3");
    expect(screen.queryByTestId("fetched-models-panel")).not.toBeInTheDocument();
  });

  it("面板内逐模型测试显示结果徽章", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (String(url).includes("/api/providers/test-model")) {
        const body = JSON.parse(String(options?.body));
        return Promise.resolve({
          ok: true,
          json: async () =>
            body.model === "m1" ? { ok: true, latencyMs: 123 } : { ok: false, error: "超时" },
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ models: ["m1", "m2"] }) });
    });
    render(<ProviderFormDialog open onOpenChange={() => {}} target={null} />);
    fireEvent.change(screen.getByLabelText(/Base URL/), { target: { value: "https://x" } });
    fireEvent.click(screen.getByTestId("fetch-models"));
    await waitFor(() => expect(screen.getByTestId("fetched-models-panel")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("测试模型 m1"));
    fireEvent.click(screen.getByLabelText("测试模型 m2"));
    await waitFor(() => expect(screen.getByText(/✓ 123ms/)).toBeInTheDocument());
    expect(screen.getByText(/✗ 超时/)).toBeInTheDocument();
  });

  it("保存失败显示后端错误", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "校验失败" }) });
    render(<ProviderFormDialog open onOpenChange={() => {}} target={editTarget} />);
    fireEvent.click(screen.getByTestId("save-provider"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("校验失败"));
  });
});
