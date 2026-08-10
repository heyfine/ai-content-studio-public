"use client";

import { useState } from "react";
import { Pencil as PencilIcon, Columns2 as Columns2Icon, Eye as EyeIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/stores/studio-store";
import { MarkdownPreview } from "./markdown-preview";

type Mode = "edit" | "split" | "preview";

interface ModeToggleProps {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ModeToggle({ active, label, onClick, children }: ModeToggleProps) {
  return (
    <Button variant="ghost" size="sm" aria-label={label} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}

export function EditorPanel() {
  const { title, content, setTitle, setContent } = useStudioStore();
  const [mode, setMode] = useState<Mode>("edit");

  return (
    <div className="flex h-full flex-col" data-testid="editor-panel">
      <div className="border-b px-4 py-3">
        <Input
          aria-label="文章标题"
          className="border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          placeholder="未命名文章"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div
        role="group"
        aria-label="编辑视图"
        className="flex items-center gap-1 border-b px-4 py-1.5"
      >
        <ModeToggle active={mode === "edit"} label="编辑模式" onClick={() => setMode("edit")}>
          <PencilIcon className="size-3.5" /> 编辑
        </ModeToggle>
        <ModeToggle active={mode === "split"} label="分屏模式" onClick={() => setMode("split")}>
          <Columns2Icon className="size-3.5" /> 分屏
        </ModeToggle>
        <ModeToggle active={mode === "preview"} label="预览模式" onClick={() => setMode("preview")}>
          <EyeIcon className="size-3.5" /> 预览
        </ModeToggle>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        {mode === "edit" && (
          <textarea
            aria-label="文章正文"
            className="flex-1 resize-none border-0 bg-transparent px-4 py-3 font-mono text-sm outline-none"
            placeholder="在此输入或由 AI 生成 Markdown 正文…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
        {mode === "split" && (
          <div className="grid flex-1 grid-cols-2 overflow-hidden">
            <textarea
              aria-label="文章正文"
              className="resize-none border-r border-border bg-transparent px-4 py-3 font-mono text-sm outline-none"
              placeholder="在此输入或由 AI 生成 Markdown 正文…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <MarkdownPreview content={content} className="overflow-y-auto px-4 py-3" />
          </div>
        )}
        {mode === "preview" && (
          <MarkdownPreview content={content} className="flex-1 overflow-y-auto px-4 py-3" />
        )}
      </div>
      <div className="border-t px-4 py-2 text-xs text-muted-foreground">
        {content.length} 字符
        {content && (
          <span className="ml-2 text-emerald-500" aria-label="自动保存提示">
            · Markdown
          </span>
        )}
      </div>
    </div>
  );
}
