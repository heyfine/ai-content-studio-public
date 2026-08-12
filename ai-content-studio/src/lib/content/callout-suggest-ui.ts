import type { CalloutType } from "@/lib/content/callout-types";
import { calloutTemplate } from "@/lib/content/render";

export interface CalloutSuggestion {
  originalText: string;
  type: CalloutType;
  title: string;
  reason: string;
}

/**
 * 在 content 中查找 originalText 的位置（首次出现）。
 * 返回字节区间 {start, end}，找不到返回 null。
 * 对原文做 trim 对齐以容错 AI 截取时的前后空白差异。
 */
export function findOriginalTextRange(
  content: string,
  originalText: string,
): { start: number; end: number } | null {
  const needle = originalText.trim();
  if (!needle) return null;
  // 先精确匹配
  const idx = content.indexOf(needle);
  if (idx !== -1) return { start: idx, end: idx + needle.length };
  // 容错：忽略首尾空白的模糊匹配（把 content 里的连续空白当通配）
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(escaped);
  const m = re.exec(content);
  if (m) return { start: m.index, end: m.index + m[0].length };
  return null;
}

/**
 * 接受建议：把 content 中 originalText 对应的位置替换为 callout 包裹版本。
 * 找不到原文则返回原 content（安全降级）。
 */
export function acceptSuggestion(content: string, suggestion: CalloutSuggestion): string {
  const range = findOriginalTextRange(content, suggestion.originalText);
  if (!range) return content;
  const template = calloutTemplate(suggestion.type);
  // 把 template 里的占位正文替换为原文
  const lines = template.split("\n");
  // template 第 2 行是占位正文
  lines[1] = suggestion.originalText.trim();
  const calloutText = lines.join("\n");
  return content.slice(0, range.start) + calloutText + content.slice(range.end);
}
