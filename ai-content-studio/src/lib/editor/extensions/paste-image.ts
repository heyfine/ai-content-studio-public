/**
 * 粘贴图片扩展 v4：Word 富文本粘贴的图片落盘与裂图防御。
 *
 * 剪贴板里 Word 内容的形态与对策：
 * 1. text/html 里 file:///C:/... 磁盘引用（图片数据不在 HTML，浏览器读不到）
 *    → 从剪贴板 **text/rtf** 里按文档顺序提取内嵌的 \pngblip/\jpegblip 图片字节，
 *      原位替换成 data: URL 再转存上传（CKEditor/Gutenberg 同款做法，图文混合也能带图）
 * 2. text/html 里 data:/blob: 内联图 → fetch 成 File 转存上传，原位替换 src
 * 3. image/* 位图文件项（单独复制图片/截图）→ canvas 转 png 上传，插入 <img>
 * 4. RTF 也没有对应图片（如 WMF/EMF 矢量图）→ 移除裂图并插入提示文字
 *
 * 文字永远不丢：清理后的 HTML 经 ProseMirror DOMParser 按 schema 插入。
 */
import { Extension } from "@tiptap/core";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { extractImagesFromRtf, type RtfImage } from "./rtf-images";
import { isWordHtml, normalizeWordHtml } from "./word-html";

const UPLOAD_ENDPOINT = "/api/uploads/image";
const MAX_PASTE_IMAGES = 9;
const BLOCKED_IMAGE_HINT =
  "（此图片无法从 Word 剪贴板读取：请在 Word 中右键复制图片本体、或截图后粘贴、或另存后用工具栏上传）";

export interface PasteImageJob {
  kind: "data" | "blob";
  src: string;
}

export interface PreparedPaste {
  /** 清理后的 HTML：RTF 命中的图已换成 data: 待转存、无对应图的不可达引用已移除（无内置提示） */
  html: string;
  /** 待转存任务（data:/blob: 内联图，含 RTF 提取出的图） */
  jobs: PasteImageJob[];
  /** 被移除的、RTF 也无对应数据的不可达图片数量 */
  blocked: number;
  /** 原始 HTML 是否含任何图片 */
  hasImage: boolean;
}

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
    return new File([blob], `${file.name.replace(/\.bmp$/i, "")}.png`, { type: "image/png" });
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

/**
 * 解析剪贴板 HTML：分类图片、用 RTF 内嵌图回填 file:// 引用、收集转存任务。
 * rtfImages 按文档顺序与 file:// <img> 一一对应；命中则原位换成 data: 并登记转存，
 * 未命中（RTF 无此图/数量不足）才移除并计入 blocked。
 */
export function preparePasteHtml(html: string, rtfImages: RtfImage[] = []): PreparedPaste {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const jobs: PasteImageJob[] = [];
  let blocked = 0;
  let hasImage = false;
  let rtfIdx = 0;
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    hasImage = true;
    const src = img.getAttribute("src") ?? "";
    if (/^data:image\//i.test(src)) {
      jobs.push({ kind: "data", src });
    } else if (/^blob:/i.test(src)) {
      jobs.push({ kind: "blob", src });
    } else if (/^https?:\/\//i.test(src)) {
      // 外链图浏览器可加载，原样保留
    } else {
      // file:///C:/... 等：优先用 RTF 内嵌图按顺序回填
      const rtf = rtfImages[rtfIdx++];
      if (rtf) {
        img.setAttribute("src", rtf.dataUrl);
        jobs.push({ kind: "data", src: rtf.dataUrl });
      } else {
        blocked += 1;
        img.remove();
      }
    }
  }
  return {
    html: doc.body ? doc.body.innerHTML : "",
    jobs,
    blocked,
    hasImage,
  };
}

