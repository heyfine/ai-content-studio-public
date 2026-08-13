import { Editor } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { act, createRef } from "react";
import { createLowlight, common } from "lowlight";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { Callout } from "../extensions/callout/callout";
import { DragHandle } from "../extensions/drag-handle/drag-handle";
import { Markdown } from "../extensions/markdown";
import { SlashCommand } from "../extensions/slash-command/slash-command";
import { SlashMenu, type SlashItem } from "../extensions/slash-command/slash-menu";

type SlashMenuRefShape = {
  onDown: () => void;
  onUp: () => void;
  onEnter: () => void;
};

const lowlight = createLowlight(common);

function makeEditor(initial = ""): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Callout,
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder,
      CharacterCount,
      Markdown,
      SlashCommand,
      DragHandle,
    ],
    content: initial,
    editable: false,
  });
}

describe("Tiptap 子任务 4：扩展集完整性与块插入", () => {
  it("扩展集可创建编辑器且基础内容往返", () => {
    const e = makeEditor("Hello **world**");
    expect(e.getText()).toContain("Hello");
    const storage = e.storage as unknown as Record<string, unknown>;
    const md = storage.markdown as { getMarkdown?: () => string } | undefined;
    expect(md?.getMarkdown?.() ?? "").toContain("Hello");
    e.destroy();
  });

  it("insertTable 插入表格", () => {
    const e = makeEditor("");
    e.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    const json = e.getJSON() as {
      content?: Array<{ type: string; content?: unknown[] }>;
    };
    expect(json.content?.some((n) => n.type === "table")).toBe(true);
    e.destroy();
  });

  it("toggleTaskList 插入任务列表", () => {
    const e = makeEditor("");
    e.commands.toggleTaskList();
    const json = e.getJSON() as { content?: Array<{ type: string }> };
    expect(json.content?.some((n) => n.type === "taskList")).toBe(true);
    e.destroy();
  });

  it("setImage 插入图片（URL）", () => {
    const e = makeEditor("");
    e.commands.setImage({ src: "https://example.com/x.png" });
    const html = e.getHTML();
    expect(html).toContain("https://example.com/x.png");
    e.destroy();
  });

  it("setCodeBlock 插入代码块", () => {
    const e = makeEditor("");
    e.commands.setCodeBlock();
    const json = e.getJSON() as { content?: Array<{ type: string }> };
    expect(json.content?.some((n) => n.type === "codeBlock")).toBe(true);
    e.destroy();
  });

  it("slash 命令可插入高亮块 callout", () => {
    const e = makeEditor("");
    e.commands.insertContent({
      type: "callout",
      attrs: { type: "warning", title: "", icon: "" },
      content: [{ type: "paragraph" }],
    });
    const html = e.getHTML();
    expect(html).toContain("callout-warning");
    e.destroy();
  });
});

describe("SlashMenu 组件", () => {
  const items: SlashItem[] = [
    { type: "paragraph", label: "正文", description: "段落", icon: "P" },
    {
      type: "heading",
      level: 1,
      label: "标题 1",
      description: "大标题",
      icon: "H1",
    },
    {
      type: "callout",
      calloutType: "info",
      label: "高亮块",
      description: "块",
      icon: "i",
    },
  ];

  it("菜单项渲染与点击选择", () => {
    const ref = createRef<SlashMenuRefShape | null>();
    const command = vi.fn();
    render(<SlashMenu ref={ref} items={items} command={command} />);
    expect(screen.getAllByRole("option").length).toBe(3);
    fireEvent.click(screen.getByRole("option", { name: /正文/ }));
    expect(command).toHaveBeenCalledWith(items[0]);
  });

  it("键盘 onDown/onUp/onEnter 选择", () => {
    const ref = createRef<SlashMenuRefShape | null>();
    const command = vi.fn();
    render(<SlashMenu ref={ref} items={items} command={command} />);
    act(() => ref.current?.onDown());
    act(() => ref.current?.onEnter());
    expect(command).toHaveBeenCalledWith(items[1]); // 初始选中 0，onDown 后选中 1
    act(() => ref.current?.onUp());
    act(() => ref.current?.onEnter());
    expect(command).toHaveBeenCalledWith(items[0]);
  });

  it("无匹配结果时显示空态", () => {
    const ref = createRef<SlashMenuRefShape | null>();
    render(<SlashMenu ref={ref} items={[]} command={vi.fn()} />);
    expect(screen.getByText("无匹配结果")).toBeInTheDocument();
  });
});
