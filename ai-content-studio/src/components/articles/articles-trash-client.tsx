"use client";

import {
  ArrowLeft as BackIcon,
  X as DeleteForeverIcon,
  RotateCcw as RestoreIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ArticleRow } from "@/lib/article-types";
import { ArticleStatusBadge } from "./article-status-badge";

export function ArticlesTrashClient() {
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/articles?trashed=true");
      if (!res.ok) throw new Error("加载失败");
      setRows((await res.json()) as ArticleRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onRestore(id: string) {
    if (!confirm("确认恢复该文章？")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${id}/restore`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        wpSynced?: boolean;
        wpError?: string;
      };
      if (!res.ok) throw new Error(data?.error ?? "恢复失败");
      await refresh();
      if (data.wpSynced === false) {
        setError(`本地已恢复，但博客同步失败：${data.wpError ?? "未知错误"}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onDeleteForever(id: string) {
    if (!confirm("确认彻底删除该文章？此操作不可恢复，博客侧也将被永久删除。")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${id}?permanent=true`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        wpDeleted?: boolean;
        wpError?: string;
      };
      if (!res.ok) throw new Error(data?.error ?? "删除失败");
      await refresh();
      if (data.wpDeleted === false) {
        setError(`本地已删除，但博客删除失败：${data.wpError ?? "未知错误"}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-destructive">
          {error}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          重试
        </Button>
      </div>
    );

  return (
    <div className="space-y-4" data-testid="articles-trash-client">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">回收站</h2>
        <Link href="/articles">
          <Button variant="outline" size="sm">
            <BackIcon className="size-4" /> 返回文章管理
          </Button>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        回收站中的文章仍占用空间，可从博客侧恢复，也可彻底删除。
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">回收站是空的。</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">标题</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium">删除时间</th>
                <th className="w-40 px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{r.title}</td>
                  <td className="px-4 py-2">
                    <ArticleStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.deletedAt ? r.deletedAt.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="恢复"
                        onClick={() => void onRestore(r.id)}
                        disabled={busyId === r.id}
                        data-testid={`restore-${r.id}`}
                      >
                        <RestoreIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="彻底删除"
                        onClick={() => void onDeleteForever(r.id)}
                        disabled={busyId === r.id}
                        data-testid={`purge-${r.id}`}
                      >
                        <DeleteForeverIcon className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
