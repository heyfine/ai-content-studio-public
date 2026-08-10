"use client";

import { useEffect, useState } from "react";
import {
  Send as SendIcon,
  Trash2 as Trash2Icon,
  ExternalLink as ExternalLinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ArticleOption {
  id: string;
  title: string;
  status: string;
  wpPostId: string | null;
}

interface WpConfigOption {
  id: string;
  name: string;
  siteUrl: string;
  username: string;
  enabled: boolean;
}

interface PublishResult {
  wpPostId: string;
  link: string;
  status: string;
  articleId: string;
}

type WpStatusMode = "auto" | "publish" | "draft";

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "草稿";
    case "REVIEW":
      return "审阅中";
    case "PUBLISHED":
      return "已发布";
    case "ARCHIVED":
      return "已归档";
    default:
      return status;
  }
}

export function PublishClient() {
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [configs, setConfigs] = useState<WpConfigOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [wpStatusMode, setWpStatusMode] = useState<WpStatusMode>("auto");
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [artRes, cfgRes] = await Promise.all([
          fetch("/api/articles"),
          fetch("/api/wordpress/configs"),
        ]);
        if (!artRes.ok || !cfgRes.ok) throw new Error("加载失败");
        const art = (await artRes.json()) as ArticleOption[];
        const cfg = (await cfgRes.json()) as WpConfigOption[];
        if (!cancelled) {
          setArticles(art);
          const enabled = cfg.filter((c) => c.enabled);
          setConfigs(enabled);
          if (enabled.length === 1) setSelectedConfigId(enabled[0].id);
        }
      } catch {
        if (!cancelled) {
          setArticles([]);
          setConfigs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedArticle = articles.find((a) => a.id === selectedArticleId);

  async function publish() {
    if (!selectedArticleId) return;
    setError(null);
    setResult(null);
    setPublishing(true);
    try {
      const body: Record<string, string> = { articleId: selectedArticleId };
      if (selectedConfigId) body.configId = selectedConfigId;
      if (wpStatusMode !== "auto") body.wpStatus = wpStatusMode;
      const res = await fetch("/api/wordpress/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as PublishResult & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "发布失败");
      setResult(data);
      setArticles((prev) =>
        prev.map((a) =>
          a.id === selectedArticleId ? { ...a, wpPostId: String(data.wpPostId) } : a,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  async function unpublish() {
    if (!selectedArticleId || !selectedArticle?.wpPostId) return;
    setError(null);
    setResult(null);
    setUnpublishing(true);
    try {
      const params = new URLSearchParams({ articleId: selectedArticleId });
      if (selectedConfigId) params.set("configId", selectedConfigId);
      const res = await fetch("/api/wordpress/publish?" + params.toString(), {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: string };
      if (!res.ok) throw new Error(data?.error ?? "撤销失败");
      setArticles((prev) =>
        prev.map((a) => (a.id === selectedArticleId ? { ...a, wpPostId: null } : a)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUnpublishing(false);
    }
  }

  const canPublish = !!selectedArticleId && configs.length > 0 && !publishing;
  const canUnpublish = !!selectedArticle?.wpPostId && !unpublishing;

  return (
    <div className="space-y-6" data-testid="publish-client">
      <h2 className="text-lg font-semibold">WordPress 发布</h2>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!loading && articles.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="no-articles">
          暂无文章，请先在 AI Studio 创建文章。
        </p>
      )}

      {!loading && articles.length > 0 && (
        <>
          <div className="space-y-2">
            <Label htmlFor="pub-article">选择文章</Label>
            <select
              id="pub-article"
              aria-label="选择文章"
              className="max-w-md w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={selectedArticleId}
              onChange={(e) => {
                setSelectedArticleId(e.target.value);
                setResult(null);
                setError(null);
              }}
              disabled={publishing || unpublishing}
            >
              <option value="">请选择</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}（{statusLabel(a.status)}）{a.wpPostId ? " · 已发布到 WP" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pub-config">WordPress 站点</Label>
            {configs.length === 0 ? (
              <p className="text-sm text-amber-600" data-testid="no-config">
                尚未配置启用的 WordPress 站点，请先在数据库添加 WordPressConfig。
              </p>
            ) : (
              <select
                id="pub-config"
                aria-label="WordPress 站点"
                className="max-w-md w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                disabled={publishing || unpublishing}
              >
                {configs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.siteUrl}）
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label>发布状态</Label>
            <div role="group" aria-label="发布状态" className="flex gap-1">
              {(["auto", "publish", "draft"] as const).map((m) => (
                <Button
                  key={m}
                  variant={wpStatusMode === m ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setWpStatusMode(m)}
                  aria-pressed={wpStatusMode === m}
                  disabled={publishing || unpublishing}
                >
                  {m === "auto" ? "自动（按文章状态）" : m === "publish" ? "直接发布" : "草稿"}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void publish()} disabled={!canPublish} data-testid="wp-publish">
              <SendIcon className="size-4" /> {publishing ? "发布中…" : "发布到 WordPress"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void unpublish()}
              disabled={!canUnpublish || publishing}
              data-testid="wp-unpublish"
            >
              <Trash2Icon className="size-4" /> {unpublishing ? "撤销中…" : "撤销发布"}
            </Button>
          </div>

          {selectedArticle?.wpPostId && !result && (
            <p className="text-sm text-muted-foreground" data-testid="wp-existing">
              当前文章已发布到 WordPress（#{selectedArticle.wpPostId}）
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border p-4" data-testid="wp-result">
              <p className="text-sm">
                发布成功！WP 文章 ID：
                <span className="font-mono font-medium">#{result.wpPostId}</span>
                <span className="ml-2 text-muted-foreground">（{result.status}）</span>
              </p>
              <a
                href={result.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                data-testid="wp-link"
              >
                <ExternalLinkIcon className="size-3" /> {result.link}
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
