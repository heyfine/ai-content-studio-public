"use client";

import { Eye as EyeIcon, RotateCcw as RestoreIcon, Trash2 as TrashIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface VersionRow {
  id: string;
  title: string;
  source: string;
  size: number;
  createdAt: string;
}

interface VersionDetail extends VersionRow {
  content: string;
  contentMd: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  save: "编辑保存",
  refresh: "AI 刷新",
  sync: "博客同步",
  restore: "恢复前存档",
};

function formatSize(size: number): string {
  if (size < 1024) return `${size} 字`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/** 编辑页「历史版本」弹窗：列表 / 预览 / 恢复（恢复前自动存档可再撤销）/ 删除 */
export function VersionHistoryDialog({
  articleId,
  onClose,
  onRestored,
}: {
  articleId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<VersionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/versions`);
      if (!res.ok) throw new Error("加载版本列表失败");
      setVersions((await res.json()) as VersionRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openPreview(version: VersionRow) {
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/versions/${version.id}`);
      if (!res.ok) throw new Error("加载版本详情失败");
      setPreview((await res.json()) as VersionDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function restore(version: VersionRow) {
    if (
      !confirm(
        `确认恢复到 ${formatDate(version.createdAt)} 的版本？当前内容会自动存档，可再次撤销。`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/versions/${version.id}/restore`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "恢复失败");
      onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function remove(version: VersionRow) {
    if (!confirm("确认删除该版本？此操作不可撤销。")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/versions/${version.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败");
      if (preview?.id === version.id) setPreview(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>历史版本</DialogTitle>
          <DialogDescription>
            每次正文被覆盖前自动存档（保存 / AI 刷新 / 博客同步），每篇保留最近 50 版。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto" data-testid="version-list">
          {loading && <p className="py-4 text-sm text-muted-foreground">加载中…</p>}
          {!loading && versions.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              还没有历史版本：从下次修改保存起，被覆盖的内容会自动存档到这里。
            </p>
          )}
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              data-testid="version-row"
            >
              <div className="min-w-0 text-sm">
                <span className="font-mono">{formatDate(v.createdAt)}</span>
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {SOURCE_LABELS[v.source] ?? v.source}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{formatSize(v.size)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="预览此版本"
                  onClick={() => void openPreview(v)}
                  data-testid={`version-preview-${v.id}`}
                >
                  <EyeIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="恢复此版本"
                  disabled={busy}
                  onClick={() => void restore(v)}
                  data-testid={`version-restore-${v.id}`}
                >
                  <RestoreIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="删除此版本"
                  disabled={busy}
                  onClick={() => void remove(v)}
                  data-testid={`version-delete-${v.id}`}
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {preview && (
          <div className="space-y-2" data-testid="version-preview">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                预览：{formatDate(preview.createdAt)}（
                {SOURCE_LABELS[preview.source] ?? preview.source}）
              </p>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                关闭预览
              </Button>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
              {preview.contentMd || preview.content}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
