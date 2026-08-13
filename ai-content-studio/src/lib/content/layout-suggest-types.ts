/**
 * AI 智能排版（Phase 12）类型定义。
 *
 * 与 Phase 11 高亮块建议同源但更全面：AI 不再只建议「加高亮块」，
 * 而是给出多种排版动作（高亮/拆分/加粗/标题/引用/列表/移除高亮）。
 * 所有建议都只是「建议」——由前端 Diff 预览、用户确认后才应用。
 *
 * 规范参照 docs/content/ARTICLE-EDITOR-AND-TYPOGRAPHY-SPEC.md。
 */
import type { CalloutType } from "./callout-types";

/** 排版建议动作类型 */
export type LayoutActionType =
  | "callout" // 原文片段 → 高亮块
  | "split" // 长段落 → 拆成多段
  | "bold" // 核心观点/关键词 → 加粗
  | "heading" // 章节性句子 → 标题（不得改变语义层级）
  | "quote" // 引述内容 → 引用块
  | "list" // 并列列举 → 列表
  | "remove_callout"; // 已有高亮块但非重点 → 拆回普通正文

/** 排版强度（影响 AI 的克制阈值） */
export type LayoutStyle = "minimal" | "standard" | "emphasis";

export const LAYOUT_STYLES: LayoutStyle[] = ["minimal", "standard", "emphasis"];

export const LAYOUT_STYLE_LABELS: Record<LayoutStyle, string> = {
  minimal: "极简",
  standard: "标准",
  emphasis: "强调",
};

export const LAYOUT_STYLE_DESCRIPTIONS: Record<LayoutStyle, string> = {
  minimal: "AI 非常克制：只对极少数真正重要的内容做排版",
  standard: "适当使用：要点、注意、提醒等重要内容自动识别",
  emphasis: "积极突出：更积极地使用高亮、加粗、引用，仍不过度",
};

/** 各强度下建议数量上限（克制机制） */
export const LAYOUT_STYLE_LIMITS: Record<LayoutStyle, { total: number; callout: number }> = {
  minimal: { total: 3, callout: 2 },
  standard: { total: 6, callout: 4 },
  emphasis: { total: 8, callout: 5 },
};

/** 单条排版建议 */
export interface LayoutSuggestion {
  action: LayoutActionType;
  /** 从正文中精确截取的原文片段（前端定位用，必须逐字来自正文） */
  originalText: string;
  /** action=callout 时：高亮块类型（白名单） */
  type?: CalloutType;
  /** action=callout 时：高亮块标题（简短） */
  title?: string;
  /** action=split/list 时：AI 提供的排版后新文本（只能做结构调整，不得改内容） */
  newText?: string;
  /** action=heading 时：目标标题层级 1-3（默认 2） */
  headingLevel?: number;
  /** 建议理由 */
  reason: string;
}

export const LAYOUT_ACTION_LABELS: Record<LayoutActionType, string> = {
  callout: "高亮块",
  split: "拆分段落",
  bold: "加粗",
  heading: "标题",
  quote: "引用",
  list: "列表",
  remove_callout: "移除高亮",
};

/** 动作白名单校验 */
export function isLayoutActionType(v: string | undefined): v is LayoutActionType {
  return v !== undefined && (Object.keys(LAYOUT_ACTION_LABELS) as string[]).includes(v);
}

export function isLayoutStyle(v: string | undefined): v is LayoutStyle {
  return v !== undefined && (LAYOUT_STYLES as string[]).includes(v);
}
