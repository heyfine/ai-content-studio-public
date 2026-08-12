import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { renderArticleContent } from "@/lib/content/render";
import { assertTransition, type ArticleStatus } from "@/lib/article-status";

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

// 抑制未使用导入告警（保留以备未来状态联动）
void assertTransition;
void (null as unknown as ArticleStatus);
