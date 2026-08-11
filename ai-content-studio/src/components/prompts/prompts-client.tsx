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
import { taskRouteDefinitions } from "@/config/task-routes";

export interface PromptRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  content: string;
  version: number;
  active: boolean;
}

/** 类型选项与 AI 操作任务对齐（中文标签展示，value 为任务标识） */
const PROMPT_TYPE_OPTIONS = taskRouteDefinitions.map((t) => ({
  value: t.value,
  label: t.label,
}));

function typeLabel(t: string) {
  return taskRouteDefinitions.find((d) => d.value === t)?.label ?? t;
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
    type: initialValues?.type ?? "article_generate",
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
      <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "编辑 Prompt" : "添加 Prompt"}</DialogTitle>
          <DialogDescription>管理提示词模板，生成时按类型注入为 system prompt。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">使用说明</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                「类型」需与右侧 AI 操作的任务对应——例如「文章生成」对应的类型是{" "}
                <code className="rounded bg-muted px-1">article_generate</code>
                ，选错类型该模板不会被使用。
              </li>
              <li>
                内容会作为 system prompt 注入；用户的输入（标题 + 正文）会作为文章资料一起发送。
              </li>
              <li>系统不做变量替换，请把要求、限制直接写进内容里。</li>
              <li>
                示例：「你是一名资深科技编辑。请阅读用户输入的资料，写一篇自然、准确、没有 AI
                味的文章……」
              </li>
            </ul>
          </div>
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
              {PROMPT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
              className="min-h-[40vh] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="示例：你是一名资深科技编辑。请阅读用户输入的资料，写一篇自然、准确、没有 AI 味的文章……"
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
        <DialogFooter className="shrink-0">
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
