/**
 * AI 智能排版纯函数：定位原文片段 + 按动作应用单条/多条排版建议。
 *
 * 安全约束（与 Phase 11 一致）：
 * - 建议的 originalText 必须在正文中可定位（模糊匹配），找不到则安全跳过；
 * - action/type 走白名单校验，非法值降级；
 * - 应用是「结构变换」：callout 包裹、加粗、标题、引用、列表、拆分、
 *   移除高亮，均不增减或篡改原文文字（AI 不得编造 newText 内容）。
 */
import { CALLOUT_FALLBACK_TYPE, CALLOUT_TYPES, isCalloutType } from "@/lib/content/callout-types";
import { findCalloutRanges } from "@/lib/content/render";
import { findOriginalTextRange } from "@/lib/content/callout-suggest-ui";
import type { LayoutSuggestion } from "@/lib/content/layout-suggest-types";

/** 计算建议的替换区间与替换文本；找不到原文返回 null。 */
function locateAndBuild(
  content: string,
  s: LayoutSuggestion,
): { start: number; end: number; replacement: string } | null {
  if (s.action === "remove_callout") {
    const needle = s.originalText.trim();
    const target = findCalloutRanges(content).find((r) => r.body.includes(needle));
    // remove_callout 的替换文本是块正文（拆回普通文本），不是整个块
    return target ? { start: target.start, end: target.end, replacement: target.body } : null;
  }
  const range = findOriginalTextRange(content, s.originalText);
  if (!range) return null;
  return {
    ...range,
    replacement: buildLayoutReplacement(content.slice(range.start, range.end), s),
  };
}

/** 根据动作生成替换文本（original 是命中区间的原文）。 */
export function buildLayoutReplacement(original: string, s: LayoutSuggestion): string {
  const trimmed = original.trim();
  switch (s.action) {
    case "callout": {
      const type = isCalloutType(s.type) ? s.type : CALLOUT_FALLBACK_TYPE;
      const config = CALLOUT_TYPES.find((t) => t.type === type) ?? CALLOUT_TYPES[0];
      const title = s.title?.trim() || config.label;
      const icon = config.icon;
      return `:::callout{type="${type}" title="${title}" icon="${icon}"}\n${trimmed}\n:::`;
    }
    case "split":
      return s.newText?.trim() || original;
    case "bold":
      return s.newText?.trim() ? s.newText.trim() : `**${trimmed}**`;
    case "heading": {
      const level = Math.min(3, Math.max(1, s.headingLevel ?? 2));
      return `${"#".repeat(level)} ${trimmed}`;
    }
    case "quote":
      return trimmed
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "list":
      return s.newText?.trim() || original;
    case "remove_callout":
      // 由 locateAndBuild 特判处理（替换为块正文），此处不应到达
      return trimmed;
  }
}

/**
 * 应用单条排版建议。找不到原文则原样返回 content（安全降级）。
 */
export function applyLayoutSuggestion(content: string, suggestion: LayoutSuggestion): string {
  const located = locateAndBuild(content, suggestion);
  if (!located) return content;
  return content.slice(0, located.start) + located.replacement + content.slice(located.end);
}

/**
 * 应用多条排版建议。
 * 先在原始正文上统一定位，再按区间结束位置逆序替换，避免前面替换影响后面的索引。
 * 定位失败的条目标安全跳过；重复建议（同区间）只保留一条，防止双重重叠替换。
 */
export function applyLayoutSuggestions(content: string, suggestions: LayoutSuggestion[]): string {
  interface Located {
    start: number;
    end: number;
    replacement: string;
  }
  const located: Located[] = [];
  for (const s of suggestions) {
    const item = locateAndBuild(content, s);
    if (!item) continue;
    // 去重：同区间的建议只保留第一条
    if (located.some((l) => l.start === item.start && l.end === item.end)) continue;
    located.push(item);
  }
  located.sort((a, b) => b.end - a.end);
  let out = content;
  for (const item of located) {
    out = out.slice(0, item.start) + item.replacement + out.slice(item.end);
  }
  return out;
}
