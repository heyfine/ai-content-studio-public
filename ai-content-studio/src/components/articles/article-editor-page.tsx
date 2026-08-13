"use client";

import { Sparkles, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ARTICLE_STATUS_LABELS,
  ARTICLE_STATUS_LIST,
  type ArticleStatus,
} from "@/lib/article-status";
import type { ArticleRow } from "@/lib/article-types";
import { calloutTemplate, scanCalloutSegments, segmentsToMarkdown } from "@/lib/content/render";
import type { CalloutType } from "@/lib/content/callout-types";
import { CALLOUT_TYPES } from "@/lib/content/callout-types";
import { type CalloutSuggestion, acceptSuggestion } from "@/lib/content/callout-suggest-ui";
import type { LayoutSuggestion, LayoutStyle } from "@/lib/content/layout-suggest-types";
import { LAYOUT_STYLE_LABELS, LAYOUT_STYLES } from "@/lib/content/layout-suggest-types";
import { MarkdownPreview } from "@/components/studio/markdown-preview";
import { CalloutPickerDialog, EditableContent } from "./editable-content";
import { LayoutSuggestPanel } from "./layout-suggest-panel";

export interface ArticleEditorPageProps {
  articleId: string | null;
}

export function ArticleEditorPage({ articleId }: ArticleEditorPageProps) {
  const router = useRouter();
  const isEdit = !!articleId;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<CalloutSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [layoutStyle, setLayoutStyle] = useState<LayoutStyle>("standard");
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutSuggestions, setLayoutSuggestions] = useState<LayoutSuggestion[] | null>(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    status: "DRAFT" as ArticleStatus,
  });

  // 编辑模式：拉取已有文章（初始 loading = isEdit，无需在此重置）
  useEffect(() => {
    if (!articleId) return;
    fetch(`/api/articles/${articleId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("加载失败");
        return res.json() as Promise<ArticleRow>;
      })
      .then((data) => {
        setForm({
          title: data.title ?? "",
          content: data.content ?? "",
          status: data.status ?? "DRAFT",
        });
      })
      .catch((e) => setSubmitError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [articleId]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function appendCallout(type: CalloutType) {
    if (insertPosition !== null) {
      // 在指定段前插入
      const segs = scanCalloutSegments(form.content);
      const template = calloutTemplate(type);
      const newSegs = scanCalloutSegments(template).filter((s) => s.kind === "callout");
      if (newSegs.length > 0) {
        const reordered = [
          ...segs.slice(0, insertPosition),
          ...newSegs,
          ...segs.slice(insertPosition),
        ];
        setField("content", segmentsToMarkdown(reordered));
      }
    } else {
      // 末尾插入
      const template = calloutTemplate(type);
      const next =
        form.content.endsWith("\n") || form.content === ""
          ? form.content + template
          : `${form.content}\n${template}`;
      setField("content", next);
    }
    setInsertPosition(null);
  }

  async function onSuggestCallouts() {
    setSuggestError(null);
    if (form.content.trim().length === 0) {
      setSuggestError("正文为空，无法生成建议");
      return;
    }
    setSuggesting(true);
    try {
      const res = await fetch("/api/articles/suggest-callouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: form.content, title: form.title }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setSuggestError(err.error ?? "AI 建议失败");
        return;
      }
      const data = (await res.json()) as { suggestions: CalloutSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) {
        setSuggestError("AI 未发现需要高亮的段落");
      }
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  function onAcceptSuggestion(idx: number) {
    const s = suggestions[idx];
    if (!s) return;
    const next = acceptSuggestion(form.content, s);
    setField("content", next);
    setSuggestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function onRejectSuggestion(idx: number) {
    setSuggestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function onAcceptAll() {
    let content = form.content;
    for (const s of [...suggestions]) {
      content = acceptSuggestion(content, s);
    }
    setField("content", content);
    setSuggestions([]);
  }

  async function onSuggestLayout() {
    setLayoutError(null);
    if (form.content.trim().length === 0) {
      setLayoutError("正文为空，无法排版");
      return;
    }
    setLayoutLoading(true);
    try {
      const res = await fetch("/api/articles/suggest-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: form.content, title: form.title, style: layoutStyle }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setLayoutError(err.error ?? "AI 排版失败");
        return;
      }
      const data = (await res.json()) as { suggestions: LayoutSuggestion[] };
      setLayoutSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) {
        setLayoutError("AI 认为当前排版已足够，无需调整");
      }
    } catch (e) {
      setLayoutError(e instanceof Error ? e.message : String(e));
    } finally {
      setLayoutLoading(false);
    }
  }

  async function onSubmit() {
    setSubmitError(null);
    try {
      const res = await fetch(isEdit ? `/api/articles/${articleId}` : "/api/articles", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(err.error ?? "操作失败");
        return;
      }
      router.push("/articles");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? "编辑文章" : "新建文章"}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.push("/articles")}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={!form.title} data-testid="submit-article">
            {isEdit ? "保存" : "创建"}
          </Button>
        </div>
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="article-title">标题</Label>
          <Input
            id="article-title"
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            data-testid="article-title-input"
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
                {ARTICLE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="article-content">正文</Label>
            <div className="flex items-center gap-1">
              <select
                aria-label="排版强度"
                className="rounded-md border border-input bg-transparent px-2 py-1.5 text-xs"
                value={layoutStyle}
                onChange={(e) => setLayoutStyle(e.target.value as LayoutStyle)}
                disabled={layoutLoading || mode !== "edit"}
                data-testid="layout-style-select"
              >
                {LAYOUT_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {LAYOUT_STYLE_LABELS[s]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="ai-layout"
                onClick={onSuggestLayout}
                disabled={layoutLoading || mode !== "edit"}
              >
                <Sparkles className="size-3.5" />
                {layoutLoading ? "排版中…" : "AI 智能排版"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="ai-suggest-callouts"
                onClick={onSuggestCallouts}
                disabled={suggesting || mode !== "edit"}
              >
                <Sparkles className="size-3.5" />
                {suggesting ? "分析中…" : "AI 建议"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="open-callout-picker"
                onClick={() => setPickerOpen(true)}
              >
                高亮块
              </Button>
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
          {mode === "edit" && suggestions.length > 0 && (
            <div
              className="space-y-2 rounded-md border border-dashed border-muted-foreground p-3"
              data-testid="suggestion-list"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">AI 建议高亮 {suggestions.length} 处</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-testid="accept-all-suggestions"
                    onClick={onAcceptAll}
                  >
                    全部接受
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-testid="reject-all-suggestions"
                    onClick={() => setSuggestions([])}
                  >
                    全部忽略
                  </Button>
                </div>
              </div>
              {suggestions.map((s, idx) => {
                const cfg = CALLOUT_TYPES.find((t) => t.type === s.type);
                const key = `${s.originalText.slice(0, 20)}-${idx}`;
                return (
                  <div
                    key={key}
                    className="flex items-start gap-2 rounded-md border p-2 text-sm"
                    data-testid={`suggestion-${idx}`}
                  >
                    <span aria-hidden="true" className="text-lg leading-none">
                      {cfg?.icon ?? "📌"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {cfg?.label ?? "补充"} · {s.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        「{s.originalText.slice(0, 50)}
                        {s.originalText.length > 50 ? "…" : ""}」
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        data-testid={`accept-suggestion-${idx}`}
                        onClick={() => onAcceptSuggestion(idx)}
                      >
                        <Check className="size-3.5 text-green-600" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        data-testid={`reject-suggestion-${idx}`}
                        onClick={() => onRejectSuggestion(idx)}
                      >
                        <X className="size-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {mode === "edit" && suggestError && !suggesting && (
            <p className="text-sm text-muted-foreground" data-testid="suggest-error">
              {suggestError}
            </p>
          )}
          {mode === "edit" && layoutError && !layoutLoading && (
            <p className="text-sm text-muted-foreground" data-testid="layout-error">
              {layoutError}
            </p>
          )}
          {mode === "edit" && layoutSuggestions && (
            <LayoutSuggestPanel
              content={form.content}
              suggestions={layoutSuggestions}
              onCancel={() => setLayoutSuggestions(null)}
              onApply={(next) => {
                setField("content", next);
                setLayoutSuggestions(null);
              }}
            />
          )}
          {mode === "edit" ? (
            <EditableContent
              content={form.content}
              onContentChange={(next) => setField("content", next)}
              onInsertCallout={() => setPickerOpen(true)}
              onInsertCalloutAt={(pos) => {
                setInsertPosition(pos);
                setPickerOpen(true);
              }}
              onInsertTextAt={(pos) => {
                const segs = scanCalloutSegments(form.content);
                const reordered = [
                  ...segs.slice(0, pos),
                  { kind: "text" as const, value: "" },
                  ...segs.slice(pos),
                ];
                setField("content", segmentsToMarkdown(reordered));
              }}
            />
          ) : (
            <div className="min-h-[40vh] w-full overflow-y-auto rounded-md border p-3">
              <MarkdownPreview content={form.content} />
            </div>
          )}
        </div>
      </div>

      <CalloutPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={appendCallout} />
    </div>
  );
}
