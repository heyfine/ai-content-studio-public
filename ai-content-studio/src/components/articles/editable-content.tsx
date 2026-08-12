"use client";

import { Highlighter as HighlighterIcon, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CALLOUT_TYPES, type CalloutType } from "@/lib/content/callout-types";
import {
  CALLOUT_CSS,
  calloutTemplate,
  editCalloutInMarkdown,
  findCalloutRanges,
  removeCalloutInMarkdown,
  scanCalloutSegments,
} from "@/lib/content/render";

/**
 * 编辑模式下的正文区：把 Markdown 切成 text / callout 交替段。
 * text 段渲染为小 textarea；callout 段渲染为彩色卡片，标题/正文/图标就地编辑，类型按钮组切换，可删除。
 * 底部有「插入高亮块」按钮。
 * 底层数据仍是 :::callout Markdown 文本，编辑只是回写对应字节区间。
 */
export function EditableContent({
  content,
  onContentChange,
  onInsertCallout,
}: {
  content: string;
  onContentChange: (next: string) => void;
  onInsertCallout: () => void;
}) {
  const segments = useMemo(() => scanCalloutSegments(content), [content]);
  const ranges = useMemo(() => findCalloutRanges(content), [content]);

  // 计算 text 段在 content 中的字节区间，用于回写
  const textRanges = useMemo(() => {
    const tr: { start: number; end: number }[] = [];
    let pos = 0;
    let rIdx = 0;
    for (const seg of segments) {
      if (seg.kind === "callout") {
        const r = ranges[rIdx];
        if (r) {
          if (r.start > pos) tr.push({ start: pos, end: r.start });
          pos = r.end;
          if (content[pos] === "\n") pos += 1;
          rIdx++;
        }
      }
    }
    if (pos < content.length) tr.push({ start: pos, end: content.length });
    return tr;
  }, [segments, ranges, content]);

  function setTextRange(rangeIdx: number, value: string) {
    const target = textRanges[rangeIdx];
    if (!target) return;
    onContentChange(content.slice(0, target.start) + value + content.slice(target.end));
  }

  let textIdx = 0;
  let calloutIdx = 0;
  let seq = 0;

  return (
    <div className="space-y-2" data-testid="editable-content">
      <style>{CALLOUT_CSS}</style>
      {segments.map((seg) => {
        const key = seq++;
        if (seg.kind === "text") {
          const idx = textIdx++;
          return (
            <textarea
              key={`text-${key}`}
              data-testid={`text-segment-${idx}`}
              className="min-h-[6vh] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
              value={seg.value}
              onChange={(e) => setTextRange(idx, e.target.value)}
              placeholder="在此输入 Markdown 正文…"
            />
          );
        }
        const r = ranges[calloutIdx];
        const cfg =
          CALLOUT_TYPES.find((t) => t.type === r?.attrs.type) ??
          CALLOUT_TYPES.find((t) => t.type === "neutral") ??
          CALLOUT_TYPES[0];
        const type: CalloutType =
          r?.attrs.type && CALLOUT_TYPES.some((t) => t.type === r.attrs.type)
            ? (r.attrs.type as CalloutType)
            : cfg.type;
        const title = r?.attrs.title ?? "";
        const icon = r?.attrs.icon ?? "";
        const body = r?.body ?? "";
        const ci = calloutIdx++;
        return (
          <div
            key={`callout-${key}`}
            className={`callout callout-${type} relative`}
            data-testid={`callout-card-${ci}`}
          >
            <div className="mb-1 flex items-center gap-1">
              <div className="flex flex-wrap gap-1" data-testid={`callout-card-type-${ci}`}>
                {CALLOUT_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    data-testid={`callout-card-type-${ci}-${t.type}`}
                    onClick={() =>
                      onContentChange(
                        editCalloutInMarkdown(content, ci, {
                          type: t.type,
                          title,
                          icon,
                          body,
                        }),
                      )
                    }
                    className={
                      "flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs " +
                      (type === t.type
                        ? "border-foreground bg-black/5 font-medium"
                        : "border-muted")
                    }
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                data-testid={`callout-card-delete-${ci}`}
                onClick={() => onContentChange(removeCalloutInMarkdown(content, ci))}
                className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive"
                title="删除该高亮块"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="callout-title items-center gap-1.5">
              <input
                data-testid={`callout-card-icon-${ci}`}
                className="w-8 border-none bg-transparent text-lg leading-none outline-none"
                value={icon}
                onChange={(e) =>
                  onContentChange(
                    editCalloutInMarkdown(content, ci, {
                      type,
                      title,
                      icon: e.target.value,
                      body,
                    }),
                  )
                }
                placeholder={cfg.icon}
              />
              <input
                data-testid={`callout-card-title-${ci}`}
                className="flex-1 border-none bg-transparent font-semibold outline-none"
                value={title}
                onChange={(e) =>
                  onContentChange(
                    editCalloutInMarkdown(content, ci, {
                      type,
                      title: e.target.value,
                      icon,
                      body,
                    }),
                  )
                }
                placeholder={cfg.label}
              />
            </div>
            <textarea
              data-testid={`callout-card-body-${ci}`}
              className="callout-content mt-1 w-full resize-y border-none bg-transparent text-sm leading-6 outline-none"
              value={body}
              onChange={(e) =>
                onContentChange(
                  editCalloutInMarkdown(content, ci, {
                    type,
                    title,
                    icon,
                    body: e.target.value,
                  }),
                )
              }
              placeholder="输入高亮块内容…"
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="xs"
        data-testid="insert-callout-inline"
        onClick={onInsertCallout}
      >
        <HighlighterIcon className="size-3.5" /> 插入高亮块
      </Button>
    </div>
  );
}

/** 高亮块类型选择 Dialog（插入用） */
export function CalloutPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (type: CalloutType) => void;
}) {
  function handlePick(type: CalloutType) {
    onPick(type);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>插入高亮块</DialogTitle>
          <DialogDescription>选择语义类型，在正文末尾插入彩色高亮块。</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1" data-testid="callout-type-list">
          {CALLOUT_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              data-testid={`callout-type-${t.type}`}
              onClick={() => handlePick(t.type)}
              className="flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted/40"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {t.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 把 calloutTemplate 的逻辑暴露给页面用 */
export { calloutTemplate };
