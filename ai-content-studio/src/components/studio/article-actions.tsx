"use client";

import { useState } from "react";
import { Save as SaveIcon, CheckCircle2 as CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useStudioStore } from "@/stores/studio-store";
import { canTransition, ARTICLE_STATUS_LABELS, type ArticleStatus } from "@/lib/article-status";

/** 状态流转候选（保留常用三态） */
const FLOW_TARGETS: ArticleStatus[] = ["DRAFT", "REVIEW", "PUBLISHED"];

export function ArticleActions() {
  const {
    title,
    content,
    articleId,
    articleStatus,
    selectedPromptId,
    setError,
    setSavedArticle,
    setArticleStatus,
  } = useStudioStore();
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError("请先填写标题再保存");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let res: Response;
      if (articleId) {
        res = await fetch(`/api/articles/${articleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, promptId: selectedPromptId ?? undefined }),
        });
      } else {
        res = await fetch("/api/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            status: articleStatus ?? undefined,
            promptId: selectedPromptId ?? undefined,
          }),
        });
      }
      const data = (await res.json()) as { id?: string; status?: ArticleStatus; error?: string };
      if (!res.ok) throw new Error(data?.error ?? "保存失败");
      setSavedArticle(
        data.id ?? articleId ?? "",
        (data.status ?? articleStatus ?? "DRAFT") as ArticleStatus,
      );
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function transition(to: ArticleStatus) {
    if (!articleId || !articleStatus) return;
    if (!canTransition(articleStatus, to)) return;
    setTransitioning(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const data = (await res.json()) as { status?: ArticleStatus; error?: string };
      if (!res.ok) throw new Error(data?.error ?? "状态切换失败");
      setArticleStatus(to);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransitioning(false);
    }
  }

  const saved = !!articleId;

  return (
    <div className="space-y-2" data-testid="article-actions">
      <Label>文章保存</Label>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => void save()}
        disabled={saving || !title.trim()}
        data-testid="save-article"
      >
        <SaveIcon className="size-3.5" />
        {saving ? "保存中…" : saved ? "保存修改" : "保存草稿"}
      </Button>
      {savedHint && (
        <p className="flex items-center gap-1 text-xs text-emerald-600" data-testid="saved-hint">
          <CheckCircle2Icon className="size-3" /> 已保存
        </p>
      )}
      {saved && articleStatus && (
        <div className="space-y-2" data-testid="status-flow">
          <div className="text-xs text-muted-foreground">
            当前状态：
            <span className="font-medium text-foreground">
              {ARTICLE_STATUS_LABELS[articleStatus]}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {FLOW_TARGETS.map((target) => {
              const allowed = canTransition(articleStatus, target);
              const isCurrent = articleStatus === target;
              return (
                <Button
                  key={target}
                  variant={isCurrent ? "secondary" : "outline"}
                  size="xs"
                  onClick={() => void transition(target)}
                  disabled={transitioning || !allowed || isCurrent}
                  data-testid={`status-${target}`}
                  title={
                    allowed
                      ? `切换到 ${ARTICLE_STATUS_LABELS[target]}`
                      : `不能从 ${ARTICLE_STATUS_LABELS[articleStatus]} 切换到 ${ARTICLE_STATUS_LABELS[target]}`
                  }
                >
                  {ARTICLE_STATUS_LABELS[target]}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      {!saved && <p className="text-xs text-muted-foreground">尚未保存，填写标题后保存为草稿。</p>}
    </div>
  );
}
