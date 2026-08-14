/**
 * AI 智能排版服务：调 AI 分析正文，返回排版建议。
 *
 * 与 Phase 11 高亮建议同模式：AI 返回结构化 JSON 建议（不直接改正文），
 * 由前端 Diff 预览、用户确认后应用。建议数量按排版强度限制（克制机制）。
 */
import { generate } from "@/lib/ai/generate";
import { buildLayoutSuggestPrompt } from "@/lib/ai/layout-suggest-prompt";
import { getPrompt } from "./prompt-service";
import { isCalloutType } from "@/lib/content/callout-types";
import {
  isLayoutActionType,
  isLayoutStyle,
  LAYOUT_STYLE_LIMITS,
  type LayoutSuggestion,
  type LayoutStyle,
} from "@/lib/content/layout-suggest-types";

export interface SuggestLayoutArgs {
  content: string;
  title?: string;
  style?: LayoutStyle;
  /** 可选：用户选择的 Prompt 模板 id；未提供时仅使用内置排版 prompt */
  promptId?: string;
}

/**
 * 组装排版 system prompt：无论是否选了模板，都保留内置格式与克制指令
 * （否则模板内容可能不含"输出 JSON 建议数组"的要求，AI 输出无法解析）。
 * 用户选择的模板作为「额外排版偏好」拼接其后。
 */
async function resolveLayoutPrompt(
  style: LayoutStyle,
  promptId?: string,
): Promise<string> {
  const base = buildLayoutSuggestPrompt(style);
  if (!promptId) return base;
  const prompt = await getPrompt(promptId);
  if (!prompt) return base;
  return `${base}\n\n## 额外排版偏好\n\n用户选择了一个排版偏好模板，请在满足上述格式与克制要求（输出 JSON 建议数组）的前提下，额外遵循以下偏好：\n${prompt.content}`;
}

export async function suggestLayout(args: SuggestLayoutArgs): Promise<{
  suggestions: LayoutSuggestion[];
  raw: string;
}> {
  const style: LayoutStyle = isLayoutStyle(args.style) ? args.style : "standard";
  const input = args.title ? `标题：${args.title}\n\n正文：\n${args.content}` : args.content;

  const gen = await generate({
    task: "layout_suggest",
    input,
    systemPrompt: await resolveLayoutPrompt(style, args.promptId),
    ...(args.promptId ? { promptId: args.promptId } : {}),
    temperature: 0.3,
    maxTokens: 2500,
  });

  const suggestions = parseLayoutSuggestions(gen.content, style);
  return { suggestions, raw: gen.content };
}

function clampHeadingLevel(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(3, Math.max(1, Math.round(n)));
}

/**
 * 解析 AI 返回的 JSON 建议，做白名单校验、字段截断与数量上限。
 * AI 输出可能包含 ```json 包裹或前后多余文本，做容错。
 */
export function parseLayoutSuggestions(
  raw: string,
  style: LayoutStyle = "standard",
): LayoutSuggestion[] {
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

  const limits = LAYOUT_STYLE_LIMITS[style];
  const items = arr
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item): LayoutSuggestion | null => {
      const action = String(item.action ?? "");
      if (!isLayoutActionType(action)) return null;
      const originalText = String(item.originalText ?? "").slice(0, 500);
      if (!originalText) return null;
      return {
        action,
        originalText,
        type:
          action === "callout" && isCalloutType(String(item.type))
            ? (String(item.type) as LayoutSuggestion["type"])
            : undefined,
        title: action === "callout" ? String(item.title ?? "").slice(0, 20) : undefined,
        newText:
          action === "split" || action === "list" || action === "bold"
            ? String(item.newText ?? "").slice(0, 2000)
            : undefined,
        headingLevel: action === "heading" ? clampHeadingLevel(item.headingLevel) : undefined,
        reason: String(item.reason ?? "").slice(0, 200),
      };
    })
    .filter((s): s is LayoutSuggestion => s !== null);
  return items.slice(0, limits.total);
}
