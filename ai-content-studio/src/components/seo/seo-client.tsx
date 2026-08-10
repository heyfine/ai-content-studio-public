"use client";

import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ArticleOption {
  id: string;
  title: string;
  status: string;
}

interface SeoResult {
  score: number;
  keywords: string[];
  issues: string[];
  suggestions: string[];
  saved?: boolean;
  reportId?: string;
}

type Mode = "article" | "preview";

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-destructive";
}

export function SeoClient() {
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<Mode>("article");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<SeoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/articles");
        if (!res.ok) throw new Error("加载文章失败");
        setArticles((await res.json()) as ArticleOption[]);
      } catch {
        if (!cancelled) setArticles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function analyze() {
    setError(null);
    setAnalyzing(true);
    try {
      const body =
        mode === "article"
          ? { articleId: selectedId }
          : { title, content, metaDescription: metaDescription || undefined };
      const res = await fetch("/api/seo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as SeoResult & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "分析失败");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  const canAnalyze =
    mode === "article" ? !!selectedId : title.trim().length > 0 && content.trim().length > 0;

  return (
    <div className="space-y-6" data-testid="seo-client">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">SEO 分析</h2>
        <div role="group" aria-label="分析模式" className="flex gap-1">
          <Button
            variant={mode === "article" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("article")}
            aria-pressed={mode === "article"}
          >
            选文章
          </Button>
          <Button
            variant={mode === "preview" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("preview")}
            aria-pressed={mode === "preview"}
          >
            粘贴预览
          </Button>
        </div>
      </div>

      {mode === "article" ? (
        <div className="space-y-2">
          <Label htmlFor="seo-article">选择文章</Label>
          <select
            id="seo-article"
            aria-label="选择文章"
            className="max-w-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={selectedId}
            disabled={loading}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">{loading ? "加载中…" : "请选择"}</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="seo-title">标题</Label>
            <Input
              id="seo-title"
              aria-label="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seo-content">正文（Markdown）</Label>
            <textarea
              id="seo-content"
              aria-label="正文"
              className="min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seo-meta">Meta 描述（可选）</Label>
            <Input
              id="seo-meta"
              aria-label="Meta 描述"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
            />
          </div>
        </div>
      )}

      <Button
        onClick={() => void analyze()}
        disabled={analyzing || !canAnalyze}
        data-testid="seo-analyze"
      >
        <SearchIcon className="size-4" /> {analyzing ? "分析中…" : "分析 SEO"}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4 rounded-lg border p-4" data-testid="seo-result">
          <div className="flex items-center gap-3">
            <span
              className={cn("text-3xl font-bold", scoreColor(result.score))}
              data-testid="seo-score"
            >
              {result.score}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            {result.saved && <span className="text-xs text-emerald-600">· 已存为报告</span>}
          </div>
          {result.keywords.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">关键词</p>
              <div className="flex flex-wrap gap-1">
                {result.keywords.map((k) => (
                  <span key={k} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.issues.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">问题</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {result.issues.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {result.suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">建议</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-emerald-700 dark:text-emerald-400">
                {result.suggestions.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
