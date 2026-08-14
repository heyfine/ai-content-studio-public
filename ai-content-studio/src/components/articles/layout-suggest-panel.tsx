"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/studio/markdown-preview";
import { applyLayoutSuggestions } from "@/lib/content/layout-suggest-ui";
import { LAYOUT_ACTION_LABELS, type LayoutSuggestion } from "@/lib/content/layout-suggest-types";
import { CALLOUT_TYPES } from "@/lib/content/callout-types";

const ACTION_BADGE_STYLES: Record<string, string> = {
  callout: "border-purple-300 bg-purple-50 text-purple-700",
  split: "border-blue-300 bg-blue-50 text-blue-700",
  bold: "border-rose-300 bg-rose-50 text-rose-700",
  heading: "border-slate-400 bg-slate-100 text-slate-700",
  quote: "border-teal-300 bg-teal-50 text-teal-700",
  list: "border-green-300 bg-green-50 text-green-700",
  remove_callout: "border-orange-300 bg-orange-50 text-orange-700",
};

/** 单条建议的补充信息（callout 类型/新文本预览） */
function SuggestionDetail({ s }: { s: LayoutSuggestion }) {
  if (s.action === "callout") {
    const cfg = CALLOUT_TYPES.find((t) => t.type === s.type);
    return (
      <span className="text-xs text-muted-foreground">
        {cfg?.icon ?? "📌"} {cfg?.label ?? "补充"} · {s.title ?? ""}
      </span>
    );
  }
  if (s.newText) {
    return (
      <span className="line-clamp-2 font-mono text-xs text-muted-foreground">
        排版后：{s.newText}
      </span>
    );
  }
  return null;
}

/**
 * AI 智能排版 Diff 预览面板：
 * - 上方逐条列出建议（默认全选，可取消勾选）；
 * - 下方左右对比「原文」与「应用所选建议后的正文」；
 * - 底部「应用所选」/「取消」。
 */
export function LayoutSuggestPanel({
  content,
  suggestions,
  onCancel,
  onApply,
}: {
  content: string;
  suggestions: LayoutSuggestion[];
  onCancel: () => void;
  onApply: (nextContent: string) => void;
}) {
  const [selected, setSelected] = useState<boolean[]>(() => suggestions.map(() => true));

  // 渲染层去重（同 action + 同原文只保留一条），并提供稳定 key
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: LayoutSuggestion[] = [];
    for (const s of suggestions) {
      const k = `${s.action}::${s.originalText}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }, [suggestions]);

  // 建议列表变化（如再次排版返回新建议）时重置勾选为全选，
  // 避免旧勾选状态与新的建议错位（否则会出现"已选 0 处"且按钮全部禁用）。
  useEffect(() => {
    setSelected(items.map(() => true));
  }, [items]);

  const nextContent = useMemo(
    () =>
      applyLayoutSuggestions(
        content,
        items.filter((_, i) => selected[i] ?? false),
      ),
    [content, items, selected],
  );

  const selectedCount = selected.filter(Boolean).length;

  function toggle(i: number) {
    setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-muted-foreground p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-purple-600" />
          AI 智能排版 · 建议 {items.length} 处
          <span className="text-xs font-normal text-muted-foreground">
            （已选 {selectedCount} 处）
          </span>
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setSelected(items.map(() => true))}
            disabled={selectedCount === items.length}
          >
            全选
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setSelected(items.map(() => false))}
            disabled={selectedCount === 0}
          >
            清空
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5" data-testid="layout-suggestion-list">
          {items.map((s, i) => (
            <li
              key={`${s.action}-${s.originalText.slice(0, 24)}`}
              className="flex items-start gap-2 rounded-md border p-2 text-sm"
            >
              <input
                type="checkbox"
                data-testid={`layout-suggestion-check-${i}`}
                checked={selected[i] ?? false}
                onChange={() => toggle(i)}
                className="mt-1"
              />
              <span
                className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${ACTION_BADGE_STYLES[s.action] ?? ACTION_BADGE_STYLES.callout}`}
              >
                {LAYOUT_ACTION_LABELS[s.action]}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs text-muted-foreground line-clamp-2">
                  「{s.originalText.slice(0, 60)}
                  {s.originalText.length > 60 ? "…" : ""}」
                </p>
                <SuggestionDetail s={s} />
                {s.reason && <p className="text-xs text-muted-foreground/80">{s.reason}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-md border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">原文</p>
          <div className="max-h-[40vh] overflow-y-auto">
            <MarkdownPreview content={content} />
          </div>
        </div>
        <div className="min-w-0 rounded-md border border-primary/30 p-3">
          <p className="mb-2 text-xs font-medium text-primary">排版后</p>
          <div className="max-h-[40vh] overflow-y-auto">
            <MarkdownPreview content={nextContent} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} data-testid="layout-cancel">
          <X className="size-3.5" /> 取消
        </Button>
        <Button
          type="button"
          data-testid="layout-apply"
          onClick={() => onApply(nextContent)}
          disabled={selectedCount === 0}
        >
          <Check className="size-3.5" /> 应用所选（{selectedCount}）
        </Button>
      </div>
    </div>
  );
}
