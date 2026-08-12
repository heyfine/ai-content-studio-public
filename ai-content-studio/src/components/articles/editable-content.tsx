"use client";

import { CSSProperties, useMemo } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, Highlighter as HighlighterIcon, Plus, Trash2 } from "lucide-react";
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
  segmentsToMarkdown,
  type Segment,
} from "@/lib/content/render";

/** 可拖动的单个段（text 或 callout） */
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        className="absolute -left-6 top-2 cursor-grab p-0.5 text-muted-foreground/40 hover:text-muted-foreground"
        aria-label="拖动排序"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </div>
  );
}

/** 段落间的插入点：hover 时显示「+ 文字块」「+ 高亮块」按钮，靠左对齐 */
function InsertPoint({
  onInsertText,
  onInsertCallout,
}: {
  onInsertText: () => void;
  onInsertCallout: () => void;
}) {
  return (
    <div className="group relative flex items-center py-0.5">
      <div className="h-px w-full bg-transparent group-hover:bg-border" />
      <div className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          data-testid="insert-point-text"
          onClick={onInsertText}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-muted-foreground px-2.5 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <Plus className="size-3" /> 文字块
        </button>
        <button
          type="button"
          data-testid="insert-point-callout"
          onClick={onInsertCallout}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-muted-foreground px-2.5 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <Plus className="size-3" /> 高亮块
        </button>
      </div>
    </div>
  );
}

/**
 * 编辑模式下的正文区：把 Markdown 切成 text / callout 交替段。
 * - text 段渲染为 textarea
 * - callout 段渲染为彩色卡片，标题/正文/图标就地编辑，类型按钮组切换，可删除
 * - 所有段可拖动排序（dnd-kit）
 * - 段之间有插入点（hover 显示「+ 高亮块」）
 * - 底层仍是 :::callout Markdown 文本
 */
export function EditableContent({
  content,
  onContentChange,
  onInsertCallout,
  onInsertCalloutAt,
  onInsertTextAt,
}: {
  content: string;
  onContentChange: (next: string) => void;
  onInsertCallout: () => void;
  onInsertCalloutAt: (position: number) => void;
  onInsertTextAt: (position: number) => void;
}) {
  const segments = useMemo(() => scanCalloutSegments(content), [content]);
  const ranges = useMemo(() => findCalloutRanges(content), [content]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // 段的稳定 ID（用序号，每次 content 变化会重建）
  const itemIds = useMemo(() => segments.map((_, i) => `seg-${i}`), [segments]);

  // text 段字节区间
  const textRanges = useMemo(() => {
    const tr: { start: number; end: number }[] = [];
    let pos = 0;
    let rIdx = 0;
    for (const seg of segments) {
      if (seg.kind === "text") {
        tr.push({ start: pos, end: pos + seg.value.length });
        pos += seg.value.length;
      } else {
        const r = ranges[rIdx];
        if (r) {
          pos = r.end;
          if (content[pos] === "\n") pos += 1;
          rIdx++;
        }
      }
    }
    return tr;
  }, [segments, ranges, content]);

  function setTextRange(rangeIdx: number, value: string) {
    const target = textRanges[rangeIdx];
    if (!target) return;
    onContentChange(content.slice(0, target.start) + value + content.slice(target.end));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = Number(String(active.id).replace("seg-", ""));
    const newIndex = Number(String(over.id).replace("seg-", ""));
    const reordered = arrayMove(segments, oldIndex, newIndex);
    onContentChange(segmentsToMarkdown(reordered));
  }

  let textIdx = 0;
  let calloutIdx = 0;

  return (
    <div className="space-y-1 pl-6" data-testid="editable-content">
      <style>{CALLOUT_CSS}</style>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {segments.map((seg, i) => {
            const id = `seg-${i}`;
            if (seg.kind === "text") {
              const idx = textIdx++;
              return (
                <div key={id}>
                  {i > 0 && (
                    <InsertPoint
                      onInsertText={() => onInsertTextAt(i)}
                      onInsertCallout={() => onInsertCalloutAt(i)}
                    />
                  )}
                  <SortableItem id={id}>
                    <textarea
                      data-testid={`text-segment-${idx}`}
                      className="min-h-[6vh] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
                      value={seg.value}
                      onChange={(e) => setTextRange(idx, e.target.value)}
                      placeholder="在此输入 Markdown 正文…"
                    />
                  </SortableItem>
                </div>
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
              <div key={id}>
                {i > 0 && (
                  <InsertPoint
                    onInsertText={() => onInsertTextAt(i)}
                    onInsertCallout={() => onInsertCalloutAt(i)}
                  />
                )}
                <SortableItem id={id}>
                  <div
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
                </SortableItem>
              </div>
            );
          })}
        </SortableContext>
      </DndContext>
      <InsertPoint
        onInsertText={() => onInsertTextAt(segments.length)}
        onInsertCallout={() => onInsertCalloutAt(segments.length)}
      />
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
          <DialogDescription>选择语义类型，插入彩色高亮块。</DialogDescription>
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
