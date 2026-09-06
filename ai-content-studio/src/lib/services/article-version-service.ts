/**
 * 文章历史版本服务：正文被覆盖前自动快照（WPS 式版本历史）。
 *
 * 快照时机：updateArticle 实际改写正文/标题外内容前，把「被覆盖的旧状态」存档——
 * 因此恢复旧版本本身也是一次覆盖，恢复前的状态同样入史，恢复操作完全可逆。
 * 每篇文章保留最近 VERSIONS_KEEP 篇，超出自动清理最旧版本。
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const VERSIONS_KEEP = 50;

export type VersionSource = "save" | "refresh" | "sync" | "restore";

export const VERSION_SOURCE_LABELS: Record<VersionSource, string> = {
  save: "编辑保存",
  refresh: "AI 刷新",
  sync: "博客同步",
  restore: "恢复前存档",
};

/** updateArticle 的正文相关输入（用于判断是否发生了内容覆盖） */
export interface ContentSnapshot {
  content?: string;
  /** Prisma Json 字段，API 层为 unknown，service 内 cast */
  contentJson?: unknown;
  contentHtml?: string | null;
  contentMd?: string | null;
  title?: string;
}

/**
 * 正文被覆盖前存档旧状态。仅当 incoming 确实改变了正文相关字段时才快照；
 * 事务外由调用方在更新前调用（updateArticle 内部）。
 */
export async function snapshotBeforeOverwrite(
  articleId: string,
  existing: {
    title: string;
    content: string;
    contentJson: unknown;
    contentHtml: string | null;
    contentMd: string | null;
  },
  incoming: ContentSnapshot,
  source: VersionSource,
): Promise<void> {
  const changed =
    (incoming.content !== undefined && incoming.content !== existing.content) ||
    (incoming.contentHtml !== undefined && incoming.contentHtml !== existing.contentHtml) ||
    (incoming.contentMd !== undefined && incoming.contentMd !== existing.contentMd) ||
    (incoming.contentJson !== undefined &&
      JSON.stringify(incoming.contentJson) !== JSON.stringify(existing.contentJson ?? null));
  if (!changed) return;
  await prisma.articleVersion.create({
    data: {
      articleId,
      title: existing.title,
      content: existing.content,
      contentJson:
        existing.contentJson === null
          ? Prisma.DbNull
          : (existing.contentJson as Prisma.InputJsonValue),
      contentHtml: existing.contentHtml,
      contentMd: existing.contentMd,
      source,
      size: existing.content.length,
    },
  });
  await pruneVersions(articleId);
}

/** 保留最近 VERSIONS_KEEP 篇，删除更早的版本 */
export async function pruneVersions(articleId: string): Promise<void> {
  const keep = await prisma.articleVersion.findMany({
    where: { articleId },
    orderBy: { createdAt: "desc" },
    take: VERSIONS_KEEP,
    select: { id: true, createdAt: true },
  });
  if (keep.length < VERSIONS_KEEP) return;
  const oldestKept = keep[keep.length - 1];
  await prisma.articleVersion.deleteMany({
    where: { articleId, createdAt: { lt: oldestKept.createdAt } },
  });
}

/** 版本列表（不含正文，避免大 payload）；size 为正文字符数 */
export async function listVersions(articleId: string) {
  return prisma.articleVersion.findMany({
    where: { articleId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      source: true,
      size: true,
      createdAt: true,
    },
  });
}

/** 单个版本详情（预览用，含正文） */
export async function getVersion(articleId: string, versionId: string) {
  return prisma.articleVersion.findFirst({
    where: { id: versionId, articleId },
  });
}

/**
 * 恢复版本：把版本内容写回文章（updateArticle 会先把当前状态快照为
 * 「恢复前存档」，恢复操作可再撤销）。返回更新后的文章 id。
 */
export async function restoreVersion(articleId: string, versionId: string): Promise<void> {
  const version = await getVersion(articleId, versionId);
  if (!version) throw new Error("版本不存在");
  const { updateArticle } = await import("./article-service");
  await updateArticle(
    articleId,
    {
      title: version.title,
      content: version.content,
      contentJson: version.contentJson as Prisma.InputJsonValue | null,
      contentHtml: version.contentHtml,
      contentMd: version.contentMd,
    },
    "restore",
  );
}

/** 删除单个版本 */
export async function deleteVersion(articleId: string, versionId: string): Promise<void> {
  const result = await prisma.articleVersion.deleteMany({
    where: { id: versionId, articleId },
  });
  if (result.count === 0) throw new Error("版本不存在");
}
