/**
 * 高亮块（Callout）语义类型配置。
 *
 * 依据 docs/content/ARTICLE-EDITOR-AND-TYPOGRAPHY-SPEC.md。
 * 类型/颜色/图标集中定义，编辑器预览与 WordPress 发布共用，不得另起一套含义。
 */

export type CalloutType = "info" | "tip" | "warning" | "danger" | "note" | "insight" | "neutral";

export interface CalloutTypeConfig {
  type: CalloutType;
  /** 中文默认标题 */
  label: string;
  /** 默认图标（短文本/Emoji） */
  icon: string;
  /** 用途说明（编辑器类型选择时展示） */
  description: string;
}

export const CALLOUT_TYPES: CalloutTypeConfig[] = [
  { type: "info", label: "信息", icon: "ℹ️", description: "客观信息、背景资料、来源说明" },
  { type: "tip", label: "推荐", icon: "💡", description: "推荐、技巧、使用建议" },
  { type: "warning", label: "注意", icon: "⚠️", description: "注意事项、限制条件、待确认信息" },
  { type: "danger", label: "警告", icon: "⛔", description: "风险、错误、严重警告" },
  { type: "note", label: "提醒", icon: "📝", description: "重点提醒、补充提示" },
  { type: "insight", label: "洞察", icon: "🔎", description: "深度观点、分析洞察、作者判断" },
  { type: "neutral", label: "补充", icon: "📌", description: "普通补充说明，不带明显倾向" },
];

export const CALLOUT_TYPE_KEYS: CalloutType[] = CALLOUT_TYPES.map((t) => t.type);

export function isCalloutType(v: string): v is CalloutType {
  return (CALLOUT_TYPE_KEYS as string[]).includes(v);
}

/** 未知类型降级目标（不允许非法类型破坏整篇渲染） */
export const CALLOUT_FALLBACK_TYPE: CalloutType = "neutral";
