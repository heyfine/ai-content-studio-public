/**
 * SEO 本地规则分析器：基于标题 + Markdown 正文做静态检测，零依赖、纯函数、可 100% 单测。
 * 不调用 AI，稳定免费；评分 0-100，返回 issues / suggestions / keywords。
 */

export interface SeoAnalysisInput {
  title: string;
  content: string;
  /** 可选 slug，影响 URL 友好度评估 */
  slug?: string;
  /** 可选 Meta 描述；缺则给「补充 Meta 描述」建议 */
  metaDescription?: string;
}

export interface SeoAnalysisResult {
  score: number;
  keywords: string[];
  issues: string[];
  suggestions: string[];
}

const TITLE_MIN = 10;
const TITLE_MAX = 60;
const META_MIN = 80;
const META_MAX = 160;

/** 中英文常见停用词，提取关键词时过滤 */
const STOPWORDS = new Set([
  "的",
  "了",
  "是",
  "在",
  "和",
  "与",
  "或",
  "也",
  "都",
  "而",
  "这",
  "那",
  "用",
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "is",
  "are",
  "with",
  "by",
  "as",
  "at",
  "from",
  "it",
  "this",
  "that",
  "be",
  "you",
  "your",
  "how",
  "what",
  "why",
  "when",
  "can",
  "use",
  "using",
]);

interface Headings {
  h1: string[];
  h2: string[];
  h3: string[];
}

function parseHeadings(content: string): Headings {
  const h1: string[] = [];
  const h2: string[] = [];
  const h3: string[] = [];
  for (const line of content.split("\n")) {
    const m1 = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    const m2 = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    const m3 = /^###\s+(.+?)\s*#*\s*$/.exec(line);
    if (m3) h3.push(m3[1].trim());
    else if (m2) h2.push(m2[1].trim());
    else if (m1) h1.push(m1[1].trim());
  }
  return { h1, h2, h3 };
}

/** 统计图片与缺 ALT 的数量 */
function parseImages(content: string): { total: number; missingAlt: number } {
  let total = 0;
  let missingAlt = 0;
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  for (const m of content.matchAll(re)) {
    total += 1;
    const alt = m[1].trim();
    if (!alt) missingAlt += 1;
  }
  return { total, missingAlt };
}

/** 统计内部链接（非图片），简化：所有 [text](url) 中非 ! 开头 */
function countLinks(content: string): number {
  let n = 0;
  const re = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
  for (const _ of content.matchAll(re)) n += 1;
  return n;
}

/** 提取关键词：标题 + 各级标题与正文，按频次取 top N，去停用词 */
function extractKeywords(title: string, content: string, topN = 5): string[] {
  const text = `${title}\n${parseHeadings(content).h2.join("\n")}\n${content}`;
  const freq = new Map<string, number>();
  const tokens = text.match(/[A-Za-z][A-Za-z0-9'-]*|[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const raw of tokens) {
    const t = raw.toLowerCase();
    if (STOPWORDS.has(t)) continue;
    if (t.length < 2) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map((e) => e[0]);
}

/** 去掉 Markdown 标记后的纯文本，用于可读性评估 */
function stripMarkdown(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Readability {
  wordCount: number;
  paragraphCount: number;
  avgParagraphLen: number;
  longParagraphs: number;
}

function assessReadability(content: string): Readability {
  const plain = stripMarkdown(content);
  const wordCount = plain.length;
  const paragraphs = plain.split(/\n{2,}|\n(?=\S)/).filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length || 1;
  const avgParagraphLen = Math.round(wordCount / paragraphCount);
  const longParagraphs = paragraphs.filter((p) => p.length > 200).length;
  return { wordCount, paragraphCount, avgParagraphLen, longParagraphs };
}

export function analyzeSeo(input: SeoAnalysisInput): SeoAnalysisResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let penalty = 0;

  // 1. 标题长度
  const titleLen = input.title.trim().length;
  if (titleLen === 0) {
    issues.push("缺少标题");
    penalty += 15;
  } else if (titleLen < TITLE_MIN) {
    issues.push(`标题过短（${titleLen} 字符，建议 ${TITLE_MIN}-${TITLE_MAX}）`);
    penalty += 8;
  } else if (titleLen > TITLE_MAX) {
    issues.push(`标题过长（${titleLen} 字符，建议 ${TITLE_MIN}-${TITLE_MAX}）`);
    penalty += 6;
  }

  // 2. 标题结构
  const headings = parseHeadings(input.content);
  if (headings.h1.length === 0 && headings.h2.length === 0) {
    issues.push("正文缺少标题层级（H1/H2）");
    penalty += 12;
  } else if (headings.h2.length === 0) {
    issues.push("缺少二级标题，文章结构偏平");
    penalty += 6;
  }
  if (headings.h1.length > 1) {
    issues.push("存在多个 H1，建议仅保留一个主标题");
    penalty += 4;
  }

  // 3. 图片 ALT
  const images = parseImages(input.content);
  if (images.total > 0 && images.missingAlt > 0) {
    issues.push(`有 ${images.missingAlt} 张图片缺少 ALT 文本`);
    penalty += Math.min(10, images.missingAlt * 4);
  }

  // 4. 内部链接
  const linkCount = countLinks(input.content);
  if (linkCount === 0 && input.content.trim().length > 0) {
    issues.push("缺少内部链接");
    suggestions.push("适当添加指向站内相关文章的内部链接，提升互联与停留时长");
    penalty += 8;
  }

  // 5. Meta 描述
  const meta = input.metaDescription?.trim() ?? "";
  if (meta.length === 0) {
    issues.push("缺少 Meta 描述");
    suggestions.push("补充 80-160 字符的 Meta 描述，用于搜索结果摘要");
    penalty += 10;
  } else if (meta.length < META_MIN) {
    issues.push(`Meta 描述过短（${meta.length} 字符，建议 ${META_MIN}-${META_MAX}）`);
    penalty += 5;
  } else if (meta.length > META_MAX) {
    issues.push(`Meta 描述过长（${meta.length} 字符，建议 ${META_MIN}-${META_MAX}）`);
    penalty += 4;
  }

  // 6. 可读性
  const r = assessReadability(input.content);
  if (r.wordCount < 200) {
    issues.push(`正文偏短（约 ${r.wordCount} 字符），内容深度可能不足`);
    penalty += 8;
  }
  if (r.longParagraphs > 0) {
    issues.push(`有 ${r.longParagraphs} 个段落过长（>200 字符），建议拆分`);
    suggestions.push("长段落拆分为小段或列表，提升可读性");
    penalty += Math.min(10, r.longParagraphs * 3);
  }

  // 7. 关键词
  const keywords = extractKeywords(input.title, input.content);
  if (keywords.length === 0) {
    issues.push("未能提取到有效关键词");
    penalty += 6;
  } else if (input.title.trim() && !keywords.some((k) => input.title.toLowerCase().includes(k))) {
    suggestions.push("让标题中的关键词在正文与 H2 中重复出现，强化主题");
    penalty += 4;
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { score, keywords, issues, suggestions };
}
