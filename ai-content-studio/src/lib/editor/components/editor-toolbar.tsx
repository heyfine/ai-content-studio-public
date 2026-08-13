"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
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

export interface EditorToolbarProps {
  editor: Editor | null;
  imagePrompt?: string;
}

/**
 * 把焦点同步送入编辑器 DOM（而非依赖 chain().focus()）。
 */
function focusEditor(ed: Editor): void {
  // 尝试 commands.focus()（如果存在）
  const cmds = (ed as unknown as Record<string, unknown>).commands as
    | Record<string, unknown>
    | undefined;
  if (cmds && typeof cmds.focus === "function") {
    cmds.focus();
  }
  // 通过 view.dom 获取 contentDOM 并 focus
  const pmView = (ed as unknown as { view?: { dom?: HTMLElement | null } })
    .view;
  pmView?.dom?.focus({ preventScroll: true });
  // 兜底：直接找 .ProseMirror 容器
  if (!pmView?.dom) {
    const el = document.querySelector(".ProseMirror");
    if (el) (el as HTMLElement).focus({ preventScroll: true });
  }
}

export function EditorToolbar({ editor, imagePrompt }: EditorToolbarProps) {
  const [calloutOpen, setCalloutOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return null;

  const isBold = editor.isActive("bold");
  const isItalic = editor.isActive("italic");
  const isStrike = editor.isActive("strike");
  const isUnderline = editor.isActive("underline");

  function insertCallout(type: CalloutType) {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    focusEditor(ed);
    ed.chain().focus().insertContent({
      type: "callout",
      attrs: { type, title: "", icon: "" },
      content: [{ type: "paragraph" }],
    }).run();
  }

  function insertImage() {
    const url = window.prompt(imagePrompt ?? "图片 URL：", "https://");
    const ed = editorRef.current ?? editor;
    if (!ed || !url) return;
    focusEditor(ed);
    ed.chain().focus().setImage({ src: url }).run();
  }

  /**
   * 执行命令：先同步聚焦编辑器 DOM，再调用 chain 命令。
   */
  function runCommand(label: string, fn: (ed: Editor) => void) {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    try {
      focusEditor(ed);
      fn(ed);
    } catch (e) {
      console.error(`[EditorToolbar] ${label} 失败:`, e);
    }
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
        onClick={() => runCommand("加粗", (ed) => ed.chain().focus().toggleBold().run())}
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
        onClick={() => runCommand("斜体", (ed) => ed.chain().focus().toggleItalic().run())}
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
        onClick={() => runCommand("删除线", (ed) => ed.chain().focus().toggleStrike().run())}
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
        onClick={() => runCommand("下划线", (ed) => ed.chain().focus().toggleUnderline().run())}
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
        onClick={() => runCommand("正文", (ed) => ed.chain().focus().setParagraph().run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <PilcrowIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 1"
        title="标题 1"
        onClick={() => runCommand("标题1", (ed) => ed.chain().focus().setHeading({ level: 1 }).run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H1Icon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 2"
        title="标题 2"
        onClick={() => runCommand("标题2", (ed) => ed.chain().focus().setHeading({ level: 2 }).run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H2Icon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 3"
        title="标题 3"
        onClick={() => runCommand("标题3", (ed) => ed.chain().focus().setHeading({ level: 3 }).run())}
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
              onSelect={() => insertCallout(c.type as CalloutType)}
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
        onClick={() => runCommand("无序列表", (ed) => ed.chain().focus().toggleBulletList().run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ListIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="有序列表"
        title="有序列表"
        onClick={() => runCommand("有序列表", (ed) => ed.chain().focus().toggleOrderedList().run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ListOrderedIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="任务列表"
        title="任务列表"
        onClick={() => runCommand("任务列表", (ed) => ed.chain().focus().toggleTaskList().run())}
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
        onClick={() => runCommand("表格", (ed) => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <TableIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="图片"
        title="图片"
        onClick={() => insertImage()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ImageIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="代码块"
        title="代码块"
        onClick={() => runCommand("代码块", (ed) => ed.chain().focus().setCodeBlock().run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <CodeXmlIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="分割线"
        title="分割线"
        onClick={() => runCommand("分割线", (ed) => ed.chain().focus().setHorizontalRule().run())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <MinusIcon className="size-4" />
      </button>
    </div>
  );
}
