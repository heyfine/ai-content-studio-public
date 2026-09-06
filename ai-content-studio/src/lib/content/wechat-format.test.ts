import { describe, expect, it } from "vitest";
import { oklchToHex, toWechatHtml } from "./wechat-format";

describe("oklchToHex", () => {
  it("白色 oklch(1,0,0) → #ffffff", () => {
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe("#ffffff");
  });

  it("黑色 oklch(0,0,0) → #000000", () => {
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe("#000000");
  });

  it("info 蓝 oklch(0.623 0.214 259.815) → #2b7fff（culori 参考值，与编辑器 oklch 同源）", () => {
    expect(oklchToHex({ l: 0.623, c: 0.214, h: 259.815 })).toBe("#2b7fff");
  });

  it("输出恒为合法 hex", () => {
    for (const h of [0, 60, 120, 180, 240, 300, 359]) {
      for (const l of [0.2, 0.5, 0.8]) {
        expect(oklchToHex({ l, c: 0.2, h })).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe("toWechatHtml", () => {
  it("所有标签样式内联：输出无 class、无 <style>、无 oklch/color-mix", () => {
    const md = [
      "# 标题",
      "",
      "正文段落 **加粗** *斜体*。",
      "",
      "- 项目一",
      "- 项目二",
      "",
      "> 引用内容",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");
    const html = toWechatHtml(md);
    expect(html).not.toMatch(/class=/);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/oklch\(/);
    expect(html).not.toMatch(/color-mix\(/);
    expect(html).toMatch(/<h1 style="/);
    expect(html).toMatch(/<p style="/);
    expect(html).toMatch(/<strong style="[^"]*font-weight:700/);
    // 原生列表被微信二次加工拆行 → 一律降级为圆点段落（微信 li 顽疾）
    expect(html).not.toMatch(/<(ul|ol|li)\b/);
    expect(html).toContain("• ");
    expect(html).toMatch(/<blockquote style="[^"]*border-left:3px solid/);
    expect(html).toMatch(/<th style="[^"]*border:1px solid/);
  });

  it("整体包一层带基础字号的 section", () => {
    const html = toWechatHtml("正文");
    expect(html.startsWith('<section style="font-size:15px;')).toBe(true);
    expect(html.endsWith("</section>")).toBe(true);
  });

  it("链接保留 href 并内联微信蓝", () => {
    const html = toWechatHtml("[例子](https://example.com)");
    expect(html).toMatch(/<a href="https:\/\/example\.com" style="[^"]*color:#576b95/);
  });

  it("图片保留 src 并内联自适应宽度", () => {
    const html = toWechatHtml("![图](https://cdn.example.com/a.png)");
    expect(html).toMatch(
      /<img src="https:\/\/cdn\.example\.com\/a\.png" alt="图" style="[^"]*max-width:100%/,
    );
  });

  it("行内代码走红色配色，代码块降级为按行 section（防微信折叠换行）", () => {
    const md = "行内 `code` 与：\n\n```\nblock code\n```";
    const html = toWechatHtml(md);
    expect(html).toMatch(/<code style="[^"]*color:#c0392b/);
    // 无原生 pre/code 块残留
    expect(html).not.toMatch(/<pre\b/);
    expect(html).toMatch(/background:#f6f8fa/);
    expect(html).toMatch(/<section style="font-family:Menlo[^"]*;">block&nbsp;code<\/section>/);
  });

  it("代码块按行拆分：缩进转 nbsp、空行转 &nbsp;、末尾换行不产生空行", () => {
    const md = "```\nconst a = 1;\n\n  if (a) {\n    go();\n  }\n```";
    const html = toWechatHtml(md);
    expect(html).toContain(">const&nbsp;a&nbsp;=&nbsp;1;</section>");
    // 空行保留为 &nbsp; 行
    expect(html).toMatch(/<section style="font-family:Menlo[^"]*;">&nbsp;<\/section>/);
    // 缩进空格转 nbsp（保持 ASCII 对齐）
    expect(html).toContain("&nbsp;&nbsp;if&nbsp;(a)&nbsp;{");
    expect(html).toContain("&nbsp;&nbsp;&nbsp;&nbsp;go();");
    // 末尾换行不产生多余空行：} 行是最后一个代码行
    expect(html).not.toMatch(/<pre\b/);
  });

  it("高亮块转为内联样式卡片：hex 颜色 + 图标标题 + 内容", () => {
    const md = [':::callout{type="tip" title="建议" icon="💡"}', "正文内容", ":::"].join("\n");
    const html = toWechatHtml(md);
    expect(html).toMatch(/border-left:4px solid #[0-9a-f]{6}/);
    expect(html).toContain("background:#e6f5e8");
    expect(html).toContain("💡 建议");
    expect(html).toContain('<section style="color:#00a63e;">');
  });

  it("tip 类型填充色为绿系淡色（oklch 源值混白 12%，culori 参考值 #e6f5e8）", () => {
    const md = [':::callout{type="tip"}', "内容", ":::"].join("\n");
    const html = toWechatHtml(md);
    expect(html).toContain("background:#e6f5e8");
  });

  it("非法类型降级 neutral（灰系淡色）且不吞正文", () => {
    const md = [':::callout{type="不存在的类型"}', "保留内容", ":::"].join("\n");
    const html = toWechatHtml(md);
    expect(html).toContain("保留内容");
    expect(html).toContain("background:#ededee");
  });

  it("未闭合高亮块按普通文本保留", () => {
    const md = [':::callout{type="info"}', "没有闭合行"].join("\n");
    const html = toWechatHtml(md);
    expect(html).toContain("没有闭合行");
    expect(html).toContain(":::callout");
  });

  it("自定义 textColor/borderColor hex 直接内联", () => {
    const md = [
      ':::callout{type="info" textColor="#123456" borderColor="#abcdef" fillColor="#098765"}',
      "内容",
      ":::",
    ].join("\n");
    const html = toWechatHtml(md);
    expect(html).toContain("color:#123456");
    expect(html).toContain("border-left:4px solid #abcdef");
    // 填充色按编辑器规则混白 12%（culori 参考值 #e5f0eb）
    expect(html).toContain("background:#e5f0eb");
  });

  it("传入 title 时在顶部渲染标题区", () => {
    const html = toWechatHtml("正文", { title: "我的标题" });
    expect(html).toContain(">我的标题</section>");
  });

  it("高亮块内嵌 markdown 列表也降级为圆点段落", () => {
    const md = [':::callout{type="info"}', "- 甲", "- 乙", ":::"].join("\n");
    const html = toWechatHtml(md);
    expect(html).not.toMatch(/<(ul|ol|li)\b/);
    expect(html).toContain("• 甲");
    expect(html).toContain("• 乙");
  });

  it("无序列表降级：圆点前缀与加粗词同段同行（防微信拆行）", () => {
    const md = "- **Agent 编排**：dsh-agent-teams 可在 Harness 里协同";
    const html = toWechatHtml(md);
    expect(html).toMatch(
      /<section style="margin:4px 0;line-height:1\.75;">• <strong style="[^"]*">Agent 编排<\/strong>：dsh-agent-teams/,
    );
  });

  it("有序列表降级：按序编号", () => {
    const md = ["1. 第一", "2. 第二", "3. 第三"].join("\n");
    const html = toWechatHtml(md);
    expect(html).toContain(">1. 第一</section>");
    expect(html).toContain(">2. 第二</section>");
    expect(html).toContain(">3. 第三</section>");
    expect(html).not.toMatch(/<(ul|ol|li)\b/);
  });

  it("嵌套列表同样降级且内容不丢", () => {
    const md = ["- 外层", "  - 内层一", "  - 内层二"].join("\n");
    const html = toWechatHtml(md);
    expect(html).not.toMatch(/<(ul|ol|li)\b/);
    expect(html).toContain("外层");
    expect(html).toContain("内层一");
    expect(html).toContain("内层二");
  });
});
