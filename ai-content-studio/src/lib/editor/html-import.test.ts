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
import { BlockBoxStyles } from "./extensions/block-box-styles";
import { Callout } from "./extensions/callout/callout";
import { Indent } from "./extensions/indent";
import { Markdown } from "./extensions/markdown";
import { TextStyleMarkdown } from "./extensions/markdown-style-bridge";
import { TableCellBackground, TableMarkdown } from "./extensions/table-background";
import { convertHtmlToSlice } from "./html-import";
import { inlineComputedStyles } from "./html-style-inliner";

/** 与 use-markdown-editor 对齐的 schema 子集（标题/列表/表格/图片/样式/callout 全通道） */
function makeSchema(): Editor {
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
    content: "",
    editable: false,
  });
}

interface PMNode {
  type: { name: string };
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: { name: string }; attrs?: Record<string, unknown> }>;
  text?: string;
  content?: unknown;
  forEach?: (f: (n: PMNode) => void) => void;
}

/** Fragment / slice.content → 数组（PM 节点 children 不是原生数组） */
function arr(container: unknown): PMNode[] {
  const out: PMNode[] = [];
  const frag = container as { forEach?: (f: (n: PMNode) => void) => void } | undefined;
  frag?.forEach?.((n) => {
    out.push(n);
  });
  return out;
}

function sliceNodes(res: { slice: { content: unknown } }): PMNode[] {
  return arr(res.slice.content);
}

