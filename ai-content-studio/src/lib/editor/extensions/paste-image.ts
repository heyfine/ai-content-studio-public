/**
 * 粘贴图片扩展 v3：Word 富文本粘贴的图片落盘与裂图防御。
 *
 * 剪贴板里 Word 内容的形态与对策（关键：**位图文件项始终上传**，
 * 即使 HTML 里有 file:// 引用——Word 图文混合复制时剪贴板也有位图兜底；
 * 旧版因「HTML 有图就跳过位图」导致图文混合时图片丢失，属过度防御）：
 * 1. image/* 位图文件项（Word 选区/截图渲染的位图）→ canvas 转 png 上传，插入 <img src="/uploads/...">
 * 2. text/html 里 data:/blob: 内联图 → fetch 成 File 转存上传，原位替换 src
 * 3. text/html 里 file:///C:/... 磁盘引用（数据不在剪贴板，浏览器无法读取）
 *    → 移除裂图；仅当位图也没成功兜底时才插入提示文字
 *
 * 文字永远不丢：清理后的 HTML 经 ProseMirror DOMParser 按 schema 插入。
 */
import { Extension } from "@tiptap/core";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

const UPLOAD_ENDPOINT = "/api/uploads/image";
const MAX_PASTE_IMAGES = 9;
const BLOCKED_IMAGE_HINT =
  "（此图片无法从 Word 剪贴板读取：请在 Word 中右键复制图片本体、或截图后粘贴、或另存后用工具栏上传）";

export interface PasteImageJob {
  kind: "data" | "blob";
  src: string;
}

export interface PreparedPaste {
  /** 清理后的 HTML：不可达图已移除、data:/blob: 图保留原 src 待转存替换（无内置提示） */
  html: string;
  /** 待转存任务（data:/blob: 内联图） */
  jobs: PasteImageJob[];
  /** 被移除的不可达图片数量 */
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

/** 解析剪贴板 HTML：分类图片、移除不可达引用（不留提示）、收集转存任务 */
export function preparePasteHtml(html: string): PreparedPaste {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const jobs: PasteImageJob[] = [];
  let blocked = 0;
  let hasImage = false;
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
      // file:///C:/... 等：数据不在剪贴板，插入必裂图 → 直接移除（提示时机由 handlePaste 决定）
      blocked += 1;
      img.remove();
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
            const items = Array.from(clipboard.items ?? []);
            const files = items
              .filter((i) => i.type.startsWith("image/"))
              .map((i) => i.getAsFile())
              .filter((f): f is File => f !== null)
              .slice(0, MAX_PASTE_IMAGES);
            const html =
              typeof clipboard.getData === "function" ? clipboard.getData("text/html") : "";
            const prepared = html ? preparePasteHtml(html) : null;
            // 纯文本（无位图无 HTML 图）：走 Tiptap 默认粘贴
            if (files.length === 0 && !prepared?.hasImage) return false;
            event.preventDefault();

            const insertAt = view.state.selection.from;
            void (async () => {
              // 转存内联图；位图文件项始终上传（Word 图文混合时有位图兜底，图片能显示）
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
              // HTML 里有被移除的 file:// 引用图，且位图也没成功兜底 → 提示并入 HTML 一起插入
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
