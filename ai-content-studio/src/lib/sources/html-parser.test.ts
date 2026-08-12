import { describe, expect, it } from "vitest";
import { parseHtml } from "./html-parser";

const ARTICLE_HTML = `<!DOCTYPE html><html lang="zh-CN"><head>
<title>示例文章标题</title>
<meta property="og:title" content="OG 示例标题">
<meta property="og:description" content="OG 摘要">
<meta property="og:site_name" content="示例站">
<meta property="og:type" content="article">
<meta property="article:author" content="张三">
<meta property="article:published_time" content="2026-08-12T10:00:00Z">
<link rel="canonical" href="https://example.com/canonical-path">
</head><body>
<nav><a href="/">首页</a></nav>
<main><article>
<h1>示例文章标题</h1>
<p>这是一个示例段落，包含足够正文让 Readability 提取。第一段介绍背景情况。</p>
<p>第二段继续展开细节，提供更多内容让解析器识别为正文而非样板。</p>
<p>第三段给出结论，使正文长度足够。</p>
</article></main>
<footer>© 2026 示例站</footer>
</body></html>`;

describe("parseHtml", () => {
  it("提取 og 元数据（title/description/canonical/author/published/site/type）", () => {
    const r = parseHtml(ARTICLE_HTML, "https://example.com/article");
    expect(r).not.toBeNull();
    expect(r?.meta.ogType).toBe("article");
    expect(r?.meta.siteName).toBe("示例站");
    expect(r?.meta.author).toBe("张三");
    expect(r?.meta.publishedTime).toBe("2026-08-12T10:00:00Z");
    expect(r?.meta.canonical).toBe("https://example.com/canonical-path");
    expect(r?.meta.lang).toBe("zh-CN");
  });

  it("提取 readability 正文（含段落、非空 textContent）", () => {
    const r = parseHtml(ARTICLE_HTML, "https://example.com/article");
    expect(r?.length).toBeGreaterThan(0);
    expect(r?.textContent).toContain("这是");
    expect(r?.textContent).toContain("第二段");
  });

  it("标题优先 og:title，无 og 用 doc.title", () => {
    const r = parseHtml(
      `<html><head><title>常规标题</title></head><body><article><p>${"正文 ".repeat(200)}</p></article></body></html>`,
    );
    expect(r?.title).toBe("常规标题");
  });

  it("无正文页降级：textContent 空、excerpt 用 description、title 用 og/document", () => {
    const empty = `<html><head><meta name="description" content="页面摘要"><meta property="og:title" content="降级标题"></head><body></body></html>`;
    const r = parseHtml(empty);
    expect(r).not.toBeNull();
    expect(r?.textContent).toBe("");
    expect(r?.excerpt).toBe("页面摘要");
    expect(r?.title).toBe("降级标题");
  });

  it("author 回退到 meta name=author", () => {
    const r = parseHtml(
      `<html><head><meta name="author" content="李四"></head><body><article><p>${"a ".repeat(200)}</p></article></body></html>`,
    );
    expect(r?.byline).toBe("李四");
  });

  it("空 HTML 返回 null", () => {
    expect(parseHtml("")).toBeNull();
  });
});
