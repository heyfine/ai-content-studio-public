"use client";

import { useEffect, useState } from "react";
import { Sparkles as SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { taskRouteDefinitions } from "@/config/task-routes";
import { useStudioStore, nextId } from "@/stores/studio-store";
import { streamGenerateRequest } from "@/lib/ai/stream-client";
import { ArticleActions } from "./article-actions";

interface PromptOption {
  id: string;
  name: string;
  type: string;
}

export function StudioSidebar() {
  const {
    selectedTask,
    setSelectedTask,
    selectedPromptId,
    content,
    title,
    setContent,
    setGenerating,
    setError,
    appendMessage,
    appendDelta,
  } = useStudioStore();
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const setSelectedPromptId = useStudioStore((s) => s.setSelectedPromptId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/prompts");
        if (!res.ok) throw new Error("加载 Prompt 失败");
        setPrompts((await res.json()) as PromptOption[]);
      } catch {
        if (!cancelled) setPrompts([]);
      } finally {
        if (!cancelled) setLoadingPrompts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(task: string) {
    const input =
      [title && `标题：${title}`, content].filter(Boolean).join("\n\n") || "请生成一篇文章";
    setSelectedTask(task);
    const promptId = selectedPromptId ?? undefined;
    setError(null);
    setGenerating(true);
    const assistantId = nextId();
    appendMessage({ id: assistantId, role: "assistant", content: "", task });
    let acc = "";
    try {
      for await (const ev of streamGenerateRequest({ task, input, promptId })) {
        if (ev.type === "delta") {
          acc += ev.content;
          appendDelta(assistantId, ev.content);
          if (task === "article_generate" || task === "outline_generate") {
            setContent(acc);
          }
        } else if (ev.type === "error") {
          throw new Error(ev.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" data-testid="studio-sidebar">
      <ArticleActions />
      <div className="space-y-2">
        <Label>AI 操作</Label>
        <div className="grid grid-cols-2 gap-2">
          {taskRouteDefinitions.map((t) => (
            <Button
              key={t.value}
              variant="outline"
              size="sm"
              onClick={() => runAction(t.value)}
              data-action={t.value}
              data-testid={t.value}
            >
              <SparklesIcon className="size-3.5" /> {t.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="studio-prompt-select">Prompt 模板</Label>
        <select
          id="studio-prompt-select"
          aria-label="选择 Prompt"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={selectedPromptId ?? ""}
          disabled={loadingPrompts}
          onChange={(e) => setSelectedPromptId(e.target.value || null)}
        >
          <option value="">{loadingPrompts ? "加载中…" : "不使用模板"}</option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>当前任务</Label>
        <p className="text-sm text-muted-foreground">
          {taskRouteDefinitions.find((t) => t.value === selectedTask)?.label ?? selectedTask}
        </p>
      </div>
    </div>
  );
}
