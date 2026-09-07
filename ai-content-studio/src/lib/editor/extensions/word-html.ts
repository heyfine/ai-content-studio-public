/**
 * Word 粘贴 HTML 规范化：把 Word 生成的内联样式 HTML 翻译成编辑器 schema
 * 认识的语义标签，避免粘贴后标题/加粗/颜色/对齐全变普通段落。
 *
 * Word 的粘贴 HTML 特征（实测）：
 * - 内容包在 <div class=WordSection1> 里，标题不是 <h1>~<h6>，
 *   而是 <p style="font-size:22.0pt;font-weight:bold">
 * - 对齐是 <p style="text-align:center">（Tiptap TextAlign 直接解析，保留即可）
 * - 颜色是 <span style='color:#2E74B5'>（Tiptap TextStyle+Color mark 解析，保留即可）
 * - 加粗是 <span style='font-weight:bold'>（ProseMirror 只认 <strong>/<b> 标签，
 *   span 内联样式会被丢弃 → 必须翻译成语义标签）
 * - 大量 <o:p>、mso-* 样式、空段落占位
 *
 * 策略：只翻译「影响语义的样式」（标题层级/加粗/斜体），印刷细节（字体/行距/缩进）
 * 交由编辑器统一排版，与 ARTICLE-EDITOR-AND-TYPOGRAPHY-SPEC「语义化排版」一致。
 */

/** 粗体检测：font-weight bold/600+ 或 b/strong 标签 */
function isBoldWeight(weight: string): boolean {
  const w = weight.toLowerCase();
  if (w === "bold" || w === "bolder") return true;
  const n = Number.parseInt(w, 10);
  return Number.isFinite(n) && n >= 600;
}

/** Word 字号（22.0pt / 18px）转 pt 数值；解析失败返回 0 */
function toPt(size: string): number {
  const m = size.match(/([\d.]+)\s*(pt|px)/i);
  if (!m) return 0;
  const n = Number.parseFloat(m[1]);
  return m[2].toLowerCase() === "px" ? n * 0.75 : n;
}

/**
 * 判定 Word 段落样式对应的标题层级（0 = 普通段落）。
 * 中文 Word 默认字号体系：标题1=22pt、标题2=16pt、标题3=15pt、标题4=14pt、正文=10.5pt(五号)。
 * 判据 = 加粗（内联样式或 b/strong 标签）+ 字号阶梯。
 */
function headingLevel(
  styles: CSSStyleDeclaration[],
  className: string,
  hasBoldTag = false,
): number {
  const m = className.match(/mso-heading(\d)/i);
  if (m) return Number.parseInt(m[1], 10);
  let size = 0;
  let bold = hasBoldTag;
  for (const s of styles) {
    const sz = toPt(s.fontSize ?? "");
    if (sz > size) size = sz;
    if (isBoldWeight(s.fontWeight ?? "")) bold = true;
  }
  if (bold && size >= 20) return 1;
  if (bold && size >= 15.5) return 2;
  if (bold && size >= 13.5) return 3;
  if (bold && size >= 12.5) return 4;
  return 0;
}

/** 判断是否 Word 粘贴 HTML（含 Word 命名空间或 mso 标记） */
export function isWordHtml(html: string): boolean {
  return /xmlns:o="urn:schemas-microsoft-com|class="?Mso|<o:p>|mso-|<!--\[if/i.test(html);
}

/** Word 粘贴 HTML → 编辑器友好 HTML（DOM 变换式） */
export function normalizeWordHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return html;

  // 1. 删除 Word 私有节点与注释
  for (const el of Array.from(body.querySelectorAll("style, script, o\\:p, meta, link"))) {
    el.remove();
  }

  // 2. unwrap 分节 div（WordSection 等无排版语义）
  for (const div of Array.from(body.querySelectorAll("div"))) {
    const align = div.style.textAlign;
    if (align && align !== "left") {
      for (const p of Array.from(
        div.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6"),
      )) {
        if (!p.style.textAlign) p.style.textAlign = align;
      }
    }
    div.replaceWith(...Array.from(div.childNodes));
  }

  // 3. 块级段落判级 → h1/h2/h3（必须在 span 语义化之前：判级要读 span 的原始内联样式）
  for (const block of Array.from(body.querySelectorAll("p"))) {
    const styles: CSSStyleDeclaration[] = [block.style];
    for (const span of Array.from(block.querySelectorAll("span"))) {
      styles.push(span.style);
    }
    // <b>/<strong> 标签也算加粗判据（部分 Word 版本直接输出 b 标签）
    const hasBoldTag = block.querySelector("b, strong") !== null;
    const level = headingLevel(styles, block.className || "", hasBoldTag);
    const align = block.style.textAlign;
    if (level > 0) {
      const h = doc.createElement(`h${Math.min(level, 6)}`);
      if (align && align !== "left") h.style.textAlign = align;
      while (block.firstChild) h.appendChild(block.firstChild);
      block.replaceWith(h);
    } else {
      block.removeAttribute("style");
      block.removeAttribute("class");
      if (align && align !== "left") block.style.textAlign = align;
    }
  }

  // 4. span 语义化：bold → strong、italic → em；style 只保留 color/background
  for (const span of Array.from(body.querySelectorAll("span"))) {
    const style = span.style;
    const bold = isBoldWeight(style.fontWeight ?? "");
    const italic = style.fontStyle === "italic";
    const color = style.color;
    const bg = style.backgroundColor;
    if (bold || italic) {
      let holder: HTMLElement = doc.createElement(bold ? "strong" : "em");
      while (span.firstChild) holder.appendChild(span.firstChild);
      if (bold && italic) {
        const em = doc.createElement("em");
        holder.appendChild(em);
        holder = em;
      }
      span.appendChild(holder);
    }
    // 清样式：只留颜色相关（Color mark 从 style 解析）
    const keep: string[] = [];
    if (color) keep.push(`color:${color}`);
    if (bg && bg !== "transparent") keep.push(`background-color:${bg}`);
    span.removeAttribute("style");
    span.removeAttribute("class");
    if (keep.length > 0) span.setAttribute("style", keep.join(";"));
    // 变成空壳的 span 移除
    if (!span.firstChild) span.remove();
  }

  // 5. 删除空段落（Word 用空段占位行距；无图片且无文本的都算空）
  for (const block of Array.from(body.querySelectorAll("p"))) {
    if (!block.querySelector("img") && (block.textContent ?? "").trim() === "") {
      block.remove();
    }
  }

  // 6. 清掉容器残余 mso 样式与 class（MsoNormal 等编辑器用不到）
  for (const el of Array.from(body.querySelectorAll("[class]"))) {
    el.removeAttribute("class");
  }
  for (const el of Array.from(
    body.querySelectorAll("ul, ol, li, table, thead, tbody, tr, td, th, h1, h2, h3, h4, h5, h6"),
  )) {
    const style = (el.getAttribute("style") ?? "").toLowerCase();
    if (style.includes("mso-")) el.removeAttribute("style");
  }

  return body.innerHTML;
}
