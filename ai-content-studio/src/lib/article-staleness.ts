/**
 * 文章过期/低质检测（纯函数，零外部依赖，100% 可单测）。
 *
 * 两个维度：
 * - age：updatedAt 距今超 maxAgeDays（默认 90）视为过期；
 * - lowSeo：seoScore 非空且 < lowSeoThreshold（默认 60）视为低质。
 * 任一满足即 stale。排序：最低 seoScore 优先；同分则最早更新优先。
 */

export const STALENESS_DEFAULTS = {
  maxAgeDays: 90,
  lowSeoThreshold: 60,
} as const;

export interface StalenessOptions {
  maxAgeDays?: number;
  lowSeoThreshold?: number;
  /** 注入当前时间，便于测试；默认 new Date() */
  now?: Date;
}

export interface ArticleStalenessInput {
  updatedAt: Date | string;
  seoScore?: number | null;
}

function toMs(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

export function isStaleArticle(
  article: ArticleStalenessInput,
  opts: StalenessOptions = {},
): boolean {
  const maxAgeDays = opts.maxAgeDays ?? STALENESS_DEFAULTS.maxAgeDays;
  const lowSeo = opts.lowSeoThreshold ?? STALENESS_DEFAULTS.lowSeoThreshold;
  const now = opts.now ?? new Date();

  const ageMs = now.getTime() - toMs(article.updatedAt);
  if (ageMs > maxAgeDays * 24 * 60 * 60 * 1000) return true;

  const score = article.seoScore;
  if (score !== null && score !== undefined && score < lowSeo) return true;

  return false;
}

/** 过期/低质原因（便于 UI 标注与日志） */
export function stalenessReasons(
  article: ArticleStalenessInput,
  opts: StalenessOptions = {},
): { aged: boolean; lowSeo: boolean; ageDays: number } {
  const maxAgeDays = opts.maxAgeDays ?? STALENESS_DEFAULTS.maxAgeDays;
  const lowSeo = opts.lowSeoThreshold ?? STALENESS_DEFAULTS.lowSeoThreshold;
  const now = opts.now ?? new Date();
  const ageMs = now.getTime() - toMs(article.updatedAt);
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const aged = ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
  const score = article.seoScore;
  const low = score !== null && score !== undefined && score < lowSeo;
  return { aged, lowSeo: low, ageDays };
}

/**
 * 从列表筛出 stale 文章并排序：
 * 1) 最低 seoScore 优先（seoScore 为 null 视为 100，即非低质但仍可因 age 入选）；
 * 2) 同分则最早 updatedAt 优先。
 */
export function rankStaleArticles<T extends ArticleStalenessInput>(
  list: T[],
  opts: StalenessOptions = {},
): T[] {
  const stale = list.filter((a) => isStaleArticle(a, opts));
  return stale.sort((a, b) => {
    const sa = a.seoScore ?? 100;
    const sb = b.seoScore ?? 100;
    if (sa !== sb) return sa - sb;
    return toMs(a.updatedAt) - toMs(b.updatedAt);
  });
}
