import { generate } from "@/lib/ai/generate";
import { isCalloutType } from "@/lib/content/callout-types";
import { CALLOUT_SUGGEST_SYSTEM_PROMPT } from "../ai/callout-suggest-prompt";

export interface CalloutSuggestion {
  /** 从正文中精确截取的原文片段 */
  originalText: string;
  /** 高亮块类型（白名单校验后的值） */
  type: "info" | "tip" | "warning" | "danger" | "note" | "insight" | "neutral";
  /** 高亮块标题 */
  title: string;
  /** 建议理由 */
  reason: string;
}

/**
 * 调 AI 分析文章正文，返回高亮块建议。
 * AI 返回 JSON 数组，每条含 originalText/type/title/reason。
 * originalText 用于前端定位匹配，不依赖 AI 的字符计数。
 */
export async function suggestCallouts(args: {
  content: string;
  title?: string;
}): Promise<{ suggestions: CalloutSuggestion[]; raw: string }> {
  const input = args.title ? `标题：${args.title}\n\n正文：\n${args.content}` : args.content;

  const gen = await generate({
    task: "article_generate",
    input,
    systemPrompt: CALLOUT_SUGGEST_SYSTEM_PROMPT,
    temperature: 0.3,
    maxTokens: 2000,
  });

  const suggestions = parseSuggestions(gen.content);
  return { suggestions, raw: gen.content };
}

/**
 * 解析 AI 返回的 JSON 建议，做白名单校验与安全过滤。
 * AI 输出可能包含 ```json 包裹或前后多余文本，做容错。
 */
export function parseSuggestions(raw: string): CalloutSuggestion[] {
  // 提取 JSON 数组（容错：去 ```json 包裹、找第一个 [ 到最后一个 ]）
  let jsonStr = raw.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  const start = jsonStr.indexOf("[");
  const end = jsonStr.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  jsonStr = jsonStr.slice(start, end + 1);

  let arr: unknown;
  try {
    arr = JSON.parse(jsonStr);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      const rawType = String(item.type ?? "");
      const type = isCalloutType(rawType) ? rawType : "neutral";
      const originalText = String(item.originalText ?? "").slice(0, 500);
      const title = String(item.title ?? "").slice(0, 20);
      const reason = String(item.reason ?? "").slice(0, 200);
      return { originalText, type, title, reason };
    })
    .filter((s) => s.originalText.length > 0);
}
