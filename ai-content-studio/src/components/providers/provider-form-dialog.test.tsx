import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

// Dialog 直接渲染内容（永久可见），Select 用原生 select
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
    <select data-testid="type-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="OPENAI">OpenAI 官方</option>
      <option value="OPENAI_COMPATIBLE">OpenAI 兼容</option>
      <option value="ANTHROPIC">Anthropic</option>
      <option value="GEMINI">Gemini</option>
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

function fillForm() {
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "DeepSeek" } });
  fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: "sk-1" } });
}

describe("ProviderFormDialog", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("无 initialValues 时显示添加标题", () => {
    render(<ProviderFormDialog trigger={<button type="button">trigger</button>} />);
    expect(screen.getByText("添加供应商")).toBeInTheDocument();
  });

  it("有 initialValues.id 时显示编辑标题", () => {
    render(
      <ProviderFormDialog
        trigger={<button type="button">trigger</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
      />,
    );
    expect(screen.getByText("编辑供应商")).toBeInTheDocument();
  });

  it("类型为 OPENAI_COMPATIBLE 时显示 Base URL 必填", () => {
    render(<ProviderFormDialog trigger={<button type="button">t</button>} />);
    // 默认 type=OPENAI_COMPATIBLE，应显示 baseUrl label 含 必填
    expect(screen.getByText(/Base URL（必填）/)).toBeInTheDocument();
  });

  it("切换到 ANTHROPIC 时不显示 Base URL 区域", () => {
    render(<ProviderFormDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByTestId("type-select"), { target: { value: "ANTHROPIC" } });
    expect(screen.queryByText(/Base URL/)).not.toBeInTheDocument();
  });

  it("切换到 OPENAI 时显示 Base URL 可留空", () => {
    render(<ProviderFormDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByTestId("type-select"), { target: { value: "OPENAI" } });
    expect(screen.getByText(/Base URL.*可留空/)).toBeInTheDocument();
  });

  it("新增提交成功调用 POST 并触发 onSaved", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new" }) });
    const onSaved = vi.fn();
    render(<ProviderFormDialog trigger={<button type="button">t</button>} onSaved={onSaved} />);
    fillForm();
    fireEvent.change(screen.getByTestId("type-select"), { target: { value: "OPENAI_COMPATIBLE" } });
    fireEvent.change(screen.getByLabelText(/Base URL/), { target: { value: "https://api.x.com" } });
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/providers",
        expect.objectContaining({ method: "POST" }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("编辑提交成功调用 PUT", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <ProviderFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
        onSaved={vi.fn()}
      />,
    );
    fillForm();
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/providers/p1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("提交失败显示错误信息", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <ProviderFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
        onSaved={vi.fn()}
      />,
    );
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    // zod 校验失败时（apiKey 空）提交会显示错误
    const saveBtn = screen.getByText("保存");
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      // 至少有一个校验错误
      expect(alerts.length).toBeGreaterThan(0);
    });
  });
});
