/**
 * Markdown 序列化桥接：让颜色/对齐等富文本格式在保存、预览、发布后不丢。
 *
 * 问题：编辑器内容经 tiptap-markdown 序列化成 Markdown 字符串持久化，而 Markdown
 * 表达不了 textStyle（颜色/背景）与 textAlign（对齐）——预览与 WordPress/公众号
 * 发布端渲染出的 HTML 里这些格式全部丢失。
 *
 * 方案：通过 tiptap-markdown 的 storage.markdown.serialize 钩子，把带样式的
 * 节点/mark 序列化为 Markdown 内嵌 HTML。marked（html:true）原样透传，WordPress
 * 与公众号内联化渲染器都保留 style 属性，实现「编辑器 = 预览 = 发布」：
 * - paragraph/heading 带 对齐/底色/左色条/缩进 → <p style="text-align:center;
 *   background-color:…;border-left:…;padding-left:…">…</p>（整块 HTML）
 * - textStyle 带 color/backgroundColor → <span style="color:…">…</span>（行内 HTML）
 * - 无样式时走默认 Markdown 输出（## 标题 / 纯段落 / **粗体**），不产生冗余 HTML
 *
 * 块级 HTML 内的行内内容必须整体转 HTML（marked 的 html block 不再解析 Markdown
 * 语法），见 inlineToHtml。
 */

import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import { TextStyle } from "@tiptap/extension-text-style";
import type { Mark as PMMark, Node as PMNode } from "@tiptap/pm/model";

interface MarkWrap {
  open: string;
  close: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** mark → HTML 包裹对；未知 mark 返回 null（丢弃，与 Markdown 序列化行为一致） */
function markWrap(mark: PMMark): MarkWrap | null {
  switch (mark.type.name) {
    case "bold":
      return { open: "<strong>", close: "</strong>" };
    case "italic":
      return { open: "<em>", close: "</em>" };
    case "strike":
      return { open: "<del>", close: "</del>" };
    case "code":
      return { open: "<code>", close: "</code>" };
    case "link": {
      const href = String(mark.attrs?.href ?? "");
      return { open: `<a href="${escapeHtml(href)}">`, close: "</a>" };
    }
    case "textStyle": {
      const parts: string[] = [];
      if (mark.attrs?.color) parts.push(`color:${mark.attrs.color}`);
      if (mark.attrs?.backgroundColor) parts.push(`background-color:${mark.attrs.backgroundColor}`);
      return parts.length > 0
        ? { open: `<span style="${parts.join(";")}">`, close: "</span>" }
        : null;
    }
    default:
      return null;
  }
}

/** 块级 HTML 分支的行内内容渲染：text/hardBreak/image + marks 全部转 HTML */
function inlineToHtml(node: PMNode): string {
  let out = "";
  node.forEach((child) => {
    if (child.isText) {
      let text = escapeHtml(child.text ?? "");
      const wraps: MarkWrap[] = [];
      for (const m of child.marks) {
        const w = markWrap(m);
        if (w) wraps.push(w);
      }
      for (const w of wraps) text = w.open + text;
      for (const w of [...wraps].reverse()) text += w.close;
      out += text;
      return;
    }
    if (child.type.name === "hardBreak") {
      out += "<br>";
      return;
    }
    if (child.type.name === "image") {
      const src = escapeHtml(String(child.attrs?.src ?? ""));
      const alt = escapeHtml(String(child.attrs?.alt ?? ""));
      out += `<img src="${src}" alt="${alt}">`;
    }
  });
  return out;
}

/**
 * textStyle mark（颜色/背景）→ 行内 <span style>。
 * 行内 HTML 不阻断 Markdown 解析：同一行里的 **粗体**、[链接](x) 照常生效。
 */
export const TextStyleMarkdown = TextStyle.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: unknown, mark: PMMark) => {
            const w = markWrap(mark);
            return w?.open ?? "";
          },
          close: (_state: unknown, mark: PMMark) => {
            const w = markWrap(mark);
            return w?.close ?? "";
          },
        },
        parse: {},
      },
    };
  },
});

/** tiptap-markdown state 的最小接口（继承 prosemirror-markdown MarkdownSerializerState） */
interface SerializerState {
  write: (content: string) => void;
  renderInline: (node: PMNode, fromBlockStart?: boolean) => void;
  closeBlock: (node: PMNode) => void;
  repeat: (str: string, n: number) => string;
}

/**
 * 块级样式声明收集：对齐/底色/左色条/缩进（BlockBoxStyles+Indent 属性）。
 * 非空 → 整块内嵌 HTML 输出；空 → 走默认 Markdown（## / 纯段落），不产冗余。
 */
function blockStyleParts(attrs: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const align = (attrs.textAlign as string | null) ?? "";
  if (align && align !== "left") parts.push(`text-align:${align}`);
  const bg = (attrs.backgroundColor as string | null) ?? "";
  if (bg) parts.push(`background-color:${bg}`);
  const border = (attrs.borderLeft as string | null) ?? "";
  if (border) parts.push(`border-left:${border}`);
  const indent = Number(attrs.indent ?? 0);
  if (indent > 0) parts.push(`padding-left:${indent}px`);
  return parts;
}

/** 标题：带块级样式 → <h2 style="…">（无样式走默认 ## 输出） */
export const HeadingMarkdown = Heading.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: unknown, node: PMNode) {
          const s = state as SerializerState;
          const parts = blockStyleParts(node.attrs as unknown as Record<string, unknown>);
          if (parts.length > 0) {
            s.write(
              `<h${node.attrs.level} style="${parts.join(";")}">${inlineToHtml(node)}</h${node.attrs.level}>`,
            );
            s.closeBlock(node);
            return;
          }
          // 默认行为（prosemirror-markdown heading）
          s.write(`${s.repeat("#", node.attrs.level)} `);
          s.renderInline(node, false);
          s.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

/** 段落：带块级样式（对齐/底色/色条/缩进）→ <p style="…">（无样式走默认输出） */
export const ParagraphMarkdown = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: unknown, node: PMNode) {
          const s = state as SerializerState;
          const parts = blockStyleParts(node.attrs as unknown as Record<string, unknown>);
          if (parts.length > 0) {
            s.write(`<p style="${parts.join(";")}">${inlineToHtml(node)}</p>`);
            s.closeBlock(node);
            return;
          }
          // 默认行为（prosemirror-markdown paragraph）
          s.renderInline(node);
          s.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
