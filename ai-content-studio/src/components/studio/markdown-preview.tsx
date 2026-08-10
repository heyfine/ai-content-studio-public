"use client";

import { useMemo } from "react";
import { marked } from "marked";
import { cn } from "@/lib/utils";

marked.setOptions({ gfm: true, breaks: true });

/** Markdown 预览排版类（无 @tailwindcss/typography，用任意值子选择器覆盖常见标签） */
export const markdownBodyClass =
  "text-sm [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-2 [&_p]:leading-7 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline [&_hr]:my-4 [&_hr]:border-muted [&_img]:max-w-full [&_table]:w-full [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1";

export function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => marked.parse(content, { async: false }) as string, [content]);
  return (
    <div
      data-testid="markdown-preview"
      className={cn(markdownBodyClass, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
