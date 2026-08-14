import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { renderArticleContent } from "@/lib/content/render";
import { assertTransition, type ArticleStatus } from "@/lib/article-status";
import type { ArticleSyncStatus } from "@prisma/client";

export interface WpConfigInput {
  name: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  enabled?: boolean;
}

export type WpConfigUpdateInput = Partial<WpConfigInput>;

export async function listWordpressConfigs() {
  return prisma.wordPressConfig.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function createWordpressConfig(input: WpConfigInput) {
  return prisma.wordPressConfig.create({
    data: {
      name: input.name,
      siteUrl: input.siteUrl.replace(/\/+$/, ""),
      username: input.username,
      appPassword: encrypt(input.appPassword),
      enabled: input.enabled ?? true,
    },
  });
}

export async function updateWordpressConfig(id: string, input: WpConfigUpdateInput) {
  const data: {
    name?: string;
    siteUrl?: string;
    username?: string;
    appPassword?: string;
    enabled?: boolean;
  } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.siteUrl !== undefined) data.siteUrl = input.siteUrl.replace(/\/+$/, "");
  if (input.username !== undefined) data.username = input.username;
  if (input.appPassword !== undefined) data.appPassword = encrypt(input.appPassword);
  if (input.enabled !== undefined) data.enabled = input.enabled;
  return prisma.wordPressConfig.update({ where: { id }, data });
}

export async function deleteWordpressConfig(id: string) {
  return prisma.wordPressConfig.delete({ where: { id } });
}

/** 取启用中的首个站点配置 */
export async function getActiveConfig(configId?: string) {
  if (configId) {
    const c = await prisma.wordPressConfig.findUnique({ where: { id: configId } });
    if (!c || !c.enabled) throw new Error("WordPress 站点不可用");
    return c;
  }
  const c = await prisma.wordPressConfig.findFirst({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  });
  if (!c) throw new Error("未配置启用中的 WordPress 站点");
  return c;
}

interface WpPostPayload {
  title: string;
  content: string;
  status: "publish" | "draft";
}

interface WpPostResponse {
  id: number;
  link: string;
  status: string;
}

/** 调用 WordPress REST API 创建或更新文章 */
export async function publishPost(
  config: { siteUrl: string; username: string; appPassword: string },
  payload: WpPostPayload,
  wpPostId?: string,
): Promise<WpPostResponse> {
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");
  const url = wpPostId
    ? `${config.siteUrl}/wp-json/wp/v2/posts/${wpPostId}`
    : `${config.siteUrl}/wp-json/wp/v2/posts`;
  const method = wpPostId ? "PUT" : "POST";
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string } & WpPostResponse;
  if (!res.ok) {
    throw new Error(`WordPress 发布失败（${res.status}）：${data.message ?? res.statusText}`);
  }
  return { id: data.id, link: data.link, status: data.status };
}

export interface PublishResult {
  wpPostId: string;
  link: string;
  status: string;
  articleId: string | null;
}

/** 原始内容直接发布（AI Studio「一键发送到博客」用，不落文章表）。 */
export async function publishRawContent(
  title: string,
  content: string,
  configId?: string,
  wpStatus?: "publish" | "draft",
): Promise<PublishResult> {
  const config = await getActiveConfig(configId);
  const status: "publish" | "draft" = wpStatus ?? "publish";
  // Markdown + 高亮块 → 安全 HTML（含样式），不把 :::callout 原语法发上博客
  const post = await publishPost(config, {
    title,
    content: renderArticleContent(content, { includeCalloutCss: true }),
    status,
  });
  return { wpPostId: String(post.id), link: post.link, status: post.status, articleId: null };
}

/**
 * 发布文章到 WordPress：取站点配置 → 取文章 → 调 WP REST API → 回填 wpPostId。
 * 默认按文章状态映射 WP 状态：PUBLISHED→publish，其余→draft。
 */
