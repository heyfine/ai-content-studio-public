import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatePickerDialog, type PromptOption } from "./template-picker-dialog";

const templates: PromptOption[] = [
  { id: "p1", name: "自然写作", type: "article_generate" },
  { id: "p2", name: "SEO 分析模板", type: "seo_analyze" },
];

describe("TemplatePickerDialog", () => {
  it("只列出与任务类型匹配的模板，并显示任务标题", () => {
    render(
      <TemplatePickerDialog
        open
        task="article_generate"
        taskLabel="文章生成"
        templates={templates}
        remembered={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("选择 Prompt 模板")).toBeInTheDocument();
    expect(screen.getByText("为「文章生成」选择本次使用的提示词模板。")).toBeInTheDocument();
    expect(screen.getByLabelText("自然写作")).toBeInTheDocument();
    expect(screen.getByLabelText("不使用模板")).toBeInTheDocument();
    expect(screen.queryByLabelText("SEO 分析模板")).not.toBeInTheDocument();
  });

  it("默认预选「不使用模板」", () => {
    render(
      <TemplatePickerDialog
        open
        task="article_generate"
        taskLabel="文章生成"
        templates={templates}
        remembered={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("不使用模板") as HTMLInputElement).checked).toBe(true);
  });

  it("预选上一次记住的模板", () => {
    render(
      <TemplatePickerDialog
        open
        task="article_generate"
        taskLabel="文章生成"
        templates={templates}
        remembered="p1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("自然写作") as HTMLInputElement).checked).toBe(true);
  });

  it("记住的模板已被删除时回退到「不使用模板」", () => {
    render(
      <TemplatePickerDialog
        open
        task="article_generate"
        taskLabel="文章生成"
        templates={templates}
        remembered="deleted-id"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("不使用模板") as HTMLInputElement).checked).toBe(true);
  });

  it("确认时传入选中的模板 id", () => {
    const onConfirm = vi.fn();
    render(
      <TemplatePickerDialog
        open
        task="article_generate"
        taskLabel="文章生成"
        templates={templates}
        remembered={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("自然写作"));
    fireEvent.click(screen.getByText("开始生成"));
    expect(onConfirm).toHaveBeenCalledWith("p1");
  });

  it("选择「不使用模板」确认时传入 null", () => {
    const onConfirm = vi.fn();
    render(
      <TemplatePickerDialog
        open
        task="article_generate"
        taskLabel="文章生成"
        templates={templates}
        remembered={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("开始生成"));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("取消按钮触发 onCancel", () => {
    const onCancel = vi.fn();
    render(
      <TemplatePickerDialog
        open
        task="article_generate"
        taskLabel="文章生成"
        templates={templates}
        remembered={null}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("取消"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("任务类型无模板时提示并可确认不使用模板", () => {
    render(
      <TemplatePickerDialog
        open
        task="translate"
        taskLabel="翻译"
        templates={templates}
        remembered={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/该任务类型暂无 Prompt 模板/)).toBeInTheDocument();
    expect((screen.getByLabelText("不使用模板") as HTMLInputElement).checked).toBe(true);
  });
});
