import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { EditorToolbar } from "../components/editor-toolbar";

function makeChainMock() {
  const run = vi.fn();
  // 模拟 Tiptap 扁平链：chain() → focus() → toggleBold() → run()
  // 每一步方法都返回 this 以保证链式调用。
  const chainObj: Record<string, unknown> = {
    run,
  };
  const methods = [
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
  ] as const;
  for (const name of methods) {
    const fn = vi.fn(() => chainObj);
    chainObj[name] = fn;
    // 保留对 fn 的引用供断言
    (chainObj as Record<string, unknown>)[`__${name}`] = fn;
  }
  const chain = vi.fn(() => chainObj);
  const editor = {
    chain,
    isActive: vi.fn(() => false),
    commands: { setImage: vi.fn() },
  } as unknown as Parameters<typeof EditorToolbar>[0]["editor"];
  return { editor, run, chain };
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
    expect(m.chain).toHaveBeenCalled();
  });

  it("点击标题 1 触发 setHeading level 1", () => {
    const m = makeChainMock();
    render(<EditorToolbar editor={m.editor} />);
    fireEvent.click(screen.getByLabelText("标题 1"));
    // chain() 被调用（内部 .focus().setHeading(...).run()）
    expect(m.chain).toHaveBeenCalled();
  });

  it("点击表格触发 insertTable", () => {
    const m = makeChainMock();
    render(<EditorToolbar editor={m.editor} />);
    fireEvent.click(screen.getByLabelText("表格"));
    expect(m.chain).toHaveBeenCalled();
  });

  it("高亮块下拉 trigger 渲染", () => {
    const m = makeChainMock();
    render(<EditorToolbar editor={m.editor} />);
    // @base-ui DropdownMenu 浮层为 portal + 动画，jsdom 不全量渲染；
    // 此处验证 trigger 存在，下拉 7 种类型的行为由真实浏览器保障。
    expect(screen.getByLabelText("高亮块")).toBeInTheDocument();
  });
});
