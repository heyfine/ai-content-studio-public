import { Editor } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { CALLOUT_TYPES } from "@/lib/content/callout-types";
import { Callout } from "../extensions/callout/callout";
import { Markdown } from "../extensions/markdown";

/**
 * Tiptap 编辑器 + Callout 自定义 Node + tiptap-markdown 互转的回归测试。
 *
 * 对齐 src/lib/content/render.test.ts 的关键契约（TIPTAP-MIGRATION-SPEC §1.2）：
 *  1. 属性序列化顺序 type → title → icon
 *  2. type 非白名单降级 neutral
 *  3. 未闭合 callout 不吞后续正文
 *  4. callout body 内部 Markdown 仍渲染
 *  5. 7 种 type 全过
 *  6. XSS 白名单转义（用 DOMParser 断言浏览器真实解析结果，spec §6.2）
 *  7. 基础 Markdown（标题/加粗/链接/代码块）往返不死
 *
 * 测试策略（spec §6.2）：用 `new Editor` 而非 `useEditor`（避开 jsdom 的
 * Selection/Range 限制），断言走 `getMarkdown()` / `getHTML()` / DOMParser。
 */

function makeEditor(initial = ""): Editor {
  return new Editor({
    extensions: [StarterKit, Callout, CharacterCount, Markdown],
    content: initial,
    editable: false, // 测试期间不需要交互
  });
}

function getMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as Record<string, unknown>;
  const md = storage.markdown as { getMarkdown?: () => string } | undefined;
  return md?.getMarkdown?.() ?? "";
}

function roundtrip(md: string): string {
  const editor = makeEditor(md);
  const out = getMarkdown(editor);
  editor.destroy();
  return out;
}

describe("Tiptap callout: Markdown 基础往返", () => {
  it("纯文本往返", () => {
    expect(roundtrip(" Hello world ")).toContain("Hello world");
  });

  it("标题/加粗/链接/代码块 往返不死", () => {
    const md = "# 标题\n\n**加粗** [链接](https://x.com) `code`";
    const out = roundtrip(md);
    expect(out).toContain("标题");
    expect(out).toContain("加粗");
    expect(out).toContain("链接");
    expect(out).toContain("https://x.com");
  });
});

describe("Tiptap callout: :::callout 互转契约", () => {
  it("三属性序列化保序 type → title → icon", () => {
    const md =
      ':::callout{type="warning" title="注意" icon="⚠️"}\n内容\n:::';
    const out = roundtrip(md);
    expect(out).toMatch(
      /:::callout\{type="warning" title="注意" icon="⚠️"\}/,
    );
  });

  it("7 种 type 全部往返（对齐 render.test.ts 7 类型）", () => {
    for (const t of CALLOUT_TYPES) {
      const md = `:::callout{type="${t.type}"}\n内容\n:::`;
      const out = roundtrip(md);
      expect(out).toContain(`type="${t.type}"`);
    }
  });

  it("type 非白名单降级 neutral（契约 2）", () => {
    const md = ':::callout{type="evil"}\n内容\n:::';
    const out = roundtrip(md);
    expect(out).toContain('type="neutral"');
    expect(out).not.toContain('type="evil"');
  });

  it("未闭合 callout 不吞后续正文（契约 3）", () => {
    const md = ':::callout{type="info"}\n没有闭合\n后续';
    const out = roundtrip(md);
    expect(out).toContain("没有闭合");
    expect(out).toContain("后续");
  });

  it("callout body 内 Markdown 仍渲染（契约 4）", () => {
    const md =
      ':::callout{type="info"}\n**加粗** 与 [链接](https://x.com)\n:::';
    const editor = makeEditor(md);
    const html = editor.getHTML();
    editor.destroy();
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain("https://x.com");
  });

  it("title 脚本被转义，无 XSS（契约 6）", () => {
    const editor = makeEditor("");
    editor.setEditable(true);
    editor.commands.insertContent({
      type: "callout",
      attrs: { type: "info", title: "<script>alert(1)</script>", icon: "" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "内" }] }],
    });
    const html = editor.getHTML();
    editor.destroy();
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("script").length).toBe(0);
    expect(html).toContain("data-title=");
  });

  it("icon img 注入被转义，无 XSS（契约 6）", () => {
    const editor = makeEditor("");
    editor.setEditable(true);
    editor.commands.insertContent({
      type: "callout",
      attrs: { type: "info", title: "x", icon: "<img src=x onerror=alert(1)>" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "内" }] }],
    });
    const html = editor.getHTML();
    editor.destroy();
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("img").length).toBe(0);
    expect(doc.querySelectorAll("aside.callout").length).toBe(1);
  });
});

describe("Tiptap callout: HTML↔node 互认", () => {
  it("parseHTML 识别 renderArticleContent 输出的 aside.callout", async () => {
    const { renderArticleContent } = await import("@/lib/content/render");
    const md = ':::callout{type="warning" title="注意" icon="⚠️"}\n正文\n:::';
    const html = renderArticleContent(md);
    const editor = makeEditor(html);
    const out = getMarkdown(editor);
    editor.destroy();
    expect(out).toContain("callout");
    expect(out).toContain("warning");
  });
});
