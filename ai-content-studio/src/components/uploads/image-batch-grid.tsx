"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";

export interface BatchGridEntry {
  id: string;
  url: string;
  alt: string;
  /** 卡片下方说明（尺寸/时间等） */
  caption: ReactNode;
  /** 相册分组日（YYYY-MM-DD）；null 或不传不分组 */
  dayLabel?: string | null;
}

export interface BatchBarAction {
  label: string;
  onClick: (ids: string[]) => void;
  /** 危险操作标红 */
  danger?: boolean;
}

interface ImageBatchGridProps {
  title: ReactNode;
  count: number;
  entries: BatchGridEntry[];
  emptyText: string;
  /** 勾选集合（父组件持有，批量操作需要读取） */
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  /** 有选中项时的批量操作按钮 */
  batchActions: BatchBarAction[];
  /** 每张卡片右下角操作按钮（可选） */
  cardActions?: (entry: BatchGridEntry) => ReactNode;
  /** 回收站样式：灰度缩略图 + 虚线边框 */
  trashStyle?: boolean;
  gridTestId: string;
  itemTestIdPrefix: string;
}

/** 图片库通用网格：批量多选模式 + 批量操作条 + 按日相册分组，四区复用 */
export function ImageBatchGrid({
  title,
  count,
  entries,
  emptyText,
  selectedIds,
  onSelectionChange,
  batchActions,
  cardActions,
  trashStyle = false,
  gridTestId,
  itemTestIdPrefix,
}: ImageBatchGridProps) {
  const [selecting, setSelecting] = useState(false);

  const selectedSet = new Set(selectedIds);
  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange([...next]);
  }
  function toggleAll() {
    if (selectedIds.length === entries.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(entries.map((e) => e.id));
    }
  }
  function exitSelecting() {
    setSelecting(false);
    onSelectionChange([]);
  }

  // 相册分组：条目已按时间倒序，连续同日归入同组；dayLabel 为 null 的归入「未分组」
  const groups: Array<{ label: string | null; items: BatchGridEntry[] }> = [];
  for (const entry of entries) {
    const label = entry.dayLabel ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }

  function renderCard(entry: BatchGridEntry) {
    const isSelected = selectedSet.has(entry.id);
    return (
      <div
        key={entry.id}
        className={`space-y-1 rounded-md border p-2 ${
          trashStyle ? "border-dashed opacity-80" : ""
        } ${isSelected ? "border-primary ring-2 ring-primary" : ""}`}
        data-testid={`${itemTestIdPrefix}`}
      >
        {/* biome-ignore lint/performance/noImgElement: 图片库缩略图使用原生 img，next/image 需配置域名 */}
        <img
          src={entry.url}
          alt={entry.alt}
          className={`h-28 w-full rounded object-cover ${trashStyle ? "grayscale" : ""}`}
          loading="lazy"
        />
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">{entry.caption}</div>
          {selecting && (
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
              aria-label={`选择 ${entry.alt}`}
              checked={isSelected}
              onChange={() => toggle(entry.id)}
              data-testid={`select-${entry.id}`}
            />
          )}
        </div>
        {cardActions && !selecting && (
          <div className="flex justify-end gap-1">{cardActions(entry)}</div>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">
          {title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">（{count}）</span>
        </h3>
        <div className="flex items-center gap-2">
          {selecting && selectedIds.length > 0 && (
            <span className="text-sm text-muted-foreground" data-testid="selection-count">
              已选 {selectedIds.length}
            </span>
          )}
          {entries.length > 0 && (
            <Button
              size="sm"
              variant={selecting ? "secondary" : "ghost"}
              onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
              data-testid={`batch-toggle-${itemTestIdPrefix}`}
            >
              {selecting ? "取消多选" : "多选"}
            </Button>
          )}
        </div>
      </div>

      {selecting && selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2"
          data-testid={`batch-bar-${itemTestIdPrefix}`}
        >
          <Button size="sm" variant="ghost" onClick={toggleAll}>
            {selectedIds.length === entries.length ? "全不选" : "全选"}
          </Button>
          {batchActions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.danger ? "destructive" : "default"}
              onClick={() => action.onClick(selectedIds)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        groups.map((group, gi) => (
          <div key={group.label ?? `ungrouped-${gi}`} className="space-y-2">
            {group.label && (
              <p className="text-sm font-medium text-muted-foreground" data-testid="album-day">
                {group.label}
                <span className="ml-2 font-normal">（{group.items.length} 张）</span>
              </p>
            )}
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
              data-testid={group.label ? undefined : gridTestId}
            >
              {group.items.map(renderCard)}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
