import { describe, expect, it } from "vitest";
import { CALLOUT_TYPE_KEYS, CALLOUT_TYPES } from "./callout-types";
import {
  calloutTemplate,
  editCalloutInMarkdown,
  findCalloutRanges,
  removeCalloutInMarkdown,
  renderArticleContent,
  scanCalloutSegments,
} from "./render";

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
      ':::callout{type="info" title="<script>alert(1)</script>" icon=""><img src=x>"}\n内容\n:::';
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

describe("findCalloutRanges", () => {
  it("返回每个合法高亮块的字节范围与属性", () => {
    const md = '开头\n:::callout{type="warning" title="注意" icon="⚠️"}\n块A\n:::\n结尾';
    const ranges = findCalloutRanges(md);
    expect(ranges).toHaveLength(1);
    const r = ranges[0];
    expect(r.index).toBe(0);
    expect(r.attrs).toEqual({ type: "warning", title: "注意", icon: "⚠️" });
    expect(r.body).toBe("块A");
    expect(md.slice(r.start, r.end)).toBe(
      ':::callout{type="warning" title="注意" icon="⚠️"}\n块A\n:::',
    );
  });

  it("多个高亮块按出现顺序编号，字节范围互不重叠", () => {
    const md = [
      "正文0",
      ':::callout{type="info"}',
      "A",
      ":::",
      "正文1",
      ':::callout{type="tip"}',
      "B",
      ":::",
      "正文2",
    ].join("\n");
    const ranges = findCalloutRanges(md);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].index).toBe(0);
    expect(ranges[1].index).toBe(1);
    expect(ranges[0].end).toBeLessThanOrEqual(ranges[1].start);
    expect(md.slice(ranges[0].start, ranges[0].end)).toContain("A");
    expect(md.slice(ranges[1].start, ranges[1].end)).toContain("B");
  });

  it("未闭合高亮块不计入范围", () => {
    const md = ':::callout{type="info"}\n没闭合';
    expect(findCalloutRanges(md)).toHaveLength(0);
  });

  it("缺省属性以 undefined 保留，不臆造默认值", () => {
    const md = ":::callout\n内容\n:::";
    const ranges = findCalloutRanges(md);
    expect(ranges[0].attrs).toEqual({});
  });
});

describe("editCalloutInMarkdown", () => {
  const md = '开头\n:::callout{type="warning" title="注意" icon="⚠️"}\n旧内容\n:::\n结尾';

  it("替换指定序号块的 type/title/icon/body", () => {
    const next = editCalloutInMarkdown(md, 0, {
      type: "tip",
      title: "推荐",
      icon: "💡",
      body: "新内容",
    });
    expect(next).toBe('开头\n:::callout{type="tip" title="推荐" icon="💡"}\n新内容\n:::\n结尾');
    // 字节范围可被再次解析
    const ranges = findCalloutRanges(next);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].attrs).toEqual({ type: "tip", title: "推荐", icon: "💡" });
    expect(ranges[0].body).toBe("新内容");
  });

  it("非法 type 降级 neutral", () => {
    const next = editCalloutInMarkdown(md, 0, {
      type: "evil" as never,
      title: "",
      icon: "",
      body: "x",
    });
    expect(next).toContain('type="neutral"');
  });

  it("title/icon 为空时回退到类型默认值", () => {
    const next = editCalloutInMarkdown(md, 0, {
      type: "info",
      title: "  ",
      icon: "",
      body: "y",
    });
    expect(next).toContain('title="信息"');
    expect(next).toContain('icon="ℹ️"');
  });

  it("索引越界时原样返回 md（防御性）", () => {
    expect(editCalloutInMarkdown(md, 99, { type: "info", title: "x", icon: "y", body: "z" })).toBe(
      md,
    );
  });

  it("不改写目标块之外的文本", () => {
    const next = editCalloutInMarkdown(md, 0, {
      type: "warning",
      title: "注意",
      icon: "⚠️",
      body: "旧内容",
    });
    expect(next).toBe(md);
  });
});

describe("removeCalloutInMarkdown", () => {
  it("移除指定序号块并清理多余空行", () => {
    const md = '前文\n:::callout{type="info"}\nA\n:::\n后文';
    expect(removeCalloutInMarkdown(md, 0)).toBe("前文\n后文");
  });

  it("连续两个块移除一个后另一个仍可正确定位", () => {
    const md = [
      "正文0",
      ':::callout{type="info"}',
      "A",
      ":::",
      "正文1",
      ':::callout{type="tip"}',
      "B",
      ":::",
      "正文2",
    ].join("\n");
    const after = removeCalloutInMarkdown(md, 0);
    const ranges = findCalloutRanges(after);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].body).toBe("B");
  });

  it("索引越界时不改动原文", () => {
    const md = '前文\n:::callout{type="info"}\nA\n:::\n后文';
    expect(removeCalloutInMarkdown(md, 99)).toBe(md);
  });
});
