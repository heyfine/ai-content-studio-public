import { Editor } from "@tiptap/core";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";
import { TableCellBackground, TableMarkdown } from "./table-background";

/** 与 use-markdown-editor 一致的表格相关扩展集（背景修复的回归面） */
function makeEditor(initial: string): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableMarkdown.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TableCellBackground,
      Markdown,
    ],
    content: initial,
    editable: false,
  });
}

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
}

/** 取 doc 里第一个 table 的所有单元格节点（cell/header） */
function tableCells(e: Editor): PMNode[] {
  const doc = e.getJSON() as PMNode;
  const table = (doc.content ?? []).find((n) => n.type === "table");
  const cells: PMNode[] = [];
  for (const row of table?.content ?? []) {
    for (const cell of row.content ?? []) cells.push(cell);
  }
  return cells;
}

function getMarkdown(e: Editor): string {
  const storage = e.storage as unknown as Record<string, unknown>;
  const md = storage.markdown as { getMarkdown?: () => string } | undefined;
  return md?.getMarkdown?.() ?? "";
}

const TABLE_HTML =
  `<table><tbody>` +
  `<tr><th style="background-color: rgb(31, 78, 121)"><p><strong>对比项</strong></p></th>` +
  `<th style="background-color: rgb(31, 78, 121)"><p>AutoBackup</p></th></tr>` +
  `<tr><td><p>新加数据库</p></td><td style="background-color: rgb(220, 230, 241)">自动检测</td></tr>` +
  `</tbody></table>`;

describe("TableCellBackground：单元格背景进 schema", () => {
  it("解析 th/td 内联 background-color → 节点 attrs.background", () => {
    const e = makeEditor(TABLE_HTML);
    const cells = tableCells(e);
    expect(cells.length).toBe(4);
    expect(cells[0]?.attrs?.background).toBe("rgb(31, 78, 121)");
    expect(cells[1]?.attrs?.background).toBe("rgb(31, 78, 121)");
    expect(cells[2]?.attrs?.background ?? null).toBeNull();
    expect(cells[3]?.attrs?.background).toBe("rgb(220, 230, 241)");
    e.destroy();
  });

  it("解析 Word 旧格式 bgcolor 属性", () => {
    const e = makeEditor(
      `<table><tbody><tr><td bgcolor="#1F4E79"><p>表头</p></td></tr></tbody></table>`,
    );
    expect(tableCells(e)[0]?.attrs?.background).toBe("#1F4E79");
    e.destroy();
  });

  it("renderHTML 输出内联 style（编辑器所见）", () => {
    const e = makeEditor(TABLE_HTML);
    expect(e.getHTML()).toContain("background-color: rgb(31, 78, 121)");
    e.destroy();
  });

  it("Markdown 往返：表格以 HTML 块存 MD，背景随保存/重开保留", () => {
    const e = makeEditor(TABLE_HTML);
    const md = getMarkdown(e);
    // 表格不是 GFM pipe 语法而是内嵌 HTML（tiptap-markdown HTMLNode 兜底），
    // marked html:true 预览端与重开解析端都原样透传
    expect(md).toContain("<table");
    expect(md).toContain("background-color: rgb(31, 78, 121)");
    const reopened = makeEditor(md);
    expect(tableCells(reopened)[0]?.attrs?.background).toBe("rgb(31, 78, 121)");
    expect(tableCells(reopened)[3]?.attrs?.background).toBe("rgb(220, 230, 241)");
    e.destroy();
    reopened.destroy();
  });

  it("transparent 背景不落属性（不产生冗余样式）", () => {
    const e = makeEditor(
      `<table><tbody><tr><td style="background-color: transparent"><p>x</p></td></tr></tbody></table>`,
    );
    expect(tableCells(e)[0]?.attrs?.background ?? null).toBeNull();
    expect(e.getHTML()).not.toContain("background-color");
    e.destroy();
  });

  it("干净表格仍走 GFM pipe（不产生冗余 HTML，锁定委托路径）", () => {
    const e = makeEditor(
      `<table><tbody><tr><th><p>甲</p></th><th><p>乙</p></th></tr>` +
        `<tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>`,
    );
    const md = getMarkdown(e);
    expect(md).toContain("| 甲 | 乙 |");
    expect(md).not.toContain("<table");
    e.destroy();
  });

  it("单元格内对齐也触发 HTML 内嵌（pipe 表达不了，重开不丢）", () => {
    const e = makeEditor(
      `<table><tbody><tr><th><p style="text-align:center">表头</p></th></tr>` +
        `<tr><td><p>值</p></td></tr></tbody></table>`,
    );
    const md = getMarkdown(e);
    expect(md).toContain("<table");
    expect(md.replace(/\s+/g, "")).toContain("text-align:center");
    const reopened = makeEditor(md);
    const p = tableCells(reopened)[0]?.content?.[0];
    expect(p?.attrs?.textAlign).toBe("center");
    e.destroy();
    reopened.destroy();
  });
});
