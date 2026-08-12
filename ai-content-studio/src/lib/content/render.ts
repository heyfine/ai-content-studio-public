/**
 * 文章内容渲染器：把 Markdown + 高亮块（:::callout）转换为安全 HTML。
 *
 * 编辑器预览与 WordPress 发布共用此渲染器（同一类型配置、同一 CSS token），
 * 保证「本地看到的颜色 = 博客上的颜色」。依据排版规范
 * docs/content/ARTICLE-EDITOR-AND-TYPOGRAPHY-SPEC.md。
 *
 * 安全约束：
 * - type 只允许白名单（非法值降级 neutral），不允许注入 class；
 * - title/icon 一律做 HTML 属性转义，不允许注入标签；
 * - 未闭合/非法 callout 按普通文本保留，不吞掉后续正文。
 */
import { marked } from "marked";
import {
  CALLOUT_FALLBACK_TYPE,
  CALLOUT_TYPES,
  isCalloutType,
  type CalloutType,
} from "./callout-types";

marked.setOptions({ gfm: true, breaks: true });

/** 高亮块统一样式（预览与发布共用同一 token）。 */
export const CALLOUT_CSS = `
.callout{margin:12px 0;padding:12px 16px;border-radius:8px;border-left:4px solid var(--callout-border,#cbd5e1);background:var(--callout-bg,#f8fafc);color:var(--callout-text,#475569);}
.callout-title{display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:6px;}
.callout-icon{line-height:1;}
.callout-content>*:first-child{margin-top:0;}
.callout-content>*:last-child{margin-bottom:0;}
.callout-info{--callout-bg:#eff6ff;--callout-border:#60a5fa;--callout-text:#1e40af;}
.callout-tip{--callout-bg:#f0fdf4;--callout-border:#4ade80;--callout-text:#166534;}
.callout-warning{--callout-bg:#fff7ed;--callout-border:#fb923c;--callout-text:#9a3412;}
.callout-danger{--callout-bg:#fef2f2;--callout-border:#f87171;--callout-text:#991b1b;}
.callout-note{--callout-bg:#fefce8;--callout-border:#facc15;--callout-text:#854d0e;}
.callout-insight{--callout-bg:#faf5ff;--callout-border:#c084fc;--callout-text:#6b21a8;}
.callout-neutral{--callout-bg:#f8fafc;--callout-border:#cbd5e1;--callout-text:#475569;}
`;

interface CalloutAttrs {
  type?: string;
  title?: string;
  icon?: string;
}

type Segment =
  | { kind: "text"; value: string }
  | { kind: "callout"; attrs: CalloutAttrs; body: string };

const OPEN_RE = /^:::callout(\{[^}]*\})?[ \t]*$/;
const CLOSE_RE = /^:::[ \t]*$/;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseCalloutAttrs(raw: string): CalloutAttrs {
  const out: CalloutAttrs = {};
  const inner = raw.replace(/^\{/, "").replace(/\}$/, "");
  const re = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const key = m[1] ?? m[3];
    const value = m[2] ?? m[4];
    if (key === "type" || key === "title" || key === "icon") {
      out[key] = value;
    }
  }
  return out;
}

/** 扫描 markdown，切分普通文本段与高亮块段。未闭合的高亮块按普通文本保留。 */
export function scanCalloutSegments(md: string): Segment[] {
  const lines = md.split("\n");
  const parts: Segment[] = [];
  let buf: string[] = [];
  const flushText = () => {
    if (buf.length > 0) {
      parts.push({ kind: "text", value: buf.join("\n") });
      buf = [];
    }
  };
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(OPEN_RE);
    if (open) {
      let j = i + 1;
      while (j < lines.length && !CLOSE_RE.test(lines[j])) j++;
      if (j < lines.length) {
        flushText();
        parts.push({
          kind: "callout",
          attrs: parseCalloutAttrs(open[1] ?? "{}"),
          body: lines.slice(i + 1, j).join("\n"),
        });
        i = j + 1;
        continue;
      }
      // 未闭合：按普通文本保留
    }
    buf.push(lines[i]);
    i++;
  }
  flushText();
  return parts;
}

function renderCallout(seg: Extract<Segment, { kind: "callout" }>): string {
  const rawType = seg.attrs.type ?? "";
  const type: CalloutType = isCalloutType(rawType) ? rawType : CALLOUT_FALLBACK_TYPE;
  const config = CALLOUT_TYPES.find((t) => t.type === type) ?? CALLOUT_TYPES[0];
  const title = escapeAttr(seg.attrs.title?.trim() || config.label);
  const icon = escapeAttr(seg.attrs.icon?.trim() || config.icon);
  const innerHtml = marked.parse(seg.body, { async: false }) as string;
  return [
    `<aside class="callout callout-${type}" data-callout="${type}">`,
    `<div class="callout-title"><span class="callout-icon" aria-hidden="true">${icon}</span><span class="callout-label">${title}</span></div>`,
    `<div class="callout-content">${innerHtml}</div>`,
    `</aside>`,
  ].join("");
}

export interface RenderOptions {
  /** 是否在输出开头注入高亮块 CSS（WordPress 发布用）；编辑器预览由样式表提供 */
  includeCalloutCss?: boolean;
}

/**
 * 把 Markdown + 高亮块渲染为 HTML。
 * @param includeCalloutCss 为 true 时在 HTML 头部附加 <style>（发布到 WP 时使用）
 */
export function renderArticleContent(md: string, opts: RenderOptions = {}): string {
  const segments = scanCalloutSegments(md);
  const body = segments
    .map((seg) =>
      seg.kind === "text"
        ? (marked.parse(seg.value, { async: false }) as string)
        : renderCallout(seg),
    )
    .join("");
  const style = opts.includeCalloutCss ? `<style>${CALLOUT_CSS}</style>` : "";
  return style + body;
}

/** 供编辑器工具栏使用的插入模板（type 必须是白名单值）。 */
export function calloutTemplate(type: CalloutType): string {
  const config = CALLOUT_TYPES.find((t) => t.type === type) ?? CALLOUT_TYPES[0];
  return [
    `:::callout{type="${config.type}" title="${config.label}" icon="${config.icon}"}`,
    `在这里输入需要展示的信息。`,
    `:::`,
    ``,
  ].join("\n");
}
