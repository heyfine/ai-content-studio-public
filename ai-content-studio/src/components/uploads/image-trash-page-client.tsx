"use client";

import { RotateCcw as RotateCcwIcon, Trash2 as Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type BatchBarAction, type BatchGridEntry, ImageBatchGrid } from "./image-batch-grid";
import { formatTime } from "./image-format";
import type { BatchItemResult, TrashImageEntry } from "./image-library-client";

/**
 * 图片回收站独立页（/images/trash）：本地 + 云端回收站合并展示。
 * 恢复/彻底删除走各自后端的 trash 批量 op；14 天未处理由服务器调度器自动清理。
 */
export function ImageTrashPageClient() {
  const [trash, setTrash] = useState<TrashImageEntry[]>([]);
  const [remoteTrash, setRemoteTrash] = useState<TrashImageEntry[]>([]);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localSel, setLocalSel] = useState<string[]>([]);
  const [remoteSel, setRemoteSel] = useState<string[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const [localRes, remoteRes] = await Promise.all([
        fetch("/api/uploads/trash"),
        fetch("/api/storage/images/trash"),
      ]);
      if (!localRes.ok) throw new Error("加载回收站失败");
      setTrash((await localRes.json()) as TrashImageEntry[]);
      // 云端区容错：对象存储失败只影响云端区
      try {
        const remote = (await remoteRes.json()) as {
          enabled?: boolean;
          name?: string;
          images?: TrashImageEntry[];
        };
        setRemoteEnabled(remote.enabled ?? false);
        setRemoteName(remote.name ?? "");
        setRemoteTrash(remote.images ?? []);
      } catch {
        setRemoteEnabled(false);
        setRemoteName("");
        setRemoteTrash([]);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh 为组件内函数，仅挂载时执行一次
  useEffect(() => {
    void refresh();
  }, []);

  function showBatchResult(results: BatchItemResult[], successHint: string) {
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      setHint(`${successHint}（${results.length} 张）`);
    } else {
      setError(
        `${successHint.replace(/成功|完成/, "")}完成：成功 ${results.length - failed.length} 张，失败 ${failed.length} 张` +
          (failed[0]?.error ? `，首个失败原因：${failed[0].error}` : ""),
      );
    }
  }

  async function postJson(url: string, body: unknown): Promise<BatchItemResult[]> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      results?: BatchItemResult[];
      error?: string;
    };
    if (!res.ok) throw new Error(data?.error ?? "操作失败");
    return data.results ?? [];
  }

  async function batchTrashOp(op: "restore" | "purge", names: string[], successHint: string) {
    try {
      const results = await postJson("/api/uploads/trash", { op, names });
      showBatchResult(results, successHint);
      setLocalSel([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function batchRemoteTrashOp(op: "restore" | "purge", keys: string[], successHint: string) {
    try {
      const results = await postJson("/api/storage/images/trash", { op, keys });
      showBatchResult(results, successHint);
      setRemoteSel([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function trashCaption(entry: TrashImageEntry, testId: string) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={testId}>
        {formatTime(entry.deletedAt)} 删除 ·{" "}
        <span className={entry.daysLeft <= 3 ? "text-destructive" : ""}>
          {entry.daysLeft > 0 ? `${entry.daysLeft} 天后自动清除` : "即将自动清除"}
        </span>
      </p>
    );
  }

  function trashCardActions(
    entry: BatchGridEntry,
    onRestore: (id: string) => void,
    onPurge: (id: string) => void,
  ) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          aria-label="恢复图片"
          title="恢复"
          onClick={() => onRestore(entry.id)}
          data-testid={`trash-restore-${entry.id}`}
        >
          <RotateCcwIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="彻底删除图片"
          title="彻底删除"
          onClick={() => onPurge(entry.id)}
          data-testid={`trash-purge-${entry.id}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </>
    );
  }

  const localBatchActions: BatchBarAction[] = [
    {
      label: "批量恢复",
      onClick: (ids) => void batchTrashOp("restore", ids, "批量恢复成功"),
    },
    {
      label: "批量彻底删除",
      danger: true,
      onClick: (ids) => {
        if (window.confirm(`彻底删除选中的 ${ids.length} 张图片？此操作不可恢复。`)) {
          void batchTrashOp("purge", ids, "批量彻底删除成功");
        }
      },
    },
  ];

  const remoteBatchActions: BatchBarAction[] = [
    {
      label: "批量恢复",
      onClick: (ids) => void batchRemoteTrashOp("restore", ids, "批量恢复成功"),
    },
    {
      label: "批量彻底删除",
      danger: true,
      onClick: (ids) => {
        if (window.confirm(`彻底删除选中的 ${ids.length} 张图片？此操作不可恢复。`)) {
          void batchRemoteTrashOp("purge", ids, "批量彻底删除成功");
        }
      },
    },
  ];

  return (
    <div className="space-y-8" data-testid="image-trash-page">
      <div>
        <h2 className="text-lg font-semibold">回收站</h2>
        <p className="text-sm text-muted-foreground">
          删除的图片在此保留 14 天，到期自动清除；恢复后原链接继续可用。
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {hint && (
        <p className="text-sm text-emerald-600" data-testid="trash-hint">
          {hint}
        </p>
      )}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <ImageBatchGrid
        title="本地图片回收站"
        count={trash.length}
        emptyText="本地回收站是空的。"
        trashStyle
        entries={trash.map<BatchGridEntry>((entry) => ({
          id: entry.id,
          url: entry.url,
          alt: entry.id,
          caption: trashCaption(entry, "trash-expires"),
        }))}
        selectedIds={localSel}
        onSelectionChange={setLocalSel}
        batchActions={localBatchActions}
        cardActions={(entry) =>
          trashCardActions(
            entry,
            (id) => void batchTrashOp("restore", [id], "图片已恢复到本地图片库"),
            (id) => {
              if (window.confirm(`彻底删除 ${id}？此操作不可恢复。`)) {
                void batchTrashOp("purge", [id], "已彻底删除");
              }
            },
          )
        }
        gridTestId="trash-grid"
        itemTestIdPrefix="trash-image"
      />

      {remoteEnabled && (
        <ImageBatchGrid
          title={<>云端图片回收站（{remoteName}）</>}
          count={remoteTrash.length}
          emptyText="云端回收站是空的。"
          trashStyle
          entries={remoteTrash.map<BatchGridEntry>((entry) => ({
            id: entry.id,
            url: entry.url,
            alt: entry.id,
            caption: trashCaption(entry, "trash-expires-remote"),
          }))}
          selectedIds={remoteSel}
          onSelectionChange={setRemoteSel}
          batchActions={remoteBatchActions}
          cardActions={(entry) =>
            trashCardActions(
              entry,
              (id) => void batchRemoteTrashOp("restore", [id], "图片已恢复到云端图片库"),
              (id) => {
                if (window.confirm(`彻底删除 ${id}？此操作不可恢复。`)) {
                  void batchRemoteTrashOp("purge", [id], "已彻底删除");
                }
              },
            )
          }
          gridTestId="remote-trash-grid"
          itemTestIdPrefix="remote-trash-image"
        />
      )}
    </div>
  );
}
