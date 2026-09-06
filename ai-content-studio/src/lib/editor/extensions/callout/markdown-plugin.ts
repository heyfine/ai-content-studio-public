import type MarkdownIt from "markdown-it";

/**
 * 自定义 markdown-it block rule：识别 :::callout{...} ... ::: fenced 块。
 *
 * 与 src/lib/content/render.ts 严格对齐：
 *  - OPEN_RE = /^:::callout(\{[^}]*\})?[ \t]*$/（render.ts:49）
 *  - CLOSE_RE = /^:::[ \t]*$/（render.ts:50）
 *  - parseCalloutAttrs 只认 key="v" 或 key='v'，只留 type/title/icon（render.ts:61-73）
 *  - 输出 <aside class="callout callout-{type}" data-callout data-title data-icon>
 *    与 renderArticleContent 的 renderCallout 互认（是 Callout.parseHTML 反向入口）
 *  - body 内 Markdown 仍被 markdown-it 渲染（render.ts renderCallout）
 *  - 未闭合 callout 按普通文本保留（render.ts scanCalloutSegments:102-103）
 *  - type 非白名单降级 neutral（render.ts CALLOUT_FALLBACK_TYPE）
 *
 * 输出 HTML 由 ProseMirror DOMParser 走 Callout.parseHTML 反序列化为 Callout node。
 */

const OPEN_RE = /^:::callout(\{[^}]*\})?[ \t]*$/;
const CLOSE_RE = /^:::[ \t]*$/;

function parseCalloutAttrs(raw: string): {
  type?: string;
  title?: string;
  icon?: string;
  textColor?: string;
  borderColor?: string;
  fillColor?: string;
} {
  const out: {
    type?: string;
    title?: string;
    icon?: string;
    textColor?: string;
    borderColor?: string;
    fillColor?: string;
  } = {};
  const inner = raw.replace(/^\{/, "").replace(/\}$/, "");
  const re = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'/g;
  let m = re.exec(inner);
  while (m !== null) {
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
    m = re.exec(inner);
  }
  return out;
}

const VALID_TYPES = new Set(["info", "tip", "warning", "danger", "note", "insight", "neutral"]);
const FALLBACK = "neutral";

/**
 * 注册 callout block rule 到 markdown-it 实例（在 fence 前面拦截）。
 * 规则名带 callout 前缀，不与 CommonMark fenced code（:::）混淆。
 */
export function calloutBlockPlugin(md: MarkdownIt): void {
  md.block.ruler.before("fence", "callout", (state: any) => {
    const startLine = state.line;
    const lineStart = state.bMarks[startLine] + state.tShift[startLine];
    const lineEnd = state.eMarks[startLine];
    const openText = state.src.slice(lineStart, lineEnd);
    const openMatch = openText.match(OPEN_RE);
    if (!openMatch) return false;

    // 找闭合行
    let endLine = startLine + 1;
    let foundClose = false;
    while (endLine < state.lineMax) {
      const s = state.bMarks[endLine] + state.tShift[endLine];
      const e = state.eMarks[endLine];
      if (CLOSE_RE.test(state.src.slice(s, e))) {
        foundClose = true;
        break;
      }
      endLine++;
    }
    // 未闭合：按普通文本保留（return false 让下一个 rule 处理）
    if (!foundClose) return false;

    const attrsRaw = openMatch[1] ?? "{}";
    const attrs = parseCalloutAttrs(attrsRaw);
    // 未指定 type 时给 info（蓝色）而非 neutral（灰白），与 render.ts renderCallout 一致，
    // 避免 AI 生成的 callout 全是白色底；只有 type 是非法字符串时才降级 neutral。
    const type = attrs.type ? (VALID_TYPES.has(attrs.type) ? attrs.type : FALLBACK) : "info";
    const title = attrs.title ?? "";
    const icon = attrs.icon ?? "";
    const textColor = attrs.textColor ?? "";
    const borderColor = attrs.borderColor ?? "";
    const fillColor = attrs.fillColor ?? "";

    const bodyStartLine = startLine + 1;
    const bodyEndLine = endLine; // 不含闭合行
    // body 内 Markdown 仍渲染（render.ts renderCallout: body 经 marked.parse）
    const bodySrc = state.getLines(bodyStartLine, bodyEndLine, state.blkIndent, false);
    const bodyHtml = md.render(bodySrc);

    const token = state.push("html_block", "div", 0);
    token.content =
      '<aside class="callout callout-' +
      type +
      '" data-callout="' +
      type +
      '" data-title="' +
      title +
      '" data-icon="' +
      icon +
      '" data-text-color="' +
      textColor +
      '" data-border-color="' +
      borderColor +
      '" data-fill-color="' +
      fillColor +
      '"><div class="callout-title"></div><div class="callout-content">' +
      bodyHtml +
      "</div></aside>";
    token.map = [startLine, endLine + 1];
    token.markup = ":::callout";

    state.line = endLine + 1;
    return true;
  });
}
