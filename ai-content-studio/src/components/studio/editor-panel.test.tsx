import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useStudioStore } from "@/stores/studio-store";
import { EditorPanel } from "./editor-panel";

describe("EditorPanel", () => {
  beforeEach(() => {
    useStudioStore.setState({
      title: "",
      content: "",
      messages: [],
      selectedTask: "article_generate",
      selectedPromptId: null,
      isGenerating: false,
      error: null,
      articleId: null,
      articleStatus: null,
    });
  });

  it("渲染标题输入与正文 textarea", () => {
    render(<EditorPanel />);
    expect(screen.getByLabelText("文章标题")).toBeInTheDocument();
    expect(screen.getByLabelText("文章正文")).toBeInTheDocument();
    expect(screen.getByText(/字符/)).toBeInTheDocument();
  });

  it("初始字数为 0", () => {
    render(<EditorPanel />);
    expect(screen.getByText(/0 字符/)).toBeInTheDocument();
  });

  it("输入标题更新 store", () => {
    render(<EditorPanel />);
    fireEvent.change(screen.getByLabelText("文章标题"), { target: { value: "我的文章" } });
    expect(useStudioStore.getState().title).toBe("我的文章");
  });

  it("输入正文更新 store 与字符计数", () => {
    render(<EditorPanel />);
    fireEvent.change(screen.getByLabelText("文章正文"), { target: { value: "一二三" } });
    expect(useStudioStore.getState().content).toBe("一二三");
    expect(screen.getByText(/3 字符/)).toBeInTheDocument();
  });

  it("预览模式隐藏 textarea，渲染 Markdown 正文", () => {
    useStudioStore.setState({ content: "# 预览标题" });
    render(<EditorPanel />);
    fireEvent.click(screen.getByLabelText("预览模式"));
    expect(screen.queryByLabelText("文章正文")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("预览标题");
    expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
  });

  it("分屏模式同时显示编辑与预览,编辑实时同步预览", () => {
    useStudioStore.setState({ content: "# 旧" });
    render(<EditorPanel />);
    fireEvent.click(screen.getByLabelText("分屏模式"));
    expect(screen.getByLabelText("文章正文")).toBeInTheDocument();
    expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
    // 编辑同步预览
    fireEvent.change(screen.getByLabelText("文章正文"), { target: { value: "# 新内容" } });
    expect(useStudioStore.getState().content).toBe("# 新内容");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("新内容");
  });

  it("可来回切换模式且 aria-pressed 正确", () => {
    render(<EditorPanel />);
    const edit = screen.getByLabelText("编辑模式");
    const split = screen.getByLabelText("分屏模式");
    const preview = screen.getByLabelText("预览模式");
    expect(edit).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("预览模式"));
    expect(preview).toHaveAttribute("aria-pressed", "true");
    expect(edit).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByLabelText("编辑模式"));
    expect(edit).toHaveAttribute("aria-pressed", "true");
  });
});
