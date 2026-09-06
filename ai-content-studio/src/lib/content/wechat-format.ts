/**
 * 微信公众号格式转换器：Markdown + 高亮块（:::callout）→ 公众号正文 HTML。
 *
 * 公众号正文约束（与博客发布不同）：
 * - 只认标签白名单，<style> 标签与 class 会被整体剥掉 → 所有样式必须内联 style；
 * - 不支持 oklch()/color-mix() → 高亮块颜色预计算为 hex（与编辑器同一 oklch 源值，
 *   oklab 空间混白模拟 color-mix(in oklab, C X%, transparent) 叠在白底上的效果）；
 * - 外链图片在手机端被防盗链拦截 → 保留原 src，粘贴到公众号编辑器时由微信自动转存图床。
 *
 * 纯渲染函数（DOMParser 走查，无网络/DB 副作用）；仅浏览器与 jsdom 环境可用。
 */
import { marked } from "marked";
import {
  CALLOUT_FALLBACK_TYPE,
  CALLOUT_TYPES,
  type CalloutType,
  isCalloutType,
} from "./callout-types";
import { scanCalloutSegments } from "./render";

marked.setOptions({ gfm: true, breaks: true });

// ---------- 颜色：oklch ↔ hex（oklab 空间混色） ----------

interface Oklab {
  l: number;
  a: number;
  b: number;
}
interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** oklch → oklab（柱坐标 → 直角坐标） */
function oklchToOklab(color: Oklch): Oklab {
  const hRad = (color.h * Math.PI) / 180;
  return {
    l: color.l,
    a: color.c * Math.cos(hRad),
    b: color.c * Math.sin(hRad),
  };
}

/** oklch → sRGB hex（超出色域时分量 clamp，与浏览器渲染近似一致） */
export function oklchToHex(color: Oklch): string {
  return oklabToHex(oklchToOklab(color));
}

function oklabToHex(lab: Oklab): string {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const toByte = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  };
  const hex = (n: number) => toByte(n).toString(16).padStart(2, "0");
  return `#${hex(lr)}${hex(lg)}${hex(lb)}`;
}

function hexToOklab(hex: string): Oklab | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const channels = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const linear = channels.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = linear;
  // Ottosson sRGB(线性)→LMS M1 矩阵
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/**
 * 模拟 color-mix(in oklab, C X%, transparent) 叠在白底上的结果：
 * 公众号无透明混合，用 oklab 空间向白色插值（白 = l:1,a:0,b:0）。
 */
function mixWithWhite(lab: Oklab, ratio: number): Oklab {
  return {
    l: lab.l * ratio + (1 - ratio),
    a: lab.a * ratio,
    b: lab.b * ratio,
  };
}

/** 高亮块 7 类型的 oklch 源值（与 render.ts CALLOUT_CSS / globals.css 严格一致） */
const CALLOUT_OKLCH: Record<CalloutType, Oklch> = {
  info: { l: 0.623, c: 0.214, h: 259.815 },
  tip: { l: 0.627, c: 0.194, h: 149.214 },
  warning: { l: 0.666, c: 0.179, h: 58.318 },
  danger: { l: 0.704, c: 0.191, h: 22.216 },
  note: { l: 0.606, c: 0.25, h: 292.717 },
  insight: { l: 0.695, c: 0.17, h: 162.48 },
  neutral: { l: 0.552, c: 0.016, h: 285.938 },
};

function resolveColor(value: string | undefined, fallbackHex: string): string {
  const v = (value ?? "").trim();
  if (!v) return fallbackHex;
  if (/^#?[0-9a-f]{6}$/i.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return fallbackHex;
}

// ---------- 标签内联样式表 ----------

const WRAPPER_STYLE =
  "font-size:15px;color:#3f3f3f;line-height:1.75;letter-spacing:0.5px;word-break:break-word;";

const TAG_STYLES: Record<string, string> = {
  h1: "margin:24px 0 16px;font-size:20px;font-weight:700;line-height:1.4;color:#1f1f1f;",
  h2: "margin:24px 0 12px;font-size:18px;font-weight:700;line-height:1.4;color:#1f1f1f;",
  h3: "margin:20px 0 10px;font-size:16px;font-weight:700;line-height:1.4;color:#1f1f1f;",
  h4: "margin:16px 0 8px;font-size:15px;font-weight:700;line-height:1.4;color:#1f1f1f;",
  h5: "margin:16px 0 8px;font-size:15px;font-weight:700;line-height:1.4;color:#1f1f1f;",
  h6: "margin:16px 0 8px;font-size:15px;font-weight:700;line-height:1.4;color:#1f1f1f;",
  p: "margin:0 0 16px;",
  blockquote:
    "margin:16px 0;padding:8px 12px;border-left:3px solid #d1d5db;background:#f9fafb;color:#6b7280;",
  pre: "margin:16px 0;padding:12px;border-radius:6px;background:#f6f8fa;overflow-x:auto;font-size:13px;line-height:1.6;",
  a: "color:#576b95;text-decoration:none;",
  img: "display:block;max-width:100%;border-radius:4px;margin:16px auto;",
  table: "border-collapse:collapse;margin:16px 0;width:100%;",
  th: "border:1px solid #d1d5db;padding:6px 12px;background:#f3f4f6;font-weight:600;",
  td: "border:1px solid #d1d5db;padding:6px 12px;",
  hr: "border:none;border-top:1px solid #e5e7eb;margin:24px 0;",
  strong: "font-weight:700;color:#1f1f1f;",
  del: "text-decoration:line-through;color:#9ca3af;",
};

const INLINE_CODE_STYLE =
  "font-family:Menlo,Consolas,monospace;font-size:0.9em;background:#f1f5f9;color:#c0392b;padding:2px 4px;border-radius:2px;";

/** 深度走查 DOM，把样式表按标签内联、剥掉 class/data-*。pre 内的 code 走 pre 配色。 */
function walkInline(el: Element): void {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    const style =
      tag === "code"
        ? child.parentElement?.tagName.toLowerCase() === "pre"
          ? "font-family:Menlo,Consolas,monospace;"
          : INLINE_CODE_STYLE
        : (TAG_STYLES[tag] ?? "");
    const existing = child.getAttribute("style") ?? "";
    if (style) child.setAttribute("style", style + existing);
    child.removeAttribute("class");
    for (const attr of Array.from(child.attributes)) {
      if (attr.name.startsWith("data-")) child.removeAttribute(attr.name);
    }
    walkInline(child);
  }
}

