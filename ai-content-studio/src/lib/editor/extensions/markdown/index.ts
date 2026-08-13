import { Markdown as TiptapMarkdown } from "tiptap-markdown";

/**
 * 项目内统一 Markdown 扩展配置——对齐 src/lib/content/render.ts:21 marked 配置：
 *   marked.setOptions({ gfm: true, breaks: true })
 *
 * breaks: true —— 单换行渲染为 <br>（marked breaks 行为）
 * html: true   —— 允许 Markdown 内联 HTML（别名 markdown-it html 选项）
 *
 * 自定义 Node（如 Callout）通过自身 addStorage 注册 storage.markdown
 * 的 serialize/parse 钩子，在此扩展自动被 MarkdownParser/Serializer 读到。
 */
export const Markdown = TiptapMarkdown.configure({
  html: true,
  breaks: true,
  linkify: false,
  tightLists: true,
  transformPastedText: true,
  transformCopiedText: true,
});
