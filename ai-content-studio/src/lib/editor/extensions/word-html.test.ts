import { describe, expect, it } from "vitest";
import { isWordHtml, normalizeWordHtml } from "./word-html";

describe("isWordHtml", () => {
  it("Word 特征判定", () => {
    expect(isWordHtml('<p class="MsoNormal">x</p>')).toBe(true);
    expect(isWordHtml('<html xmlns:o="urn:schemas-microsoft-com:office:office">')).toBe(true);
    expect(isWordHtml("<p style='mso-list:l0'>x</p>")).toBe(true);
    expect(isWordHtml("<p>普通网页文本</p>")).toBe(false);
    expect(isWordHtml('<p style="color:red">普通富文本</p>')).toBe(false);
  });
});

describe("normalizeWordHtml", () => {
  it("22pt 加粗段落 → h1（Word 标题1）", () => {
    const out = normalizeWordHtml(
      `<div class="WordSection1"><p class="MsoNormal" style="font-size:22.0pt">` +
        `<span style="font-weight:bold">自建 LLM 网关 myapi 接入记</span></p></div>`,
    );
    expect(out).toContain("<h1");
    expect(out).toContain("<strong>自建 LLM 网关 myapi 接入记</strong>");
    expect(out).not.toContain("MsoNormal");
    expect(out).not.toContain("WordSection");
  });

  it("16pt 加粗段落 → h2；14pt 加粗段落 → h3；12pt 正文 → p", () => {
    const out = normalizeWordHtml(
      `<p style="font-size:16.0pt"><b>二级标题</b></p>` +
        `<p style="font-size:14.0pt"><b>三级标题</b></p>` +
        `<p style="font-size:12.0pt"><span>普通正文</span></p>`,
    );
    expect(out).toContain("<h2");
    expect(out).toContain("<h3");
    expect(out).toContain("<p");
    expect(out).not.toContain("<h1");
  });

  it("居中对齐保留（Tiptap TextAlign 从 style.textAlign 解析）", () => {
    const out = normalizeWordHtml(
      `<p style="text-align:center;font-size:14pt"><span style="color:#2E74B5">副标题</span></p>`,
    );
    // 浏览器会规范化 style 值（加空格、颜色转 rgb），用宽松断言
    expect(out.replace(/\s+/g, "")).toContain("text-align:center");
    expect(out).toContain("color:");
    expect(out).toContain("副标题");
  });

  it("span 加粗/斜体语义化，颜色背景保留，其余样式丢弃", () => {
    const out = normalizeWordHtml(
      `<p style="mso-margin-top-alt:0"><span style="font-weight:bold;font-family:等线">粗</span>` +
        `<span style="font-style:italic;color:red">斜红</span></p>`,
    );
    expect(out).toContain("<strong>粗</strong>");
    // 单独斜体：em 包裹，颜色随 span 保留
    expect(out).toContain("<em>斜红</em>");
    expect(out.replace(/\s+/g, "")).toContain("color:red");
    expect(out).not.toContain("font-family");
    expect(out).not.toContain("mso-margin");
  });

  it("空段落删除（Word 空行占位）", () => {
    const out = normalizeWordHtml(
      `<p class="MsoNormal"><span style="mso-spacerun:yes">&nbsp;</span></p><p class="MsoNormal">正文</p>`,
    );
    expect((out.match(/<p/g) ?? []).length).toBe(1);
    expect(out).toContain("正文");
  });

  it("图片与链接保留", () => {
    const out = normalizeWordHtml(
      `<p class="MsoNormal"><img width="100" src="file:///C:/a.png"><a href="https://x.com">链接</a></p>`,
    );
    expect(out).toContain('<img width="100" src="file:///C:/a.png">');
    expect(out).toContain('<a href="https://x.com">链接</a>');
  });

  it("ul/li 结构保留", () => {
    const out = normalizeWordHtml(
      `<ul style="mso-margin-top-alt:0"><li>项目一</li><li>项目二</li></ul>`,
    );
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>项目一</li>");
    expect(out).toContain("<li>项目二</li>");
  });

  it("Word 表格：td 的 background 在剥离 mso 样式时保留，表头白字加粗不丢", () => {
    const out = normalizeWordHtml(
      `<table class="MsoNormalTable" style="border-collapse:collapse;mso-padding-alt:0cm 5.4pt"><tbody>` +
        `<tr><td width="187" style="border:solid windowtext 1.0pt;mso-border-alt:solid windowtext .5pt;background:#1F4E79;padding:0cm 5.4pt">` +
        `<p class="MsoNormal" style="text-align:center"><span style="color:white;font-weight:bold">对比项</span></p></td>` +
        `<td width="187" style="mso-border-alt:solid windowtext .5pt;background:#1F4E79;padding:0cm 5.4pt">` +
        `<p class="MsoNormal"><b>AutoBackup</b></p></td></tr>` +
        `<tr><td style="mso-border-alt:solid windowtext .5pt;padding:0cm 5.4pt">` +
        `<p class="MsoNormal">应用新加了个数据库</p></td>` +
        `<td style="mso-border-alt:solid windowtext .5pt;padding:0cm 5.4pt">` +
        `<p class="MsoNormal">手动往脚本里加一行</p></td></tr></tbody></table>`,
    );
    // 表头两格背景保留（jsdom 把 #1F4E79 规范化为 rgb）；数据行无背景不受影响
    expect((out.match(/background-color:\s*rgb\(31,\s*78,\s*121\)/g) ?? []).length).toBe(2);
    expect(out).not.toContain("mso-border-alt");
    expect(out).not.toContain("border:solid");
    // 表头文字：白字色 + 加粗语义都保留（strong 标签或 b 标签均被 PM 解析为粗体）
    expect(out).toContain("color:");
    expect(out).toContain("<strong>对比项</strong>");
    expect(out).toMatch(/<(strong|b)>AutoBackup<\/\1>/);
    // 单元格内段落对齐保留
    expect(out.replace(/\s+/g, "")).toContain("text-align:center");
    expect(out).toContain("<td");
  });

  it("Word 表格：td 上的 text-align 下传到单元格内段落", () => {
    const out = normalizeWordHtml(
      `<table><tbody><tr>` +
        `<td style="mso-border-alt:solid windowtext .5pt;text-align:center;background:#1F4E79">` +
        `<p class="MsoNormal"><span style="color:white">对比项</span></p></td></tr></tbody></table>`,
    );
    expect(out.replace(/\s+/g, "")).toContain("text-align:center");
    expect(out).toContain("background-color:");
  });

  it("Word 表格：无 mso 样式的 td 原样保留（含 background）", () => {
    const out = normalizeWordHtml(
      `<table><tbody><tr><td style="background:#1F4E79"><p>x</p></td></tr></tbody></table>`,
    );
    expect(out).toContain("background");
  });
});
