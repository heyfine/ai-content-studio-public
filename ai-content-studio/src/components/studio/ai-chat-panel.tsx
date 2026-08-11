"use client";

import { useState } from "react";
import { Send as SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useStudioStore, nextId, type ChatMessage } from "@/stores/studio-store";
import { taskRouteDefinitions } from "@/config/task-routes";
import { streamGenerateRequest } from "@/lib/ai/stream-client";

function taskLabel(task: string): string {
  return taskRouteDefinitions.find((t) => t.value === task)?.label ?? task;
}

function MessageItem({ m }: { m: ChatMessage }) {
  const isUser = m.role === "user";
  return (
    <div className={isUser ? "text-right" : ""}>
      <div className={`mb-1 text-xs text-muted-foreground ${isUser ? "" : "font-medium"}`}>
        {isUser ? "我" : "AI"}
        {!isUser && m.task ? ` · ${taskLabel(m.task)}` : ""}
      </div>
      <div
        className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "bg-primary/10 inline-block max-w-prose" : "bg-muted"
        }`}
      >
        {m.content}
      </div>
    </div>
  );
}

export function AIChatPanel() {
  const {
    messages,
    selectedTask,
    selectedPromptId,
    reasoningEnabled,
    reasoningEffort,
    appendMessage,
    appendDelta,
    appendGeneration,
    appendGenerationDelta,
    setSelectedTask,
    setReasoningEnabled,
    setReasoningEffort,
    setGenerating,
    setError,
  } = useStudioStore();
  const [input, setInput] = useState("");
  const generating = useStudioStore((s) => s.isGenerating);
  const error = useStudioStore((s) => s.error);

  async function send() {
    const text = input.trim();
    if (!text || generating) return;
    setInput("");
    appendMessage({ id: nextId(), role: "user", content: text, task: selectedTask });
    setError(null);
    setGenerating(true);
    const assistantId = nextId();
    appendMessage({ id: assistantId, role: "assistant", content: "", task: selectedTask });
    appendGeneration({
      id: assistantId,
      task: selectedTask,
      index: useStudioStore.getState().generations.length + 1,
      content: "",
      createdAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    });
    try {
      for await (const ev of streamGenerateRequest({
        task: selectedTask,
        input: text,
        promptId: selectedPromptId ?? undefined,
        ...(reasoningEnabled ? { reasoningEffort } : {}),
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

  return (
    <div className="flex h-full flex-col" data-testid="ai-chat-panel">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">AI 对话</span>
        <select
          aria-label="选择任务"
          className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
          value={selectedTask}
          onChange={(e) => setSelectedTask(e.target.value)}
        >
          {taskRouteDefinitions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              输入内容开始对话，AI 会按所选任务生成。
            </p>
          )}
          {messages.map((m) => (
            <MessageItem key={m.id} m={m} />
          ))}
          {generating && <p className="text-sm text-muted-foreground">生成中…</p>}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="border-t p-3">
        <textarea
          aria-label="AI 输入"
          className="min-h-[60px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          placeholder="输入要求…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          size="sm"
          className="mt-2 w-full"
          onClick={() => void send()}
          disabled={generating || !input.trim()}
        >
          <SendIcon className="size-4" /> 发送
        </Button>
      </div>
    </div>
  );
}
