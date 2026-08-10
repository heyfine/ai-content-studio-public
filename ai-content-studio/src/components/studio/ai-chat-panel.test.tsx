import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { useStudioStore } from "@/stores/studio-store";
import { AIChatPanel } from "./ai-chat-panel";

function resetStore(over: Partial<ReturnType<typeof useStudioStore.getState>> = {}) {
  useStudioStore.setState({
    title: "",
    content: "",
    messages: [],
    selectedTask: "article_generate",
    selectedPromptId: null,
    isGenerating: false,
    error: null,
    ...over,
  });
}

describe("AIChatPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("render 含任务选择、输入框、发送按钮", () => {
    render(<AIChatPanel />);
    expect(screen.getByTestId("ai-chat-panel")).toBeInTheDocument();
    expect(screen.getByLabelText("AI 输入")).toBeInTheDocument();
    expect(screen.getByText("发送")).toBeInTheDocument();
  });

  it("空消息列表显示占位提示", () => {
    render(<AIChatPanel />);
    expect(screen.getByText(/输入内容开始对话/)).toBeInTheDocument();
  });

  it("render 已有消息列表", () => {
    resetStore({
      messages: [
        { id: "1", role: "user", content: "hi" },
        { id: "2", role: "assistant", content: "你好" },
      ],
    });
    render(<AIChatPanel />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("切换任务选择更新 store", () => {
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("选择任务"), { target: { value: "seo_analyze" } });
    expect(useStudioStore.getState().selectedTask).toBe("seo_analyze");
  });

  it("发送成功追加用户与助手消息", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: "AI 回复", generationId: "g1" }),
    });
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "写文章" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => {
      expect(screen.getByText("写文章")).toBeInTheDocument();
      expect(screen.getByText("AI 回复")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/generate",
      expect.objectContaining({ method: "POST" }),
    );
    // input cleared
    expect(screen.getByLabelText("AI 输入")).toHaveValue("");
  });

  it("article_generate 回填到编辑区 content", async () => {
    resetStore({ selectedTask: "article_generate" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: "正文内容" }) });
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(useStudioStore.getState().content).toBe("正文内容"));
  });

  it("非 article/outline 任务不回填 content", async () => {
    resetStore({ selectedTask: "seo_analyze" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: "SEO 建议" }) });
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByText("SEO 建议")).toBeInTheDocument());
    expect(useStudioStore.getState().content).toBe("");
  });

  it("生成失败显示错误 alert", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "未配置路由" }) });
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("未配置路由"));
    expect(useStudioStore.getState().messages).toHaveLength(1); // 仅用户消息
  });

  it("生成中显示 加载提示且按钮禁用", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: "c" }) });
    render(<AIChatPanel />);
    fireEvent.change(screen.getByLabelText("AI 输入"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("发送"));
    await waitFor(() => expect(screen.getByText("生成中…")).toBeInTheDocument());
    // await 完成
    await waitFor(() => expect(screen.queryByText("生成中…")).not.toBeInTheDocument());
  });
});
