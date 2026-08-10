"use client";

import { Input } from "@/components/ui/input";
import { useStudioStore } from "@/stores/studio-store";

export function EditorPanel() {
  const { title, content, setTitle, setContent } = useStudioStore();

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
      <div className="flex flex-1 flex-col overflow-hidden">
        <textarea
          aria-label="文章正文"
          className="flex-1 resize-none border-0 bg-transparent px-4 py-3 font-mono text-sm outline-none"
          placeholder="在此输入或由 AI 生成 Markdown 正文…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="border-t px-4 py-2 text-xs text-muted-foreground">{content.length} 字符</div>
    </div>
  );
}
