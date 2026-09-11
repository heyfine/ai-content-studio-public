import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type MarkdownIt from "markdown-it";

import {
  CALLOUT_FALLBACK_TYPE,
  CALLOUT_TYPES,
  type CalloutType,
  isCalloutType,
} from "@/lib/content/callout-types";
import { CalloutView } from "./callout-view";
import { calloutBlockPlugin } from "./markdown-plugin";

/**
 * 自定义 Callout 块节点 —— 兼容现有 :::callout fenced 语法。
 *
 * 互操作契约（与 src/lib/content/render.ts 对齐，迁移必须守住）：
 *  1. 属性序列化顺序固定 type → title → icon（render.ts segmentsToMarkdown:122）
 *  2. type 非白名单降级 neutral（render.ts isCalloutType/CALLOUT_FALLBACK_TYPE）
 *  3. 未闭合 callout 不吞后续正文（render.ts scanCalloutSegments）
 *  4. callout body 内部 Markdown 仍渲染（render.ts renderCallout）
 *  5. HTML 形态 <aside class="callout callout-{type}" data-callout data-title data-icon>
 *     是 parseHTML 反向入口，与 renderArticleContent 互认
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  // body 内可含段落/列表/代码块，匹配现有 renderCallout 的 marked.parse(body) 行为
  content: "block+",
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      type: {
        default: CALLOUT_FALLBACK_TYPE,
        parseHTML: (el) => {
          const t = el.getAttribute("data-callout") ?? CALLOUT_FALLBACK_TYPE;
          return isCalloutType(t) ? t : CALLOUT_FALLBACK_TYPE;
        },
        renderHTML: (attrs) => ({ "data-callout": attrs.type }),
        validate: (t: unknown): boolean => typeof t === "string" && isCalloutType(t),
      },
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
        // title/icon 的 HTML 输出由顶层 renderHTML 统一控制，这里不输出
        // （避免 ProseMirror DOMSerializer 对同一值二次 escape）
        renderHTML: () => ({}),
      },
      icon: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-icon") ?? "",
        renderHTML: () => ({}),
      },
      // 用户自定义颜色（空 = 走类型默认色）；只影响渲染，不参与类型判断
      textColor: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-text-color") ?? "",
        renderHTML: () => ({}),
      },
      borderColor: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-border-color") ?? "",
        renderHTML: () => ({}),
      },
      fillColor: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-fill-color") ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside.callout" }, { tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // 直接从 node.attrs 读原始 attrs。ProseMirror DOMSerializer 会对 attr value
    // 自动 escape & 和 "，浏览器在 RCDATA attr value 段里不会把 < > 解析为元素，
    // 故这里塞 raw 字符串即可（手动 escape 会造成双重实体化，见 spec §4.4 注）。
    const rawType = (node.attrs.type as string) ?? CALLOUT_FALLBACK_TYPE;
    const type: CalloutType = isCalloutType(rawType) ? rawType : CALLOUT_FALLBACK_TYPE;
    const title = (node.attrs.title as string) ?? "";
    const icon = (node.attrs.icon as string) ?? "";
    const textColor = (node.attrs.textColor as string) ?? "";
    const borderColor = (node.attrs.borderColor as string) ?? "";
    const fillColor = (node.attrs.fillColor as string) ?? "";
    const attrs: Record<string, string> = {
      class: `callout callout-${type}`,
      "data-callout": type,
    };
    if (title) attrs["data-title"] = title;
    if (icon) attrs["data-icon"] = icon;
    // 自定义色原值补输出 data-*：parseHTML 只认 data-text/border/fill-color，
    // style 仅是呈现形式——「复制源码 → HTML 源码转换」跨站迁移必须靠 data-* 还原
    if (textColor) attrs["data-text-color"] = textColor;
    if (borderColor) attrs["data-border-color"] = borderColor;
    if (fillColor) attrs["data-fill-color"] = fillColor;
    // 颜色直接落 style，导出 HTML 时即带自定义色
    const styleParts: string[] = [];
    if (textColor) styleParts.push(`color:${textColor}`);
    if (borderColor) styleParts.push(`border-color:${borderColor}`);
    // 填充色加透明度调浅，与编辑器内保持一致（飞书式淡色填充）
    if (fillColor) styleParts.push(`background:color-mix(in oklab, ${fillColor} 12%, transparent)`);
    if (styleParts.length) attrs.style = styleParts.join(";");
    return [
      "aside",
      mergeAttributes(HTMLAttributes, attrs),
      ["div", { class: "callout-title" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs ?? {}),
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      updateCalloutAttrs:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },

  // tiptap-markdown 通过 storage.markdown 注册 Node 的序列化/反序列化 hooks
  // 严格按 render.ts segmentsToMarkdown 输出 :::callout{type title icon}\n<body>\n:::
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const type: CalloutType = isCalloutType(node.attrs.type)
            ? node.attrs.type
            : CALLOUT_FALLBACK_TYPE;
          const config = CALLOUT_TYPES.find((t) => t.type === type) ?? CALLOUT_TYPES[0];
          const title = (node.attrs.title ?? "").trim() || config.label;
          const icon = (node.attrs.icon ?? "").trim() || config.icon;
          const textColor = (node.attrs.textColor ?? "").trim();
          const borderColor = (node.attrs.borderColor ?? "").trim();
          const fillColor = (node.attrs.fillColor ?? "").trim();
          state.write(
            `:::callout{type="${type}" title="${title}" icon="${icon}"` +
              (textColor ? ` textColor="${textColor}"` : "") +
              (borderColor ? ` borderColor="${borderColor}"` : "") +
              (fillColor ? ` fillColor="${fillColor}"` : "") +
              `}\n`,
          );
          state.renderContent(node);
          state.ensureNewLine();
          state.write(":::");
          // 关键：closeBlock 让下一个节点的 write() 先补上闭合块的结束换行，
          // 否则正文会紧跟 ":::" 粘连成 ":::正文"，导致预览端认为 callout 未闭合而排版全乱。
          state.closeBlock(node);
        },
        parse: {
          // 给 markdown-it 注入自定义 block rule，识别 :::callout{...} ... :::
          setup(md: MarkdownIt) {
            calloutBlockPlugin(md);
          },
        },
      },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: {
        type?: CalloutType;
        title?: string;
        icon?: string;
        textColor?: string;
        borderColor?: string;
        fillColor?: string;
      }) => ReturnType;
      toggleCallout: () => ReturnType;
      updateCalloutAttrs: (
        attrs: Partial<{
          type: CalloutType;
          title: string;
          icon: string;
          textColor: string;
          borderColor: string;
          fillColor: string;
        }>,
      ) => ReturnType;
    };
  }
}
