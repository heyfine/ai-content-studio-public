import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { normalizePastedImage, preparePasteHtml, uploadPastedImage } from "./paste-image";
import { PasteImage } from "./paste-image";

describe("normalizePastedImage", () => {
  it("非 bmp 原样返回", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    expect(await normalizePastedImage(file)).toBe(file);
  });

  it("bmp 在无 canvas 环境回退原样（jsdom 无 createImageBitmap/canvas）", async () => {
    const file = new File(["bmp"], "w.bmp", { type: "image/bmp" });
    expect(await normalizePastedImage(file)).toBe(file);
  });
});

describe("uploadPastedImage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POST /api/uploads/image 携带 multipart 文件，返回 url", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      return Response.json({ url: "/uploads/abc.png" }, { status: 201 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const file = new File(["x"], "a.png", { type: "image/png" });
    await expect(uploadPastedImage(file)).resolves.toBe("/uploads/abc.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/image",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("上传失败抛中文错误", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ error: "图片上传失败" }, { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      uploadPastedImage(new File(["x"], "a.png", { type: "image/png" })),
    ).rejects.toThrow("图片上传失败");
  });
});

describe("preparePasteHtml", () => {
  it("无图片的 HTML：hasImage=false，原样返回", () => {
    const r = preparePasteHtml("<p>你好</p><p>世界</p>");
    expect(r.hasImage).toBe(false);
    expect(r.jobs).toEqual([]);
    expect(r.blocked).toBe(0);
    expect(r.html).toContain("你好");
    expect(r.html).toContain("世界");
  });

  it("http(s) 外链图：保留原样，不产生转存任务", () => {
    const r = preparePasteHtml('<p>前</p><img src="https://cdn.example.com/a.png"><p>后</p>');
    expect(r.hasImage).toBe(true);
    expect(r.jobs).toEqual([]);
    expect(r.blocked).toBe(0);
    expect(r.html).toContain("https://cdn.example.com/a.png");
  });

  it("data: 内联图：保留并产生转存任务", () => {
    const r = preparePasteHtml('<p>图：</p><img src="data:image/png;base64,AAAA">');
    expect(r.jobs).toEqual([{ kind: "data", src: "data:image/png;base64,AAAA" }]);
    expect(r.blocked).toBe(0);
    expect(r.html).toContain("data:image/png;base64,AAAA");
  });

  it("blob: 引用：保留并产生转存任务", () => {
    const r = preparePasteHtml('<img src="blob:https://x/uuid">');
    expect(r.jobs).toEqual([{ kind: "blob", src: "blob:https://x/uuid" }]);
  });

  it("file:// 磁盘引用：移除裂图并插入提示文字", () => {
    const r = preparePasteHtml(
      '<p>前文</p><img src="file:///C:/Users/x/image1.png"><p>后文</p>',
    );
    expect(r.hasImage).toBe(true);
    expect(r.jobs).toEqual([]);
    expect(r.blocked).toBe(1);
    expect(r.html).not.toContain("<img");
    expect(r.html).not.toContain("file://");
    expect(r.html).toContain("无法从 Word 剪贴板读取");
    expect(r.html).toContain("前文");
    expect(r.html).toContain("后文");
  });

  it("混合场景：file: 移除 + data: 收任务 + 文字全保留", () => {
    const r = preparePasteHtml(
      '<p>标题</p><img src="file:///C:/a.bmp"><p>中间</p><img src="data:image/jpeg;base64,BBBB">',
    );
    expect(r.blocked).toBe(1);
    expect(r.jobs).toHaveLength(1);
    expect(r.html).toContain("标题");
    expect(r.html).toContain("中间");
  });

  it("相对路径/协议相对图也按不可达处理（编辑器内无上下文可解析）", () => {
    const r = preparePasteHtml('<img src="/local/a.png">');
    expect(r.blocked).toBe(1);
    expect(r.jobs).toEqual([]);
  });
});

describe("PasteImage 编辑器集成（真实 Editor + paste 事件）", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeEditor(): Editor {
    return new Editor({
      extensions: [StarterKit, Image, PasteImage],
      content: "",
    });
  }

  function pasteHtml(editor: Editor, html: string): boolean | undefined {
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [],
        // 只有 text/html 有值；其他 type 返回空串，避免干扰 Tiptap 内部
        // 对 getData("text/plain") 结果做 JSON.parse 的插件（code-block）。
        getData: (type: string) => (type === "text/html" ? html : ""),
      },
    });
    return editor.view.someProp(
      "handlePaste",
      (fn) => (fn as (view: Editor["view"], event: ClipboardEvent) => boolean)(editor.view, event),
    );
  }

  it("file:// 图：被拦截处理（返回 true），提示文字入文且无裂图节点", async () => {
    const editor = makeEditor();
    const handled = pasteHtml(editor, '<p>前文</p><img src="file:///C:/a.png"><p>后文</p>');
    expect(handled).toBe(true);
    await vi.waitFor(() => {
      const text = editor.getText();
      expect(text).toContain("前文");
      expect(text).toContain("后文");
      expect(text).toContain("无法从 Word 剪贴板读取");
    });
    const json = editor.getJSON() as { content?: Array<{ type: string }> };
    expect(json.content?.some((n) => n.type === "image")).toBe(false);
    editor.destroy();
  });

  it("data: 内联图：转存上传后以 /uploads/ URL 插入", async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).startsWith("data:")) {
        return new Response(new Blob(["x"], { type: "image/png" }), { status: 200 });
      }
      return Response.json({ url: "/uploads/pasted.png" }, { status: 201 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const editor = makeEditor();
    pasteHtml(editor, '<p>说明</p><img src="data:image/png;base64,AAAA">');
    await vi.waitFor(() => {
      const json = editor.getJSON() as {
        content?: Array<{ type: string; attrs?: { src?: string } }>;
      };
      expect(json.content?.some((n) => n.type === "image" && n.attrs?.src === "/uploads/pasted.png")).toBe(
        true,
      );
    });
    expect(editor.getText()).toContain("说明");
    editor.destroy();
  });
});
