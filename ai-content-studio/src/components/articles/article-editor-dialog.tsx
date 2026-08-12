"use client";

import { useRef, useState } from "react";
import { Highlighter as HighlighterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ARTICLE_STATUS_LIST, type ArticleStatus } from "@/lib/article-status";
import { CALLOUT_TYPES, type CalloutType } from "@/lib/content/callout-types";
import { calloutTemplate } from "@/lib/content/render";
import { MarkdownPreview } from "@/components/studio/markdown-preview";

export interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: ArticleStatus;
  seoScore: number | null;
  wpPostId: string | null;
  promptId: string | null;
  updatedAt?: string;
}

export interface ArticleEditorDialogProps {
  trigger: React.ReactNode;
  initialValues?: Partial<ArticleRow>;
  onSaved?: () => void;
}

export function ArticleEditorDialog({ trigger, initialValues, onSaved }: ArticleEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEdit = !!initialValues?.id;
  const [form, setForm] = useState({
    title: initialValues?.title ?? "",
    content: initialValues?.content ?? "",
    status: (initialValues?.status ?? "DRAFT") as ArticleStatus,
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** 在光标位置插入高亮块模板，保持编辑器焦点与后续编辑位置 */
  function insertCallout(type: CalloutType) {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? form.content.length;
    const end = ta?.selectionEnd ?? start;
    const template = calloutTemplate(type);
    const next = form.content.slice(0, start) + template + form.content.slice(end);
    setField("content", next);
    setPickerOpen(false);
    setMode("edit");
    requestAnimationFrame(() => {
      ta?.focus();
      if (ta) {
        ta.selectionStart = ta.selectionEnd = start + template.length;
      }
    });
  }

  async function onSubmit() {
    setSubmitError(null);
    try {
      const res = await fetch(isEdit ? `/api/articles/${initialValues?.id}` : "/api/articles", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(err.error ?? "操作失败");
        return;
      }
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as never} />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "编辑文章" : "新建文章"}</DialogTitle>
          <DialogDescription>
            填写标题与正文，保存为草稿后可在 Studio 中用 AI 继续完善。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="article-title">标题</Label>
            <Input
              id="article-title"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="article-status">状态</Label>
            <select
              id="article-status"
              className="max-w-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setField("status", e.target.value as ArticleStatus)}
            >
              {ARTICLE_STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="article-content">正文（Markdown）</Label>
              <div className="flex items-center gap-1">
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    data-testid="open-callout-picker"
                    onClick={() => setPickerOpen(true)}
                  >
                    <HighlighterIcon className="size-3.5" /> 高亮块
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  data-testid="toggle-preview"
                  onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
                >
                  {mode === "edit" ? "预览" : "编辑"}
                </Button>
              </div>
            </div>
            {mode === "edit" ? (
              <textarea
                id="article-content"
                ref={textareaRef}
                className="min-h-[40vh] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
                value={form.content}
                onChange={(e) => setField("content", e.target.value)}
              />
            ) : (
              <div className="min-h-[40vh] w-full overflow-y-auto rounded-md border p-3">
                <MarkdownPreview content={form.content} />
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <DialogClose
            render={
              <Button type="button" variant="ghost">
                取消
              </Button>
            }
          />
          <Button onClick={onSubmit} disabled={!form.title}>
            {isEdit ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* 高亮块类型选择 */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>插入高亮块</DialogTitle>
            <DialogDescription>选择语义类型，在光标位置插入彩色高亮块。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1" data-testid="callout-type-list">
            {CALLOUT_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                data-testid={`callout-type-${t.type}`}
                onClick={() => insertCallout(t.type)}
                className="flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted/40"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {t.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPickerOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
