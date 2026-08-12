"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ARTICLE_STATUS_LIST, type ArticleStatus } from "@/lib/article-status";
import type { ArticleRow } from "@/lib/article-types";
import { calloutTemplate, scanCalloutSegments, segmentsToMarkdown } from "@/lib/content/render";
import type { CalloutType } from "@/lib/content/callout-types";
import { MarkdownPreview } from "@/components/studio/markdown-preview";
import { CalloutPickerDialog, EditableContent } from "./editable-content";

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
  const [form, setForm] = useState({
    title: "",
    content: "",
    status: "DRAFT" as ArticleStatus,
  });

  // 编辑模式：拉取已有文章
  useEffect(() => {
    if (!articleId) return;
    setLoading(true);
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
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="article-content">正文</Label>
            <div className="flex items-center gap-1">
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
          {mode === "edit" ? (
            <EditableContent
              content={form.content}
              onContentChange={(next) => setField("content", next)}
              onInsertCallout={() => setPickerOpen(true)}
              onInsertCalloutAt={(pos) => {
                setInsertPosition(pos);
                setPickerOpen(true);
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
