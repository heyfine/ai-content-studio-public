"use client";

import { Highlighter as HighlighterIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { MarkdownPreview } from "@/components/studio/markdown-preview";
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
import {
  type CalloutEditValue,
  calloutTemplate,
  editCalloutInMarkdown,
  findCalloutRanges,
  removeCalloutInMarkdown,
} from "@/lib/content/render";

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
  const [managerOpen, setManagerOpen] = useState(false);
  const [editing, setEditing] = useState<{ index: number; value: CalloutEditValue } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEdit = !!initialValues?.id;
  const [form, setForm] = useState({
    title: initialValues?.title ?? "",
    content: initialValues?.content ?? "",
    status: (initialValues?.status ?? "DRAFT") as ArticleStatus,
  });

  // 已插入高亮块列表（仅在编辑模式下扫描，预览模式不消耗）
  const calloutRanges = useMemo(
    () => (mode === "edit" ? findCalloutRanges(form.content) : []),
    [mode, form.content],
  );

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

  /** 打开指定高亮块的可视化编辑弹窗 */
  function openEditCallout(index: number) {
    const target = calloutRanges.find((r) => r.index === index);
    if (!target) return;
    const fallback = CALLOUT_TYPES.find((t) => t.type === "neutral") ?? CALLOUT_TYPES[0];
    const type: CalloutType =
      target.attrs.type && CALLOUT_TYPES.some((t) => t.type === target.attrs.type)
        ? (target.attrs.type as CalloutType)
        : fallback.type;
    setEditing({
      index,
      value: {
        type,
        title: target.attrs.title ?? "",
        icon: target.attrs.icon ?? "",
        body: target.body,
      },
    });
  }

  /** 确认编辑：回写到 markdown 并关闭弹窗 */
  function confirmEditCallout() {
    if (!editing) return;
    const next = editCalloutInMarkdown(form.content, editing.index, editing.value);
    setField("content", next);
    setEditing(null);
  }

  /** 删除指定高亮块 */
  function deleteCallout(index: number) {
    setField("content", removeCalloutInMarkdown(form.content, index));
    // 删除后 manager 内列表会随 calloutRanges 重算自动更新
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
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      data-testid="open-callout-picker"
                      onClick={() => setPickerOpen(true)}
                    >
                      <HighlighterIcon className="size-3.5" /> 高亮块
                    </Button>
                    {calloutRanges.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        data-testid="open-callout-manager"
                        onClick={() => setManagerOpen(true)}
                      >
                        管理高亮块（{calloutRanges.length}）
                      </Button>
                    )}
                  </>
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

      {/* 高亮块管理：列出已插入块，逐个编辑/删除 */}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>管理高亮块</DialogTitle>
            <DialogDescription>逐个编辑已插入高亮块的类型、标题、图标与正文。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1" data-testid="callout-manager-list">
            {calloutRanges.length === 0 && (
              <p className="text-sm text-muted-foreground">当前正文没有可管理的高亮块。</p>
            )}
            {calloutRanges.map((r) => {
              const cfg =
                CALLOUT_TYPES.find((t) => t.type === r.attrs.type) ??
                CALLOUT_TYPES.find((t) => t.type === "neutral") ??
                CALLOUT_TYPES[0];
              const title = r.attrs.title?.trim() || cfg.label;
              const icon = r.attrs.icon?.trim() || cfg.icon;
              const preview = r.body.replace(/\s+/g, " ").slice(0, 30);
              return (
                <div
                  key={r.index}
                  className="flex items-start gap-2 rounded-md border p-2 text-sm"
                  data-testid={`callout-manager-item-${r.index}`}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    {icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      #{r.index + 1} · {title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {cfg.label} · {preview || "（空）"}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-testid={`callout-manager-edit-${r.index}`}
                    onClick={() => openEditCallout(r.index)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-testid={`callout-manager-delete-${r.index}`}
                    onClick={() => deleteCallout(r.index)}
                  >
                    删除
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setManagerOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 高亮块可视化编辑：类型/标题/图标/正文 */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑高亮块</DialogTitle>
            <DialogDescription>
              修改类型、标题、图标或正文，确认后回写到 Markdown。
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-1" data-testid="callout-edit-form">
              <div className="space-y-1">
                <Label>类型</Label>
                <div className="flex flex-wrap gap-1" data-testid="callout-edit-type-list">
                  {CALLOUT_TYPES.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      data-testid={`callout-edit-type-${t.type}`}
                      onClick={() =>
                        setEditing((e) => (e ? { ...e, value: { ...e.value, type: t.type } } : e))
                      }
                      className={
                        "flex items-center gap-1 rounded-md border px-2 py-1 text-xs " +
                        (editing.value.type === t.type ? "border-foreground bg-muted/40" : "")
                      }
                    >
                      <span aria-hidden="true">{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="callout-edit-title">标题（留空用默认）</Label>
                <Input
                  id="callout-edit-title"
                  value={editing.value.title}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, value: { ...s.value, title: e.target.value } } : s,
                    )
                  }
                  data-testid="callout-edit-title"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="callout-edit-icon">图标（留空用默认）</Label>
                <Input
                  id="callout-edit-icon"
                  value={editing.value.icon}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, value: { ...s.value, icon: e.target.value } } : s,
                    )
                  }
                  data-testid="callout-edit-icon"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="callout-edit-body">正文</Label>
                <textarea
                  id="callout-edit-body"
                  className="min-h-[10vh] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
                  value={editing.value.body}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, value: { ...s.value, body: e.target.value } } : s,
                    )
                  }
                  data-testid="callout-edit-body"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button type="button" data-testid="callout-edit-confirm" onClick={confirmEditCallout}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
