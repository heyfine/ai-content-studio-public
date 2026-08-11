"use client";

import { useEffect, useState } from "react";
import {
  Play as PlayIcon,
  CheckCircle2 as CheckIcon,
  XCircle as XIcon,
  MinusCircle as SkipIcon,
  ExternalLink as ExternalLinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StepResult {
  id: string;
  name: string;
  output: { status: string; content?: string; data?: Record<string, unknown>; error?: string };
}

interface RunResult {
  run: {
    id: string;
    topic: string;
    status: string;
    articleId: string | null;
    error: string | null;
    steps: unknown;
  };
  result: { status: string; reason?: string; steps: StepResult[] };
}

interface HistoryItem {
  id: string;
  topic: string;
  status: string;
  articleId: string | null;
  error: string | null;
  createdAt: string;
}

const STEP_LABELS: Record<string, string> = {
  outline: "选题/大纲",
  write: "写作",
  seo: "SEO 分析",
  review: "AI 审核",
  publish: "发布 WordPress",
};

function statusIcon(status: string) {
  if (status === "success") return <CheckIcon className="size-4 text-emerald-600" />;
  if (status === "failed") return <XIcon className="size-4 text-destructive" />;
  if (status === "skipped") return <SkipIcon className="size-4 text-muted-foreground" />;
  return null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function WorkflowClient() {
  const [topic, setTopic] = useState("");
  const [wpStatus, setWpStatus] = useState<"draft" | "publish">("draft");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("加载历史失败");
      setHistory((await res.json()) as HistoryItem[]);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function run() {
    if (!topic.trim()) return;
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, wpStatus }),
      });
      const data = (await res.json()) as RunResult & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "工作流执行失败");
      setResult(data);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const canRun = topic.trim().length > 0 && !running;

  return (
    <div className="space-y-6" data-testid="workflow-client">
      <h2 className="text-lg font-semibold">AI 内容工作流</h2>
      <p className="text-sm text-muted-foreground">
        输入主题，AI 自动完成「选题/大纲 → 写作 → SEO → 审核 → 发布」全流程，约需 1-2 分钟。
      </p>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="wf-topic">主题</Label>
          <Input
            id="wf-topic"
            aria-label="主题"
            placeholder="例如：Next.js 16 新特性解析"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={running}
          />
        </div>
        <div className="space-y-2">
          <Label>发布到 WordPress 的状态</Label>
          <div role="group" aria-label="发布状态" className="flex gap-1">
            <Button
              variant={wpStatus === "draft" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setWpStatus("draft")}
              aria-pressed={wpStatus === "draft"}
              disabled={running}
            >
              草稿（推荐）
            </Button>
            <Button
              variant={wpStatus === "publish" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setWpStatus("publish")}
              aria-pressed={wpStatus === "publish"}
              disabled={running}
            >
              直接发布
            </Button>
          </div>
        </div>
        <Button onClick={() => void run()} disabled={!canRun} data-testid="wf-run">
          <PlayIcon className="size-4" /> {running ? "运行中…" : "运行工作流"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-3 rounded-lg border p-4" data-testid="wf-result">
          <div className="flex items-center gap-2">
            <span className="font-medium">{result.run.topic}</span>
            <span
              className={
                result.result.status === "success"
                  ? "text-emerald-600 text-sm"
                  : "text-destructive text-sm"
              }
            >
              {result.result.status === "success" ? "成功" : "失败"}
            </span>
          </div>
          <ol className="space-y-1">
            {result.result.steps.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-2 text-sm"
                data-testid={`wf-step-${s.id}`}
              >
                {statusIcon(s.output.status)}
                <span>{STEP_LABELS[s.id] ?? s.name}：</span>
                <span className="text-muted-foreground">
                  {s.output.status === "success"
                    ? "完成"
                    : s.output.status === "skipped"
                      ? "跳过"
                      : (s.output.error ?? "失败")}
                </span>
                {s.id === "seo" && s.output.data?.score !== undefined && (
                  <span className="text-emerald-600">· 评分 {String(s.output.data.score)}</span>
                )}
                {s.id === "publish" && Boolean(s.output.data?.link) && (
                  <a
                    href={String(s.output.data?.link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    data-testid="wf-step-link"
                  >
                    <ExternalLinkIcon className="size-3" /> 文章链接
                  </a>
                )}
              </li>
            ))}
          </ol>
          {result.run.error && (
            <p className="text-sm text-destructive" data-testid="wf-run-error">
              {result.run.error}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">历史记录</h3>
        {loadingHistory && <p className="text-sm text-muted-foreground">加载中…</p>}
        {!loadingHistory && history.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="wf-no-history">
            暂无运行记录
          </p>
        )}
        {!loadingHistory && history.length > 0 && (
          <ul className="divide-y rounded-lg border" data-testid="wf-history">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">{h.topic}</span>
                <span
                  className={h.status === "SUCCEEDED" ? "text-emerald-600" : "text-destructive"}
                >
                  {h.status === "SUCCEEDED" ? "成功" : "失败"} · {formatDate(h.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
