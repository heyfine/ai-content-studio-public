"use client";

import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
// text-style 包内含 Color + BackgroundColor（文字色/背景色命令）
import { BackgroundColor, Color } from "@tiptap/extension-text-style";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import type { ReactNode } from "react";
import { EditorToolbar } from "./components/editor-toolbar";
import { Callout } from "./extensions/callout/callout";
import { DragHandle } from "./extensions/drag-handle/drag-handle";
import { Indent } from "./extensions/indent";
import { Markdown } from "./extensions/markdown";
import {
  HeadingMarkdown,
  ParagraphMarkdown,
  TextStyleMarkdown,
} from "./extensions/markdown-style-bridge";
import { PasteImage } from "./extensions/paste-image";
import { SlashCommand } from "./extensions/slash-command/slash-command";

const lowlight = createLowlight(common);

export interface MarkdownEditorProps {
  /** 初始 Markdown 字符串（含 :::callout 语法）或 HTML 字符串 */
  initialContent?: string;
  /** 占位符 */
  placeholder?: string;
  /** 仅可读 */
  editable?: boolean;
  /** 内容变化回调，收到 Markdown 字符串 */
  onChange?: (markdown: string) => void;
  className?: string;
}

/**
 * 默认扩展集：StarterKit + Callout + Placeholder + CharacterCount + Markdown 互转
 * + SlashCommand（/ 插入）+ DragHandle（块拖拽）+ Image/Table/TaskList/CodeBlockLowlight。
 *
 * heading/paragraph/TextStyle 用 markdown-style-bridge 桥接版替代：颜色/对齐序列化为
 * Markdown 内嵌 HTML，保证预览与 WordPress/公众号发布后格式不丢（见该文件头注释）。
 */
const baseExtensions = (placeholder?: string) => [
  StarterKit.configure({
    // 代码块低亮替代默认 codeBlock；heading/paragraph 由桥接版替代
    codeBlock: false,
    heading: false,
    paragraph: false,
  }),
  TextStyleMarkdown,
  Color,
  BackgroundColor,
  HeadingMarkdown,
  ParagraphMarkdown,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Indent,
  Callout,
  Image,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  CodeBlockLowlight.configure({ lowlight }),
  Placeholder.configure({
    placeholder: placeholder ?? "输入文字，或使用 / 插入块…",
  }),
  CharacterCount,
  Markdown,
  SlashCommand,
  DragHandle,
  PasteImage,
];

/**
 * useEditor 封装：固定 immediatelyRender: false（避免 Next 16 + React 19 SSR
 * hydration mismatch / document is not defined，见 TIPTAP-MIGRATION-SPEC §6.1）
 */
export function useMarkdownEditor(options: {
  initialContent?: string;
  placeholder?: string;
  editable?: boolean;
  onChange?: (markdown: string) => void;
}): Editor | null {
  const editor = useEditor({
    extensions: baseExtensions(options.placeholder),
    content: options.initialContent ?? "",
    editable: options.editable ?? true,
    immediatelyRender: false,
    onUpdate({ editor }) {
      const storage = editor.storage as unknown as Record<string, unknown>;
      const md = (storage.markdown as { getMarkdown?: () => string } | undefined) ?? null;
      options.onChange?.(md?.getMarkdown?.() ?? "");
    },
  });
  return editor;
}

/**
 * 可直接渲染的 Tiptap 编辑器组件（文章页可作新板块插入，不动原编辑器）。
 * 顶部带图形化工具栏（EditorToolbar），覆盖 slash 菜单全部能力。
 */
export function MarkdownEditor({
  initialContent,
  placeholder,
  editable,
  onChange,
  className,
}: MarkdownEditorProps): ReactNode {
  const editor = useMarkdownEditor({
    initialContent,
    placeholder,
    editable,
    onChange,
  });
  return (
    <div className="flex flex-col gap-2">
      {editable !== false && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} className={className} />
    </div>
  );
}
