"use client";

import { useEffect, useState } from "react";
import { Sparkles as SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { taskRouteDefinitions } from "@/config/task-routes";
import { useStudioStore, nextId } from "@/stores/studio-store";
import { streamGenerateRequest } from "@/lib/ai/stream-client";
import { ArticleActions } from "./article-actions";
import { TemplatePickerDialog, type PromptOption } from "./template-picker-dialog";

export function StudioSidebar() {
  const {
    selectedTask,
    setSelectedTask,
    content,
    title,
    setGenerating,
    setError,
    appendMessage,
    appendDelta,
    appendGeneration,
    appendGenerationDelta,
  } = useStudioStore();
  const lastPromptByTask = useStudioStore((s) => s.lastPromptByTask);
  const setLastPrompt = useStudioStore((s) => s.setLastPrompt);
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  /** 点击 AI 操作后待确认的任务；非 null 时弹窗打开 */
  const [pendingTask, setPendingTask] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/prompts");
        if (!res.ok) throw new Error("加载 Prompt 失败");
        setPrompts((await res.json()) as PromptOption[]);
      } catch {
        if (!cancelled) setPrompts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(task: string, promptId: string | null) {
    const input =
      [title && `标题：${title}`, content].filter(Boolean).join("\n\n") || "请生成一篇文章";
    setSelectedTask(task);
    setError(null);
    setGenerating(true);
    const assistantId = nextId();
    appendMessage({ id: assistantId, role: "assistant", content: "", task });
    appendGeneration({
      id: assistantId,
      task,
      index: useStudioStore.getState().generations.length + 1,
      content: "",
      createdAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    });
    try {
      for await (const ev of streamGenerateRequest({
        task,
        input,
        promptId: promptId ?? undefined,
      })) {
        if (ev.type === "delta") {
          appendDelta(assistantId, ev.content);
          appendGenerationDelta(assistantId, ev.content);
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

  function handleActionClick(task: string) {
    setSelectedTask(task);
    setPendingTask(task);
  }

  function handleConfirm(promptId: string | null) {
    if (!pendingTask) return;
    const task = pendingTask;
    setLastPrompt(task, promptId);
    setPendingTask(null);
    void runAction(task, promptId);
  }

  function handleCancel() {
    setPendingTask(null);
  }

  const pendingLabel =
    taskRouteDefinitions.find((t) => t.value === pendingTask)?.label ?? pendingTask ?? "";

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
              onClick={() => handleActionClick(t.value)}
              data-action={t.value}
              data-testid={t.value}
            >
              <SparklesIcon className="size-3.5" /> {t.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>当前任务</Label>
        <p className="text-sm text-muted-foreground">
          {taskRouteDefinitions.find((t) => t.value === selectedTask)?.label ?? selectedTask}
        </p>
      </div>
      <TemplatePickerDialog
        open={pendingTask !== null}
        task={pendingTask}
        taskLabel={pendingLabel}
        templates={prompts}
        remembered={pendingTask ? (lastPromptByTask[pendingTask] ?? null) : null}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
