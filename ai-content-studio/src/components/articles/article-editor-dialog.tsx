"use client";

import { useState } from "react";
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
  const isEdit = !!initialValues?.id;
  const [form, setForm] = useState({
    title: initialValues?.title ?? "",
    content: initialValues?.content ?? "",
    status: (initialValues?.status ?? "DRAFT") as ArticleStatus,
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑文章" : "新建文章"}</DialogTitle>
          <DialogDescription>
            填写标题与正文，保存为草稿后可在 Studio 中用 AI 继续完善。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
            <Label htmlFor="article-content">正文（Markdown）</Label>
            <textarea
              id="article-content"
              className="min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
              value={form.content}
              onChange={(e) => setField("content", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
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
    </Dialog>
  );
}
