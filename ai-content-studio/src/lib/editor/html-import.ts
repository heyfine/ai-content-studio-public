import type { Schema, Slice } from "@tiptap/pm/model";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { preparePasteHtml, uploadInlineImages } from "./extensions/paste-image";
import { isWordHtml, normalizeWordHtml } from "./extensions/word-html";

/**
 * HTML 源码 → 编辑器文档 slice（工具栏「HTML 源码」对话框的转换内核）。
 *
 * 与直接粘贴共用同一条管道，保证「浏览器粘贴 HTML」与「源码框贴 HTML 转换」
 * 结果完全一致：
 * 1. Word 来源（mso 标记）先 normalizeWordHtml：标题判级/加粗语义化/表格底色保留
 * 2. preparePasteHtml：data:/blob: 图转存上传、file:// 等不可达图丢弃并计数
 * 3. ProseMirror DOMParser 按 schema 解析：内联样式类格式（颜色/底色/对齐/缩进/
 *    表格单元格背景等）随既有 mark/attr 通道进文档，Markdown 序列化链路已闭合
 *
 * 保真边界：class 与 <style> 外链样式、script 不保留——与浏览器粘贴限制相同，
 * 属富文本可编辑化的固有约束（UI 端对话框须如实提示）。
 */
export interface HtmlImportResult {
  /** 解析出的内容 slice（content.size === 0 表示无可导入内容） */
  slice: Slice;
  /** 不可达（file:// 等）被移除的图片数 */
  droppedImages: number;
}

export async function convertHtmlToSlice(html: string, schema: Schema): Promise<HtmlImportResult> {
  const processed = isWordHtml(html) ? normalizeWordHtml(html) : html;
  const prepared = preparePasteHtml(processed);
  const urlBySrc = await uploadInlineImages(prepared.jobs);
  const cleaned = Array.from(urlBySrc.entries()).reduce(
    (acc, [src, url]) => acc.split(src).join(url),
    prepared.html,
  );
  const holder = document.createElement("div");
  holder.innerHTML = cleaned;
  return {
    slice: PMDOMParser.fromSchema(schema).parseSlice(holder),
    droppedImages: prepared.blocked,
  };
}
