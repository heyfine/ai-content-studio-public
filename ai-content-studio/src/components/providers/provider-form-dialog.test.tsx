import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

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
  fireEvent.change(screen.getByTestId("api-key-input"), { target: { value: "sk-1" } });
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

  it("提交校验失败显示错误信息", async () => {
    render(
      <ProviderFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.length).toBeGreaterThan(0);
    });
  });
});

describe("ProviderFormDialog API Key 眼睛/复制", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    writeTextMock.mockClear();
  });

  it("编辑场景点眼睛从库里拉取明文并显示为 text", async () => {
    render(
      <ProviderFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
        onSaved={vi.fn()}
      />,
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: "real-secret-key" }),
    });
    fireEvent.click(screen.getByTestId("toggle-reveal"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/providers/p1");
      const input = screen.getByTestId("api-key-input");
      expect(input).toHaveAttribute("type", "text");
      expect(input).toHaveValue("real-secret-key");
    });
  });

  it("再次点眼睛切换回隐藏（password）", async () => {
    render(
      <ProviderFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
        onSaved={vi.fn()}
      />,
    );
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ apiKey: "k" }) });
    fireEvent.click(screen.getByTestId("toggle-reveal"));
    await waitFor(() =>
      expect(screen.getByTestId("api-key-input")).toHaveAttribute("type", "text"),
    );
    fireEvent.click(screen.getByTestId("toggle-reveal"));
    expect(screen.getByTestId("api-key-input")).toHaveAttribute("type", "password");
  });

  it("复制按钮调用 navigator.clipboard.writeText 并提示已复制", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<ProviderFormDialog trigger={<button type="button">t</button>} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByTestId("api-key-input"), { target: { value: "sk-xyz" } });
    fireEvent.click(screen.getByTestId("copy-key"));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("sk-xyz");
      expect(screen.getByTestId("copied-tip")).toBeInTheDocument();
    });
  });
});

describe("ProviderFormDialog 占位密码", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("编辑场景 API Key 显示屏蔽占位（type=password、非空）", () => {
    render(
      <ProviderFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
        onSaved={vi.fn()}
      />,
    );
    const input = screen.getByTestId("api-key-input");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("UNCHANGED_KEY_PLACEHOLDER");
    expect(screen.queryByTestId("copied-tip")).not.toBeInTheDocument();
  });

  it("编辑场景占位 Key 提交时不传 apiKey（保持不变）", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <ProviderFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{ id: "p1", name: "DS", type: "OPENAI", baseUrl: "", enabled: true }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => c[0] === "/api/providers/p1");
      expect(calls.length).toBe(1);
      const body = JSON.parse((calls[0][1] as RequestInit).body as string);
      expect(body).not.toHaveProperty("apiKey");
    });
  });

  it("新建场景 API Key 为空、无占位", () => {
    render(<ProviderFormDialog trigger={<button type="button">t</button>} onSaved={vi.fn()} />);
    expect(screen.getByTestId("api-key-input")).toHaveValue("");
  });
});
