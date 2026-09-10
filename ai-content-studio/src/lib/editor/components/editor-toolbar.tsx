"use client";

import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter as AlignCenterIcon,
  AlignLeft as AlignLeftIcon,
  AlignRight as AlignRightIcon,
  Bold as BoldIcon,
  CodeXml as CodeXmlIcon,
  Heading1 as H1Icon,
  Heading2 as H2Icon,
  Heading3 as H3Icon,
  Highlighter as HighlighterIcon,
  Image as ImageIcon,
  IndentDecrease as IndentDecreaseIcon,
  IndentIncrease as IndentIncreaseIcon,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Minus as MinusIcon,
  Pilcrow as PilcrowIcon,
  Quote as QuoteIcon,
  Strikethrough as StrikethroughIcon,
  Table as TableIcon,
  ListTodo as TaskListIcon,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CALLOUT_TYPES, type CalloutType } from "@/lib/content/callout-types";
import { CalloutColorPicker } from "../extensions/callout/callout-color-picker";
import { HtmlSourceButton } from "./html-source-button";

export interface EditorToolbarProps {
  editor: Editor | null;
  imagePrompt?: string;
}

/**
 * 同步聚焦编辑器 DOM，阻止鼠标事件传播到父元素（避免焦点丢失）。
 */
function focusEditor(ed: Editor): void {
  const cmds = (ed as unknown as Record<string, unknown>).commands as
    | Record<string, unknown>
    | undefined;
  if (cmds && typeof cmds.focus === "function") {
    cmds.focus();
  }
  const pmView = (ed as unknown as { view?: { dom?: HTMLElement | null } }).view;
  pmView?.dom?.focus({ preventScroll: true });
  if (!pmView?.dom) {
    const el = document.querySelector(".ProseMirror");
    if (el) (el as HTMLElement).focus({ preventScroll: true });
  }
}

