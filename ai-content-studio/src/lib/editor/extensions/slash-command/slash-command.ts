import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

import { CALLOUT_TYPES, type CalloutType } from "@/lib/content/callout-types";
import { SlashMenu, type SlashItem, type SlashMenuRef } from "./slash-menu";

/**
 * Slash 命令扩展：输入 / 唤起块插入菜单（飞书/Notion 风格）。
 *
 * 基于 @tiptap/suggestion v3：
 *  - char: "/" 触发
 *  - items: 按 query 过滤可插入块
 *  - command: 执行插入（段落/标题/callout/图片/表格/任务列表/代码块）
 *  - render: ReactRenderer + props.mount（v3 托管定位，锚定光标）
 *
 * 子任务 4 范围；表格/图片/任务列表/代码块低亮扩展由 use-markdown-editor 引入。
 */

export interface SlashCommandOptions {
  /** 插入图片时提示输入 URL 的字符串 */
  imagePrompt?: string;
}

const menuItems: SlashItem[] = [
  { type: "paragraph", label: "正文", description: "普通段落", icon: "📝" },
  { type: "heading", level: 1, label: "标题 1", description: "大标题", icon: "H1" },
  { type: "heading", level: 2, label: "标题 2", description: "中标题", icon: "H2" },
  { type: "heading", level: 3, label: "标题 3", description: "小标题", icon: "H3" },
  ...CALLOUT_TYPES.map<SlashItem>((c) => ({
    type: "callout",
    calloutType: c.type as CalloutType,
    label: `高亮块 · ${c.label}`,
    description: c.description,
    icon: c.icon,
  })),
  { type: "bulletList", label: "无序列表", description: "圆点列表", icon: "•" },
  { type: "orderedList", label: "有序列表", description: "编号列表", icon: "1." },
  { type: "taskList", label: "任务列表", description: "带复选框的列表", icon: "☑" },
  { type: "table", label: "表格", description: "插入 3×3 表格", icon: "▦" },
  { type: "image", label: "图片", description: "插入图片 URL", icon: "🖼" },
  { type: "codeBlock", label: "代码块", description: "插入代码块（低亮）", icon: "</>" },
  { type: "horizontalRule", label: "分割线", description: "水平分隔线", icon: "—" },
];

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return menuItems;
  return menuItems.filter(
    (i) =>
      i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
  );
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return { imagePrompt: "图片 URL：" };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: new PluginKey("slashCommand"),
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => {
          // 先删除已输入的 "/query"
          editor.chain().focus().deleteRange(range).run();
          const item = props as SlashItem;
          const chain = editor.chain();
          switch (item.type) {
            case "paragraph":
              chain.setParagraph();
              break;
            case "heading":
              chain.setHeading({ level: item.level ?? 1 });
              break;
            case "callout":
              chain
                .insertContent({
                  type: "callout",
                  attrs: {
                    type: item.calloutType,
                    title: "",
                    icon: "",
                  },
                  content: [{ type: "paragraph" }],
                })
                .focus("start");
              break;
            case "bulletList":
              chain.toggleBulletList();
              break;
            case "orderedList":
              chain.toggleOrderedList();
              break;
            case "taskList":
              chain.toggleTaskList();
              break;
            case "table":
              chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
              break;
            case "image": {
              const url = window.prompt(
                this.options.imagePrompt,
                "https://",
              );
              if (url) chain.setImage({ src: url });
              break;
            }
            case "codeBlock":
              chain.setCodeBlock();
              break;
            case "horizontalRule":
              chain.setHorizontalRule();
              break;
            default:
              break;
          }
          chain.run();
        },
        render: () => {
          let component: ReactRenderer<
            SlashMenuRef,
            { items: SlashItem[]; command: (item: SlashItem) => void }
          > | null = null;
          let unmount: (() => void) | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props: {
                  items: props.items as SlashItem[],
                  command: (item: SlashItem) => {
                    props.command(item);
                  },
                },
                editor: props.editor,
              });
              unmount = props.mount(component.element);
            },
            onUpdate: (props) => {
              component?.updateProps({
                items: props.items as SlashItem[],
                command: (item: SlashItem) => props.command(item),
              });
            },
            onKeyDown: (props) => {
              if (props.event.key === "ArrowDown") {
                component?.ref?.onDown();
                return true;
              }
              if (props.event.key === "ArrowUp") {
                component?.ref?.onUp();
                return true;
              }
              if (props.event.key === "Enter") {
                component?.ref?.onEnter();
                return true;
              }
              if (props.event.key === "Escape") {
                props.event.preventDefault();
                props.view.focus();
                return true;
              }
              return false;
            },
            onExit: () => {
              component?.destroy();
              unmount?.();
            },
          };
        },
      }),
    ];
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    slashCommand: {
      /** 手动触发 slash 菜单（一般由 / 输入唤起） */
      openSlashCommand: () => ReturnType;
    };
  }
}
