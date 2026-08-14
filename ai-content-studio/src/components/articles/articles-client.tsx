"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Pencil as PencilIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshIcon,
  Trash2 as Trash2Icon,
  Download as DownloadIcon,
  Server as ServerIcon,
  Archive as ArchiveIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArticleStatusBadge } from "./article-status-badge";
import type { ArticleRow } from "@/lib/article-types";
import { isStaleArticle } from "@/lib/article-staleness";
import { listWordpressConfigs } from "@/lib/services/wordpress-service";

interface RefreshOutcome {
  articleId: string;
  oldSeoScore: number | null;
  newSeoScore: number;
  delta: number;
}

function scoreCell(score: number | null): React.ReactNode {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const cls =
    score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-destructive";
  return <span className={cls}>{score}</span>;
}

export function ArticlesClient() {
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome | null>(null);
  const [wordpressConfigs, setWordpressConfigs] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; conflicts: number; errors: number } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/articles");
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

  // 加载 WordPress 站点配置
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const res = await fetch("/api/wordpress/configs");
        if (res.ok) {
          const configs = await res.json();
          setWordpressConfigs(configs);
        }
      } catch (e) {
        console.error("加载 WordPress 站点失败:", e);
      }
    };
    loadConfigs();
  }, []);

  async function onDelete(id: string) {
    if (!confirm("确认将文章移入回收站？")) return;
    setError(null);
    try {
      const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        wpSynced?: boolean;
        wpError?: string;
      };
      if (!res.ok) throw new Error(data?.error ?? "移入回收站失败");
      await refresh();
      if (data.wpSynced === false) {
        setError(`已移入本地回收站，但博客同步失败：${data.wpError ?? "未知错误"}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRefresh(id: string) {
    setRefreshingId(id);
    setRefreshOutcome(null);
    try {
      const res = await fetch(`/api/articles/${id}/refresh`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        articleId?: string;
        oldSeoScore?: number | null;
        newSeoScore?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data?.error ?? "刷新失败");
      const oldScore = data.oldSeoScore ?? null;
      const newScore = data.newSeoScore ?? 0;
      setRefreshOutcome({
        articleId: id,
        oldSeoScore: oldScore,
        newSeoScore: newScore,
        delta: newScore - (oldScore ?? 0),
      });
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? `AI 刷新失败：${e.message}` : String(e));
    } finally {
      setRefreshingId(null);
    }
  }

  async function onSyncFromBlog() {
    if (!selectedConfigId) {
      setError("请先选择博客站点");
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    setError(null);

    try {
      const res = await fetch("/api/wordpress/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: selectedConfigId }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        synced?: number;
        conflicts?: number;
        errors?: number;
        error?: string;
      };

      if (!res.ok) throw new Error(data?.error ?? "同步失败");

      setSyncResult({
        synced: data.synced ?? 0,
        conflicts: data.conflicts ?? 0,
        errors: data.errors ?? 0,
      });

      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
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
    <div className="space-y-4" data-testid="articles-client">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">文章管理</h2>
        <div className="flex items-center gap-3">
          {wordpressConfigs.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={selectedConfigId} onValueChange={(value) => setSelectedConfigId(value || "")}>
                <SelectTrigger className="w-[200px]">
                  <ServerIcon className="size-4 mr-2" />
                  <SelectValue placeholder="选择博客站点" />
                </SelectTrigger>
                <SelectContent>
                  {wordpressConfigs.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={onSyncFromBlog}
                disabled={!selectedConfigId || syncing}
                data-testid="sync-from-blog"
              >
                <DownloadIcon className="size-4 mr-1" />
                {syncing ? "同步中…" : "从博客同步"}
              </Button>
            </div>
          )}
          <Link href="/articles/trash" data-testid="trash-link">
            <Button variant="outline" size="sm">
              <ArchiveIcon className="size-4" /> 回收站
            </Button>
          </Link>
          <Link href="/articles/new" data-testid="new-article-link">
            <Button size="sm">
              <PlusIcon className="size-4" /> 新建文章
            </Button>
          </Link>
        </div>
      </div>

      {syncResult && (
        <p className="text-sm">
          同步完成：成功 {syncResult.synced} 篇，
          {syncResult.conflicts > 0 && (
            <span className="ml-1 text-amber-600">
              冲突 {syncResult.conflicts} 篇（点击文章查看详情）
            </span>
          )}
          {syncResult.errors > 0 && (
            <span className="ml-1 text-destructive">
              失败 {syncResult.errors} 篇
            </span>
          )}
        </p>
      )}

      {refreshOutcome && (
        <p className="text-sm text-emerald-600" data-testid="refresh-outcome">
          AI 刷新完成：SEO 评分 {refreshOutcome.oldSeoScore ?? "—"} →{" "}
          <span className="font-medium">{refreshOutcome.newSeoScore}</span>
          {refreshOutcome.delta > 0 && <span className="ml-1">（+{refreshOutcome.delta}）</span>}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无文章，点击右上角新建。</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">标题</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium">SEO</th>
                <th className="px-4 py-2 font-medium">同步</th>
                <th className="px-4 py-2 font-medium">标记</th>
                <th className="px-4 py-2 font-medium">更新时间</th>
                <th className="w-36 px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stale = isStaleArticle({
                  updatedAt: r.updatedAt ?? new Date(0),
                  seoScore: r.seoScore,
                });

                // 同步状态标签
                let syncBadge: React.ReactNode = null;
                if (r.syncStatus === "CONFLICT") {
                  syncBadge = (
                    <span
                      className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      title="检测到冲突，请手动解决"
                    >
                      冲突
                    </span>
                  );
                } else if (r.syncStatus === "SYNCED") {
                  syncBadge = (
                    <span
                      className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      title={`最后同步: ${r.lastSyncedAt?.slice(0, 16).replace("T", " ")}`}
                    >
                      已同步
                    </span>
                  );
                } else if (r.syncStatus === "FAILED") {
                  syncBadge = (
                    <span
                      className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                      title="同步失败"
                    >
                      失败
                    </span>
                  );
                }

                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{r.title}</td>
                    <td className="px-4 py-2">
                      <ArticleStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2">{scoreCell(r.seoScore)}</td>
                    <td className="px-4 py-2">{syncBadge}</td>
                    <td className="px-4 py-2">
                      {stale && (
                        <span
                          className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                          data-testid={`stale-mark-${r.id}`}
                        >
                          待刷新
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {r.updatedAt?.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="AI 刷新"
                          onClick={() => void onRefresh(r.id)}
                          disabled={refreshingId === r.id}
                          data-testid={`refresh-${r.id}`}
                        >
                          <RefreshIcon
                            className={refreshingId === r.id ? "size-4 animate-spin" : "size-4"}
                          />
                        </Button>
                        <Link href={`/articles/${r.id}/edit`} data-testid={`edit-${r.id}`}>
                          <Button variant="ghost" size="icon" aria-label="编辑">
                            <PencilIcon className="size-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="移入回收站"
                          onClick={() => onDelete(r.id)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
