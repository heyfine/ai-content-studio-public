"use client";

import type { Editor } from "@tiptap/react";
import { useState } from "react";
import {
  Bold as BoldIcon,
  CodeXml as CodeXmlIcon,
  Heading1 as H1Icon,
  Heading2 as H2Icon,
  Heading3 as H3Icon,
  Highlighter as HighlighterIcon,
  Image as ImageIcon,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  ListTodo as TaskListIcon,
  Minus as MinusIcon,
  Pilcrow as PilcrowIcon,
  Strikethrough as StrikethroughIcon,
  Table as TableIcon,
  Underline as UnderlineIcon,
} from "lucide-react";

import { CALLOUT_TYPES, type CalloutType } from "@/lib/content/callout-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 富文本编辑器图形化工具栏（替代 / slash 命令入口）。
 *
 * 覆盖 slash 菜单全部能力：
 *  - 块：正文 / H1-H3 / 高亮块（7 种下拉） / 无序·有序·任务列表 / 表格 / 图片 / 代码块 / 分割线
 *  - 行内格式：加粗 / 斜体 / 删除线 / 下划线
 *
 * 通过 editor.chain().focus().<command>().run() 触发；高亮块经 DropdownMenu 选类型，
 * 图片经 prompt 输入 URL。active 状态由 isActive 感知（行内格式高亮）。
 */

export interface EditorToolbarProps {
  editor: Editor | null;
  /** 插入图片时提示输入 URL 的字符串 */
  imagePrompt?: string;
}

export function EditorToolbar({ editor, imagePrompt }: EditorToolbarProps) {
  const [calloutOpen, setCalloutOpen] = useState(false);

  if (!editor) return null;
  const ed = editor;

  const isBold = ed.isActive("bold");
  const isItalic = ed.isActive("italic");
  const isStrike = ed.isActive("strike");
  const isUnderline = ed.isActive("underline");

  function insertCallout(type: CalloutType) {
    ed
      .chain()
      .focus()
      .insertContent({
        type: "callout",
        attrs: { type, title: "", icon: "" },
        content: [{ type: "paragraph" }],
      })
      .run();
  }

  function insertImage() {
    const url = window.prompt(
      imagePrompt ?? "图片 URL：",
      "https://",
    );
    if (url) ed.chain().focus().setImage({ src: url }).run();
  }

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-md border bg-background px-1.5 py-1"
      data-testid="editor-toolbar"
      aria-label="编辑器工具栏"
    >
      {/* 行内格式 */}
      <button
        type="button"
        aria-label="加粗"
        title="加粗"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isBold ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <BoldIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="斜体"
        title="斜体"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isItalic ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <ItalicIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="删除线"
        title="删除线"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isStrike ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <StrikethroughIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="下划线"
        title="下划线"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isUnderline ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <UnderlineIcon className="size-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* 块类型 */}
      <button
        type="button"
        aria-label="正文"
        title="正文"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setParagraph().run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <PilcrowIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 1"
        title="标题 1"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setHeading({ level: 1 }).run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H1Icon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 2"
        title="标题 2"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setHeading({ level: 2 }).run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H2Icon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 3"
        title="标题 3"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setHeading({ level: 3 }).run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H3Icon className="size-4" />
      </button>

      <DropdownMenu open={calloutOpen} onOpenChange={setCalloutOpen}>
        <DropdownMenuTrigger
          aria-label="高亮块"
          title="高亮块"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <HighlighterIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {CALLOUT_TYPES.map((c) => (
            <DropdownMenuItem
              key={c.type}
              onSelect={() => {
                insertCallout(c.type as CalloutType);
              }}
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-xs">
                {c.icon}
              </span>
              {c.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* 列表 */}
      <button
        type="button"
        aria-label="无序列表"
        title="无序列表"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ListIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="有序列表"
        title="有序列表"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ListOrderedIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="任务列表"
        title="任务列表"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <TaskListIcon className="size-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* 插入 */}
      <button
        type="button"
        aria-label="表格"
        title="表格"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <TableIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="图片"
        title="图片"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => insertImage()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ImageIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="代码块"
        title="代码块"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setCodeBlock().run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <CodeXmlIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="分割线"
        title="分割线"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <MinusIcon className="size-4" />
      </button>
    </div>
  );
}
