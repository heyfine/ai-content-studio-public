import { generate as aiGenerate, type AIGenerateArgs } from "@/lib/ai/generate";
import { analyzeAndSave, type AnalyzeSavedResult } from "@/lib/services/seo-service";
import { getArticle, updateArticle } from "@/lib/services/article-service";
import {
  rankStaleArticles,
  stalenessReasons,
  type StalenessOptions,
} from "@/lib/article-staleness";

const REFRESH_SYSTEM_PROMPT =
  "你是资深技术博客编辑。重写以下文章以提升质量、SEO 结构与时效性：保持原文主题与核心观点，优化标题层级（H1/H2/H3）、补充细节与示例、修正陈旧或错误的表述，确保 Markdown 结构清晰。只输出正文 Markdown，不要寒暄与标题重复。";

export interface RefreshOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface RefreshResult {
  articleId: string;
  title: string;
  generationId: string;
  oldSeoScore: number | null;
  newSeoScore: number;
  oldContentLength: number;
  newContentLength: number;
  stale: { aged: boolean; lowSeo: boolean; ageDays: number };
}

/**
 * AI 重写单篇文章：取文章 → AI 任务路由 article_generate 重写 → 更新 content
 * → 重新 SEO 分析并回填 seoScore。返回新旧评分对比，供 UI 展示改进幅度。
 */
export async function refreshArticle(
  articleId: string,
  opts: RefreshOptions = {},
): Promise<RefreshResult> {
  const article = await getArticle(articleId);
  if (!article) throw new Error("文章不存在");

  const input = `重写以下文章（标题：${article.title}）：\n\n${article.content}`;
  const genArgs: AIGenerateArgs = {
    task: "article_generate",
    input,
    systemPrompt: opts.systemPrompt ?? REFRESH_SYSTEM_PROMPT,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    articleId,
  };
  const gen = await aiGenerate(genArgs);

  await updateArticle(articleId, { content: gen.content });

  let saved: AnalyzeSavedResult;
  try {
    saved = await analyzeAndSave(articleId);
  } catch {
    // SEO 重评失败不视为刷新失败（重写本身已成功）；用旧分兜底
    return {
      articleId,
      title: article.title as string,
      generationId: gen.generationId,
      oldSeoScore: (article as { seoScore?: number | null }).seoScore ?? null,
      newSeoScore: (article as { seoScore?: number | null }).seoScore ?? 0,
      oldContentLength: (article.content as string).length,
      newContentLength: gen.content.length,
      stale: stalenessReasons({
        updatedAt: (article as { updatedAt: Date }).updatedAt,
        seoScore: (article as { seoScore?: number | null }).seoScore,
      }),
    };
  }

  return {
    articleId,
    title: article.title as string,
    generationId: gen.generationId,
    oldSeoScore: (article as { seoScore?: number | null }).seoScore ?? null,
    newSeoScore: saved.score,
    oldContentLength: (article.content as string).length,
    newContentLength: gen.content.length,
    stale: stalenessReasons({
      updatedAt: (article as { updatedAt: Date }).updatedAt,
      seoScore: (article as { seoScore?: number | null }).seoScore,
    }),
  };
}

export interface RefreshBatchResult {
  refreshed: RefreshResult[];
  failed: { articleId: string; error: string }[];
}

/**
 * 取候选列表 → 对每个 stale 文章执行 AI 重写刷新；单篇失败收集不阻断后续。
 * articles 传入由调用方读取（便于服务纯注入、测试时 mock），实际由 API 层调 listArticles 后传入。
 */
export async function refreshStaleArticles(
  articles: { id: string; updatedAt: Date; seoScore: number | null }[],
  stalenessOpts: StalenessOptions = {},
  refreshOpts: RefreshOptions = {},
): Promise<RefreshBatchResult> {
  const ranked = rankStaleArticles(articles, stalenessOpts);
  const refreshed: RefreshResult[] = [];
  const failed: { articleId: string; error: string }[] = [];
  for (const a of ranked) {
    try {
      refreshed.push(await refreshArticle(a.id, refreshOpts));
    } catch (e) {
      failed.push({ articleId: a.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { refreshed, failed };
}
