"use client";

import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { type ReactNode } from "react";

import { Callout } from "./extensions/callout/callout";
import { Markdown } from "./extensions/markdown";

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
 * 默认扩展集：StarterKit + Callout + Placeholder + CharacterCount + Markdown 互转。
 *
 * 子任务 1 范围：纯骨架 + 互转能力。
 * slash 命令、拖拽手柄 UI、表格/图片/代码块低亮 在子任务 4 进。
 */
const baseExtensions = (placeholder?: string) => [
  StarterKit,
  Callout,
  Placeholder.configure({
    placeholder: placeholder ?? "输入文字，或使用 / 插入块…",
  }),
  CharacterCount,
  Markdown,
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
