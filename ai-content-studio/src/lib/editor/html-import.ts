import type { Schema, Slice } from "@tiptap/pm/model";
import { DOMParser as PMDOMParser, Slice as PMSlice } from "@tiptap/pm/model";
import { preparePasteHtml, uploadInlineImages } from "./extensions/paste-image";
import { isWordHtml, normalizeWordHtml } from "./extensions/word-html";
import { inlineHtmlStyles } from "./html-style-inliner";

/**
 * HTML 源码 → 编辑器文档 slice（工具栏「HTML 源码」对话框的转换内核）。
 *
 * 与直接粘贴共用同一条管道，保证「浏览器粘贴 HTML」与「源码框贴 HTML 转换」
 * 结果完全一致：
 * 0. class/<style> 外链样式文档：隐藏 iframe 真实渲染 + getComputedStyle 差分
 *    内联（html-style-inliner），把浏览器效果落成内联样式——「与网页效果一致」
 *    的关键；Word 源码（mso）本自带内联样式，跳过计算走专属规范化路径
 * 1. Word 来源先 normalizeWordHtml：标题判级/加粗语义化/表格底色保留
 * 2. preparePasteHtml：data:/blob: 图转存上传、file:// 等不可达图丢弃并计数
 * 3. ProseMirror DOMParser 按 schema 解析：内联样式类格式（颜色/底色/对齐/缩进/
 *    表格单元格背景/块级底色/左色条等）随 mark/attr 通道进文档，Markdown 序列化
 *    链路已闭合（markdown-style-bridge + TableMarkdown）
 *
 * 无法保留项（渲染类装饰，UI 须如实告知）：字体族与字号阶梯、圆角/阴影/边框、
 * 渐变整象（取首色标兜底）、flex/绝对定位流向、counter() 类伪元素编号。
 */
export interface HtmlImportOptions {
  /** 测试接缝：样式内联实现（默认浏览器 iframe；可注入恒等函数跳过） */
  inlineStyles?: (html: string) => Promise<string>;
}

export interface HtmlImportResult {
  /** 解析出的内容 slice（content.size === 0 表示无可导入内容） */
  slice: Slice;
  /** 不可达（file:// 等）被移除的图片数 */
  droppedImages: number;
}

export async function convertHtmlToSlice(
  html: string,
  schema: Schema,
  opts: HtmlImportOptions = {},
): Promise<HtmlImportResult> {
  let source = html;
  // 仅含外链 <style> 的非 Word 文档需要计算样式；渲染失败静默回退（行为同内联前）
  if (!isWordHtml(html) && /<style[\s>]/i.test(html)) {
    try {
      source = await (opts.inlineStyles ?? inlineHtmlStyles)(html);
    } catch (e) {
      console.warn("[html-import] 样式内联渲染失败，按原源码转换:", e);
    }
  }
  const processed = isWordHtml(source) ? normalizeWordHtml(source) : source;
  const prepared = preparePasteHtml(processed);
  const urlBySrc = await uploadInlineImages(prepared.jobs);
  const cleaned = Array.from(urlBySrc.entries()).reduce(
    (acc, [src, url]) => acc.split(src).join(url),
    prepared.html,
  );
  const holder = document.createElement("div");
  holder.innerHTML = cleaned;
  const parsed = PMDOMParser.fromSchema(schema).parseSlice(holder);
  return {
    // openStart/openEnd 归零（closed slice）：parseSlice 把 holder 当开放上下文，
    // 产生的 open=1 会让 tr.replace/replaceSelection 按 fitting 逐层解包顶级节点——
    // 普通段落无感，callout/table 等包装节点会被拆散（单测+最小复现定案）
    slice: new PMSlice(parsed.content, 0, 0),
    droppedImages: prepared.blocked,
  };
}
