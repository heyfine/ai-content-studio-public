import { prisma } from "@/lib/prisma";
import { analyzeSeo, type SeoAnalysisResult } from "@/lib/seo-analyzer";

export interface AnalyzeRawInput {
  title: string;
  content: string;
  metaDescription?: string;
}

export type AnalyzeRawResult = SeoAnalysisResult & { saved: false };
export type AnalyzeSavedResult = SeoAnalysisResult & {
  saved: true;
  reportId: string;
  articleId: string;
};

/** 预览模式：仅分析，不写库 */
export async function analyzeRaw(input: AnalyzeRawInput): Promise<AnalyzeRawResult> {
  return { ...analyzeSeo(input), saved: false };
}

/** 存库模式：分析指定文章，写 SeoReport 并回填 Article.seoScore */
export async function analyzeAndSave(articleId: string): Promise<AnalyzeSavedResult> {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) {
    throw new Error("文章不存在");
  }
  const result = analyzeSeo({ title: article.title, content: article.content });
  const report = await prisma.seoReport.create({
    data: {
      articleId,
      score: result.score,
      keywords: result.keywords,
      issues: result.issues,
      suggestions: result.suggestions,
    },
  });
  await prisma.article.update({
    where: { id: articleId },
    data: { seoScore: result.score },
  });
  return { ...result, saved: true, reportId: report.id, articleId };
}

/** 取某文章最新的 SEO 报告 */
export async function getLatestReport(articleId: string) {
  return prisma.seoReport.findFirst({
    where: { articleId },
    orderBy: { createdAt: "desc" },
  });
}
