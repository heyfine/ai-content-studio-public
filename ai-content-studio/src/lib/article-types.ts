import type { ArticleStatus } from "@/lib/article-status";

export interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: ArticleStatus;
  seoScore: number | null;
  wpPostId: string | null;
  promptId: string | null;
  updatedAt?: string;
}
