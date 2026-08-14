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
  type CalloutType,
  isCalloutType,
} from "./callout-types";

marked.setOptions({ gfm: true, breaks: true });

/**
 * 高亮块统一样式（预览与发布共用同一 token）。
 * 颜色值与 src/app/globals.css 的 --callout-* 完全一致（oklch + 相同渲染公式），
 * 保证「编辑器里看到的颜色 = 预览里的颜色」。
 */
export const CALLOUT_CSS = `
.callout{margin:12px 0;padding:12px 16px;border-radius:8px;border-left:4px solid var(--callout-border,#cbd5e1);background:var(--callout-bg,#f8fafc);color:var(--callout-text,#475569);}
.callout-title{display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:6px;}
.callout-icon{line-height:1;}
.callout-content>*:first-child{margin-top:0;}
.callout-content>*:last-child{margin-bottom:0;}
.callout{color:var(--c);border-color:color-mix(in oklab,var(--c) 55%,transparent);background:color-mix(in oklab,var(--c) 10%,transparent);}
.callout-info{--callout-bg:color-mix(in oklab,oklch(0.623 0.214 259.815) 10%,transparent);--callout-border:color-mix(in oklab,oklch(0.623 0.214 259.815) 55%,transparent);--callout-text:oklch(0.623 0.214 259.815);--c:oklch(0.623 0.214 259.815);}
.callout-tip{--callout-bg:color-mix(in oklab,oklch(0.627 0.194 149.214) 10%,transparent);--callout-border:color-mix(in oklab,oklch(0.627 0.194 149.214) 55%,transparent);--callout-text:oklch(0.627 0.194 149.214);--c:oklch(0.627 0.194 149.214);}
.callout-warning{--callout-bg:color-mix(in oklab,oklch(0.666 0.179 58.318) 10%,transparent);--callout-border:color-mix(in oklab,oklch(0.666 0.179 58.318) 55%,transparent);--callout-text:oklch(0.666 0.179 58.318);--c:oklch(0.666 0.179 58.318);}
.callout-danger{--callout-bg:color-mix(in oklab,oklch(0.704 0.191 22.216) 10%,transparent);--callout-border:color-mix(in oklab,oklch(0.704 0.191 22.216) 55%,transparent);--callout-text:oklch(0.704 0.191 22.216);--c:oklch(0.704 0.191 22.216);}
.callout-note{--callout-bg:color-mix(in oklab,oklch(0.606 0.25 292.717) 10%,transparent);--callout-border:color-mix(in oklab,oklch(0.606 0.25 292.717) 55%,transparent);--callout-text:oklch(0.606 0.25 292.717);--c:oklch(0.606 0.25 292.717);}
.callout-insight{--callout-bg:color-mix(in oklab,oklch(0.695 0.17 162.48) 10%,transparent);--callout-border:color-mix(in oklab,oklch(0.695 0.17 162.48) 55%,transparent);--callout-text:oklch(0.695 0.17 162.48);--c:oklch(0.695 0.17 162.48);}
.callout-neutral{--callout-bg:color-mix(in oklab,oklch(0.552 0.016 285.938) 10%,transparent);--callout-border:color-mix(in oklab,oklch(0.552 0.016 285.938) 55%,transparent);--callout-text:oklch(0.552 0.016 285.938);--c:oklch(0.552 0.016 285.938);}
`;

interface CalloutAttrs {
  type?: string;
  title?: string;
  icon?: string;
  /** 自定义颜色（编辑器内可调，预览需保持一致） */
  textColor?: string;
  borderColor?: string;
  fillColor?: string;
}