function firstChild(res: { slice: { content: unknown } }): PMNode {
  const nodes = sliceNodes(res);
  if (nodes.length === 0) throw new Error("slice 为空");
  return nodes[0] as PMNode;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("convertHtmlToSlice", () => {
  it("内联样式 HTML：标题层级/段落对齐/加粗+文字色 marks 全保留", async () => {
    const e = makeSchema();
    const res = await convertHtmlToSlice(
      `<h2>小章节</h2>` +
        `<p style="text-align:center"><span style="font-weight:bold;color:rgb(255,0,0)">红粗</span></p>`,
      e.schema,
    );
    const heading = firstChild(res);
    expect(heading.type.name).toBe("heading");
    expect(heading.attrs?.level).toBe(2);

    // parseSlice 平铺在 content 上：取第二个子节点断言段落对齐与 marks
    const nodes = sliceNodes(res);
    expect(nodes[1]?.type.name).toBe("paragraph");
    expect(nodes[1]?.attrs?.textAlign).toBe("center");
    const text = arr(nodes[1]?.content)[0];
    expect(text?.marks?.some((m) => m.type.name === "bold")).toBe(true);
    const ts = text?.marks?.find((m) => m.type.name === "textStyle");
    // jsdom CSSOM 会给 rgb() 逗号后补空格，宽松比较
    expect(String(ts?.attrs?.color ?? "").replace(/\s/g, "")).toBe("rgb(255,0,0)");
    e.destroy();
  });

  it("Word 源码：mso 样式 + 22pt 加粗 → h1，表头底色进单元格 attrs", async () => {
    const e = makeSchema();
    const res = await convertHtmlToSlice(
      `<p class="MsoNormal" style="font-size:22.0pt"><span style="font-weight:bold">网关接入记</span></p>` +
        `<table><tbody><tr><td width="187" style="mso-border-alt:solid windowtext .5pt;background:#1F4E79">` +
        `<p class="MsoNormal"><span style="color:white">对比项</span></p></td></tr></tbody></table>`,
      e.schema,
    );
    const nodes = sliceNodes(res);
    expect(nodes[0]?.type.name).toBe("heading");
    expect(nodes[0]?.attrs?.level).toBe(1);

    const table = nodes[1];
    expect(table?.type.name).toBe("table");
    const row = arr(table?.content)[0];
    const cell = arr(row?.content)[0];
    expect(cell?.attrs?.background).toBe("rgb(31, 78, 121)");
    e.destroy();
  });

  it("data: 图片自动转存上传，src 换成站内 URL", async () => {
    const pngB64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const dataUrl = `data:image/png;base64,${pngB64}`;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("data:")) {
        const bytes = Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0));
        return new Response(new Blob([bytes], { type: "image/png" }));
      }
      if (url === "/api/uploads/image") {
        return Response.json({ url: "/uploads/imported.png" }, { status: 201 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const e = makeSchema();
    const res = await convertHtmlToSlice(`<p><img src="${dataUrl}"></p>`, e.schema);
    // Tiptap v3 Image 为块级 atom：段落中的 img 解析后成为顶层 image 节点
    const nodes = sliceNodes(res);
    const img =
      nodes.find((n) => n.type.name === "image") ??
      arr(nodes[0]?.content).find((c) => c.type.name === "image");
    expect(img?.attrs?.src).toBe("/uploads/imported.png");
    e.destroy();
  });

  it("file:// 不可达图片丢弃并计数（不产生裂图节点）", async () => {
    const e = makeSchema();
    const res = await convertHtmlToSlice(
      `<p>前文</p><p><img src="file:///C:/Users/x/a.png"></p>`,
      e.schema,
    );
    expect(res.droppedImages).toBe(1);
    let imgCount = 0;
    for (const n of sliceNodes(res)) {
      if (n.type.name === "image") imgCount++;
      for (const c of arr(n.content)) if (c.type.name === "image") imgCount++;
    }
    expect(imgCount).toBe(0);
    e.destroy();
  });

  it("空白输入返回空 slice（由 UI 层提示）", async () => {
    const e = makeSchema();
    const res = await convertHtmlToSlice("   \n  ", e.schema);
    expect(res.slice.content.size).toBe(0);
    e.destroy();
  });

  it("外链 style 文档：先经内联器再进管道；无 style 文档不触发内联", async () => {
    const e = makeSchema();
    // 无 <style> 的纯内联文档：不调用内联器（零开销）
    const spyIdle = vi.fn(async (h: string) => h);
    await convertHtmlToSlice('<p style="color:red">内联文档</p>', e.schema, {
      inlineStyles: spyIdle,
    });
    expect(spyIdle).not.toHaveBeenCalled();

    // 带 <style> 的非 Word 文档：调用注入的内联实现，产物块级底色进段落 attrs
    const spyInline = vi.fn(
      async () =>
        `<div style="background-color:rgb(22,38,63)"><p style="background-color:rgb(22,38,63)">自检清单</p></div>`,
    );
    const res = await convertHtmlToSlice(
      `<style>.qa{background:#16263f}</style><div class="qa"><p>自检清单</p></div>`,
      e.schema,
      { inlineStyles: spyInline },
    );
    expect(spyInline).toHaveBeenCalledOnce();
    const p = sliceNodes(res).find((n) => n.type.name === "paragraph");
    expect(String(p?.attrs?.backgroundColor ?? "").replace(/\s+/g, "")).toBe("rgb(22,38,63)");
    e.destroy();
  });

  it("深底白字块端到端：p 底色 attrs + 文字 color textStyle mark（本轮事故回归锁）", async () => {
    const e = makeSchema();
    // 模拟浏览器 inliner 的真实输出形制：块级色包 span，容器色下传
    const res = await convertHtmlToSlice(
      `<style>.qa{background:#16263f;color:#e8f1ff}</style>`, // 触发内联器
      e.schema,
      {
        inlineStyles: async () =>
          `<h2 style="color:rgb(232,241,255);background-color:rgb(22,38,63)">` +
          `<span style="color:rgb(232, 241, 255)">BACKUP 自检清单</span></h2>` +
          `<ul><li style="color:rgb(232,241,255)"><span style="color:rgb(232,241,255)">问题一</span></li></ul>`,
      },
    );
    const h2 = sliceNodes(res).find((n) => n.type.name === "heading");
    expect(h2?.attrs?.backgroundColor).toBeTruthy();
    const h2Text = arr(h2?.content)[0];
    const h2Color = h2Text?.marks?.find((m) => m.type.name === "textStyle")?.attrs?.color;
    expect(String(h2Color ?? "").replace(/\s+/g, "")).toBe("rgb(232,241,255)");
    const li = arr(
      arr(sliceNodes(res).find((n) => n.type.name === "bulletList")?.content)[0]?.content,
    )[0];
    const liText = arr(li?.content)[0];
    expect(
      String(liText?.marks?.find((m) => m.type.name === "textStyle")?.attrs?.color ?? "").replace(
        /\s+/g,
        "",
      ),
    ).toBe("rgb(232,241,255)");
    e.destroy();
  });

  it("色块卡片全链路：真实 inliner 核心 → callout 节点 → :::callout 序列化（重开不丢）", async () => {
    const e = makeSchema();
    // 假 getStyle 喂真 inlineComputedStyles：卡片化/徽章删除/标题提取全部真实执行
    const fakeStyle = (el: Element) => ({
      getPropertyValue: (prop: string) => el.getAttribute(`data-cs-${prop}`)?.trim() ?? "",
    });
    const res = await convertHtmlToSlice(`<style>.qa{background:#16263f}</style>`, e.schema, {
      inlineStyles: async (html) => {
        void html;
        const doc = new DOMParser().parseFromString(
          `<div data-cs-background-color="rgb(22,38,63)">` +
            `<div data-cs-color="rgb(127,176,245)">BACKUP 自检清单</div>` +
            `<ul><li>问题一</li></ul></div>`,
          "text/html",
        );
        return inlineComputedStyles(doc, fakeStyle);
      },
    });
    const callout = sliceNodes(res).find((n) => n.type.name === "callout");
    expect(callout?.attrs?.title).toBe("BACKUP 自检清单");
    expect(String(callout?.attrs?.fillColor ?? "").replace(/\s+/g, "")).toBe("rgb(22,38,63)");
    // 插入编辑器后序列化为 :::callout{...}——Markdown 唯一事实源下卡片无损重开
    // （走产品同款事务通道：view.dispatch(tr.replace)，insertContent 不吃 Slice 对象）
    const tr = e.state.tr.replace(0, e.state.doc.content.size, res.slice);
    e.view.dispatch(tr);
    const storage = e.storage as unknown as Record<string, unknown>;
    const mdApi = storage.markdown as { getMarkdown?: () => string } | undefined;
    const md = mdApi?.getMarkdown?.() ?? "";
    expect(md).toContain(':::callout{type="neutral" title="BACKUP 自检清单"');
    expect(md).toContain('fillColor="rgb(22, 38, 63)"');
    expect(md).toContain("问题一");
    e.destroy();
  });
});
