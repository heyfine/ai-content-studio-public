import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

/**
 * HTML 正文解析：jsdom + @mozilla/readability 提取正文，同一 DOM 抽 og/canonical/author 等元数据。
 * 无正文页降级用 meta（标题/描述/作者）；供 source-service 形成 normalizedContent 与 metadata。
 */

export interface ParsedMeta {
  title?: string;
  description?: string;
  canonical?: string;
  author?: string;
  publishedTime?: string;
  lang?: string;
  siteName?: string;
  ogType?: string;
}

export interface ParsedArticle {
  title: string;
  excerpt: string;
  byline: string;
  length: number;
  /** Readability 提取的正文 HTML（失败为空） */
  content: string;
  /** 正文纯文本（normalizedContent 用） */
  textContent: string;
  meta: ParsedMeta;
}

function getMeta(doc: Document, prop: string): string | undefined {
  const el = doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
  const v = el?.getAttribute("content") ?? undefined;
  return v && v.trim() ? v.trim() : undefined;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Readability.parse 返回结构（T=string） */
type ReadabilityResult = {
  title: string | null | undefined;
  content: string | null | undefined;
  textContent: string | null | undefined;
  length: number | null | undefined;
  excerpt: string | null | undefined;
  byline: string | null | undefined;
};

export function parseHtml(html: string, baseUrl?: string): ParsedArticle | null {
  if (!html) return null;
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;
  const meta: ParsedMeta = {
    title: getMeta(doc, "og:title"),
    description: getMeta(doc, "og:description") ?? getMeta(doc, "description"),
    canonical: doc.querySelector("link[rel='canonical']")?.getAttribute("href") ?? undefined,
    author: getMeta(doc, "article:author") ?? getMeta(doc, "author"),
    publishedTime: getMeta(doc, "article:published_time"),
    lang: doc.documentElement.getAttribute("lang") ?? undefined,
    siteName: getMeta(doc, "og:site_name"),
    ogType: getMeta(doc, "og:type"),
  };
  const fallbackTitle = meta.title ?? doc.title ?? "";

  let article: ReadabilityResult | null = null;
  try {
    article = new Readability(doc.cloneNode(true) as Document).parse() as ReadabilityResult | null;
  } catch {
    article = null;
  }

  if (article) {
    const contentHtml = article.content ?? "";
    const textContent = article.textContent ?? stripTags(contentHtml);
    return {
      title: article.title ?? fallbackTitle,
      excerpt: article.excerpt ?? meta.description ?? "",
      byline: article.byline ?? meta.author ?? "",
      length: article.length ?? textContent.length,
      content: contentHtml,
      textContent,
      meta,
    };
  }
  return {
    title: fallbackTitle,
    excerpt: meta.description ?? "",
    byline: meta.author ?? "",
    length: 0,
    content: "",
    textContent: "",
    meta,
  };
}
