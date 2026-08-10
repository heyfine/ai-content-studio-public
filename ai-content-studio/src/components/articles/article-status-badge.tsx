import { ARTICLE_STATUS_LABELS, type ArticleStatus } from "@/lib/article-status";
import { cn } from "@/lib/utils";

const COLOR: Record<ArticleStatus, string> = {
  DRAFT: "text-muted-foreground bg-muted",
  REVIEW: "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-950",
  PUBLISHED: "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950",
  ARCHIVED: "text-muted-foreground bg-muted/60",
};

export interface ArticleStatusBadgeProps {
  status: ArticleStatus;
}

export function ArticleStatusBadge({ status }: ArticleStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        COLOR[status],
      )}
    >
      {ARTICLE_STATUS_LABELS[status]}
    </span>
  );
}