/** 把 data:/blob: 图转存到本地图片库，返回 src → 新 URL 映射 */
async function uploadInlineImages(jobs: PasteImageJob[]): Promise<Map<string, string>> {
  const urlBySrc = new Map<string, string>();
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const res = await fetch(job.src);
        const blob = await res.blob();
        const type = blob.type || "image/png";
        const ext = type === "image/jpeg" ? "jpg" : "png";
        const file = new File(
          [blob],
          `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
          {
            type,
          },
        );
        urlBySrc.set(job.src, await uploadPastedImage(await normalizePastedImage(file)));
      } catch (e) {
        // 单图转存失败：保留原 src（data: 仍可显示），不阻塞其他图
        console.error("粘贴内联图片转存失败:", job.src.slice(0, 64), e);
      }
    }),
  );
  return urlBySrc;
}

export const PasteImage = Extension.create({
  name: "pasteImage",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;
            const canRead = typeof clipboard.getData === "function";
            const items = Array.from(clipboard.items ?? []);
            const files = items
              .filter((i) => i.type.startsWith("image/"))
              .map((i) => i.getAsFile())
              .filter((f): f is File => f !== null)
              .slice(0, MAX_PASTE_IMAGES);
            const rawHtml = canRead ? clipboard.getData("text/html") : "";
            // Word 粘贴 HTML 是内联样式（字号+粗体当标题），先规范化成语义标签
            const html = rawHtml && isWordHtml(rawHtml) ? normalizeWordHtml(rawHtml) : rawHtml;
            // Word 图文混合：图片字节藏在 RTF 里（浏览器 clipboardData 无 image 文件项）
            const rtf = canRead
              ? clipboard.getData("text/rtf") || clipboard.getData("application/rtf")
              : "";
            const rtfImages = html && rtf ? extractImagesFromRtf(rtf) : [];
            const prepared = html ? preparePasteHtml(html, rtfImages) : null;
            // 诊断日志：图文粘贴再出问题时，让用户在 Console 里贴这行即可定位
            console.info(
              "[paste-image] clipboard:",
              JSON.stringify({
                types: Array.from(clipboard.types ?? []),
                files: files.length,
                rtfLen: rtf.length,
                rtfImages: rtfImages.length,
                blocked: prepared?.blocked ?? 0,
              }),
            );
            // 纯文本（无位图无 HTML 图）：走 Tiptap 默认粘贴
            if (files.length === 0 && !prepared?.hasImage) return false;
            event.preventDefault();

            const insertAt = view.state.selection.from;
            void (async () => {
              // 转存内联图与 RTF 回填图；位图文件项也上传（单独复制图片/截图场景）
              const urlBySrc = prepared
                ? await uploadInlineImages(prepared.jobs)
                : new Map<string, string>();
              const fileUrls: string[] = [];
              for (const f of files) {
                try {
                  fileUrls.push(await uploadPastedImage(await normalizePastedImage(f)));
                } catch (e) {
                  console.error("粘贴图片上传失败:", e);
                }
              }
              // 组装并插入：清理后的 HTML（文字 + 已转存图 + 必要提示）在前，位图文件在后
              const tr = view.state.tr;
              let pos = insertAt;
              let cleaned = prepared
                ? Array.from(urlBySrc.entries()).reduce(
                    (acc, [src, url]) => acc.split(src).join(url),
                    prepared.html,
                  )
                : "";
              // 仍有 RTF 也无能为力的引用图（且无位图兜底）→ 提示并入 HTML 一起插入
              if (prepared && prepared.blocked > 0 && fileUrls.length === 0) {
                cleaned += `<p>${BLOCKED_IMAGE_HINT}</p>`;
              }
              if (cleaned.trim()) {
                const holder = document.createElement("div");
                holder.innerHTML = cleaned;
                const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(holder);
                tr.insert(pos, slice.content);
                pos += slice.content.size;
              }
              for (const url of fileUrls) {
                tr.insert(pos, [view.state.schema.nodes.image.create({ src: url })]);
                pos += 1;
              }
              view.dispatch(tr.scrollIntoView());
            })();
            return true;
          },
        },
      }),
    ];
  },
});