/** 对 marked 输出的 HTML 片段做内联化（DOMParser 解析后只取片段本身）。 */
function inlineStyles(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="__w">${html}</div>`, "text/html");
  const root = doc.getElementById("__w");
  if (!root) return html;
  walkInline(root);
  convertLists(root);
  return root.innerHTML;
}

/**
 * 把 ul/ol/li 降级为带圆点/编号字符的 section 段落。
 * 微信富文本管道会二次加工原生列表（拆行、制造空列表项），公众号排版工具
 * （mdnice/doocs-md 等）均不用原生 li；纯文本前缀在任何管道里渲染一致。
 * 每次替换最外层一个 ul/ol；li 内嵌套的列表随 innerHTML 复制后下一轮继续处理。
 */
function convertLists(root: Element): void {
  const doc = root.ownerDocument;
  for (;;) {
    const list = root.querySelector("ul,ol");
    if (!list) break;
    const ordered = list.tagName.toLowerCase() === "ol";
    const fragment = doc.createDocumentFragment();
    let index = 0;
    for (const li of Array.from(list.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      index++;
      const item = doc.createElement("section");
      item.setAttribute("style", "margin:4px 0;line-height:1.75;");
      item.textContent = ordered ? `${index}. ` : "• ";
      // li 的子节点逐个搬入（前缀文本在前，保留内联结构）
      for (const node of Array.from(li.childNodes)) item.appendChild(node);
      fragment.appendChild(item);
    }
    list.replaceWith(fragment);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- 高亮块 → 内联样式卡片 ----------

interface CalloutAttrsLike {
  type?: string;
  title?: string;
  icon?: string;
  textColor?: string;
  borderColor?: string;
  fillColor?: string;
}

function calloutPalette(attrs: CalloutAttrsLike, resolvedType: CalloutType) {
  const base = oklchToOklab(CALLOUT_OKLCH[resolvedType]);
  const text = resolveColor(attrs.textColor, oklabToHex(base));
  const border = resolveColor(attrs.borderColor, oklabToHex(mixWithWhite(base, 0.55)));
  const fillSource =
    (attrs.fillColor ? hexToOklab(resolveColor(attrs.fillColor, "")) : null) ?? base;
  const fill = oklabToHex(mixWithWhite(fillSource, 0.12));
  return { text, border, fill };
}

function renderWechatCallout(
  attrs: CalloutAttrsLike,
  body: string,
  fallbackLabel: string,
  fallbackIcon: string,
): string {
  const rawType = attrs.type ?? "";
  const type: CalloutType = rawType
    ? isCalloutType(rawType)
      ? rawType
      : CALLOUT_FALLBACK_TYPE
    : "info";
  const { text, border, fill } = calloutPalette(attrs, type);
  const title = escapeHtml(attrs.title?.trim() || fallbackLabel);
  const icon = escapeHtml(attrs.icon?.trim() || fallbackIcon);
  const inner = inlineStyles(marked.parse(body, { async: false }) as string);
  return [
    `<section style="margin:16px 0;padding:12px 16px;border-radius:8px;border-left:4px solid ${border};background:${fill};">`,
    `<section style="font-weight:600;margin-bottom:8px;color:${text};">${icon} ${title}</section>`,
    `<section style="color:${text};">${inner}</section>`,
    `</section>`,
  ].join("");
}

// ---------- 入口 ----------

export interface WechatFormatOptions {
  /** 提供时在正文顶部渲染标题区（公众号标题字段仍需单独填写） */
  title?: string;
}

/**
 * 把 Markdown + 高亮块转换为公众号正文 HTML：全部内联样式、无 class/<style>。
 * 需要浏览器环境（DOMParser）。
 */
export function toWechatHtml(md: string, opts: WechatFormatOptions = {}): string {
  const segments = scanCalloutSegments(md);
  const parts = segments.map((seg) => {
    if (seg.kind === "text") {
      return inlineStyles(marked.parse(seg.value, { async: false }) as string);
    }
    // 标签/图标默认值取该类型配置（与 renderCallout 行为一致）
    const rawType = seg.attrs.type ?? "";
    const type: CalloutType = rawType
      ? isCalloutType(rawType)
        ? rawType
        : CALLOUT_FALLBACK_TYPE
      : "info";
    const config = CALLOUT_TYPES.find((c) => c.type === type);
    return renderWechatCallout(seg.attrs, seg.body, config?.label ?? "补充", config?.icon ?? "📌");
  });
  const titleSection = opts.title
    ? `<section style="margin:0 0 24px;font-size:20px;font-weight:700;line-height:1.4;color:#1f1f1f;">${escapeHtml(opts.title)}</section>`
    : "";
  return `<section style="${WRAPPER_STYLE}">${titleSection}${parts.join("")}</section>`;
}
