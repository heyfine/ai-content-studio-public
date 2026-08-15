import type { ArticleSyncStatus } from "@prisma/client";
import type { ArticleStatus } from "@/lib/article-status";

export interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  contentJson?: unknown | null;
  contentHtml?: string | null;
  contentMd?: string | null;
  status: ArticleStatus;
  seoScore: number | null;
  wpPostId: string | null;
  wpUrl?: string | null;
  siteConfigId: string | null;
  syncStatus: ArticleSyncStatus | null;
  lastSyncedAt: string | null;
  wpModifiedAt: string | null;
  categories?: unknown | null;
  tags?: unknown | null;
  featuredImage: string | null;
  promptId: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
}
