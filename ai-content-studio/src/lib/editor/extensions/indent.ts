import { Extension, type CommandProps } from "@tiptap/core";

export interface IndentOptions {
  /** 应用缩进的节点类型 */
  types: string[];
  /** 单次缩进步长（px） */
  step: number;
  /** 最大缩进 */
  max: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** 增加缩进 */
      indent: () => ReturnType;
      /** 减少缩进 */
      outdent: () => ReturnType;
    };
  }
}

/**
 * 段落/标题缩进：给节点加 padding-left 内联样式。
 * 纯视觉属性，不参与 markdown 序列化（markdown 无缩进语法）。
 */
export const Indent = Extension.create<IndentOptions>({
  name: "indent",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
      step: 24,
      max: 240,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const v = parseInt(el.style.paddingLeft || "0", 10);
              return Number.isFinite(v) ? v : 0;
            },
            renderHTML: (attrs) =>
              attrs.indent && attrs.indent > 0 ? { style: `padding-left: ${attrs.indent}px` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const changeIndent =
      (delta: number) =>
      ({ tr, state, dispatch }: CommandProps) => {
        const { from, to } = state.selection;
        let done = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!this.options.types.includes(node.type.name)) return;
          const cur = (node.attrs.indent as number) || 0;
          const next =
            delta > 0
              ? Math.min(cur + this.options.step, this.options.max)
              : Math.max(cur - this.options.step, 0);
          if (next !== cur) {
            tr.setNodeAttribute(pos, "indent", next);
            done = true;
          }
        });
        if (done && dispatch) dispatch(tr);
        return done;
      };

    return {
      indent: () => changeIndent(this.options.step),
      outdent: () => changeIndent(-this.options.step),
    };
  },
});
