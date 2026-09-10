import { Extension } from "@tiptap/core";

/**
 * 块级视觉属性：段落/标题的背景色与左边彩色条。
 *
 * 用途：HTML 源码转换（html-style-inliner）把「引用块 / 自检清单卡片 / 高亮卡片」
 * 等 div 盒子的底色与左侧色条下传到文字块后，需要 schema 有地方承接——此前
 * p 的 style background-color 会被 ProseMirror 直接丢弃（探针验证），文字又落白底。
 * renderHTML 与 Indent（padding-left）经 Tiptap mergeAttributes 的 style 合并共存。
 * Markdown 序列化由 markdown-style-bridge 的 Paragraph/Heading 钩子统一输出内嵌
 * HTML，「编辑器=预览=发布=重开」闭合。
 */
export const BlockBoxStyles = Extension.create({
  name: "blockBoxStyles",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          backgroundColor: {
            default: null as string | null,
            parseHTML: (element) => {
              const v = (element.style.backgroundColor || "").trim();
              return v && v.toLowerCase() !== "transparent" ? v : null;
            },
            renderHTML: (attributes) =>
              attributes.backgroundColor
                ? { style: `background-color: ${attributes.backgroundColor}` }
                : {},
          },
          borderLeft: {
            default: null as string | null,
            parseHTML: (element) => {
              const v = (element.style.borderLeft || "").trim();
              if (!v || v === "none" || /^0(px)?\s+none/.test(v)) return null;
              return v;
            },
            renderHTML: (attributes) =>
              attributes.borderLeft ? { style: `border-left: ${attributes.borderLeft}` } : {},
          },
        },
      },
    ];
  },
});
