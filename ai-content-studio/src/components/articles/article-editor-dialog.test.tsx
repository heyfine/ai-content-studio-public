import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ render }: { render: React.ReactNode }) => <>{render}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ render }: { render: React.ReactNode }) => <>{render}</>,
}));

import { ArticleEditorDialog } from "./article-editor-dialog";

describe("ArticleEditorDialog 高亮块", () => {
  beforeEach(() => fetchMock.mockReset());

  it("渲染工具栏：高亮块按钮与预览切换", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    expect(screen.getByTestId("open-callout-picker")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-preview")).toBeInTheDocument();
    expect(screen.getByText("正文（Markdown）")).toBeInTheDocument();
  });

  it("点击高亮块弹出 7 种类型", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.click(screen.getByTestId("open-callout-picker"));
    expect(screen.getByText("插入高亮块")).toBeInTheDocument();
    expect(screen.getByTestId("callout-type-info")).toBeInTheDocument();
    expect(screen.getByTestId("callout-type-warning")).toBeInTheDocument();
    expect(screen.getByTestId("callout-type-danger")).toBeInTheDocument();
    expect(screen.getByTestId("callout-type-neutral")).toBeInTheDocument();
    // 7 种类型
    const list = screen.getByTestId("callout-type-list");
    expect(list.querySelectorAll("[data-testid^='callout-type-']")).toHaveLength(7);
  });

  it("选择类型后在光标处插入模板", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByLabelText("正文（Markdown）"), {
      target: { value: "第一段\n第二段" },
    });
    // 光标放在第二段开头
    const ta = screen.getByLabelText("正文（Markdown）") as HTMLTextAreaElement;
    ta.selectionStart = 4;
    ta.selectionEnd = 4;
    fireEvent.click(screen.getByTestId("open-callout-picker"));
    fireEvent.click(screen.getByTestId("callout-type-warning"));
    expect(screen.getByLabelText("正文（Markdown）")).toHaveValue(
      '第一段\n:::callout{type="warning" title="注意" icon="⚠️"}\n在这里输入需要展示的信息。\n:::\n第二段',
    );
  });

  it("切换到预览渲染高亮块样式", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByLabelText("正文（Markdown）"), {
      target: { value: '开头\n:::callout{type="info"}\n背景资料\n:::\n结尾' },
    });
    fireEvent.click(screen.getByTestId("toggle-preview"));
    expect(screen.queryByLabelText("正文（Markdown）")).not.toBeInTheDocument();
    const preview = screen.getByTestId("markdown-preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveTextContent("信息"); // 默认标题
    expect(preview).toHaveTextContent("背景资料");
  });

  it("标题为空时创建按钮禁用", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    expect(screen.getByText("创建").closest("button")).toBeDisabled();
  });

  it("新建提交 POST /api/articles", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a9" }) });
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "新文章" } });
    fireEvent.change(screen.getByLabelText("正文（Markdown）"), {
      target: { value: "内容" },
    });
    fireEvent.click(screen.getByText("创建"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("正文有高亮块时显示「管理高亮块」按钮", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByLabelText("正文（Markdown）"), {
      target: { value: ':::callout{type="info"}\nA\n:::' },
    });
    expect(screen.getByTestId("open-callout-manager")).toBeInTheDocument();
  });

  it("管理面板列出全部已插入高亮块", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByLabelText("正文（Markdown）"), {
      target: {
        value: [
          ':::callout{type="info" title="信息" icon="ℹ️"}',
          "A",
          ":::",
          "正文",
          ':::callout{type="tip" title="推荐" icon="💡"}',
          "B",
          ":::",
        ].join("\n"),
      },
    });
    const list = screen.getByTestId("callout-manager-list");
    expect(list.querySelectorAll("[data-testid^='callout-manager-item-']")).toHaveLength(2);
    expect(screen.getByTestId("callout-manager-item-0")).toHaveTextContent("信息");
    expect(screen.getByTestId("callout-manager-item-1")).toHaveTextContent("推荐");
  });

  it("编辑高亮块可改类型并回写 Markdown", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByLabelText("正文（Markdown）"), {
      target: { value: ':::callout{type="info" title="信息" icon="ℹ️"}\n旧\n:::' },
    });
    // 打开编辑弹窗
    fireEvent.click(screen.getByTestId("callout-manager-edit-0"));
    expect(screen.getByTestId("callout-edit-form")).toBeInTheDocument();
    // 改类型为 tip（点对应按钮）
    fireEvent.click(screen.getByTestId("callout-edit-type-tip"));
    // 改标题
    fireEvent.change(screen.getByTestId("callout-edit-title"), { target: { value: "推荐改" } });
    // 改正文
    fireEvent.change(screen.getByTestId("callout-edit-body"), { target: { value: "新正文" } });
    // 确认
    fireEvent.click(screen.getByTestId("callout-edit-confirm"));
    expect(screen.getByLabelText("正文（Markdown）")).toHaveValue(
      ':::callout{type="tip" title="推荐改" icon="ℹ️"}\n新正文\n:::',
    );
  });

  it("删除高亮块从 Markdown 中移除", () => {
    render(<ArticleEditorDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByLabelText("正文（Markdown）"), {
      target: { value: '前文\n:::callout{type="info"}\nA\n:::\n后文' },
    });
    fireEvent.click(screen.getByTestId("callout-manager-delete-0"));
    expect(screen.getByLabelText("正文（Markdown）")).toHaveValue("前文\n后文");
    // 删除后管理列表也清空
    expect(screen.queryByTestId("callout-manager-item-0")).not.toBeInTheDocument();
  });
});
