"use client";

import { type Editor, EditorContent } from "@tiptap/react";
import {
  Check,
  History as HistoryIcon,
  MessageCircle as MessageCircleIcon,
  Send as SendIcon,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MarkdownPreview } from "@/components/studio/markdown-preview";
import {
  type PromptOption,
  TemplatePickerDialog,
} from "@/components/studio/template-picker-dialog";
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
import { taskRouteDefinitions } from "@/config/task-routes";
import { streamGenerateRequest } from "@/lib/ai/stream-client";
import {
  ARTICLE_STATUS_LABELS,
  ARTICLE_STATUS_LIST,
  type ArticleStatus,
} from "@/lib/article-status";
import type { ArticleRow } from "@/lib/article-types";
import { acceptSuggestion, type CalloutSuggestion } from "@/lib/content/callout-suggest-ui";
import { CALLOUT_TYPES } from "@/lib/content/callout-types";
import { toWechatHtml } from "@/lib/content/wechat-format";
import {
  clearNewArticleDraft,
  loadNewArticleDraft,
  saveNewArticleDraft,
} from "@/lib/editor/autosave-draft";
import { EditorToolbar } from "@/lib/editor/components/editor-toolbar";
import { useMarkdownEditor } from "@/lib/editor/use-markdown-editor";
import { GENERATE_INPUT_MAX } from "@/lib/schemas/generate";
import { useStudioStore } from "@/stores/studio-store";
import { VersionHistoryDialog } from "./version-history-dialog";

export interface TiptapEditorPageProps {
  articleId: string | null;
}

interface WpOption {
  id: string;
  name: string;
  siteUrl: string;
  enabled: boolean;
}

interface WechatOption {
  id: string;
  name: string;
  appId: string;
  enabled: boolean;
}

/**
 * 流式排版的附加 system prompt：教 AI 使用系统识别的高亮块语法。
 * 若不指明，AI 会用 ">" 引用语法生成高亮，渲染出来是灰白引用块、无彩色。
 */
