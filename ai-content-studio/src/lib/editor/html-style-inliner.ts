/**
 * HTML 样式内联计算器：把「class / <style> 外链样式」的文档变成「内联样式」文档，
 * 让 HTML 源码转换的保真度与浏览器渲染一致（Chrome 富文本复制同款思路）。
 *
 * 原理：真实渲染成本文档（隐藏 iframe srcdoc，浏览器级联引擎完整可用），逐元素
 * getComputedStyle 取关键视觉属性，**与父元素计算值不同才内联**（避免继承噪声），
 * 再交回既有粘贴管道（ProseMirror 已验证能解析内联 font-weight/style color/
 * background-color/text-align/text-decoration/padding-left）。
 *
 * 针对「ProseMirror 会拍平未知容器（div/section…）」做三步补救：
 * - 被丢容器的 color/background-color/border-left/text-align 下传给后代文字块
 * - 被丢容器的裸文本包成 <p>（样式随之下传）
 * - display:grid 版式（对比表行）识别重建为 <table><tr><td>，单元格底色走已修好的
 *   TableCellBackground 通道
 * 细节对策：transparent/低透明度 rgba 不落（避免隐形色）；渐变背景取第一色标作纯色
 * 底（保住深底白字，如封面区）；a 链接自带底色时内容包 span（mark 通道不吃 a 的
 * style）；::before 字面内容（如 ✓ 前缀）转真实文本（counter()/none 跳过）。
 */

export type StyleValueGetter = (
  el: Element,
  pseudoElt?: string,
) => { getPropertyValue(prop: string): string };

/** ProseMirror 无对应节点、解析时被拍平的通用容器（li 列入：裸文本需包 p 承载底色/色） */
const DROP_SELECTOR = "div, section, article, header, footer, main, aside, figure, li";
/** 样式下传的接收者：解析后仍能存活并携带块级 style 的文字块 */
const TEXT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, figcaption";

const STYLE_PROPS = ["color", "font-weight", "font-style", "text-align", "border-left"] as const;

/** 块级标签（PM 会拍平或作为块节点；其 style color 不被 textStyle mark 解析） */
const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "TD",
  "TH",
  "BLOCKQUOTE",
  "PRE",
  "DIV",
  "SECTION",
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "MAIN",
  "ASIDE",
  "FIGURE",
  "FIGCAPTION",
  "UL",
  "OL",
]);
/** 直接承载文字的块：色差用 span 包裹承载（PM 解析行内 style color 成 textStyle mark） */
const TEXT_BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "TD",
  "TH",
  "BLOCKQUOTE",
  "PRE",
  "FIGCAPTION",
]);

/** 把文字块的行内内容包进带 color（可带 bg）的 span；有块级子节点则递归包叶子 */
function wrapTextWithSpan(el: Element, color: string, bg?: string): void {
  const blockKids = Array.from(el.children).filter((c) => BLOCK_TAGS.has(c.tagName));
  if (blockKids.length === 0) {
    if (!el.firstChild) return;
    const span = el.ownerDocument.createElement("span");
    span.style.setProperty("color", color);
    if (bg) span.style.setProperty("background-color", bg);
    while (el.firstChild) span.appendChild(el.firstChild);
    el.appendChild(span);
    return;
  }
  for (const child of blockKids) wrapTextWithSpan(child, color, bg);
}

/** 行内元素自身的 rgba 底被否掉时，取其所在有效底（父链快照），防浅色字落白底 */
function keepInlineChip(el: Element, parent: ComputedSnapshot): void {
  const hs = el as HTMLElement;
  if (BLOCK_TAGS.has(el.tagName) || hs.style.backgroundColor) return;
  if (!hs.style.color || !isUsableBackground(parent.background)) return;
  const span = el.ownerDocument.createElement("span");
  span.style.backgroundColor = parent.background;
  while (el.firstChild) span.appendChild(el.firstChild);
  el.appendChild(span);
}

/** 与父元素比较后需要落地的属性集合（bg/decoration 有特殊分支） */
interface ComputedSnapshot {
  color: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  background: string;
  decoration: string;
  borderLeft: string;
}

const EMPTY_SNAPSHOT: ComputedSnapshot = {
  color: "",
  fontWeight: "",
  fontStyle: "",
  textAlign: "",
  background: "",
  decoration: "",
  borderLeft: "",
};

function isUsableBackground(v: string): boolean {
  const lower = v.trim().toLowerCase();
  if (!lower || lower === "transparent") return false;
  // 纯白底不落：编辑器画布本就是白，白块底只会在 Markdown 里制造噪声
  if (
    lower === "#fff" ||
    lower === "#ffffff" ||
    /^rgba?\(\s*255,\s*255,\s*255\s*(,\s*1(\.0+)?)?\s*\)$/.test(lower)
  ) {
    return false;
  }
  const rgba = lower.match(/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/);
  if (rgba) return Number.parseFloat(rgba[1]) >= 0.5;
  return true;
}

