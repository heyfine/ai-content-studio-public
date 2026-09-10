import { Extension, getHTMLFromFragment } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";

/**
 * 表格单元格背景色全局属性。
 *
 * 问题：Tiptap 3.x 的 TableCell/TableHeader 没有背景属性，Word 表格的表头底色
 * （td style="background:#1F4E79" 或旧格式 bgcolor 属性）在 ProseMirror 解析
 * 粘贴 HTML 时即被丢弃——白字色因 Color mark 存在而幸存，结果是白字落白底不可读。
 *
 * 方案：addGlobalAttributes 给两种单元格节点加 background 属性（内联 style 或
 * bgcolor/background 属性 → attrs），renderHTML 输出内联 style。
 * 与 resizable 表格的列宽不冲突：v3 列宽渲染在 colgroup > col，不占单元格 style。
 */
export const TableCellBackground = Extension.create({
  name: "tableCellBackground",

  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          background: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) => {
              const inline = element.style.backgroundColor?.trim();
              if (inline && inline.toLowerCase() !== "transparent") return inline;
              const legacy = element.getAttribute("bgcolor") ?? element.getAttribute("background");
              const value = legacy?.trim();
              return value && value.toLowerCase() !== "transparent" ? value : null;
            },
            renderHTML: (attributes: { background?: string | null }) =>
              attributes.background ? { style: `background-color: ${attributes.background}` } : {},
          },
        },
      },
    ];
  },
});

/* ---------- Markdown 序列化：带底色的表格整体内嵌 HTML，其余保持 GFM pipe ---------- */

interface SerializeState {
  write(content: string): void;
  renderInline(node: PMNode, fromBlockStart?: boolean): void;
  closeBlock(node: PMNode): void;
  ensureNewLine(): void;
  inTable: boolean;
}

function childNodes(node: PMNode): PMNode[] {
  const out: PMNode[] = [];
  node.forEach((child) => {
    out.push(child);
  });
  return out;
}

/** 单元格含 Markdown 表达不了的信息：背景色 / 合并单元格 / 多块 / 单元格内对齐 */
function cellNeedsHtml(cell: PMNode): boolean {
  if (Number(cell.attrs?.colspan ?? 1) > 1 || Number(cell.attrs?.rowspan ?? 1) > 1) return true;
  if (cell.childCount !== 1 || cell.attrs?.background) return true;
  const align = (cell.firstChild?.attrs?.textAlign as string | null | undefined) ?? "";
  return align !== "" && align !== "left";
}

/**
 * 对齐 tiptap-markdown 默认表格 spec（markdownExtensions.Table）的可序列化判定：
 * 首行必须全 tableHeader、其余行不得含 tableHeader，且无 cellNeedsHtml 情形。
 */
function tableNeedsHtml(node: PMNode): boolean {
  const rows = childNodes(node);
  if (rows.length === 0) return false;
  const headerRow = rows[0];
  if (
    childNodes(headerRow).some((cell) => cell.type.name !== "tableHeader" || cellNeedsHtml(cell))
  ) {
    return true;
  }
  return rows
    .slice(1)
    .some((row) =>
      childNodes(row).some((cell) => cell.type.name === "tableHeader" || cellNeedsHtml(cell)),
    );
}

/**
 * 表格节点（背景修复的序列化层）。
 *
 * Markdown 是文章唯一事实源（tiptap-markdown 桥接读各扩展 storage.markdown）：
 * 干净表格照旧输出 GFM pipe；一旦单元格带背景/对齐/合并等 Markdown 表达不了的
 * 格式，整表内嵌 HTML（getHTMLFromFragment 按 schema renderHTML 输出内联 style）。
 * marked html:true 使预览端原样透传，重开编辑器时 markdown-it 以 HTML 块交回
 * ProseMirror 解析、属性经 TableCellBackground 还原——「编辑器=预览=发布」闭合，
 * 与 markdown-style-bridge 同思路。
 */
export const TableMarkdown = Table.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: unknown, node: PMNode) {
          const s = state as SerializeState;
          if (tableNeedsHtml(node)) {
            s.write(getHTMLFromFragment(Fragment.from(node), node.type.schema));
            s.closeBlock(node);
            return;
          }
          // GFM pipe 输出（对齐 tiptap-markdown 默认行为）
          s.inTable = true;
          node.forEach((row, _pos, i) => {
            s.write("| ");
            row.forEach((col, _p2, j) => {
              if (j) s.write(" | ");
              const cellContent = col.firstChild;
              if (cellContent?.textContent.trim()) {
                s.renderInline(cellContent);
              }
            });
            s.write(" |");
            s.ensureNewLine();
            if (!i) {
              const delimiterRow = Array.from({ length: row.childCount })
                .map(() => "---")
                .join(" | ");
              s.write(`| ${delimiterRow} |`);
              s.ensureNewLine();
            }
          });
          s.closeBlock(node);
          s.inTable = false;
        },
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});
