"use client";

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

export interface TiptapEditorPageProps {
  articleId: string | null;
}

/**
 * Tiptap 富文本块编辑器板块（Phase 13 子任务 2）。
 *
 * 与经典编辑器（article-editor-page）并存、不替换：读写同一 /api/articles 通道。
 * 数据模型：content 保留 Markdown（兼容旧数据/AI/WP/SEO 链路），并同步写入
 * contentJson（ProseMirror doc JSON）、contentHtml、contentMd 三个新字段。
 *
 * 保存契约：
 *  - Markdown 是唯一事实源（tiptap-markdown 保证 :::callout 双向不丢）
 *  - contentJson/Html/Md 由编辑器即时派生，保存时一并写入
 *  - 旧文章（无 contentJson）首次打开时用 content 的 Markdown 初始化
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

  const editor: Editor | null = useMarkdownEditor({
    initialContent: initial.content ?? "",
    editable: true,
    onChange: (md) => setContent(md),
  });

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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEdit ? "编辑文章（Tiptap）" : "新建文章（Tiptap）"}
          </h1>
          <p className="text-sm text-muted-foreground">
            富文本块编辑器板块 · 与经典编辑器并存，数据互通
          </p>
        </div>
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
          <Label htmlFor="article-content">正文</Label>
          <div className="flex flex-col gap-2" data-testid="tiptap-editor-host">
            <EditorToolbar editor={editor} />
            <div className="min-h-[45vh] w-full rounded-md border p-3 [&_.ProseMirror]:min-h-[40vh] [&_.ProseMirror]:outline-none">
              <EditorContent editor={editor} className="tiptap-editor" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            支持 Markdown 语法 + 高亮块 · 保存后经典编辑器同样可读
          </p>
        </div>
      </div>
    </div>
  );
}
