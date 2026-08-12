import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditableContent } from "./editable-content";

function renderWith(content: string) {
  const onContentChange = vi.fn();
  const onInsertCallout = vi.fn();
  const onInsertCalloutAt = vi.fn();
  const onInsertTextAt = vi.fn();
  const utils = render(
    <EditableContent
      content={content}
      onContentChange={onContentChange}
      onInsertCallout={onInsertCallout}
      onInsertCalloutAt={onInsertCalloutAt}
      onInsertTextAt={onInsertTextAt}
    />,
  );
  return { onContentChange, onInsertCallout, onInsertCalloutAt, onInsertTextAt, ...utils };
}

const calloutMd = '前文\n:::callout{type="warning" title="注意" icon="⚠️"}\n警告正文\n:::\n后文';

describe("EditableContent", () => {
  it("普通 Markdown 切成 text 段，callout 渲染为卡片", () => {
    renderWith(calloutMd);
    expect(screen.getByTestId("callout-card-0")).toBeInTheDocument();
    expect(screen.getByTestId("callout-card-0")).toHaveClass("callout-warning");
  });

  it("卡片显示类型切换按钮与删除按钮", () => {
    renderWith(calloutMd);
    expect(screen.getByTestId("callout-card-type-0-warning")).toBeInTheDocument();
    expect(screen.getByTestId("callout-card-delete-0")).toBeInTheDocument();
  });

  it("点击类型按钮回写新类型", () => {
    const { onContentChange } = renderWith(calloutMd);
    fireEvent.click(screen.getByTestId("callout-card-type-0-tip"));
    expect(onContentChange).toHaveBeenCalledTimes(1);
    const next = onContentChange.mock.calls[0][0] as string;
    expect(next).toContain('type="tip"');
    expect(next).toContain("警告正文");
  });

  it("编辑标题就地回写", () => {
    const { onContentChange } = renderWith(calloutMd);
    const title = screen.getByTestId("callout-card-title-0");
    fireEvent.change(title, { target: { value: "新标题" } });
    const next = onContentChange.mock.calls[0][0] as string;
    expect(next).toContain('title="新标题"');
  });

  it("编辑正文就地回写", () => {
    const { onContentChange } = renderWith(calloutMd);
    const body = screen.getByTestId("callout-card-body-0");
    fireEvent.change(body, { target: { value: "新正文" } });
    const next = onContentChange.mock.calls[0][0] as string;
    expect(next).toContain("新正文");
  });

  it("编辑图标就地回写", () => {
    const { onContentChange } = renderWith(calloutMd);
    const icon = screen.getByTestId("callout-card-icon-0");
    fireEvent.change(icon, { target: { value: "💡" } });
    const next = onContentChange.mock.calls[0][0] as string;
    expect(next).toContain('icon="💡"');
  });

  it("删除按钮移除该 callout", () => {
    const { onContentChange } = renderWith(calloutMd);
    fireEvent.click(screen.getByTestId("callout-card-delete-0"));
    const next = onContentChange.mock.calls[0][0] as string;
    expect(next).not.toContain(":::callout");
  });

  it("text 段编辑回写对应字节区间", () => {
    const { onContentChange } = renderWith(calloutMd);
    const text0 = screen.getByTestId("text-segment-0");
    fireEvent.change(text0, { target: { value: "修改后的前文" } });
    const next = onContentChange.mock.calls[0][0] as string;
    expect(next.startsWith("修改后的前文")).toBe(true);
    expect(next).toContain(":::callout");
  });

  it("多个 callout 按序渲染编号", () => {
    const md = [
      ':::callout{type="info" title="信息"}',
      "A",
      ":::",
      "正文",
      ':::callout{type="tip" title="推荐"}',
      "B",
      ":::",
    ].join("\n");
    renderWith(md);
    expect(screen.getByTestId("callout-card-0")).toBeInTheDocument();
    expect(screen.getByTestId("callout-card-1")).toBeInTheDocument();
  });

  it("空内容时 text 段可正常输入（不被吞掉）", () => {
    const { onContentChange } = renderWith("");
    const ta = screen.getByTestId("text-segment-0");
    fireEvent.change(ta, { target: { value: "输入的内容" } });
    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange.mock.calls[0][0]).toBe("输入的内容");
  });
});
