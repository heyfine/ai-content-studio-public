import { describe, it, expect } from "vitest";
import { calloutTemplate, renderArticleContent, scanCalloutSegments } from "./render";
import { CALLOUT_TYPES, CALLOUT_TYPE_KEYS } from "./callout-types";

describe("scanCalloutSegments", () => {
  it("切分普通文本与高亮块", () => {
    const segs = scanCalloutSegments('开头\n:::callout{type="warning"}\n内容A\n:::\n结尾');
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ kind: "text", value: "开头" });
    expect(segs[1]).toMatchObject({ kind: "callout", body: "内容A" });
    expect(segs[2]).toEqual({ kind: "text", value: "结尾" });
  });

  it("未闭合的高亮块按普通文本保留，不吞掉后续", () => {
    const segs = scanCalloutSegments(':::callout{type="info"}\n没有闭合\n后面正文');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: "text", value: ':::callout{type="info"}\n没有闭合\n后面正文' });
  });
});

describe("renderArticleContent", () => {
  it("普通 Markdown 渲染为 HTML", () => {
    const html = renderArticleContent("# 标题\n\n正文");
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<p>正文</p>");
  });

  it("渲染 7 种类型的高亮块", () => {
    for (const t of CALLOUT_TYPES) {
      const md = `:::callout{type="${t.type}"}\n内容\n:::`;
      const html = renderArticleContent(md);
      expect(html).toContain(`class="callout callout-${t.type}"`);
      expect(html).toContain(`data-callout="${t.type}"`);
      expect(html).toContain(t.label); // 默认标题
      expect(html).toContain(t.icon); // 默认图标
    }
  });

  it("type 非法时降级 neutral 且不注入 class", () => {
    const html = renderArticleContent(':::callout{type="evil"}\n内容\n:::');
    expect(html).toContain('class="callout callout-neutral"');
    expect(html).not.toContain("callout-evil");
  });

  it("title/icon 注入脚本被转义，不产生 XSS", () => {
    const md =
      ':::callout{type="info" title="<script>alert(1)</script>" icon="\"><img src=x>"}\n内容\n:::';
    const html = renderArticleContent(md);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("未闭合高亮块按普通文本输出（保留原字符）", () => {
    const md = ':::callout{type="info"}\n没有闭合\n后续';
    const html = renderArticleContent(md);
    expect(html).toContain("没有闭合");
    expect(html).toContain("后续");
  });

  it("includeCalloutCss 时注入 <style>，否则不注入", () => {
    const md = ':::callout{type="info"}\nx\n:::';
    expect(renderArticleContent(md)).not.toContain("<style>");
    expect(renderArticleContent(md, { includeCalloutCss: true })).toContain("<style>");
  });

  it("高亮块内部 Markdown 仍被渲染", () => {
    const md = ':::callout{type="tip"}\n**加粗**和[链接](https://a.com)\n:::';
    const html = renderArticleContent(md);
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain('<a href="https://a.com">');
  });

  it("多个高亮块与正文交错渲染", () => {
    const md = [
      "第一段",
      ':::callout{type="note"}',
      "提醒A",
      ":::",
      "第二段",
      ':::callout{type="danger"}',
      "警告B",
      ":::",
    ].join("\n");
    const html = renderArticleContent(md);
    expect(html.indexOf("callout-note")).toBeLessThan(html.indexOf("第二段"));
    expect(html.indexOf("callout-danger")).toBeGreaterThan(html.indexOf("第二段"));
  });
});

describe("calloutTemplate", () => {
  it("生成白名单类型的插入模板", () => {
    const tpl = calloutTemplate("warning");
    expect(tpl).toContain('type="warning"');
    expect(tpl).toContain('title="注意"');
    expect(tpl).toContain(":::");
  });

  it("所有类型都能生成合法模板", () => {
    for (const t of CALLOUT_TYPE_KEYS) {
      const tpl = calloutTemplate(t);
      expect(scanCalloutSegments(tpl)[0]).toMatchObject({ kind: "callout" });
      expect(tpl).toContain(`type="${t}"`);
    }
  });
});
