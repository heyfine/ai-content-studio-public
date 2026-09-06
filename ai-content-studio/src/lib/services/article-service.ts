import { Prisma } from "@prisma/client";
import { type ArticleStatus, assertTransition } from "@/lib/article-status";
import { prisma } from "@/lib/prisma";

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
  siteConfigId?: string | null;
  syncStatus?: string | null;
  lastSyncedAt?: string | null;
  wpModifiedAt?: string | null;
  categories?: unknown | null;
  tags?: unknown | null;
  featuredImage?: string | null;
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

export async function listArticles(status?: ArticleStatus, includeTrashed = false) {
  const where: Prisma.ArticleWhereInput = includeTrashed ? {} : { deletedAt: null };
  if (status) where.status = status;
  return prisma.article.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { publishes: { select: { configId: true, wpUrl: true, wpPostId: true } } },
  });
}

/** 列出回收站中的文章（deletedAt 非空） */
export async function listTrashedArticles() {
  return prisma.article.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: { publishes: { select: { configId: true, wpUrl: true, wpPostId: true } } },
  });
}

export async function getArticle(id: string) {
  return prisma.article.findUnique({ where: { id } });
}

/** 软删除：移入回收站（设置 deletedAt） */
export async function trashArticle(id: string) {
  return prisma.article.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/** 从回收站恢复 */
export async function restoreArticle(id: string) {
  return prisma.article.update({
    where: { id },
    data: { deletedAt: null },
  });
}

/** 永久删除（从回收站彻底清除） */
export async function purgeArticle(id: string) {
  return prisma.article.delete({ where: { id } });
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

/**
 * 复制文章为一份新副本：标题加「（副本）」，slug 自动去重（-2/-3…）；
 * 正文三字段与特色图片/分类/标签保留，状态重置 DRAFT，发布相关字段不复制
 * （副本未发布过，wpPostId/wpUrl/同步状态均为空）。
 */
export async function duplicateArticle(id: string) {
  const source = await prisma.article.findUnique({ where: { id } });
  if (!source) {
    throw new Error("文章不存在");
  }
  const title = `${source.title}（副本）`;
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let n = 2;
  while (await prisma.article.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${n++}`;
  }
  return prisma.article.create({
    data: {
      title,
      slug,
      content: source.content,
      contentJson:
        source.contentJson === null ? Prisma.DbNull : (source.contentJson as Prisma.InputJsonValue),
      contentHtml: source.contentHtml,
      contentMd: source.contentMd,
      status: "DRAFT",
      featuredImage: source.featuredImage,
      categories:
        source.categories === null ? Prisma.DbNull : (source.categories as Prisma.InputJsonValue),
      tags: source.tags === null ? Prisma.DbNull : (source.tags as Prisma.InputJsonValue),
      promptId: source.promptId,
    },
  });
}