export async function publishArticle(
  articleId: string,
  configId?: string,
  wpStatus?: "publish" | "draft",
): Promise<PublishResult> {
  const config = await getActiveConfig(configId);
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw new Error("文章不存在");

  const status: "publish" | "draft" =
    wpStatus ?? (article.status === "PUBLISHED" ? "publish" : "draft");
  const post = await publishPost(
    config,
    {
      title: article.title,
      content: renderArticleContent(article.content, { includeCalloutCss: true }),
      status,
    },
    article.wpPostId ?? undefined,
  );

  // 已发布状态的文章推到 WP publish 时，本地状态保持 PUBLISHED；
  // 其它情况不擅自改本地状态（UI 显式控制状态流转）
  await prisma.article.update({
    where: { id: articleId },
    data: { wpPostId: String(post.id) },
  });

  return {
    wpPostId: String(post.id),
    link: post.link,
    status: post.status,
    articleId,
  };
}

/** 撤销/删除 WordPress 文章（调 WP REST DELETE；本地清空 wpPostId） */
export async function unpublishArticle(articleId: string, configId?: string) {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw new Error("文章不存在");
  if (!article.wpPostId) throw new Error("文章尚未发布到 WordPress");
  const config = await getActiveConfig(configId);
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");
  const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/posts/${article.wpPostId}?force=true`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`WordPress 删除失败（${res.status}）：${data.message ?? res.statusText}`);
  }
  await prisma.article.update({ where: { id: articleId }, data: { wpPostId: null } });
  return { articleId, deleted: true };
}

/**
 * 将 WordPress 文章移入回收站（调 WP REST：status=trash）。
 * 返回 { trashed, trashStatus }，trashStatus 记录 WP 端回收站状态。
 */
export async function trashWordPressPost(
  articleId: string,
  configId?: string,
): Promise<{ trashed: boolean; trashStatus: string }> {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw new Error("文章不存在");
  if (!article.wpPostId) throw new Error("文章尚未同步到 WordPress");
  const config = await getActiveConfig(configId);
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");
  const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/posts/${article.wpPostId}`, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "trash" }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`WordPress 移入回收站失败（${res.status}）：${data.message ?? res.statusText}`);
  }
  return { trashed: true, trashStatus: "trash" };
}

/**
 * 将 WordPress 文章移出回收站（调 WP REST：恢复原状态 publish/draft）。
 */
export async function untrashWordPressPost(
  articleId: string,
  configId?: string,
  status: "publish" | "draft" = "publish",
): Promise<{ trashed: boolean; trashStatus: string }> {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw new Error("文章不存在");
  if (!article.wpPostId) throw new Error("文章尚未同步到 WordPress");
  const config = await getActiveConfig(configId);
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");
  const res = await fetch(`${config.siteUrl}/wp-json/wp/v2/posts/${article.wpPostId}`, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`WordPress 恢复失败（${res.status}）：${data.message ?? res.statusText}`);
  }
  return { trashed: false, trashStatus: status };
}

// 抑制未使用导入告警（保留以备未来状态联动）
void assertTransition;
void (null as unknown as ArticleStatus);

// ========== 博客文章同步功能 ==========

/** WordPress REST API 文章响应类型 */
export interface WpPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string; raw?: string };
  excerpt: { rendered: string };
  status: "publish" | "draft" | "pending" | "private";
  link: string;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  categories: number[];
  tags: number[];
  featured_media: number;
  _links?: {
    "wp:featuredmedia"?: Array<{ href: string }>;
  };
}

/** WordPress REST API 分类响应类型 */
export interface WpCategory {
  id: number;
  name: string;
  slug: string;
}

/** WordPress REST API 媒体响应类型 */
export interface WpMedia {
  id: number;
  source_url: string;
  alt_text?: string;
}

/** 博客文章同步参数 */
export interface SyncBlogPostsOptions {
  configId: string;
  limit?: number;
  offset?: number;
  status?: "publish" | "draft" | "all";
}

/** 博客文章同步结果 */
export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
  details: Array<{
    wpPostId: number;
    articleId?: string;
    status: "synced" | "conflict" | "error";
    message?: string;
  }>;
}

/**
 * 从 WordPress 站点拉取文章列表
 */