export function EditorToolbar({ editor, imagePrompt }: EditorToolbarProps) {
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [colorPanel, setColorPanel] = useState<"text" | "bg" | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return null;

  const isBold = editor.isActive("bold");
  const isItalic = editor.isActive("italic");
  const isStrike = editor.isActive("strike");
  const isUnderline = editor.isActive("underline");
  const isAlignLeft = editor.isActive({ textAlign: "left" });
  const isAlignCenter = editor.isActive({ textAlign: "center" });
  const isAlignRight = editor.isActive({ textAlign: "right" });
  const isQuote = editor.isActive("blockquote");
  const textStyleAttrs = editor.getAttributes("textStyle") as Record<string, unknown>;
  const textColor = typeof textStyleAttrs.color === "string" ? textStyleAttrs.color : "";
  const textBg =
    typeof textStyleAttrs.backgroundColor === "string" ? textStyleAttrs.backgroundColor : "";

  function applyTextColor(color: string) {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    focusEditor(ed);
    ed.chain().focus().setColor(color).run();
  }

  function clearTextColor() {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    focusEditor(ed);
    ed.chain().focus().unsetColor().run();
  }

  function applyTextBg(color: string) {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    focusEditor(ed);
    ed.chain().focus().setBackgroundColor(color).run();
  }

  /** 清除文字背景色（保留文字色） */
  function clearTextBg() {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    focusEditor(ed);
    ed.chain().focus().unsetBackgroundColor().run();
  }

  function insertCallout(type: CalloutType) {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    focusEditor(ed);

    // 把选中内容作为 callout 内容（Tiptap insertContent 会 replaceWith 替换
    // selection，若直接用空 callout 会把选中的文字吞掉）。空选择则插入空 callout。
    const { state, schema } = ed;
    const slice = state.selection.content();
    let content: Fragment | ProseMirrorNode;
    const first = slice.content.firstChild;
    if (slice.content.size === 0) {
      content = schema.nodes.paragraph.create();
    } else if (slice.content.childCount === 1 && first && first.isTextblock) {
      content = slice.content;
    } else {
      let allBlocks = true;
      slice.content.forEach((n) => {
        if (!n.isBlock) allBlocks = false;
      });
      content = allBlocks ? slice.content : schema.nodes.paragraph.create(null, slice.content);
    }

    ed.commands.insertContent(schema.nodes.callout.create({ type, title: "", icon: "" }, content));
  }

  function insertImage() {
    const url = window.prompt(imagePrompt ?? "图片 URL：", "https://");
    const ed = editorRef.current ?? editor;
    if (!ed || !url) return;
    focusEditor(ed);
    ed.commands.setImage({ src: url });
  }

  /**
   * 执行命令：先同步聚焦 DOM，再直接调用 commands。
   * onMouseDown stopPropagation 防止焦点丢失到父容器。
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
      role="toolbar"
      aria-label="编辑器工具栏"
      className="flex flex-wrap items-center gap-0.5 rounded-md border bg-background px-1.5 py-1"
      data-testid="editor-toolbar"
    >
      {/* 行内格式 */}
      <button
        type="button"
        aria-label="加粗"
        title="加粗"
        onClick={() => runCommand("加粗", (ed) => ed.commands.toggleBold())}
        onMouseDown={(e) => e.stopPropagation()}
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
        onClick={() => runCommand("斜体", (ed) => ed.commands.toggleItalic())}
        onMouseDown={(e) => e.stopPropagation()}
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
        onClick={() => runCommand("删除线", (ed) => ed.commands.toggleStrike())}
        onMouseDown={(e) => e.stopPropagation()}
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
        onClick={() => runCommand("下划线", (ed) => ed.commands.toggleUnderline())}
        onMouseDown={(e) => e.stopPropagation()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isUnderline ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <UnderlineIcon className="size-4" />
      </button>

      {/* 文字颜色 / 背景颜色 */}
      <div className="toolbar-color" style={{ position: "relative" }}>
        <button
          type="button"
          aria-label="文字颜色"
          title="文字颜色"
          onClick={() => {
            setColorPanel((v) => (v === "text" ? null : "text"));
            setCalloutOpen(false);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
        >
          <span className="toolbar-color-letter" style={{ color: textColor || undefined }}>
            A
          </span>
        </button>
        {colorPanel === "text" && (
          <>
            <button
              type="button"
              aria-label="关闭颜色面板"
              className="callout-color-backdrop"
              onClick={() => setColorPanel(null)}
            />
            <CalloutColorPicker
              value={textColor}
              onPick={applyTextColor}
              onClear={() => {
                clearTextColor();
                setColorPanel(null);
              }}
            />
          </>
        )}
      </div>
      <div className="toolbar-color" style={{ position: "relative" }}>
        <button
          type="button"
          aria-label="背景颜色"
          title="背景颜色"
          onClick={() => {
            setColorPanel((v) => (v === "bg" ? null : "bg"));
            setCalloutOpen(false);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
        >
          <span
            className="toolbar-color-letter toolbar-color-letter-bg"
            style={{ backgroundColor: textBg || undefined }}
          >
            A
          </span>
        </button>
        {colorPanel === "bg" && (
          <>
            <button
              type="button"
              aria-label="关闭颜色面板"
              className="callout-color-backdrop"
              onClick={() => setColorPanel(null)}
            />
            <CalloutColorPicker
              value={textBg}
              onPick={applyTextBg}
              onClear={() => {
                clearTextBg();
                setColorPanel(null);
              }}
            />
          </>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* 块类型 */}
      <button
        type="button"
        aria-label="正文"
        title="正文"
        onClick={() => runCommand("正文", (ed) => ed.commands.setParagraph())}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <PilcrowIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 1"
        title="标题 1"
        onClick={() => runCommand("标题1", (ed) => ed.commands.setHeading({ level: 1 }))}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H1Icon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 2"
        title="标题 2"
        onClick={() => runCommand("标题2", (ed) => ed.commands.setHeading({ level: 2 }))}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H2Icon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="标题 3"
        title="标题 3"
        onClick={() => runCommand("标题3", (ed) => ed.commands.setHeading({ level: 3 }))}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <H3Icon className="size-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* 对齐 / 缩进 / 引用 */}
      <button
        type="button"
        aria-label="左对齐"
        title="左对齐"
        onClick={() => runCommand("左对齐", (ed) => ed.commands.setTextAlign("left"))}
        onMouseDown={(e) => e.stopPropagation()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isAlignLeft ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <AlignLeftIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="居中对齐"
        title="居中对齐"
        onClick={() => runCommand("居中对齐", (ed) => ed.commands.setTextAlign("center"))}
        onMouseDown={(e) => e.stopPropagation()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isAlignCenter ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <AlignCenterIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="右对齐"
        title="右对齐"
        onClick={() => runCommand("右对齐", (ed) => ed.commands.setTextAlign("right"))}
        onMouseDown={(e) => e.stopPropagation()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isAlignRight ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <AlignRightIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="增加缩进"
        title="增加缩进"
        onClick={() => runCommand("增加缩进", (ed) => ed.commands.indent())}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <IndentIncreaseIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="减小缩进"
        title="减小缩进"
        onClick={() => runCommand("减小缩进", (ed) => ed.commands.outdent())}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <IndentDecreaseIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="引用"
        title="引用"
        onClick={() => runCommand("引用", (ed) => ed.commands.toggleBlockquote())}
        onMouseDown={(e) => e.stopPropagation()}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isQuote ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}
      >
        <QuoteIcon className="size-4" />
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
              // Base UI 菜单项用 onClick（onSelect 是 Radix API，Base UI 下不生效）
              onClick={() => insertCallout(c.type as CalloutType)}
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
        onClick={() => runCommand("无序列表", (ed) => ed.commands.toggleBulletList())}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ListIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="有序列表"
        title="有序列表"
        onClick={() => runCommand("有序列表", (ed) => ed.commands.toggleOrderedList())}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ListOrderedIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="任务列表"
        title="任务列表"
        onClick={() => runCommand("任务列表", (ed) => ed.commands.toggleTaskList())}
        onMouseDown={(e) => e.stopPropagation()}
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
        onClick={() =>
          runCommand("表格", (ed) =>
            ed.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
          )
        }
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <TableIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="图片"
        title="图片"
        onClick={() => insertImage()}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ImageIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="代码块"
        title="代码块"
        onClick={() => runCommand("代码块", (ed) => ed.commands.setCodeBlock())}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <CodeXmlIcon className="size-4" />
      </button>
      <HtmlSourceButton editor={editor} />
      <button
        type="button"
        aria-label="分割线"
        title="分割线"
        onClick={() => runCommand("分割线", (ed) => ed.commands.setHorizontalRule())}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <MinusIcon className="size-4" />
      </button>
    </div>
  );
}