/** linear/radial-gradient(… #1b2a4a 0%, …) → 第一个颜色字面量 */
function firstGradientColor(image: string): string | null {
  if (!/gradient\(/i.test(image)) return null;
  const m = image.match(/(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/i);
  return m ? m[1] : null;
}

function hasDirectText(el: Element): boolean {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3 && child.textContent && child.textContent.trim() !== "") return true;
  }
  return false;
}

function hasBlockChild(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (child.matches("p, h1, h2, h3, h4, h5, h6, ul, ol, li, div, table, blockquote, pre")) {
      return true;
    }
  }
  return false;
}

function gridTrackCount(value: string): number {
  const v = value.trim();
  if (!v || v === "none") return 0;
  return v.split(/\s+(?![^(]*\))/).filter(Boolean).length;
}

/** 纯逻辑核心：在已渲染的 document 上做样式内联，返回 body 序列化 HTML */
export function inlineComputedStyles(doc: Document, getStyle: StyleValueGetter): string {
  const body = doc.body;
  if (!body) return "";

  walk(body, { ...EMPTY_SNAPSHOT }, getStyle);
  convertGridRowsToTables(body, getStyle);
  fixDroppedContainers(body);
  return body.innerHTML;
}

/** Pass A：自顶向下差分内联（只写与父计算值不同的属性，抑制继承噪声） */
function walk(el: HTMLElement, parent: ComputedSnapshot, getStyle: StyleValueGetter): void {
  const cs = getStyle(el);
  const own: ComputedSnapshot = { ...parent };
  // 块级包色会移动子节点（包进 span），先抓引用再递归，孙辈不被跳过
  const childEls = Array.from(el.children) as HTMLElement[];

  for (const prop of STYLE_PROPS) {
    const v = cs.getPropertyValue(prop);
    if (!v || v === "none" || v === "normal") continue;
    const key: keyof ComputedSnapshot =
      prop === "font-weight"
        ? "fontWeight"
        : prop === "font-style"
          ? "fontStyle"
          : prop === "text-align"
            ? "textAlign"
            : prop === "border-left"
              ? "borderLeft"
              : "color";
    if (v !== parent[key]) {
      if (prop === "color" && TEXT_BLOCK_TAGS.has(el.tagName)) {
        // 文字块的色：PM 不认块元素 style color（探针验证），包 span 承载
        el.style.setProperty(prop, v);
        wrapTextWithSpan(el, v);
      } else {
        // 容器等：值留槽位，由 Pass C 下传时对文字块执行同样的包裹
        el.style.setProperty(prop, v);
      }
      own[key] = v;
    }
  }

  const bg = cs.getPropertyValue("background-color");
  if (isUsableBackground(bg) && bg !== parent.background) {
    el.style.backgroundColor = bg;
    own.background = bg;
  } else if (!isUsableBackground(bg)) {
    const stop = firstGradientColor(cs.getPropertyValue("background-image"));
    if (stop && stop !== parent.background) {
      el.style.backgroundColor = stop;
      own.background = stop;
    }
  }

  const deco = cs.getPropertyValue("text-decoration-line");
  if (deco === "underline" && parent.decoration !== "underline") {
    el.style.textDecoration = "underline";
    own.decoration = "underline";
  } else if (deco === "none" && parent.decoration === "underline") {
    el.style.textDecoration = "none";
    own.decoration = "";
  }

  // ::before 字面内容（"✓" 类前缀）转真实文本；counter()/url()/none 跳过
  const before = getStyle(el, "::before").getPropertyValue("content");
  const literal = before.match(/^"([^"]+)"$/);
  if (literal?.[1]) {
    el.prepend(docText(el.ownerDocument, `${literal[1]} `));
  }

  // 自带/继承有效底色的链接：内容包 span（link 是 mark，a 的 style 不进 schema，
  // 深底白字的按钮链接不包会变成白字落白底）；继承底来自 Pass A 的 own 快照
  const linkBg = el.style.backgroundColor || own.background;
  if (el.tagName === "A" && linkBg && isUsableBackground(linkBg)) {
    const span = el.ownerDocument.createElement("span");
    span.style.backgroundColor = linkBg;
    const linkColor = el.style.color || own.color;
    if (linkColor) span.style.color = linkColor;
    while (el.firstChild) span.appendChild(el.firstChild);
    el.appendChild(span);
    el.style.removeProperty("background-color");
    el.style.removeProperty("color");
  }

  // 行内文字（span/em/strong…）：色差已落 style，若所在有效底非白（色块上的浅色字），
  // 自身底又被 rgba 低透明度否决 → 给内容补包承载底色的 span（防浅字落白底）
  if (el.tagName !== "A" && !BLOCK_TAGS.has(el.tagName)) {
    keepInlineChip(el, parent);
  }

  // Pass A 包色移动过子节点，用先前抓的引用递归
  for (const child of childEls) {
    walk(child, own, getStyle);
  }
}