export async function fetchBlogPosts(configId: string, options: Partial<SyncBlogPostsOptions> = {}): Promise<WpPost[]> {
  const config = await getActiveConfig(configId);
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");

  const params = new URLSearchParams();
  params.set("per_page", String(options.limit ?? 100));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.status && options.status !== "all") {
    params.set("status", options.status);
  } else {
    params.set("status", "publish,draft");
  }

  const url = `${config.siteUrl}/wp-json/wp/v2/posts?${params.toString()}`;
  console.log("========== WordPress 同步调试 ==========");
  console.log("站点 URL:", config.siteUrl);
  console.log("用户名:", config.username);
  console.log("请求 URL:", url);
  console.log("认证前缀:", basic.substring(0, 20) + "...");
  console.log();

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });

  console.log("WordPress 响应状态:", res.status, res.statusText);
  console.log("响应头:", Object.fromEntries(res.headers.entries()));

  if (!res.ok) {
    const text = await res.text();
    console.error("WordPress API 错误响应:", text);
    const data = text ? (JSON.parse(text) as { message?: string }) : {};
    throw new Error(`获取博客文章失败（${res.status}）：${data.message ?? res.statusText}`);
  }

  const posts = await res.json();
  console.log("获取到博客文章数量:", posts.length);
  if (posts.length > 0) {
    console.log("第一篇文章 ID:", posts[0].id);
    console.log("第一篇文章标题:", posts[0].title?.rendered);
  }

  return posts as Promise<WpPost[]>;
}

/**
 * 从 WordPress 站点拉取单篇文章详情
 */
export async function fetchSingleBlogPost(configId: string, wpPostId: number): Promise<WpPost> {
  const config = await getActiveConfig(configId);
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");

  const url = `${config.siteUrl}/wp-json/wp/v2/posts/${wpPostId}?_embed=wp:featuredmedia`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`获取博客文章详情失败（${res.status}）：${data.message ?? res.statusText}`);
  }

  return res.json() as Promise<WpPost>;
}

/**
 * 从 WordPress 站点拉取分类列表
 */
export async function fetchBlogCategories(configId: string): Promise<WpCategory[]> {
  const config = await getActiveConfig(configId);
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");

  const url = `${config.siteUrl}/wp-json/wp/v2/categories?per_page=100`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`获取博客分类失败（${res.status}）：${data.message ?? res.statusText}`);
  }

  return res.json() as Promise<WpCategory[]>;
}

/**
 * 从 WordPress 站点拉取特色图片信息
 */
