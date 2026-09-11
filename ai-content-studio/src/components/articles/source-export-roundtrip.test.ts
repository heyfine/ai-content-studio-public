import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
// text-style 包内含 Color + BackgroundColor（与 use-markdown-editor 相同注册）
import { BackgroundColor, Color } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockBoxStyles } from "@/lib/editor/extensions/block-box-styles";
import { Callout } from "@/lib/editor/extensions/callout/callout";
import { Indent } from "@/lib/editor/extensions/indent";
import { Markdown } from "@/lib/editor/extensions/markdown";
import { TextStyleMarkdown } from "@/lib/editor/extensions/markdown-style-bridge";
import { TableCellBackground, TableMarkdown } from "@/lib/editor/extensions/table-background";
import { convertHtmlToSlice } from "@/lib/editor/html-import";
import { absolutizeImageUrls } from "./source-export-dialog";

/**
 * 「复制源码 → 目标站 HTML 源码转换」的跨站迁移契约测试：
 * 编辑器 getHTML（+ 图片绝对化）必须能被导入管道 convertHtmlToSlice 全保真还原
 * ——callout（含自定义色 data-*）、表格底色、块级样式、图片链接。
 */

/** 与 use-markdown-editor 对齐的 schema 子集（callout/表格/样式全通道） */
function makeEditor(initial: string): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      Image,
      TextStyleMarkdown,
      Color,
      BackgroundColor,
      Indent,
      BlockBoxStyles,
      Callout,
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
  text?: string;
}

function docChildren(e: Editor): PMNode[] {
  return ((e.getJSON() as PMNode).content ?? []) as PMNode[];
}

/** 模拟「转换并替换正文」通道：closed slice 全文替换后从 doc 取证 */
async function importHtml(e: Editor, html: string): Promise<void> {
  const { slice } = await convertHtmlToSlice(html, e.schema);
  const { state, view } = e;
  const tr = state.tr.replace(0, state.doc.content.size, slice);
  view.dispatch(tr);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("源码导出 → 导入管道 round-trip", () => {
  it("callout 含自定义色：data-* 属性导出并经导入管道还原", async () => {
    const md = [
      ':::callout{type="tip" title="核心要点" icon="✅" fillColor="#10b981"}',
      "内容段落文字",
      ":::",
    ].join("\n");
    const e1 = makeEditor(md);
    const html = e1.getHTML();
    // 导出源码必须带原值 data-*（parseHTML 只认它们；style 仅为呈现）
    expect(html).toContain('data-callout="tip"');
    expect(html).toContain('data-title="核心要点"');
    expect(html).toContain('data-icon="✅"');
    expect(html).toContain('data-fill-color="#10b981"');

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("round-trip 不应触发图片上传"))),
    );
    const e2 = makeEditor("");
    await importHtml(e2, html);
    const callout = docChildren(e2).find((n) => n.type === "callout");
    expect(callout?.attrs?.type).toBe("tip");
    expect(callout?.attrs?.title).toBe("核心要点");
    expect(callout?.attrs?.icon).toBe("✅");
    expect(callout?.attrs?.fillColor).toBe("#10b981");
    e1.destroy();
    e2.destroy();
  });

  it("表格底色 + 块级样式 + 图片相对路径绝对化 round-trip", async () => {
    const md = [
      '<table><tbody><tr><th style="background-color:#1F4E79"><p>列A</p></th></tr>' +
        '<tr><td style="background-color:#DCE6F1"><p>值1</p></td></tr></tbody></table>',
      // Image 默认块级（与 use-markdown-editor 一致），独立成块
      '<img src="/uploads/test.png" alt="配图">',
      '<p style="text-align:center;background:#FFF7E6">居中黄底段落</p>',
    ].join("\n\n");
    const e1 = makeEditor(md);
    const html = absolutizeImageUrls(e1.getHTML(), "https://src.example.com");
    // 图片相对路径 → 源站绝对 URL（目标站不裂图）
    expect(html).toContain('src="https://src.example.com/uploads/test.png"');

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("round-trip 不应触发图片上传"))),
    );
    const e2 = makeEditor("");
    await importHtml(e2, html);
    const nodes = docChildren(e2);

    const table = nodes.find((n) => n.type === "table");
    const row0 = table?.content?.[0]?.content ?? [];
    // jsdom CSSOM 把 hex 归一化为 rgb()（值等价：#1F4E79 === rgb(31, 78, 121)），
    // 与 table-background.test.ts 断言口径一致
    expect(row0[0]?.attrs?.background).toBe("rgb(31, 78, 121)");
    const row1 = table?.content?.[1]?.content ?? [];
    expect(row1[0]?.attrs?.background).toBe("rgb(220, 230, 241)");

    const imgNode = nodes.find((n) => n.type === "image");
    expect(imgNode?.attrs?.src).toBe("https://src.example.com/uploads/test.png");

    const styled = nodes.find(
      (n) => n.type === "paragraph" && n.content?.[0]?.text === "居中黄底段落",
    );
    expect(styled?.attrs?.textAlign).toBe("center");
    expect(styled?.attrs?.backgroundColor).toBe("rgb(255, 247, 230)");
    e1.destroy();
    e2.destroy();
  });
});
