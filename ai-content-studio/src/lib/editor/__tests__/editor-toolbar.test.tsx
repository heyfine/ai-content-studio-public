import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { EditorToolbar } from "../components/editor-toolbar";

function makeChainMock() {
  const commands: Record<string, ReturnType<typeof vi.fn>> = {};
  const methodNames = [
    "focus",
    "toggleBold",
    "toggleItalic",
    "toggleStrike",
    "toggleUnderline",
    "setParagraph",
    "setHeading",
    "toggleBulletList",
    "toggleOrderedList",
    "toggleTaskList",
    "insertTable",
    "setCodeBlock",
    "setHorizontalRule",
    "insertContent",
    "setImage",
  ] as const;
  for (const name of methodNames) {
    commands[name] = vi.fn();
  }
  const chainObj = { run: vi.fn() };
  const chain = vi.fn(() => chainObj);
  const editor = {
    chain,
    isActive: vi.fn(() => false),
    isEditable: true,
    isFocused: false,
    view: { dom: null },
    commands,
  } as unknown as Parameters<typeof EditorToolbar>[0]["editor"];
  return { editor, commands, chain, chainObj };
}

describe("EditorToolbar", () => {
  it("editor 为 null 时不渲染", () => {
    const { container } = render(<EditorToolbar editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("渲染工具栏与核心按钮", () => {
    const { editor } = makeChainMock();
    render(<EditorToolbar editor={editor} />);
    expect(screen.getByTestId("editor-toolbar")).toBeInTheDocument();
    expect(screen.getByLabelText("加粗")).toBeInTheDocument();
    expect(screen.getByLabelText("标题 1")).toBeInTheDocument();
    expect(screen.getByLabelText("高亮块")).toBeInTheDocument();
    expect(screen.getByLabelText("表格")).toBeInTheDocument();
    expect(screen.getByLabelText("无序列表")).toBeInTheDocument();
  });

  it("点击加粗触发 toggleBold", () => {
    const m = makeChainMock();
    render(<EditorToolbar editor={m.editor} />);
    fireEvent.click(screen.getByLabelText("加粗"));
    expect(m.commands.toggleBold).toHaveBeenCalled();
  });

  it("点击标题 1 触发 setHeading level 1", () => {
    const m = makeChainMock();
    render(<EditorToolbar editor={m.editor} />);
    fireEvent.click(screen.getByLabelText("标题 1"));
    expect(m.commands.setHeading).toHaveBeenCalledWith({ level: 1 });
  });

  it("点击表格触发 insertTable", () => {
    const m = makeChainMock();
    render(<EditorToolbar editor={m.editor} />);
    fireEvent.click(screen.getByLabelText("表格"));
    expect(m.commands.insertTable).toHaveBeenCalledWith({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
    });
  });

  it("高亮块下拉 trigger 渲染", () => {
    const m = makeChainMock();
    render(<EditorToolbar editor={m.editor} />);
    expect(screen.getByLabelText("高亮块")).toBeInTheDocument();
  });
});
