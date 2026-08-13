"use client";

import { useEffect, useState } from "react";
import { EditorContent } from "@tiptap/react";
import {
  ArrowUpFromLine as ApplyIcon,
  Check as CheckIcon,
  ClipboardCopy as CopyIcon,
  Eraser as EraserIcon,
  Highlighter as HighlighterIcon,
  SquarePen as PenIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useStudioStore, type GenerationItem } from "@/stores/studio-store";
import { taskRouteDefinitions } from "@/config/task-routes";
import { MarkdownPreview } from "./markdown-preview";
import { useMarkdownEditor } from "@/lib/editor/use-markdown-editor";
import {
  applyMarkdownToEditor,
  registerEditor,
  unregisterEditor,
} from "@/lib/editor/editor-bridge";

function taskLabel(task: string): string {
  return taskRouteDefinitions.find((t) => t.value === task)?.label ?? task;
}

function GenerationCard({ g }: { g: GenerationItem }) {
  const setContent = useStudioStore((s) => s.setContent);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(g.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默忽略
    }
  }

  return (
    <div className="rounded-md border" data-testid="generation-item">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="text-xs font-medium" data-testid="generation-header">
          第{g.index}次 · {taskLabel(g.task)} · {g.createdAt}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            aria-label="复制生成结果"
            onClick={() => void copy()}
            disabled={!g.content}
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            {copied ? "已复制" : "复制"}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            aria-label="应用到原文"
            onClick={() => {
              // 富文本模式直刷 editor，经典模式只写 store
              applyMarkdownToEditor(g.content);
              setContent(g.content);
            }}
            disabled={!g.content}
          >
            <ApplyIcon className="size-3" /> 应用到原文
          </Button>
        </div>
      </div>
      <div className="max-h-[320px] overflow-y-auto px-3 py-2" data-testid="generation-content">
        {g.content ? (
          <MarkdownPreview content={g.content} />
        ) : (
          <p className="text-sm text-muted-foreground">生成中…</p>
        )}
      </div>
    </div>
  );
}

export function EditorPanel() {
  const { title, content, setTitle, setContent, generations, clearGenerations } = useStudioStore();
  const [mode, setMode] = useState<"classic" | "rich">("classic");

  const richEditor = useMarkdownEditor({
    initialContent: content,
    editable: true,
    onChange: (md) => setContent(md),
  });

  // 富文本编辑器实例桥接：挂载注册 / 卸载注销（供应用到原文与流式直刷）
  useEffect(() => {
    if (mode !== "rich") return;
    registerEditor(richEditor);
    return () => unregisterEditor();
  }, [mode, richEditor]);

  return (
    <div className="flex h-full flex-col" data-testid="editor-panel">
      <div className="shrink-0 border-b px-4 py-3">
        <Input
          aria-label="文章标题"
          className="border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          placeholder="未命名文章"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between pb-1.5">
            <Label>原文</Label>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-md border p-0.5 text-xs">
                <Button
                  variant={mode === "classic" ? "secondary" : "ghost"}
                  size="xs"
                  aria-label="经典编辑器"
                  aria-pressed={mode === "classic"}
                  onClick={() => setMode("classic")}
                >
                  <PenIcon className="size-3" /> 经典
                </Button>
                <Button
                  variant={mode === "rich" ? "secondary" : "ghost"}
                  size="xs"
                  aria-label="富文本编辑器"
                  aria-pressed={mode === "rich"}
                  onClick={() => setMode("rich")}
                >
                  <HighlighterIcon className="size-3" /> 富文本
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">{content.length} 字符</span>
            </div>
          </div>
          {mode === "classic" ? (
            <textarea
              aria-label="原文"
              className="min-h-[120px] flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none"
              placeholder="把要改写的原文或资料粘贴到这里，再在右侧选择 AI 操作…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          ) : (
            <div
              className="min-h-[120px] flex-1 overflow-y-auto rounded-md border border-input px-3 py-2 text-sm [&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:outline-none"
              data-testid="rich-editor-host"
            >
              <EditorContent editor={richEditor} className="rich-editor" />
            </div>
          )}
        </section>
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between pb-1.5">
            <Label>生成结果</Label>
            {generations.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                aria-label="清空生成结果"
                onClick={clearGenerations}
              >
                <EraserIcon className="size-3" /> 清空
              </Button>
            )}
          </div>
          <div
            className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
            data-testid="generation-list"
          >
            {generations.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                暂无生成结果，点右侧「AI 操作」开始。
              </p>
            )}
            {generations.map((g) => (
              <GenerationCard key={g.id} g={g} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
