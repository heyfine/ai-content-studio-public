"use client";

import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { createLowlight, common } from "lowlight";
import { type ReactNode } from "react";

import { Callout } from "./extensions/callout/callout";
import { DragHandle } from "./extensions/drag-handle/drag-handle";
import { Markdown } from "./extensions/markdown";
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
 * 子任务 4 范围：slash 命令、拖拽手柄、表格/图片/任务列表/代码块低亮全部接入。
 */
const baseExtensions = (placeholder?: string) => [
  StarterKit.configure({
    // 代码块低亮替代默认 codeBlock
    codeBlock: false,
  }),
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
      const md =
        (storage.markdown as { getMarkdown?: () => string } | undefined) ?? null;
      options.onChange?.(md?.getMarkdown?.() ?? "");
    },
  });
  return editor;
}

/**
 * 可直接渲染的 Tiptap 编辑器组件（文章页可作新板块插入，不动原编辑器）。
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
  return <EditorContent editor={editor} className={className} />;
}
