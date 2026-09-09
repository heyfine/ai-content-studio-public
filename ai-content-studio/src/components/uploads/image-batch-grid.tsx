"use client";

import type { ReactNode } from "react";
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
  /** 每张卡片右下角操作按钮（可选；点击不会触发选中） */
  cardActions?: (entry: BatchGridEntry) => ReactNode;
  /** 回收站样式：灰度缩略图 + 虚线边框 */
  trashStyle?: boolean;
  gridTestId: string;
  itemTestIdPrefix: string;
}

/**
 * 图片库通用网格：点击图片直接选中（连续点选多张）+ 批量操作条 + 按日相册分组（组头全选）。
 * 选中 ≥1 张时自动出现批量条；卡片上的操作按钮不触发选中。
 */
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

  /** 组级全选：组内已全选中则取消全选，否则一键全选 */
  function toggleGroup(ids: string[]) {
    const allSelected = ids.every((id) => selectedSet.has(id));
    const next = new Set(selectedIds);
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    onSelectionChange([...next]);
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
      // biome-ignore lint/a11y/useSemanticElements: 图片卡片需包含 img/caption/操作按钮等复杂子元素，不能收窄为原生 button
      <div
        key={entry.id}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`选择图片 ${entry.alt}`}
        onClick={() => toggle(entry.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(entry.id);
          }
        }}
        className={`space-y-1 rounded-md border p-2 transition-colors ${
          trashStyle ? "border-dashed opacity-80" : ""
        } ${
          isSelected
            ? "border-primary bg-primary/5 ring-2 ring-primary"
            : "cursor-pointer hover:border-primary/50"
        }`}
        data-testid={itemTestIdPrefix}
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
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
            aria-label={`选择 ${entry.alt}`}
            checked={isSelected}
            onChange={() => toggle(entry.id)}
            onClick={(e) => e.stopPropagation()}
            data-testid={`select-${entry.id}`}
          />
        </div>
        {cardActions && (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {cardActions(entry)}
          </div>
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
        {selectedIds.length > 0 && (
          <span className="text-sm text-muted-foreground" data-testid="selection-count">
            已选 {selectedIds.length}
          </span>
        )}
      </div>

      {selectedIds.length > 0 && (
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSelectionChange([])}
            data-testid={`batch-clear-${itemTestIdPrefix}`}
          >
            取消选择
          </Button>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        groups.map((group, gi) => {
          const groupIds = group.items.map((i) => i.id);
          const groupSelected = groupIds.every((id) => selectedSet.has(id));
          return (
            <div key={group.label ?? `ungrouped-${gi}`} className="space-y-2">
              {group.label && (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground" data-testid="album-day">
                    {group.label}
                    <span className="ml-2 font-normal">（{group.items.length} 张）</span>
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleGroup(groupIds)}
                    data-testid={`album-select-${group.label}`}
                  >
                    {groupSelected ? "取消全选" : "全选"}
                  </Button>
                </div>
              )}
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
                data-testid={group.label ? undefined : gridTestId}
              >
                {group.items.map(renderCard)}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
