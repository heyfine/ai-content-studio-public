"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ARTICLE_STATUS_LABELS,
  ARTICLE_STATUS_LIST,
  type ArticleStatus,
} from "@/lib/article-status";
import type { ArticleRow } from "@/lib/article-types";
import { useMarkdownEditor } from "@/lib/editor/use-markdown-editor";
import { EditorToolbar } from "@/lib/editor/components/editor-toolbar";
import { MarkdownPreview } from "@/components/studio/markdown-preview";
import {
  TemplatePickerDialog,
  type PromptOption,
} from "@/components/studio/template-picker-dialog";
import { taskRouteDefinitions } from "@/config/task-routes";
import { useStudioStore } from "@/stores/studio-store";
import { LayoutSuggestPanel } from "./layout-suggest-panel";
import { type CalloutSuggestion, acceptSuggestion } from "@/lib/content/callout-suggest-ui";
import {
  LAYOUT_STYLE_LABELS,
  LAYOUT_STYLES,
  type LayoutStyle,
  type LayoutSuggestion,
} from "@/lib/content/layout-suggest-types";
import { CALLOUT_TYPES } from "@/lib/content/callout-types";

export interface TiptapEditorPageProps {
  articleId: string | null;
}

/**
 * Tiptap 富文本块编辑器（文章主编辑器，替代经典编辑器）。
 *
 * 数据模型：content 保留 Markdown（兼容旧数据/AI/WP/SEO 链路），并同步写入
 * contentJson（ProseMirror doc JSON）、contentHtml、contentMd 三个新字段。
 * 保存契约：Markdown 是唯一事实源，三个派生字段由编辑器即时派生。
 *
 * 集成能力：
 * - AI 智能排版（layout_suggest）：选排版强度 → 弹模板选择 → 对比 diff → 应用到编辑器
 * - AI 建议高亮块（suggest-callouts）：逐条接受/拒绝/全部接受
 * - 预览：编辑/预览 toggle，用 MarkdownPreview 渲染最终效果
 *
 * 生命周期：外层先 fetch 数据，拿到最终 content 后才渲染内层 editor，
 * 保证 useMarkdownEditor 的 initialContent 首次创建即正确（Tiptap 不响应
 * initialContent 后续变化）。
 */
