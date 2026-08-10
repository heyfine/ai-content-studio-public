"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil as PencilIcon, Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export interface PromptRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  content: string;
  version: number;
  active: boolean;
}

const PROMPT_TYPES = [
  "system",
  "article_write",
  "outline_generate",
  "seo_analyze",
  "title_generate",
  "summary",
  "translate",
];

function typeLabel(t: string) {
  return PROMPT_TYPES.includes(t) ? t : t;
}

export function PromptsClient() {
  const [rows, setRows] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prompts");
      if (!res.ok) throw new Error("加载失败");
      setRows((await res.json()) as PromptRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onDelete(id: string) {
    if (!confirm("确认删除该 Prompt？")) return;
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    void refresh();
  }

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error}
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Prompt 模板库</h2>
        <PromptFormDialog
          trigger={
            <Button size="sm" render={<span />}>
              <PlusIcon className="size-4" /> 添加 Prompt
            </Button>
          }
          onSaved={refresh}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无 Prompt，点击右上角添加。</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{r.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <PromptFormDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="编辑" render={<span />}>
                          <PencilIcon className="size-4" />
                        </Button>
                      }
                      initialValues={r}
                      onSaved={refresh}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除"
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {typeLabel(r.type)} · v{r.version} · {r.active ? "启用" : "禁用"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground line-clamp-3">
                  {r.content}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export interface PromptFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: Partial<PromptRow>;
  onSaved?: () => void;
}

export function PromptFormDialog({ trigger, initialValues, onSaved }: PromptFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEdit = !!initialValues?.id;
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    type: initialValues?.type ?? "article_write",
    description: initialValues?.description ?? "",
    content: initialValues?.content ?? "",
    active: initialValues?.active ?? true,
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit() {
    setSubmitError(null);
    try {
      const res = await fetch(isEdit ? `/api/prompts/${initialValues?.id}` : "/api/prompts", {
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
          <DialogTitle>{isEdit ? "编辑 Prompt" : "添加 Prompt"}</DialogTitle>
          <DialogDescription>管理提示词模板，生成时按类型注入为 system prompt。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="prompt-name">名称</Label>
            <Input
              id="prompt-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-type">类型</Label>
            <select
              id="prompt-type"
              className="max-w-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.type}
              onChange={(e) => setField("type", e.target.value)}
            >
              {PROMPT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-desc">描述</Label>
            <Input
              id="prompt-desc"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-content">Prompt 内容</Label>
            <textarea
              id="prompt-content"
              className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.content}
              onChange={(e) => setField("content", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="prompt-active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setField("active", e.target.checked)}
            />
            <Label htmlFor="prompt-active">启用（生成时使用）</Label>
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
          <Button onClick={onSubmit} disabled={!form.name || !form.content}>
            {isEdit ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
