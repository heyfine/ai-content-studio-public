/**
 * 粘贴图片扩展：把剪贴板里的图片文件上传到服务器，以可访问 URL 插入正文。
 *
 * 背景：从 Word 等富文本复制图片时，剪贴板携带的是位图（image/bmp）和
 * file:// 路径的 HTML，浏览器/Tiptap 默认粘贴不处理文件项，图片静默丢失。
 * 本扩展读取 clipboardData.items 里的 image/* 文件（Word 位图先经 canvas
 * 转成 png），POST /api/uploads/image 落盘后插入 <img src="/uploads/...">。
 */
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

const UPLOAD_ENDPOINT = "/api/uploads/image";
const MAX_PASTE_IMAGES = 9;

/** Word 位图转 png（canvas 不可用或转换失败时原样返回，由后端类型校验兜底） */
export async function normalizePastedImage(file: File): Promise<File> {
  if (file.type !== "image/bmp") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 不可用");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], file.name.replace(/\.bmp$/i, "") + ".png", { type: "image/png" });
  } catch {
    return file;
  }
}

/** 单张图片上传，返回可插入的 URL */
export async function uploadPastedImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data?.error ?? "图片上传失败");
  return data.url;
}

export const PasteImage = Extension.create({
  name: "pasteImage",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const files = items
              .filter((i) => i.type.startsWith("image/"))
              .map((i) => i.getAsFile())
              .filter((f): f is File => f !== null)
              .slice(0, MAX_PASTE_IMAGES);
            if (files.length === 0) return false;
            event.preventDefault();
            const insertAt = view.state.selection.from;
            void (async () => {
              try {
                const urls = await Promise.all(
                  files.map(async (f) => uploadPastedImage(await normalizePastedImage(f))),
                );
                const nodes = urls.map((url) => view.state.schema.nodes.image.create({ src: url }));
                view.dispatch(view.state.tr.insert(insertAt, nodes));
              } catch (e) {
                // 上传失败静默回退：保持原内容不动，不阻塞编辑
                console.error("粘贴图片上传失败:", e);
              }
            })();
            return true;
          },
        },
      }),
    ];
  },
});
