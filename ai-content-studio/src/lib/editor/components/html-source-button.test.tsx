import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HtmlSourceButton } from "./html-source-button";

function makeEditor(content = ""): Editor {
  return new Editor({
    extensions: [StarterKit],
    content,
    editable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** 打开对话框并在源码框填入 HTML（base-ui Dialog 内容挂载需异步等） */
async function openDialogAndFill(html: string) {
  fireEvent.click(screen.getByLabelText("HTML 源码转换"));
  const textarea = await screen.findByLabelText("HTML 源码输入");
  fireEvent.change(textarea, { target: { value: html } });
  return textarea;
}

describe("HtmlSourceButton", () => {
  it("editor 为 null 不渲染", () => {
    const { container } = render(<HtmlSourceButton editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("转换并插入：源码转成段落追加在光标处，原文保留", async () => {
    const editor = makeEditor("<p>原有内容</p>");
    render(<HtmlSourceButton editor={editor} />);
    await openDialogAndFill("<h2>导入标题</h2><p>导入正文<strong>粗体</strong></p>");

    fireEvent.click(screen.getByRole("button", { name: "转换并插入" }));
    await waitFor(() => {
      expect(editor.getText()).toContain("导入标题");
    });
    expect(editor.getText()).toContain("原有内容");
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"heading"');
    expect(json).toContain('"type":"bold"');
    editor.destroy();
  });

  it("转换并替换：确认后整篇替换，旧内容不在", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const editor = makeEditor("<p>旧内容将被替换</p>");
    render(<HtmlSourceButton editor={editor} />);
    await openDialogAndFill("<p>全新正文</p>");

    fireEvent.click(screen.getByRole("button", { name: "转换并替换正文" }));
    await waitFor(() => {
      expect(editor.getText()).toContain("全新正文");
    });
    expect(editor.getText()).not.toContain("旧内容将被替换");
    expect(confirmSpy).toHaveBeenCalled();
    editor.destroy();
  });

  it("替换在用户取消确认时不动文档", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = makeEditor("<p>保留内容</p>");
    render(<HtmlSourceButton editor={editor} />);
    await openDialogAndFill("<p>不要的内容</p>");

    fireEvent.click(screen.getByRole("button", { name: "转换并替换正文" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(editor.getText()).toContain("保留内容");
    expect(editor.getText()).not.toContain("不要的内容");
    editor.destroy();
  });

  it("空源码点转换 → 对话框内提示错误且文档不变", async () => {
    const editor = makeEditor("<p>保持</p>");
    render(<HtmlSourceButton editor={editor} />);
    fireEvent.click(screen.getByLabelText("HTML 源码转换"));
    expect(await screen.findByLabelText("HTML 源码输入")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "转换并插入" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("请先");
    expect(editor.getText()).toBe("保持");
    editor.destroy();
  });
});
