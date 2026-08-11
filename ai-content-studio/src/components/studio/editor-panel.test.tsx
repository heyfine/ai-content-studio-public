import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useStudioStore } from "@/stores/studio-store";
import { EditorPanel } from "./editor-panel";

function resetStore() {
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
}

describe("EditorPanel", () => {
  beforeEach(() => {
    resetStore();
  });

  it("渲染标题输入、原文 textarea 与生成结果区域", () => {
    render(<EditorPanel />);
    expect(screen.getByLabelText("文章标题")).toBeInTheDocument();
    expect(screen.getByLabelText("原文")).toBeInTheDocument();
    expect(screen.getByText("生成结果")).toBeInTheDocument();
    expect(screen.getByTestId("generation-list")).toBeInTheDocument();
  });

  it("初始字数为 0 且生成结果为空态", () => {
    render(<EditorPanel />);
    expect(screen.getByText(/0 字符/)).toBeInTheDocument();
    expect(screen.getByText(/暂无生成结果/)).toBeInTheDocument();
  });

  it("输入标题更新 store", () => {
    render(<EditorPanel />);
    fireEvent.change(screen.getByLabelText("文章标题"), { target: { value: "我的文章" } });
    expect(useStudioStore.getState().title).toBe("我的文章");
  });

  it("输入原文更新 store 与字符计数", () => {
    render(<EditorPanel />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "一二三" } });
    expect(useStudioStore.getState().content).toBe("一二三");
    expect(screen.getByText(/3 字符/)).toBeInTheDocument();
  });

  it("生成结果条目展示 第N次/任务/时间 并渲染内容", () => {
    useStudioStore.setState({
      generations: [
        {
          id: "g1",
          task: "article_generate",
          index: 1,
          content: "# 生成的文章",
          createdAt: "14:32:05",
        },
        {
          id: "g2",
          task: "seo_analyze",
          index: 2,
          content: "SEO 分析结果",
          createdAt: "14:35:11",
        },
      ],
    });
    render(<EditorPanel />);
    expect(screen.getAllByTestId("generation-item")).toHaveLength(2);
    expect(screen.getByText("第1次 · 文章生成 · 14:32:05")).toBeInTheDocument();
    expect(screen.getByText("第2次 · SEO 分析 · 14:35:11")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("生成的文章");
    expect(screen.getByText("SEO 分析结果")).toBeInTheDocument();
  });

  it("清空按钮清空生成结果", () => {
    useStudioStore.setState({
      generations: [
        { id: "g1", task: "article_generate", index: 1, content: "x", createdAt: "14:32:05" },
      ],
    });
    render(<EditorPanel />);
    fireEvent.click(screen.getByLabelText("清空生成结果"));
    expect(useStudioStore.getState().generations).toEqual([]);
    expect(screen.getByText(/暂无生成结果/)).toBeInTheDocument();
  });

  it("「应用到原文」把生成内容写入 content", () => {
    useStudioStore.setState({
      content: "原文内容",
      generations: [
        { id: "g1", task: "article_generate", index: 1, content: "新生成", createdAt: "14:32:05" },
      ],
    });
    render(<EditorPanel />);
    fireEvent.click(screen.getByLabelText("应用到原文"));
    expect(useStudioStore.getState().content).toBe("新生成");
  });

  it("「复制」把生成内容写入剪贴板并提示已复制", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    useStudioStore.setState({
      generations: [
        {
          id: "g1",
          task: "article_generate",
          index: 1,
          content: "可复制内容",
          createdAt: "14:32:05",
        },
      ],
    });
    render(<EditorPanel />);
    fireEvent.click(screen.getByLabelText("复制生成结果"));
    expect(writeText).toHaveBeenCalledWith("可复制内容");
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });
});
