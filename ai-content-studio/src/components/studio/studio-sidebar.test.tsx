import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { useStudioStore } from "@/stores/studio-store";
import { StudioSidebar } from "./studio-sidebar";

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

describe("StudioSidebar", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("渲染 6 个 AI 操作按钮 与 Prompt 模板选择", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByLabelText("选择 Prompt")).not.toBeDisabled());
    expect(screen.getByText("AI 操作")).toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((b) => b.dataset.action).length).toBe(6);
  });

  it("Prompt 列表加载后填充选项", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "p1", name: "技术文章", type: "article_write" }],
    });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("技术文章")).toBeInTheDocument());
  });

  it("选择 Prompt 更新 store", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "p1", name: "技术文章", type: "article_write" }],
    });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("技术文章")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择 Prompt"), { target: { value: "p1" } });
    expect(useStudioStore.getState().selectedPromptId).toBe("p1");
  });

  it("点击 AI 操作按钮调用 generate；article_generate 回填 content", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "p1", name: "x", type: "t" }],
    });
    resetStore({ title: "我的主题", content: "" });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: "生成的正文" }) });
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/generate",
        expect.objectContaining({
          body: expect.stringContaining("我的主题"),
        }),
      );
      expect(useStudioStore.getState().content).toBe("生成的正文");
    });
  });

  it("非 article/outline 任务不回填 content", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "p1", name: "x", type: "t" }],
    });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: "SEO 建议" }) });
    fireEvent.click(screen.getByTestId("seo_analyze"));
    await waitFor(() => expect(useStudioStore.getState().selectedTask).toBe("seo_analyze"));
    // content 不被改写
    expect(useStudioStore.getState().content).toBe("");
  });

  it("generate 失败写入 store error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "p1", name: "x", type: "t" }],
    });
    render(<StudioSidebar />);
    await waitFor(() => expect(screen.getByText("当前任务")).toBeInTheDocument());
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "路由未配置" }) });
    fireEvent.click(screen.getByTestId("article_generate"));
    await waitFor(() => expect(useStudioStore.getState().error).toBe("路由未配置"));
  });
});