export type Segment =
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
  for (let m = re.exec(inner); m !== null; m = re.exec(inner)) {
    const key = m[1] ?? m[3];
    const value = m[2] ?? m[4];
    if (
      key === "type" ||
      key === "title" ||
      key === "icon" ||
      key === "textColor" ||
      key === "borderColor" ||
      key === "fillColor"
    ) {
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

/** 把 segments 重新拼接回 markdown 文本（与 scanCalloutSegments 配对）。 */
export function segmentsToMarkdown(segments: Segment[]): string {
  return segments
    .map((seg) => {
      if (seg.kind === "text") return seg.value;
      const type: CalloutType = isCalloutType(seg.attrs.type)
        ? seg.attrs.type
        : CALLOUT_FALLBACK_TYPE;
      const config = CALLOUT_TYPES.find((t) => t.type === type) ?? CALLOUT_TYPES[0];
      const title = seg.attrs.title?.trim() || config.label;
      const icon = seg.attrs.icon?.trim() || config.icon;
      const textColor = (seg.attrs.textColor ?? "").trim();
      const borderColor = (seg.attrs.borderColor ?? "").trim();
      const fillColor = (seg.attrs.fillColor ?? "").trim();
      const extra =
        (textColor ? ` textColor="${textColor}"` : "") +
        (borderColor ? ` borderColor="${borderColor}"` : "") +
        (fillColor ? ` fillColor="${fillColor}"` : "");
      return `:::callout{type="${type}" title="${title}" icon="${icon}"${extra}}\n${seg.body}\n:::`;
    })
    .join("\n");
}

function renderCallout(seg: Extract<Segment, { kind: "callout" }>): string {
  // 未指定 type 时给 info（蓝色）而非 neutral（灰白），避免 AI 生成的
  // 高亮块全是白色底；只有 type 是非法字符串时才降级 neutral。
  const rawType = seg.attrs.type ?? "";
  const type: CalloutType = rawType
    ? isCalloutType(rawType)
      ? rawType
      : CALLOUT_FALLBACK_TYPE
    : "info";
  const config = CALLOUT_TYPES.find((t) => t.type === type) ?? CALLOUT_TYPES[0];
  const title = escapeAttr(seg.attrs.title?.trim() || config.label);
  const icon = escapeAttr(seg.attrs.icon?.trim() || config.icon);
  const innerHtml = marked.parse(seg.body, { async: false }) as string;
  // 自定义颜色：与编辑器内 callout 渲染保持一致（fill 用 12% 透明混合）
  const textColor = (seg.attrs.textColor ?? "").trim();
  const borderColor = (seg.attrs.borderColor ?? "").trim();
  const fillColor = (seg.attrs.fillColor ?? "").trim();
  const styleParts: string[] = [];
  if (textColor) styleParts.push(`color:${textColor}`);
  if (borderColor) styleParts.push(`border-color:${borderColor}`);
  if (fillColor) styleParts.push(`background:color-mix(in oklab, ${fillColor} 12%, transparent)`);
  const style = styleParts.length ? ` style="${styleParts.join(";")}"` : "";
  return [
    `<aside class="callout callout-${type}" data-callout="${type}"${style}>`,
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

/** 高亮块在原文中的字节范围（含开/闭行）。 */
export interface CalloutRange {
  /** 第几个高亮块，从 0 开始（用于 UI 列表序号与定位） */
  index: number;
  /** 开头 `:::callout{...}` 所在起始字节 */
  start: number;
  /** 结尾 `:::` 所在结束字节（不含其后换行） */
  end: number;
  /** 已解析的属性（type/title/icon，缺省为 undefined） */
  attrs: CalloutAttrs;
  /** 块正文（开闭行之间的文本） */
  body: string;
}

/**
 * 扫描 markdown，返回全部合法（已闭合）高亮块的字节范围与属性。
 * 未闭合的高亮块不计入（与 renderArticleContent 的保留为普通文本一致）。
 */
export function findCalloutRanges(md: string): CalloutRange[] {
  const lines = md.split("\n");
  const ranges: CalloutRange[] = [];
  let lineStart = 0; // 当前行在 md 中的起始字节
  let idx = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineEnd = lineStart + line.length; // 不含换行
    const open = line.match(OPEN_RE);
    if (open) {
      let j = i + 1;
      while (j < lines.length && !CLOSE_RE.test(lines[j])) j++;
      if (j < lines.length) {
        // 闭合行字节范围：从开头行的起始到闭合行末尾
        let closeLineStart = lineEnd + 1; // 跳过开头行末的 \n
        for (let k = i + 1; k < j; k++) closeLineStart += lines[k].length + 1;
        ranges.push({
          index: idx++,
          start: lineStart,
          end: closeLineStart + lines[j].length,
          attrs: parseCalloutAttrs(open[1] ?? "{}"),
          body: lines.slice(i + 1, j).join("\n"),
        });
        i = j + 1;
        // 同步 lineStart：跳过中间行 + 闭合行 + 各自换行
        lineStart = closeLineStart + lines[j].length + 1;
        continue;
      }
      // 未闭合：按普通文本处理
    }
    lineStart = lineEnd + 1;
    i++;
  }
  return ranges;
}

/** 高亮块可编辑属性。type 必须为白名单，否则序列化时降级 neutral。 */
export interface CalloutEditValue {
  type: CalloutType;
  title: string;
  icon: string;
  body: string;
}

/**
 * 把指定序号的高亮块替换为新属性/正文，返回新 markdown。
 * 索引越界或未找到时原样返回 md（防御性，UI 应保证索引合法）。
 * 序列化结果保持 :::callout{type="..." title="..." icon="..."} 三属性顺序与 calloutTemplate 一致，
 * 便于编辑器回写后再被 findCalloutRanges 正确解析。
 */
export function editCalloutInMarkdown(md: string, index: number, value: CalloutEditValue): string {
  const ranges = findCalloutRanges(md);
  const target = ranges.find((r) => r.index === index);
  if (!target) return md;
  const type: CalloutType = isCalloutType(value.type) ? value.type : CALLOUT_FALLBACK_TYPE;
  const config = CALLOUT_TYPES.find((t) => t.type === type) ?? CALLOUT_TYPES[0];
  const title = value.title.trim() || config.label;
  const icon = value.icon.trim() || config.icon;
  const body = value.body.replace(/\r\n/g, "\n");
  const replacement = `:::callout{type="${type}" title="${title}" icon="${icon}"}\n${body}\n:::`;
  return md.slice(0, target.start) + replacement + md.slice(target.end);
}

/** 供编辑器「删除某个高亮块」使用：移除指定序号块，并清理一个相邻换行以免前后文粘连。 */
export function removeCalloutInMarkdown(md: string, index: number): string {
  const ranges = findCalloutRanges(md);
  const target = ranges.find((r) => r.index === index);
  if (!target) return md;
  let start = target.start;
  let end = target.end;
  const hasPrevNl = start > 0 && md[start - 1] === "\n";
  const hasNextNl = end < md.length && md[end] === "\n";
  // 只吞一个换行：优先块前换行；块前没有再吞块后换行；都没有则原样裁剪
  if (hasPrevNl) start -= 1;
  else if (hasNextNl) end += 1;
  return md.slice(0, start) + md.slice(end);
}
