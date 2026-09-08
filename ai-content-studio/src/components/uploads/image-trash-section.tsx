"use client";

import { Clock as ClockIcon, RotateCcw as RotateCcwIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSize, formatTime } from "./image-format";

/** 回收站条目（与 /api/uploads/trash、/api/storage/images/trash 返回结构一致） */
export interface TrashImageEntry {
  id: string;
  backend: "local" | "remote";
  url: string;
  size: number;
  deletedAt: string;
  expiresAt: string;
  daysLeft: number;
}

interface TrashSectionProps {
  title: string;
  entries: TrashImageEntry[];
  onRestore: (entry: TrashImageEntry) => void;
  onPurge: (entry: TrashImageEntry) => void;
}

/** 图片库回收站区块：过期时间徽标 + 恢复/彻底删除操作，本地与云端区复用 */
export function ImageTrashSection({ title, entries, onRestore, onPurge }: TrashSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">
        {title}
        <span className="ml-2 text-sm font-normal text-muted-foreground">（{entries.length}）</span>
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">回收站是空的。</p>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          data-testid="trash-grid"
        >
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="space-y-1 rounded-md border border-dashed p-2 opacity-80"
              data-testid="trash-image"
            >
              {/* biome-ignore lint/performance/noImgElement: 图片库缩略图使用原生 img，next/image 需配置域名 */}
              <img
                src={entry.url}
                alt={entry.id}
                className="h-28 w-full rounded object-cover grayscale"
                loading="lazy"
              />
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ClockIcon className="size-3" />
                {formatTime(entry.deletedAt)} 删除 · {formatSize(entry.size)}
              </p>
              <p
                className={`text-xs ${entry.daysLeft <= 3 ? "text-destructive" : "text-muted-foreground"}`}
                data-testid="trash-expires"
              >
                {entry.daysLeft > 0 ? `${entry.daysLeft} 天后自动清除` : "即将自动清除"}
              </p>
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="恢复图片"
                  title="恢复"
                  onClick={() => onRestore(entry)}
                  data-testid={`trash-restore-${entry.id}`}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="彻底删除图片"
                  title="彻底删除"
                  onClick={() => onPurge(entry)}
                  data-testid={`trash-purge-${entry.id}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
