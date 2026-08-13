import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertTransition, type ArticleStatus } from "@/lib/article-status";

export interface CreateArticleInput {
  title: string;
  slug?: string;
  content?: string;
  /** ProseMirror doc JSON（Prisma Json 字段）；API 层是 unknown，service 内 cast */
  contentJson?: unknown;
  contentHtml?: string;
  contentMd?: string;
  status?: ArticleStatus;
  seoScore?: number;
  wpPostId?: string;
  promptId?: string;
}

export type UpdateArticleInput = {
  title?: string;
  slug?: string;
  content?: string;
  contentJson?: unknown | null;
  contentHtml?: string | null;
  contentMd?: string | null;
  status?: ArticleStatus;
  seoScore?: number | null;
  wpPostId?: string | null;
  promptId?: string | null;
};

/** 从标题生成 slug：小写、非字母数字与中文替换为 -，去首尾 -；空则 untitled */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export async function listArticles(status?: ArticleStatus) {
  if (status) {
    return prisma.article.findMany({ where: { status }, orderBy: { updatedAt: "desc" } });
  }
  return prisma.article.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function getArticle(id: string) {
  return prisma.article.findUnique({ where: { id } });
}

export async function createArticle(input: CreateArticleInput) {
  const data: Record<string, unknown> = {
    title: input.title,
    slug: input.slug ?? slugify(input.title),
    content: input.content ?? "",
    status: input.status ?? "DRAFT",
  };
  // 新字段只在显式提供时写入，保持旧调用（无 contentJson 等）的 create payload 不变
  if (input.contentJson !== undefined)
    data.contentJson = input.contentJson as Prisma.InputJsonValue;
  if (input.contentHtml !== undefined) data.contentHtml = input.contentHtml;
  if (input.contentMd !== undefined) data.contentMd = input.contentMd;
  if (input.seoScore !== undefined) data.seoScore = input.seoScore;
  if (input.wpPostId !== undefined) data.wpPostId = input.wpPostId;
  if (input.promptId !== undefined) data.promptId = input.promptId;
  return prisma.article.create({ data: data as Prisma.ArticleCreateInput });
}

export async function updateArticle(id: string, input: UpdateArticleInput) {
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("文章不存在");
  }
  if (input.status && input.status !== existing.status) {
    assertTransition(existing.status as ArticleStatus, input.status);
  }
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.content !== undefined) data.content = input.content;
  if (input.contentJson !== undefined)
    data.contentJson = input.contentJson as Prisma.InputJsonValue | null;
  if (input.contentHtml !== undefined) data.contentHtml = input.contentHtml;
  if (input.contentMd !== undefined) data.contentMd = input.contentMd;
  if (input.status !== undefined) data.status = input.status;
  if (input.seoScore !== undefined) data.seoScore = input.seoScore;
  if (input.wpPostId !== undefined) data.wpPostId = input.wpPostId;
  if (input.promptId !== undefined) data.promptId = input.promptId;
  return prisma.article.update({ where: { id }, data });
}

export async function deleteArticle(id: string) {
  return prisma.article.delete({ where: { id } });
}