export function TiptapEditorPage({ articleId }: TiptapEditorPageProps) {
  const isEdit = !!articleId;
  const [loaded, setLoaded] = useState<ArticleRow | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!articleId) {
      setLoaded({
        id: "",
        title: "",
        slug: "",
        content: "",
        status: "DRAFT",
        seoScore: null,
        wpPostId: null,
        promptId: null,
      });
      setLoading(false);
      return;
    }
    fetch(`/api/articles/${articleId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("加载失败");
        return res.json() as Promise<ArticleRow>;
      })
      .then(setLoaded)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [articleId]);

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!loaded) return null;

  return <TiptapEditorInner key={loaded.id} initial={loaded} isEdit={isEdit} />;
}

interface TiptapEditorInnerProps {
  initial: ArticleRow;
  isEdit: boolean;
}

function TiptapEditorInner({ initial, isEdit }: TiptapEditorInnerProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<ArticleStatus>(initial.status ?? "DRAFT");
  const [content, setContent] = useState(initial.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // AI 智能排版
  const [layoutStyle, setLayoutStyle] = useState<LayoutStyle>("standard");
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutSuggestions, setLayoutSuggestions] = useState<LayoutSuggestion[] | null>(null);
  const [layoutPending, setLayoutPending] = useState(false);
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const lastLayoutPrompt = useStudioStore((s) => s.lastPromptByTask.layout_suggest ?? null);
  const setLastPrompt = useStudioStore((s) => s.setLastPrompt);

  // AI 建议高亮块
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<CalloutSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const editor: Editor | null = useMarkdownEditor({
    initialContent: initial.content ?? "",
    editable: true,
    onChange: (md) => setContent(md),
  });

  // 加载 Prompt 模板列表（供「AI 智能排版」选择模板时使用）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/prompts");
        if (!res.ok) throw new Error("加载 Prompt 失败");
        const data = (await res.json()) as unknown;
        setPrompts(Array.isArray(data) ? (data as PromptOption[]) : []);
      } catch {
        if (!cancelled) setPrompts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 把新 Markdown 直刷进编辑器（emitUpdate: false 避免 onChange 回环），并同步 state */
  function applyContent(next: string) {
    editor?.commands.setContent(next, { emitUpdate: false });
    setContent(next);
  }

  /** 点击「AI 智能排版」：先弹 Prompt 模板选择框（与 AI Studio 交互一致） */
  function handleLayoutClick() {
    if (content.trim().length === 0) {
      setLayoutError("正文为空，无法排版");
      return;
    }
    setLayoutError(null);
    setLayoutPending(true);
  }

  /** 模板确认后执行排版 */
  async function runLayout(promptId: string | null) {
    setLayoutLoading(true);
    try {
      const res = await fetch("/api/articles/suggest-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          title,
          style: layoutStyle,
          ...(promptId ? { promptId } : {}),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setLayoutError(err.error ?? "AI 排版失败");
        return;
      }
      const data = (await res.json()) as { suggestions: LayoutSuggestion[] };
      setLayoutSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) {
        setLayoutError("AI 认为当前排版已足够，无需调整");
      }
    } catch (e) {
      setLayoutError(e instanceof Error ? e.message : String(e));
    } finally {
      setLayoutLoading(false);
    }
  }

  function handleLayoutConfirm(promptId: string | null) {
    setLastPrompt("layout_suggest", promptId);
    setLayoutPending(false);
    void runLayout(promptId);
  }

  async function onSuggestCallouts() {
    setSuggestError(null);
    if (content.trim().length === 0) {
      setSuggestError("正文为空，无法生成建议");
      return;
    }
    setSuggesting(true);
    try {
      const res = await fetch("/api/articles/suggest-callouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setSuggestError(err.error ?? "AI 建议失败");
        return;
      }
      const data = (await res.json()) as { suggestions: CalloutSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) {
        setSuggestError("AI 未发现需要高亮的段落");
      }
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  function onAcceptSuggestion(idx: number) {
    const s = suggestions[idx];
    if (!s) return;
    applyContent(acceptSuggestion(content, s));
    setSuggestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function onRejectSuggestion(idx: number) {
    setSuggestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function onAcceptAll() {
    let next = content;
    for (const s of [...suggestions]) {
      next = acceptSuggestion(next, s);
    }
    applyContent(next);
    setSuggestions([]);
  }

  async function onSubmit() {
    if (!title.trim()) return;
    setError(null);
    setSaving(true);
    try {
      // Markdown 事实源（content）+ 三个派生字段（json/html/md）
      const json = editor?.getJSON() ?? null;
      const html = editor?.getHTML() ?? null;
      const body = {
        title,
        status,
        content,
        contentJson: json,
        contentHtml: html,
        contentMd: content,
      };
      const res = await fetch(isEdit ? `/api/articles/${initial.id}` : "/api/articles", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? "操作失败");
        return;
      }
      router.push("/articles");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="tiptap-editor-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? "编辑文章" : "新建文章"}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.push("/articles")}>
            取消
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={!title.trim() || saving}
            data-testid="submit-article"
          >
            {saving ? "保存中…" : isEdit ? "保存" : "创建"}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="article-title">标题</Label>
          <Input
            id="article-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="article-title-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="article-status">状态</Label>
          <select
            id="article-status"
            className="max-w-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as ArticleStatus)}
          >
            {ARTICLE_STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {ARTICLE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="article-content">正文</Label>
            <div className="flex items-center gap-1">
              <select
                aria-label="排版强度"
                className="rounded-md border border-input bg-transparent px-2 py-1.5 text-xs"
                value={layoutStyle}
                onChange={(e) => setLayoutStyle(e.target.value as LayoutStyle)}
                disabled={layoutLoading || mode !== "edit"}
                data-testid="layout-style-select"
              >
                {LAYOUT_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {LAYOUT_STYLE_LABELS[s]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="ai-layout"
                onClick={handleLayoutClick}
                disabled={layoutLoading || mode !== "edit"}
              >
                <Sparkles className="size-3.5" />
                {layoutLoading ? "排版中…" : "AI 智能排版"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="ai-suggest-callouts"
                onClick={() => void onSuggestCallouts()}
                disabled={suggesting || mode !== "edit"}
              >
                <Sparkles className="size-3.5" />
                {suggesting ? "分析中…" : "AI 建议"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                data-testid="toggle-preview"
                onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
              >
                {mode === "edit" ? "预览" : "编辑"}
              </Button>
            </div>
          </div>

          {mode === "edit" && suggestions.length > 0 && (
            <div
              className="space-y-2 rounded-md border border-dashed border-muted-foreground p-3"
              data-testid="suggestion-list"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">AI 建议高亮 {suggestions.length} 处</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-testid="accept-all-suggestions"
                    onClick={onAcceptAll}
                  >
                    全部接受
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-testid="reject-all-suggestions"
                    onClick={() => setSuggestions([])}
                  >
                    全部忽略
                  </Button>
                </div>
              </div>
              {suggestions.map((s, idx) => {
                const cfg = CALLOUT_TYPES.find((t) => t.type === s.type);
                const key = `${s.originalText.slice(0, 20)}-${idx}`;
                return (
                  <div
                    key={key}
                    className="flex items-start gap-2 rounded-md border p-2 text-sm"
                    data-testid={`suggestion-${idx}`}
                  >
                    <span aria-hidden="true" className="text-lg leading-none">
                      {cfg?.icon ?? "📌"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {cfg?.label ?? "补充"} · {s.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        「{s.originalText.slice(0, 50)}
                        {s.originalText.length > 50 ? "…" : ""}」
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        data-testid={`accept-suggestion-${idx}`}
                        onClick={() => onAcceptSuggestion(idx)}
                      >
                        <Check className="size-3.5 text-green-600" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        data-testid={`reject-suggestion-${idx}`}
                        onClick={() => onRejectSuggestion(idx)}
                      >
                        <X className="size-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {mode === "edit" && suggestError && !suggesting && (
            <p className="text-sm text-muted-foreground" data-testid="suggest-error">
              {suggestError}
            </p>
          )}
          {mode === "edit" && layoutError && !layoutLoading && (
            <p className="text-sm text-muted-foreground" data-testid="layout-error">
              {layoutError}
            </p>
          )}
          {mode === "edit" && layoutSuggestions && (
            <LayoutSuggestPanel
              content={content}
              suggestions={layoutSuggestions}
              onCancel={() => setLayoutSuggestions(null)}
              onApply={(next) => {
                applyContent(next);
                setLayoutSuggestions(null);
              }}
            />
          )}

          {mode === "edit" ? (
            <div className="flex flex-col gap-2" data-testid="tiptap-editor-host">
              <EditorToolbar editor={editor} />
              <div className="min-h-[45vh] w-full rounded-md border p-3 [&_.ProseMirror]:min-h-[40vh] [&_.ProseMirror]:outline-none">
                <EditorContent editor={editor} className="tiptap-editor" />
              </div>
            </div>
          ) : (
            <div className="min-h-[45vh] w-full overflow-y-auto rounded-md border p-3">
              <MarkdownPreview content={content} />
            </div>
          )}
        </div>
      </div>

      {/* AI 智能排版：先选 Prompt 模板，再执行排版（与 AI Studio 交互一致） */}
      <TemplatePickerDialog
        open={layoutPending}
        task="layout_suggest"
        taskLabel={
          taskRouteDefinitions.find((t) => t.value === "layout_suggest")?.label ?? "AI 智能排版"
        }
        templates={prompts}
        remembered={lastLayoutPrompt}
        onConfirm={handleLayoutConfirm}
        onCancel={() => setLayoutPending(false)}
      />
    </div>
  );
}
