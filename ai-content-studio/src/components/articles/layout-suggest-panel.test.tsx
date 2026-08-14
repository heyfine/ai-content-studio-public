import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { LayoutSuggestPanel } from "./layout-suggest-panel";
import type { LayoutSuggestion } from "@/lib/content/layout-suggest-types";

const content = "前文\n这里需要注意数据安全\n中间内容\n结尾";
const suggestions: LayoutSuggestion[] = [
  {
    action: "callout",
    originalText: "这里需要注意数据安全",
    type: "warning",
    title: "注意",
    reason: "存在数据泄露风险",
  },
  {
    action: "bold",
    originalText: "中间内容",
    reason: "核心观点值得突出",
  },
];

function renderPanel() {
  const onCancel = vi.fn();
  const onApply = vi.fn();
  const utils = render(
    <LayoutSuggestPanel
      content={content}
      suggestions={suggestions}
      onCancel={onCancel}
      onApply={onApply}
    />,
  );
  return { onCancel, onApply, ...utils };
}

describe("LayoutSuggestPanel", () => {
  it("渲染建议列表：动作徽标 + 原文 + 理由", () => {
    renderPanel();
    const list = screen.getByTestId("layout-suggestion-list");
    expect(list).toBeInTheDocument();
    expect(within(list).getByText("高亮块")).toBeInTheDocument();
    expect(within(list).getByText("加粗")).toBeInTheDocument();
    expect(within(list).getByText(/这里需要注意数据安全/)).toBeInTheDocument();
    expect(within(list).getByText("存在数据泄露风险")).toBeInTheDocument();
  });

  it("默认全部勾选，应用所选返回排版后正文", () => {
    const { onApply } = renderPanel();
    fireEvent.click(screen.getByTestId("layout-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0][0] as string;
    expect(next).toContain(':::callout{type="warning" title="注意"');
    expect(next).toContain("**中间内容**");
  });

  it("取消勾选某条建议后，应用时不含该动作", () => {
    const { onApply } = renderPanel();
    fireEvent.click(screen.getByTestId("layout-suggestion-check-1"));
    fireEvent.click(screen.getByTestId("layout-apply"));
    const next = onApply.mock.calls[0][0] as string;
    expect(next).toContain(':::callout{type="warning" title="注意"');
    expect(next).not.toContain("**中间内容**");
  });

  it("全部取消勾选时应用按钮禁用", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("layout-suggestion-check-0"));
    fireEvent.click(screen.getByTestId("layout-suggestion-check-1"));
    expect(screen.getByTestId("layout-apply")).toBeDisabled();
  });

  it("清空 / 全选按钮恢复勾选状态", () => {
    const { onApply } = renderPanel();
    fireEvent.click(screen.getByText("清空"));
    expect(screen.getByTestId("layout-apply")).toBeDisabled();
    fireEvent.click(screen.getByText("全选"));
    fireEvent.click(screen.getByTestId("layout-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("建议列表更新后重置勾选为全选，按钮恢复可用", () => {
    const { rerender } = render(
      <LayoutSuggestPanel
        content={content}
        suggestions={[]}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    // 空建议时应用按钮禁用
    expect(screen.getByTestId("layout-apply")).toBeDisabled();
    // 再次排版返回新建议：自动全选，按钮恢复可用
    rerender(
      <LayoutSuggestPanel
        content={content}
        suggestions={suggestions}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText(/已选 2 处/)).toBeInTheDocument();
    expect(screen.getByTestId("layout-apply")).toBeEnabled();
  });

  it("取消按钮触发 onCancel", () => {
    const { onCancel } = renderPanel();
    fireEvent.click(screen.getByTestId("layout-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
