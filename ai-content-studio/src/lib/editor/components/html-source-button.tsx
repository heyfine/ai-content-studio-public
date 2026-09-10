"use client";

import type { Editor } from "@tiptap/react";
import { FileCode as FileCodeIcon } from "lucide-react";
import { useState } from "react";

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

import { convertHtmlToSlice } from "../html-import";

/**
 * 工具栏「HTML 源码转换」：打开对话框粘贴 HTML 源码 → 转换成可编辑正文。
 *
 * 转换复用粘贴管道（convertHtmlToSlice），与浏览器直接粘贴行为一致：
 * Word 源码自动规范化、data: 图转存、表格底色/颜色/对齐等内联样式保真。
 * 提供两个动作：插入光标处 / 替换整篇正文（替换前 confirm，可 Ctrl+Z 撤销，
 * 落库时另有历史版本快照兜底）。
 */
export function HtmlSourceButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editor) return null;

  async function convert(mode: "insert" | "replace") {
    if (!editor || busy) return;
    setError(null);
    if (!source.trim()) {
      setError("请先在上方粘贴 HTML 源码");
      return;
    }
    if (
      mode === "replace" &&
      !window.confirm("将用转换结果替换整篇正文（可 Ctrl+Z 撤销）。继续？")
    ) {
      return;
    }
    setBusy(true);
    try {
      const { slice, droppedImages } = await convertHtmlToSlice(source, editor.schema);
      if (slice.content.size === 0) {
        setError("未能从源码解析出可导入的内容（可能只有样式/脚本声明）");
        return;
      }
      const { state, view } = editor;
      const tr = state.tr;
      if (mode === "replace") {
        tr.replace(0, state.doc.content.size, slice);
      } else {
        tr.replaceSelection(slice);
      }
      view.dispatch(tr.scrollIntoView());
      if (droppedImages > 0) {
        console.warn(`[html-import] ${droppedImages} 张不可读图片（file:// 等）已丢弃`);
      }
      setOpen(false);
      setSource("");
    } catch (e) {
      setError(`转换失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="HTML 源码转换"
        title="HTML 源码转换（粘贴 HTML 代码转成排版一致的正文）"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <FileCodeIcon className="size-4" />
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>HTML 源码转换</DialogTitle>
            <DialogDescription>
              粘贴 HTML 源码（整页含 &lt;style&gt;
              的文档也可以），转换时按浏览器实际渲染效果落成可编辑正文：
              颜色、加粗、对齐、表格底色等保留；彩色卡片区块（提示框/引用卡/配图占位等）自动转成编辑器
              「高亮块」可继续编辑。不保留：字体/字号、圆角阴影、渐变（取主色）、复杂定位； file:///
              本地图片无法读取会被移除。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="HTML 源码输入"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="<h2>在此粘贴 HTML 源码…</h2>"
            className="h-64 min-h-64 resize-y font-mono text-xs"
            spellCheck={false}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void convert("replace")}
            >
              {busy ? "转换中…" : "转换并替换正文"}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void convert("insert")}>
              {busy ? "转换中…" : "转换并插入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
