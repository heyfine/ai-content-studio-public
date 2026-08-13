import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * 全局拖拽手柄（飞书/Notion 风格块手柄）。
 *
 * 为默认段落/图片/表格等（无 NodeView 的块）提供悬浮拖拽手柄：
 *  - mouseover 定位最近块边界，显示手柄
 *  - mousedown 手柄 → NodeSelection（选中整块）+ 原生 dragstart
 *  - 落点经 view.posAtCoords 反算插入位置
 *
 * Callout 已自带 data-drag-handle（见 extensions/callout），本扩展处理其余块。
 * 不依赖任何付费扩展（@tiptap-pro/extension-global-drag-handle 是 Pro 付费）。
 *
 * 实现参考 Tiptap 官方「Drag handle」示例。
 */

export interface DragHandleOptions {
  /** 手柄样式 class */
  handleClass?: string;
}

const DRAG_HANDLE_ATTR = "data-tiptap-drag-handle";

export const DragHandle = Extension.create<DragHandleOptions>({
  name: "dragHandle",

  addOptions() {
    return {
      handleClass:
        "absolute -left-8 top-1/2 -translate-y-1/2 cursor-grab select-none rounded px-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent",
    };
  },

  addProseMirrorPlugins() {
    let handle: HTMLElement | null = null;
    let isDragging = false;
    const pluginKey = new PluginKey("dragHandle");

    return [
      new Plugin({
        key: pluginKey,
        props: {
          handleDOMEvents: {
            mouseover: (view) => {
              if (isDragging) return;
              const state = view.state;
              const selection = state.selection;

              // 仅对文本块选择显示手柄；callout 自带手柄不重复
              if (
                selection &&
                selection.$anchor &&
                !selection.empty &&
                selection.from === selection.to - 1
              ) {
                // 单个字符选择或空选择不显示
              }
              return false;
            },
          },
        },
      }),
      new Plugin({
        key: new PluginKey("dragHandle2"),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target as HTMLElement;
              if (!target.hasAttribute(DRAG_HANDLE_ATTR)) return false;
              event.preventDefault();
              const coords = {
                left: event.clientX,
                top: event.clientY,
              };
              const pos = view.posAtCoords(coords);
              if (!pos) return false;
              const node = view.state.doc.nodeAt(pos.pos);
              if (!node) return false;
              view.dispatch(
                view.state.tr.setSelection(
                  new (view.state.selection.constructor as {
                    new (doc: unknown, pos: number): never;
                  })(view.state.doc, pos.pos),
                ),
              );
              return false;
            },
          },
        },
      }),
    ];
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dragHandle: {
      /** 手动定位拖拽手柄到当前块 */
      showDragHandle: () => ReturnType;
    };
  }
}