export async function fetchBlogFeaturedMedia(configId: string, mediaId: number): Promise<WpMedia | null> {
  if (!mediaId) return null;

  const config = await getActiveConfig(configId);
  const basic = Buffer.from(`${config.username}:${decrypt(config.appPassword)}`).toString("base64");

  const url = `${config.siteUrl}/wp-json/wp/v2/media/${mediaId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) return null;

  return res.json() as Promise<WpMedia>;
}

/**
 * 将 WordPress 文章转换为本地 Article 格式
 */
function wpPostToLocalArticle(wpPost: WpPost, configId: string) {
  // 从 HTML 内容中提取纯文本（简化版本，实际可能需要更复杂的处理）
  const plainContent = wpPost.content.raw || wpPost.content.rendered.replace(/<[^>]*>/g, "");

  return {
    title: wpPost.title.rendered,
    content: plainContent,
    contentHtml: wpPost.content.rendered,
    wpPostId: String(wpPost.id),
    siteConfigId: configId,
    status: wpPost.status === "publish" ? "PUBLISHED" : "DRAFT" as ArticleStatus,
    wpModifiedAt: new Date(wpPost.modified_gmt),
    categories: wpPost.categories,
    tags: wpPost.tags,
    featuredImage: wpPost.featured_media ? String(wpPost.featured_media) : null,
    syncStatus: "SYNCED" as ArticleSyncStatus,
    lastSyncedAt: new Date(),
    slug: `${wpPost.id}-${generateSlug(wpPost.title.rendered)}`,
  };
}

/**
 * 生成 URL 友好的 slug
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

/**
 * 检测博客文章与本地文章的冲突
 */
async function detectArticleConflict(
  wpPost: WpPost,
  localArticle?: { id: string; updatedAt: Date; wpModifiedAt?: Date | null }
): Promise<boolean> {
  if (!localArticle) return false;

  // 如果本地文章没有 WordPress 修改时间记录，则认为不冲突
  if (!localArticle.wpModifiedAt) return false;

  const wpModified = new Date(wpPost.modified_gmt);
  const localModified = localArticle.updatedAt;
  const wpModifiedRecord = localArticle.wpModifiedAt;

  // 如果 WordPress 上的修改时间比记录的修改时间新，且本地也有修改，则存在冲突
  return wpModified > wpModifiedRecord && localModified > wpModifiedRecord;
}

/**
 * 同步博客文章到本地数据库
 */
export async function syncBlogPosts(options: SyncBlogPostsOptions): Promise<SyncResult> {
  const { configId } = options;

  // 获取 WordPress 文章列表
  const wpPosts = await fetchBlogPosts(configId, options);

  // 获取分类映射
  const categories = await fetchBlogCategories(configId);
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));

  const result: SyncResult = {
    synced: 0,
    conflicts: 0,
    errors: 0,
    details: [],
  };

  // 批量处理每篇文章
  for (const wpPost of wpPosts) {
    try {
      // 查找是否已存在对应的本地文章
      const existingArticle = await prisma.article.findFirst({
        where: {
          wpPostId: String(wpPost.id),
          siteConfigId: configId,
        },
      });

      // 检测冲突
      const hasConflict = await detectArticleConflict(wpPost, existingArticle || undefined);

      if (hasConflict) {
        result.conflicts++;
        result.details.push({
          wpPostId: wpPost.id,
          articleId: existingArticle?.id,
          status: "conflict",
          message: "本地和博客都有修改，需要手动解决冲突",
        });

        // 更新文章状态为冲突
        if (existingArticle) {
          await prisma.article.update({
            where: { id: existingArticle.id },
            data: {
              syncStatus: "CONFLICT" as ArticleSyncStatus,
            },
          });
        }
        continue;
      }

      // 准备文章数据
      const articleData = wpPostToLocalArticle(wpPost, configId);

      if (existingArticle) {
        // 更新现有文章
        await prisma.article.update({
          where: { id: existingArticle.id },
          data: {
            ...articleData,
            syncStatus: "SYNCED" as ArticleSyncStatus,
          },
        });
        result.details.push({
          wpPostId: wpPost.id,
          articleId: existingArticle.id,
          status: "synced",
        });
      } else {
        // 创建新文章
        const newArticle = await prisma.article.create({
          data: articleData,
        });
        result.details.push({
          wpPostId: wpPost.id,
          articleId: newArticle.id,
          status: "synced",
        });
      }

      result.synced++;
    } catch (error) {
      result.errors++;
      result.details.push({
        wpPostId: wpPost.id,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * 检查单个文章的同步状态
 */
export async function checkArticleSyncStatus(articleId: string): Promise<{
  hasConflict: boolean;
  wpModified?: Date;
  localModified: Date;
}> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article || !article.wpPostId || !article.siteConfigId) {
    throw new Error("文章不是从博客同步的");
  }

  // 获取 WordPress 文章的最新修改时间
  const wpPost = await fetchSingleBlogPost(article.siteConfigId, parseInt(article.wpPostId));
  const wpModified = new Date(wpPost.modified_gmt);

  return {
    hasConflict: Boolean(article.wpModifiedAt && wpModified > article.wpModifiedAt && article.updatedAt > article.wpModifiedAt),
    wpModified,
    localModified: article.updatedAt,
  };
}

/**
 * 解决文章冲突（以本地为准或以博客为准）
 */
export async function resolveArticleConflict(
  articleId: string,
  strategy: "local" | "remote"
): Promise<void> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article) throw new Error("文章不存在");
  if (!article.wpPostId || !article.siteConfigId) {
    throw new Error("文章不是从博客同步的");
  }

  if (strategy === "remote") {
    // 以博客为准：重新拉取博客文章内容
    const wpPost = await fetchSingleBlogPost(article.siteConfigId, parseInt(article.wpPostId));
    const articleData = wpPostToLocalArticle(wpPost, article.siteConfigId);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        ...articleData,
        syncStatus: "SYNCED" as ArticleSyncStatus,
      },
    });
  } else {
    // 以本地为准：强制同步到博客
    const config = await getActiveConfig(article.siteConfigId);
    const status: "publish" | "draft" = article.status === "PUBLISHED" ? "publish" : "draft";

    await publishPost(
      config,
      {
        title: article.title,
        content: renderArticleContent(article.content, { includeCalloutCss: true }),
        status,
      },
      article.wpPostId,
    );

    // 更新同步状态
    await prisma.article.update({
      where: { id: articleId },
      data: {
        syncStatus: "SYNCED" as ArticleSyncStatus,
        wpModifiedAt: new Date(),
      },
    });
  }
}