const LAYOUT_CALLOUT_GUIDE = `【高亮块语法要求】
文中需要强调的要点、注意、提醒、重要内容、总结等，必须使用以下高亮块语法，禁止用 ">" 引用语法代替：
:::callout{type="类型" title="标题" icon="图标"}
高亮块内容...
:::

type 只能取以下值（对应不同底色）：
- info：蓝色，用于客观信息、背景资料、来源说明
- tip：绿色，用于推荐、技巧、使用建议
- warning：橙色，用于注意事项、限制条件
- danger：红色，用于风险、严重警告
- note：黄色，用于重点提醒、补充提示
- insight：紫色，用于深度观点、分析洞察
- neutral：灰色，用于普通补充说明

高亮块标题保持简洁（如「核心要点」「注意事项」「总结」），正文为一段完整句子。`;

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
      // 新建模式：恢复上次未保存的本地暂存草稿（标题为空时无法落库，退出前暂存 localStorage）
      const draft = loadNewArticleDraft();
      setLoaded({
        id: "",
        title: draft?.title ?? "",
        slug: "",
        content: draft?.content ?? "",
        status: "DRAFT",
        seoScore: null,
        wpPostId: null,
        siteConfigId: null,
        syncStatus: null,
        lastSyncedAt: null,
        wpModifiedAt: null,
        categories: null,
        tags: null,
        featuredImage: null,
        promptId: null,
        updatedAt: "",
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

  // AI 智能排版（流式生成排版结果，与 AI Studio 一致）
  const [layoutGenerating, setLayoutGenerating] = useState(false);
  const [layoutResult, setLayoutResult] = useState("");
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutPending, setLayoutPending] = useState(false);
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const lastLayoutPrompt = useStudioStore((s) => s.lastPromptByTask.layout_suggest ?? null);
  const setLastPrompt = useStudioStore((s) => s.setLastPrompt);

  // AI 建议高亮块
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<CalloutSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // 发送到 WordPress
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{
    link: string;
    wpPostId: string;
    status: string;
  } | null>(null);
  const [publishPickerOpen, setPublishPickerOpen] = useState(false);
  const [wpConfigs, setWpConfigs] = useState<WpOption[]>([]);
  const [wpConfigId, setWpConfigId] = useState("");
  // 发送到微信公众号（草稿箱）
  const [sendingWechat, setSendingWechat] = useState(false);
  const [wechatError, setWechatError] = useState<string | null>(null);
  const [wechatResult, setWechatResult] = useState<string | null>(null);
  const [wechatPickerOpen, setWechatPickerOpen] = useState(false);
  const [wechatAccounts, setWechatAccounts] = useState<WechatOption[]>([]);
  const [wechatConfigId, setWechatConfigId] = useState("");
  // 历史版本
  const [versionsOpen, setVersionsOpen] = useState(false);
  // 实际文章 id：编辑模式即 initial.id；新建模式首次保存（POST）后获得，后续转 PUT 更新
  const [savedArticleId, setSavedArticleId] = useState(initial.id);
  // 自动保存：输入停顿 2s 静默保存；切选项卡立即保存；无标题新建暂存 localStorage
  const [autoSavedLabel, setAutoSavedLabel] = useState<string | null>(null);
  const savedSnapshotRef = useRef({ title: initial.title, content: initial.content ?? "" });
  const autosaveBusyRef = useRef(false);

  const editor: Editor | null = useMarkdownEditor({
    initialContent: initial.content ?? "",
    editable: true,
    onChange: (md) => setContent(md),
  });

  /** 静默自动保存：有 id 或有标题 → 落库；无标题新建 → localStorage 暂存（退出后可恢复） */
  async function autosaveNow() {
    if (autosaveBusyRef.current) return;
    const dirty =
      title !== savedSnapshotRef.current.title || content !== savedSnapshotRef.current.content;
    if (!dirty) return;
    const time = new Date().toTimeString().slice(0, 5);
    if (isEdit || savedArticleId !== "" || title.trim()) {
      autosaveBusyRef.current = true;
      const ok = await saveArticle({ silent: true });
      autosaveBusyRef.current = false;
      if (ok) {
        savedSnapshotRef.current = { title, content };
        setAutoSavedLabel(`已自动保存 ${time}`);
      }
      return;
    }
    // 标题和正文都清空了 → 本地暂存一并清除（避免恢复出空文章）
    if (!title && !content) {
      clearNewArticleDraft();
      savedSnapshotRef.current = { title, content };
      return;
    }
    saveNewArticleDraft(title, content);
    savedSnapshotRef.current = { title, content };
    setAutoSavedLabel(`已暂存本地 ${time}`);
  }

  // 输入停顿 2s 触发自动保存（挂载后首次运行内容未变，no-op）
  // biome-ignore lint/correctness/useExhaustiveDependencies: autosaveNow 每次渲染重建，依赖它会让任意 state 变化重置计时器；刻意按 title/content 变化触发
  useEffect(() => {
    const timer = setTimeout(() => {
      void autosaveNow();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

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

  /** 流式生成排版结果：复用 /api/ai/stream（layout_suggest 任务 + 所选模板），逐段拼到面板 */
  async function runLayoutStream(promptId: string | null) {
    const input =
      [title && `标题：${title}`, content].filter(Boolean).join("\n\n") || "请生成一篇文章";
    // 前置预检：超限直接友好报错，不发请求（否则后端 zod 400 只会回「校验失败」）
    if (input.length > GENERATE_INPUT_MAX) {
      setLayoutError(
        `正文过长：共 ${input.length} 字符，超过排版输入上限 ${GENERATE_INPUT_MAX} 字符。` +
          "带样式的表格会以内嵌 HTML 序列化、字符数远超所见，请精简正文后重试",
      );
      return;
    }
    setLayoutGenerating(true);
    setLayoutResult("");
    setLayoutError(null);
    try {
      for await (const ev of streamGenerateRequest({
        task: "layout_suggest",
        input,
        promptId: promptId ?? undefined,
        // 高亮块语法规范（模板内容由后端 resolveSystemPrompt 拼接在其后/前）
        systemPrompt: LAYOUT_CALLOUT_GUIDE,
      })) {
        if (ev.type === "delta") {
          setLayoutResult((prev) => prev + ev.content);
        } else if (ev.type === "error") {
          throw new Error(ev.message);
        }
      }
    } catch (e) {
      setLayoutError(e instanceof Error ? e.message : String(e));
    } finally {
      setLayoutGenerating(false);
    }
  }

  function handleLayoutConfirm(promptId: string | null) {
    setLastPrompt("layout_suggest", promptId);
    setLayoutPending(false);
    void runLayoutStream(promptId);
  }

  /** 把排版结果应用到正文（替换整个编辑器内容） */
  function applyLayoutResult() {
    applyContent(layoutResult);
    setLayoutResult("");
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

  /**
   * 保存文章到后端（不跳转），成功返回文章 id，失败返回 null。
   * Markdown 事实源（content）+ 三个派生字段（json/html/md）一并提交。
   * 新建模式首次保存用 POST 创建并拿到 id，之后转 PUT 更新同一篇文章。
   */
  async function saveArticle(opts: { silent?: boolean } = {}): Promise<string | null> {
    const { silent = false } = opts;
    if (!title.trim()) {
      if (!silent) setError("标题不能为空");
      return null;
    }
    if (!silent) setError(null);
    setSaving(true);
    try {
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
      const isUpdate = isEdit || savedArticleId !== "";
      const res = await fetch(
        isUpdate ? `/api/articles/${savedArticleId || initial.id}` : "/api/articles",
        {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        if (!silent) setError(err.error ?? "操作失败");
        return null;
      }
      const data = (await res.json()) as { id?: string };
      const id = data.id ?? (isEdit ? initial.id : "");
      if (id) setSavedArticleId(id);
      // 新建文章落库成功后，本地暂存草稿不再需要
      if (!isUpdate) clearNewArticleDraft();
      return id || null;
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit() {
    if (await saveArticle()) router.push("/articles");
  }

  async function doPublish(configId: string, articleId?: string) {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/wordpress/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: articleId ?? savedArticleId, configId }),
      });
      const data = (await res.json()) as {
        link?: string;
        wpPostId?: string;
        status?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "发送失败");
      setPublishResult({
        link: data.link ?? "",
        wpPostId: String(data.wpPostId ?? ""),
        status: data.status ?? "",
      });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  /**
   * 点击「发送到 WordPress」：先保存最新内容，再拉站点列表。
   * 0 个站点提示未配置；1 个站点直接发送；多个站点弹下拉选择。
   */
  async function handlePublishClick() {
    setPublishError(null);
    setPublishResult(null);
    const id = await saveArticle();
    if (!id) return;
    try {
      const res = await fetch("/api/wordpress/configs");
      if (!res.ok) throw new Error("加载 WordPress 站点失败");
      const all = (await res.json()) as WpOption[];
      const enabled = all.filter((c) => c.enabled);
      if (enabled.length === 0) {
        setPublishError("未配置启用中的 WordPress 站点，请先到「发布」板块配置站点");
        return;
      }
      if (enabled.length === 1) {
        await doPublish(enabled[0].id, id);
      } else {
        setWpConfigs(enabled);
        setWpConfigId((prev) => (enabled.some((c) => c.id === prev) ? prev : enabled[0].id));
        setPublishPickerOpen(true);
      }
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 转换当前正文为微信 HTML 并送进所选公众号的草稿箱 */
  async function doSendWechat(configId: string, articleId?: string) {
    setSendingWechat(true);
    setWechatError(null);
    try {
      const wechatHtml = toWechatHtml(content);
      const res = await fetch("/api/wechat/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: articleId ?? savedArticleId,
          configId,
          content: wechatHtml,
        }),
      });
      const data = (await res.json()) as { mediaId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "发送失败");
      setWechatResult(
        `已进入公众号草稿箱（media_id: ${data.mediaId}），请到公众号后台「草稿箱」检查排版后手动发表`,
      );
    } catch (e) {
      setWechatError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingWechat(false);
    }
  }

  /**
   * 点击「发送到微信公众号」：先保存最新内容，再拉公众号账号列表。
   * 0 个账号提示未配置；1 个账号直接发送；多个账号弹下拉选择。
   */
  async function handleSendWechatClick() {
    setWechatError(null);
    setWechatResult(null);
    const id = await saveArticle();
    if (!id) return;
    try {
      const res = await fetch("/api/wechat/configs");
      if (!res.ok) throw new Error("加载公众号账号失败");
      const all = (await res.json()) as WechatOption[];
      const enabled = all.filter((c) => c.enabled);
      if (enabled.length === 0) {
        setWechatError("未配置公众号账号，请先到「发布」板块添加微信公众号");
        return;
      }
      if (enabled.length === 1) {
        await doSendWechat(enabled[0].id, id);
      } else {
        setWechatAccounts(enabled);
        setWechatConfigId((prev) => (enabled.some((c) => c.id === prev) ? prev : enabled[0].id));
        setWechatPickerOpen(true);
      }
    } catch (e) {
      setWechatError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6" data-testid="tiptap-editor-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? "编辑文章" : "新建文章"}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handlePublishClick()}
            disabled={publishing || saving}
            data-testid="publish-to-wordpress"
          >
            <SendIcon className="size-4" />
            {publishing ? "发送中…" : "发送到 WordPress"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSendWechatClick()}
            disabled={sendingWechat || saving}
            data-testid="send-to-wechat"
          >
            <MessageCircleIcon className="size-4" />
            {sendingWechat ? "发送中…" : "发送到微信公众号"}
          </Button>
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setVersionsOpen(true)}
              data-testid="open-versions"
            >
              <HistoryIcon className="size-4" />
              历史版本
            </Button>
          )}
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

      {autoSavedLabel && (
        <p className="text-xs text-muted-foreground" data-testid="autosave-indicator">
          {autoSavedLabel}
        </p>
      )}

      {publishError && (
        <p role="alert" className="text-sm text-destructive" data-testid="publish-error">
          {publishError}
        </p>
      )}
      {wechatError && (
        <p role="alert" className="text-sm text-destructive" data-testid="wechat-error">
          {wechatError}
        </p>
      )}
      {wechatResult && (
        <p className="text-sm text-emerald-600" data-testid="wechat-result">
          {wechatResult}
        </p>
      )}
      {publishResult && (
        <p className="text-sm text-emerald-600" data-testid="publish-result">
          已发送到 WordPress（#{publishResult.wpPostId}，{publishResult.status}）
          <a
            href={publishResult.link}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-primary underline-offset-4 hover:underline"
          >
            查看博客文章
          </a>
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
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="ai-layout"
                onClick={handleLayoutClick}
                disabled={layoutGenerating || mode !== "edit"}
              >
                <Sparkles className="size-3.5" />
                {layoutGenerating ? "排版中…" : "AI 智能排版"}
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
                onClick={() => {
                  // 切换编辑/预览选项卡时立即自动保存（要求 1：切换选项卡不丢内容）
                  void autosaveNow();
                  setMode((m) => (m === "edit" ? "preview" : "edit"));
                }}
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
          {mode === "edit" && layoutError && !layoutGenerating && (
            <p className="text-sm text-muted-foreground" data-testid="layout-error">
              {layoutError}
            </p>
          )}
          {mode === "edit" && (layoutGenerating || layoutResult) && (
            <div
              className="space-y-2 rounded-md border border-primary/30 p-3"
              data-testid="layout-generate-panel"
            >
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="size-4 text-purple-600" />
                  AI 智能排版
                  <span className="text-xs font-normal text-muted-foreground">
                    {layoutGenerating ? "排版中…" : "排版完成"}
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setLayoutResult("")}
                    disabled={layoutGenerating}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    onClick={applyLayoutResult}
                    disabled={layoutGenerating || !layoutResult}
                    data-testid="layout-apply-result"
                  >
                    <Check className="size-3.5" /> 应用到正文
                  </Button>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-md border p-3">
                {layoutResult ? (
                  <MarkdownPreview content={layoutResult} />
                ) : (
                  <p className="text-sm text-muted-foreground">正在生成排版结果…</p>
                )}
              </div>
            </div>
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

      {/* 发送到 WordPress：多站点时选择目标站点 */}
      <Dialog
        open={publishPickerOpen}
        onOpenChange={(o) => (o ? undefined : setPublishPickerOpen(false))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>发送到 WordPress</DialogTitle>
            <DialogDescription>选择要发送到的博客站点。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="article-publish-config">发送到哪个站点</Label>
            <select
              id="article-publish-config"
              aria-label="发送到哪个站点"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={wpConfigId}
              onChange={(e) => setWpConfigId(e.target.value)}
            >
              {wpConfigs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.siteUrl}）
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPublishPickerOpen(false)}
              disabled={publishing}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                setPublishPickerOpen(false);
                void doPublish(wpConfigId);
              }}
              disabled={!wpConfigId || publishing}
              data-testid="publish-confirm"
            >
              <SendIcon className="size-4" /> {publishing ? "发送中…" : "发送"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 发送到微信公众号：多账号时选择目标账号 */}
      <Dialog
        open={wechatPickerOpen}
        onOpenChange={(o) => (o ? undefined : setWechatPickerOpen(false))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>发送到微信公众号</DialogTitle>
            <DialogDescription>
              自动上传图片并创建公众号草稿；正式发表需到公众号后台手动操作。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="article-wechat-config">发送到哪个公众号</Label>
            <select
              id="article-wechat-config"
              aria-label="发送到哪个公众号"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={wechatConfigId}
              onChange={(e) => setWechatConfigId(e.target.value)}
            >
              {wechatAccounts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setWechatPickerOpen(false)}
              disabled={sendingWechat}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                setWechatPickerOpen(false);
                void doSendWechat(wechatConfigId);
              }}
              disabled={!wechatConfigId || sendingWechat}
              data-testid="wechat-send-confirm"
            >
              <MessageCircleIcon className="size-4" /> {sendingWechat ? "发送中…" : "发送到草稿箱"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 历史版本：列表 / 预览 / 恢复 / 删除（仅编辑模式入口） */}
      {versionsOpen && (
        <VersionHistoryDialog
          articleId={isEdit ? initial.id : savedArticleId}
          onClose={() => setVersionsOpen(false)}
          onRestored={() => window.location.reload()}
        />
      )}
    </div>
  );
}
