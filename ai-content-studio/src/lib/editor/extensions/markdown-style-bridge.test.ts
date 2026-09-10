import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { BackgroundColor, Color } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockBoxStyles } from "./block-box-styles";
import { Indent } from "./indent";
import { Markdown } from "./markdown";
import { HeadingMarkdown, ParagraphMarkdown, TextStyleMarkdown } from "./markdown-style-bridge";

function makeEditor(initial?: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: false, paragraph: false }),
      TextStyleMarkdown,
      Color,
      BackgroundColor,
      HeadingMarkdown,
      ParagraphMarkdown,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      BlockBoxStyles,
      Indent,
      Image,
      Markdown,
    ],
    content: initial ?? "",
  });
}

function getMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as Record<string, { getMarkdown?: () => string }>;
  return storage.markdown?.getMarkdown?.() ?? "";
}

describe("markdown-style-bridge 序列化", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("普通标题/段落仍输出纯 Markdown（不受桥接影响）", () => {
    const editor = makeEditor("<h1>大标题</h1><p>正文一段</p>");
    const md = getMarkdown(editor);
    expect(md).toContain("# 大标题");
    expect(md).toContain("正文一段");
    editor.destroy();
  });

  it("居中段落 → 内嵌 <p style=text-align:center>", () => {
    const editor = makeEditor('<p style="text-align:center">居中副标题</p>');
    const md = getMarkdown(editor);
    expect(md).toContain('<p style="text-align:center">居中副标题</p>');
    editor.destroy();
  });

  it("居中标题 → 内嵌 <h2 style=text-align:center>", () => {
    const editor = makeEditor('<h2 style="text-align:center">居中标题</h2>');
    const md = getMarkdown(editor);
    expect(md).toContain('<h2 style="text-align:center">居中标题</h2>');
    editor.destroy();
  });

  it("颜色文字 → 行内 <span style=color>，同行 Markdown 粗体仍生效", () => {
    const editor = makeEditor(
      '<p><span style="color:#2E74B5">蓝色</span><strong>加粗</strong></p>',
    );
    const md = getMarkdown(editor);
    expect(md).toContain('<span style="color:#2E74B5">蓝色</span>');
    expect(md).toContain("**加粗**");
    editor.destroy();
  });

  it("颜色+粗体叠加：行内 span 内 Markdown 粗体标记（marked 行内 HTML 仍解析）", () => {
    const editor = makeEditor('<p><strong><span style="color:red">红粗</span></strong></p>');
    const md = getMarkdown(editor);
    // 行内 <span> 不阻断 Markdown 解析：** ** 会被 marked 渲染成 <strong>
    expect(md.replace(/\s+/g, "")).toBe('<spanstyle="color:red">**红粗**</span>');
    editor.destroy();
  });

  it("块级 HTML 分支内全部 mark 转 HTML（marked 块级 HTML 不解析 Markdown）", () => {
    const editor = makeEditor(
      '<p style="text-align:center"><strong>标题</strong>与<span style="color:red">红字</span></p>',
    );
    const md = getMarkdown(editor);
    expect(md).toContain("<strong>标题</strong>");
    expect(md).toContain('<span style="color:red">红字</span>');
    expect(md).not.toContain("**");
    editor.destroy();
  });

  it("背景色 → span background-color", () => {
    const editor = makeEditor('<p><span style="background-color:#FFFF00">高亮</span></p>');
    const md = getMarkdown(editor);
    expect(md).toContain("background-color");
    expect(md).toContain("高亮");
    editor.destroy();
  });

  it("往返解析：内嵌 HTML 回到编辑器后样式保留", () => {
    const md = '<p style="text-align:center">副标题</p>\n\n<span style="color:red">红字</span>';
    const editor = makeEditor(md);
    const html = editor.getHTML();
    expect(html).toContain("text-align");
    expect(html).toContain("color");
    editor.destroy();
  });

  it("块级底色/左色条/缩进 → 内嵌 <p style>，往返重开不丢", () => {
    const editor = makeEditor(
      `<p style="background-color:rgb(22,38,63);border-left:4px solid rgb(74,134,232);padding-left:24px">深色引用块</p>`,
    );
    const md = getMarkdown(editor);
    // CSSOM 会给 rgb() 逗号补空格，统一去空白后比较
    const flat = md.replace(/\s+/g, "");
    expect(flat).toContain("<p");
    expect(flat).toContain("background-color:rgb(22,38,63)");
    expect(flat).toContain("border-left:4pxsolidrgb(74,134,232)");
    expect(flat).toContain("padding-left:24px");
    expect(md).toContain("深色引用块");
    const reopened = makeEditor(md);
    const doc = JSON.stringify(reopened.getJSON()).replace(/\s+/g, "");
    expect(doc).toContain("rgb(22,38,63)");
    expect(doc).toContain("4pxsolidrgb(74,134,232)");
    editor.destroy();
    reopened.destroy();
  });

  it("标题带底色同样内嵌（h2 style）", () => {
    const editor = makeEditor('<h2 style="background-color:rgb(245,249,255)">小节底色</h2>');
    const md = getMarkdown(editor).replace(/\s+/g, "");
    expect(md).toContain("<h2");
    expect(md).toContain("background-color:rgb(245,249,255)");
    editor.destroy();
  });
});