function docText(doc: Document | null, text: string): Text {
  if (!doc) return { textContent: text } as Text;
  return doc.createTextNode(text);
}

/** Pass B：连续同构 display:grid 行（对比表版式）→ 真 table */
function convertGridRowsToTables(root: Element, getStyle: StyleValueGetter): void {
  const containers = Array.from(root.querySelectorAll<HTMLElement>("*"));
  for (const el of containers) {
    const rows = Array.from(el.children).filter((child) => {
      const cs = getStyle(child);
      return (
        cs.getPropertyValue("display") === "grid" &&
        gridTrackCount(cs.getPropertyValue("grid-template-columns")) >= 2
      );
    });
    if (rows.length < 2 || rows.length !== el.children.length) continue;
    const cols = new Set<number>();
    for (const row of rows) {
      cols.add(row.children.length);
      if (row.children.length < 2) cols.add(-1);
    }
    if (cols.size !== 1 || cols.has(-1)) continue;

    const doc = el.ownerDocument;
    const table = doc.createElement("table");
    const tbody = doc.createElement("tbody");
    for (const row of rows) {
      const tr = doc.createElement("tr");
      for (const cell of Array.from(row.children)) {
        const td = doc.createElement("td");
        const cellStyle = cell.getAttribute("style");
        if (cellStyle) td.setAttribute("style", cellStyle);
        while (cell.firstChild) td.appendChild(cell.firstChild);
        // Pass A 时格还是 div（容器分支不包色），转成 td 后就地补包：
        // PM 对块级 style color 一律忽略，格内文字色必须落在 span 上
        const cellColor = td.style.color;
        if (cellColor && cellColor !== "inherit") {
          td.style.removeProperty("color");
          wrapTextWithSpan(td, cellColor);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    el.replaceWith(table);
  }
}

/** Pass C：被 ProseMirror 拍平的容器——裸文本包段 + 块级样式下传到文字块 */
function fixDroppedContainers(root: Element): void {
  // 由内向外处理（DOM 序反转）：嵌套容器时内层底色先落位，外层不覆盖——
  // 否则 .article 白卡片的白底会先抢占全文段落，深色区块（qa/封面）落空
  const drops = Array.from(root.querySelectorAll<HTMLElement>(DROP_SELECTOR)).reverse();
  for (const el of drops) {
    if (!el.parentNode) continue; // 已随上层转换移除
    // 裸文本容器 → 整体包成段落（否则文本被 PM 提为匿名段后样式尽失）
    if (hasDirectText(el) && !hasBlockChild(el)) {
      const p = el.ownerDocument.createElement("p");
      while (el.firstChild) p.appendChild(el.firstChild);
      el.appendChild(p);
    }
    for (const prop of ["color", "background-color", "border-left", "text-align"]) {
      const value = el.style.getPropertyValue(prop);
      if (!value) continue;
      for (const block of Array.from(el.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR))) {
        if (block.style.getPropertyValue(prop)) continue; // 自身色差优先（Pass A 已落）
        if (prop === "color") {
          // 容器色下传：文字块要包 span 才进得了 textStyle mark（容器递归到文字块）
          wrapTextWithSpan(block, value);
          block.style.setProperty(prop, value);
        } else {
          block.style.setProperty(prop, value);
        }
      }
    }
  }
}

/**
 * 浏览器胶水：srcdoc 隐藏 iframe 真实渲染 → 交回调读取渲染后的 document →
 * 自动清理。无 DOM 环境/超时/失败均 reject，由调用方回退原文（行为等同 v1）。
 */
export function withRenderedDocument<T>(
  html: string,
  fn: (doc: Document, view: Window) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("no-dom"));
      return;
    }
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText =
      "position:fixed;left:-99999px;top:0;width:780px;height:1200px;visibility:hidden;border:0;";
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      run();
      frame.remove();
    };
    const timer = window.setTimeout(() => finish(() => reject(new Error("render-timeout"))), 3000);
    frame.onload = () => {
      try {
        const inner = frame.contentDocument;
        const view = frame.contentWindow;
        if (!inner?.body || !view?.getComputedStyle) throw new Error("no-rendered-doc");
        const value = fn(inner, view);
        finish(() => resolve(value));
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error(String(e))));
      }
    };
    frame.onerror = () => finish(() => reject(new Error("render-error")));
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/** 渲染文档并内联样式（withRenderedDocument + inlineComputedStyles 的组合） */
export function inlineHtmlStyles(html: string): Promise<string> {
  return withRenderedDocument(html, (doc, view) =>
    inlineComputedStyles(doc, (el, pseudo) => view.getComputedStyle(el, pseudo ?? null)),
  );
}
