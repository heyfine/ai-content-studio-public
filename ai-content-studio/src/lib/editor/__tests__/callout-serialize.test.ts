import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { Callout } from "../extensions/callout/callout";
import { Markdown } from "../extensions/markdown";
import { renderArticleContent, scanCalloutSegments } from "@/lib/content/render";

function makeEditor(initial = ""): Editor {
  return new Editor({
    extensions: [StarterKit, Callout, Markdown],
    content: initial,
    editable: false,
  });
}

function getMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as Record<string, unknown>;
  const md = storage.markdown as { getMarkdown?: () => string } | undefined;
  return md?.getMarkdown?.() ?? "";
}

describe("callout 序列化与预览一致性", () => {
  it("平级 doc（正文+callout+正文）序列化后闭合符不粘连正文，预览正常", () => {
    const html =
      '<p>正文第一段</p><aside class="callout" data-callout="tip" data-title="要点" data-icon="📌"><div class="callout-title"></div><p>高亮内容</p></aside><p>正文第二段</p>';
    const editor = makeEditor(html);
    const md = getMarkdown(editor);
    editor.destroy();
    expect(md).toMatch(/:::\n\n正文第二段/);
    const preview = renderArticleContent(md);
    expect(preview).toContain("callout-tip");
    expect(preview).not.toContain(":::callout{");
    const asideEnd = preview.indexOf("</aside>");
    expect(preview.indexOf("正文第二段")).toBeGreaterThan(asideEnd);
  });

  it("自定义三色随序列化输出，预览渲染出同款 style", () => {
    const md =
      ':::callout{type="info" title="提示" icon="📌" textColor="#dc2626" borderColor="#60a5fa" fillColor="#3b82f6"}\n自定义颜色内容\n:::';
    const segs = scanCalloutSegments(md);
    expect(segs[0].kind).toBe("callout");
    if (segs[0].kind !== "callout") return;
    expect(segs[0].attrs).toMatchObject({
      textColor: "#dc2626",
      borderColor: "#60a5fa",
      fillColor: "#3b82f6",
    });
    const html = renderArticleContent(md);
    expect(html).toContain("color:#dc2626");
    expect(html).toContain("border-color:#60a5fa");
    expect(html).toContain("background:color-mix(in oklab, #3b82f6 12%, transparent)");
  });

  it("编辑器内设三色，序列化 markdown 携带三色，往返回编辑器不丢色", () => {
    const md =
      ':::callout{type="warning" title="注意" icon="⚠️" textColor="#9a3412" borderColor="#fb923c" fillColor="#f97316"}\n内容\n:::';
    const editor = makeEditor(md);
    const out = getMarkdown(editor);
    editor.destroy();
    expect(out).toContain('textColor="#9a3412"');
    expect(out).toContain('borderColor="#fb923c"');
    expect(out).toContain('fillColor="#f97316"');
    // 再渲染预览仍带 style
    const html = renderArticleContent(out);
    expect(html).toContain("color:#9a3412");
  });

  it("callout 与正文不空行的 markdown 也能正确渲染", () => {
    const md = '第一段\n:::callout{type="tip" title="要点" icon="📌"}\n内容\n:::\n第二段';
    const preview = renderArticleContent(md);
    expect(preview).toContain("callout-tip");
    expect(preview).toContain("第二段");
    expect(preview).not.toContain(":::callout{");
  });
});
