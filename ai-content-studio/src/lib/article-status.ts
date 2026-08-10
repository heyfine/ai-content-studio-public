export type ArticleStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";

export const ARTICLE_STATUS_LIST = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  DRAFT: "草稿",
  REVIEW: "审阅",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

const ALLOWED_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT: ["REVIEW", "PUBLISHED", "ARCHIVED"],
  REVIEW: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED", "DRAFT"],
  ARCHIVED: ["DRAFT"],
};

export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ArticleStatus, to: ArticleStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`非法状态转换：${from} → ${to}`);
  }
}
