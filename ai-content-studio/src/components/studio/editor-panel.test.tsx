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
});
