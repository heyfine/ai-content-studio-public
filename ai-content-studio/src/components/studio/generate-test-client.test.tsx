import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { taskRouteDefinitions } from "@/config/task-routes";

// 用原生 select 替换 base-ui Select，便于 jsdom 交互测试
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (v: string | null) => void;
  }) => (
    <select data-testid="mock-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">选择任务</option>
      {taskRouteDefinitions.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: (props: { value: string; children: React.ReactNode }) => (
    <option value={props.value}>{props.children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { GenerateTestClient } from "./generate-test-client";

function selectTaskAndInput(taskValue: string, inputValue: string) {
  fireEvent.change(screen.getByTestId("mock-select"), { target: { value: taskValue } });
  const textarea = screen.getByPlaceholderText("输入需要 AI 处理的文本…");
  fireEvent.change(textarea, { target: { value: inputValue } });
}

describe("GenerateTestClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("渲染任务选择区与输入区与生成按钮", () => {
    render(<GenerateTestClient />);
    expect(screen.getByText("AI 生成测试")).toBeInTheDocument();
    expect(screen.getByText("生成")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入需要 AI 处理的文本…")).toBeInTheDocument();
    expect(screen.getByTestId("mock-select")).toBeInTheDocument();
  });

  it("未选任务且无输入时生成按钮禁用", () => {
    render(<GenerateTestClient />);
    expect(screen.getByText("生成").closest("button")).toBeDisabled();
  });

  it("填写任务与内容后按钮可用且提交成功展示结果", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: "这是一篇 AI 文章",
        modelId: "m1",
        generationId: "gen-1",
        inputTokens: 10,
        outputTokens: 50,
      }),
    });
    render(<GenerateTestClient />);
    selectTaskAndInput("article_generate", "写一篇文章");

    const genButton = screen.getByText("生成").closest("button");
    expect(genButton).not.toBeDisabled();
    fireEvent.click(genButton!);

    await waitFor(() => expect(screen.getByText("这是一篇 AI 文章")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ task: "article_generate", input: "写一篇文章" }),
      }),
    );
    // token 信息
    expect(screen.getByText(/模型 m1 · 输入 10 \/ 输出 50 tokens/)).toBeInTheDocument();
  });

  it("API 返回非 ok 时显示错误信息", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "API Key 无效" }),
    });
    render(<GenerateTestClient />);
    selectTaskAndInput("summary", "摘要这个");
    fireEvent.click(screen.getByText("生成").closest("button")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("API Key 无效"));
  });

  it("网络异常时显示错误", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<GenerateTestClient />);
    selectTaskAndInput("translate", "翻译这个");
    fireEvent.click(screen.getByText("生成").closest("button")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("network down"));
  });

  it("生成中按钮显示加载状态", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<GenerateTestClient />);
    selectTaskAndInput("summary", "摘要");
    fireEvent.click(screen.getByText("生成").closest("button")!);

    await waitFor(() => expect(screen.getByText("生成中…")).toBeInTheDocument());
    expect(screen.getByText("生成中…").closest("button")).toBeDisabled();
  });
});
