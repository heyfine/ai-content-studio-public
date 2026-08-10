"use client";

import { useEffect, useState } from "react";
import { Sparkles as SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { taskRouteDefinitions } from "@/config/task-routes";
import { useStudioStore } from "@/stores/studio-store";

interface PromptOption {
  id: string;
  name: string;
  type: string;
}

export function StudioSidebar() {
  const { selectedTask, setSelectedTask, content, title, setContent, setGenerating, setError } =
    useStudioStore();
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const selectedPromptId = useStudioStore((s) => s.selectedPromptId);
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
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "生成失败");
      if (task === "article_generate" || task === "outline_generate") {
        setContent(data.content);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" data-testid="studio-sidebar">
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
