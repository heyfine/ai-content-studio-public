"use client";

import { Code as CodeIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * 把导出 HTML 里的站内相对路径图片改写为绝对 URL。
 *
 * 跨站点迁移场景：正文图在源站是 `/uploads/x.png` 或 `/api/storage/object/<key>`
 * 这类相对路径，直接复制到另一站点会按目标站 origin 解析而裂图；改为绝对 URL
 * 后图片继续指向源站。http(s)/data:/blob: 等非相对路径原样保留。
 */
export function absolutizeImageUrls(html: string, origin: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("/")) {
      img.setAttribute("src", new URL(src, origin).toString());
    }
  }
  return doc.body.innerHTML;
}

interface SourceExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: string;
}

/**
 * 「复制源码」对话框：展示编辑器当前正文的 HTML 源码并一键复制。
 *
 * 用途：把本站编辑好的文章（含高亮块、表格底色、对齐等样式）迁移到另一个
 * AI Content Studio 实例——在目标站编辑器工具栏打开「HTML 源码转换」，
 * 粘贴此源码并「转换并替换正文」即可还原。
 */
export function SourceExportDialog({ open, onOpenChange, source }: SourceExportDialogProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
    } catch {
      // 剪贴板不可用时静默，用户可手动全选复制
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>复制文章源码</DialogTitle>
          <DialogDescription>
            在目标站点编辑器的「HTML
            源码转换」对话框粘贴此源码并「转换并替换正文」，即可还原内容与样式（高亮块、表格底色、对齐等）。
            标题不包含在源码内，请在目标站单独填写；文章图片以本站链接引用。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="文章 HTML 源码"
          readOnly
          value={source}
          data-testid="source-export-text"
          className="h-64 min-h-64 resize-y font-mono text-xs"
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            type="button"
            disabled={!source}
            onClick={() => void handleCopy()}
            data-testid="source-copy"
          >
            <CodeIcon className="size-4" />
            {copied ? "已复制" : "复制源码"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
