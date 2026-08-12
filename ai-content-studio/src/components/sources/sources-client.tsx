"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink as ExternalLinkIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshIcon,
  Trash2 as Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SourceRow {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  fetchStatus: string;
  httpStatus: number | null;
  contentHash: string | null;
  wordCount: number | null;
  robotsStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface DetailRow extends SourceRow {
  normalizedContent: string | null;
  fetchError: string | null;
  versions?: { versionNumber: number; contentHash: string | null; createdAt: string }[];
}

interface IngestResult {
  source: {
    id: string;
    url: string;
    canonicalUrl: string;
    domain: string;
    title: string | null;
    fetchStatus: string;
  };
  created: boolean;
  versionBumped: boolean;
  versionNumber: number;
}

function statusColor(status: string): string {
  if (status === "parsed") return "text-emerald-600";
  if (status === "blocked" || status === "requires_access" || status === "failed")
    return "text-destructive";
  return "text-muted-foreground";
}

export function SourcesClient() {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) throw new Error("加载失败");
      setRows((await res.json()) as SourceRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAdd() {
    setSubmitting(true);
    setIngestMsg(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });
      const data = (await res.json().catch(() => ({}))) as IngestResult & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "抓取失败");
      if (data.created) {
        setIngestMsg(`已新建并抓取（v${data.versionNumber}）`);
      } else if (data.versionBumped) {
        setIngestMsg(`内容已更新，新增版本 v${data.versionNumber}`);
      } else {
        setIngestMsg(`来源已存在，内容未变化`);
      }
      setUrlInput("");
      void refresh();
    } catch (e) {
      setIngestMsg(e instanceof Error ? `失败：${e.message}` : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function onRefreshRow(id: string) {
    setRefreshingId(id);
    try {
      await fetch(`/api/sources/${id}/refresh`, { method: "POST" });
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingId(null);
    }
  }

  async function onDeleteRow(id: string) {
    if (!confirm("确认删除该来源？")) return;
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    void refresh();
  }

  async function onOpenDetail(id: string) {
    const res = await fetch(`/api/sources/${id}`);
    if (res.ok) setDetail((await res.json()) as DetailRow);
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
    <div className="space-y-4" data-testid="sources-client">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">来源库</h2>
        <Button
          size="sm"
          onClick={() => {
            setIngestMsg(null);
            setUrlInput("");
            setAddOpen(true);
          }}
          data-testid="add-source-btn"
        >
          <PlusIcon className="size-4" /> 添加来源
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加来源</DialogTitle>
            <DialogDescription>输入公开网页 URL，系统会抓取并解析正文。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="src-url">URL</Label>
            <Input
              id="src-url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/article"
              data-testid="src-url-input"
            />
            {ingestMsg && (
              <p className="text-sm" data-testid="ingest-msg">
                {ingestMsg}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void onAdd()}
              disabled={submitting || !urlInput}
              data-testid="submit-source"
            >
              {submitting ? "抓取中…" : "抓取入库"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无来源，点击右上角添加。</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">标题 / 域名</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium">HTTP</th>
                <th className="px-4 py-2 font-medium">字数</th>
                <th className="w-36 px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.title ?? "（无标题）"}</div>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                    >
                      {r.domain} <ExternalLinkIcon className="size-3" />
                    </a>
                  </td>
                  <td className="px-4 py-2">
                    <span className={statusColor(r.fetchStatus)} data-testid={`status-${r.id}`}>
                      {r.fetchStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.httpStatus ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.wordCount ?? "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="详情"
                        onClick={() => void onOpenDetail(r.id)}
                        data-testid={`detail-${r.id}`}
                      >
                        <ExternalLinkIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="刷新"
                        onClick={() => void onRefreshRow(r.id)}
                        disabled={refreshingId === r.id}
                        data-testid={`refresh-${r.id}`}
                      >
                        <RefreshIcon
                          className={refreshingId === r.id ? "size-4 animate-spin" : "size-4"}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="删除"
                        onClick={() => onDeleteRow(r.id)}
                        data-testid={`delete-${r.id}`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={!!detail}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.title ?? "来源详情"}</DialogTitle>
            <DialogDescription>{detail?.canonicalUrl}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>状态：{detail?.fetchStatus}</span>
              <span>HTTP：{detail?.httpStatus ?? "—"}</span>
              <span>字数：{detail?.wordCount ?? "—"}</span>
              <span>版本数：{detail?.versions?.length ?? 0}</span>
            </div>
            {detail?.fetchError && (
              <p className="text-sm text-destructive" data-testid="detail-error">
                {detail.fetchError}
              </p>
            )}
            <div
              className="max-h-[40vh] overflow-auto rounded-md border bg-muted/20 p-3 text-xs whitespace-pre-wrap"
              data-testid="detail-content"
            >
              {detail?.normalizedContent ?? "（暂无正文）"}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
