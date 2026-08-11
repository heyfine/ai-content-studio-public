import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { useStudioStore } from "@/stores/studio-store";
import { StudioLayout } from "./studio-layout";

describe("StudioLayout", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    useStudioStore.setState({
      title: "",
      content: "",
      messages: [],
      generations: [],
      selectedTask: "article_generate",
      lastPromptByTask: {},
      isGenerating: false,
      error: null,
      articleId: null,
      articleStatus: null,
    });
  });

  it("渲染三栏：对话 / 编辑 / 侧栏", async () => {
    render(<StudioLayout />);
    expect(screen.getByTestId("ai-chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("editor-panel")).toBeInTheDocument();
    expect(screen.getByTestId("studio-sidebar")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("AI 操作")).toBeInTheDocument());
  });
});
