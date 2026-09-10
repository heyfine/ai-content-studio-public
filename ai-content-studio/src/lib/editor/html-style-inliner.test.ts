import { describe, expect, it } from "vitest";
import { inlineComputedStyles } from "./html-style-inliner";

/** 假 getStyle：样式值来自元素 data-cs-* 属性（::before 用 data-csb-*） */
function fakeGetStyle(el: Element, pseudo?: string) {
  const prefix = pseudo ? "data-csb-" : "data-cs-";
  return {
    getPropertyValue: (prop: string) => el.getAttribute(`${prefix}${prop}`)?.trim() ?? "",
  };
}

function inline(bodyHtml: string): string {
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  // 剔除 fixture 属性（data-cs-*），只看真实产出
  return inlineComputedStyles(doc, fakeGetStyle).replace(/ data-csb?-[^=]*="[^"]*"/g, "");
}

describe("inlineComputedStyles：差分内联", () => {
  it("文字色与父不同才写入；被丢容器色差下传到后代段落（重建视觉）", () => {
    const out = inline(
      `<div data-cs-color="rgb(51,51,51)"><p>正文</p>` +
        `<p><span data-cs-color="rgb(217,71,43)">红</span></p></div>`,
    );
    // div 的色差被重挂到两个 p（div 本身解析时会被 ProseMirror 拍平）
    expect((out.match(/<p[^>]*color: rgb\(51, 51, 51\)/g) ?? []).length).toBe(2);
    expect(out).toContain("color: rgb(217, 71, 43)");
    // 红色 span 不被下传覆盖
    expect(out).toMatch(/<span[^>]*color: rgb\(217, 71, 43\)/);
  });

  it("font-weight 700 内联到元素自身（h3 与 span 均生效）", () => {
    const out = inline(
      `<div data-cs-font-weight="400"><h3 data-cs-font-weight="700">小节</h3>` +
        `<p><span data-cs-font-weight="700">粗</span>普通</p></div>`,
    );
    expect(out).toMatch(/<h3[^>]*font-weight: 700/);
    expect(out).toMatch(/<span[^>]*font-weight: 700/);
    expect(out).not.toMatch(/<p[^>]*font-weight/);
  });

  it("下划线用 text-decoration 简写输出（line 版 ProseMirror 不识别）", () => {
    const out = inline(`<p><span data-cs-text-decoration-line="underline">划</span></p>`);
    expect(out).toContain("text-decoration: underline");
  });

  it("transparent 与低透明度 rgba 背景不落（避免隐形色块）", () => {
    const out = inline(
      `<p><span data-cs-background-color="transparent">甲</span>` +
        `<span data-cs-background-color="rgba(255,255,255,0.16)">乙</span></p>`,
    );
    expect(out).not.toContain("background-color");
  });

  it("渐变背景取第一色标作纯色底（保住白字可读性；cssstyle 会把 hex 规范化为 rgb）", () => {
    const out = inline(
      `<div data-cs-background-color="rgba(0, 0, 0, 0)"` +
        ` data-cs-background-image="linear-gradient(135deg, #1b2a4a 0%, #2e4a7d 45%)">` +
        `<p data-cs-color="rgb(255,255,255)">封面标题</p></div>`,
    );
    // 第一色标 #1b2a4a → rgb(27, 42, 74)：容器拿到，白字段落下传
    expect(out).toContain("background-color: rgb(27, 42, 74)");
    expect(out).toMatch(
      /<p[^>]*color: rgb\(255, 255, 255\)[^>]*background-color: rgb\(27, 42, 74\)|<p[^>]*background-color: rgb\(27, 42, 74\)[^>]*color/,
    );
  });
});

describe("inlineComputedStyles：被丢容器的样式下传", () => {
  it("div 底色/左色条/对齐下传给后代文字块（已有值不覆盖）", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(22,38,63)" data-cs-border-left="4px solid rgb(74,134,232)"` +
        ` data-cs-text-align="center">` +
        `<p>会拿到父底色</p><p data-cs-background-color="rgb(240,248,255)">自己的浅蓝底优先</p></div>`,
    );
    // 恰好一个 p 拿到容器底色，另一个保持自身色（白底断言见嵌套用例）
    expect((out.match(/<p[^>]*background-color: rgb\(22, 38, 63\)/g) ?? []).length).toBe(1);
    expect((out.match(/<p[^>]*background-color: rgb\(240, 248, 255\)/g) ?? []).length).toBe(1);
    expect((out.match(/<p[^>]*border-left: 4px solid rgb\(74, 134, 232\)/g) ?? []).length).toBe(2);
    expect((out.match(/<p[^>]*text-align: center/g) ?? []).length).toBe(2);
  });

  it("被丢容器的裸文本包成段落，文字色再包 span（PM 解析通道）", () => {
    const out = inline(`<div data-cs-color="rgb(232,241,255)">三个问题里有两个让你心里一虚</div>`);
    expect(out).toMatch(/<p[^>]*>[\s\S]*三个问题里有两个让你心里一虚/);
    // 色必须落在 span 上：Tiptap Color mark 只解析行内元素 style（块级 style color 被忽略）
    expect(out).toMatch(/<span[^>]*color: rgb\(232, 241, 255\)/);
  });

  it("嵌套容器由内向外下传：深色内块不被外层白卡片抢占，纯白底不落", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(255,255,255)"><div data-cs-background-color="rgb(22,38,63)">` +
        `<p>暗块文字</p></div><p>白卡正文</p></div>`,
    );
    // 内层 p 拿到深色底；外层白底直接不落（编辑器画布本就白）
    expect(out).toMatch(/<p[^>]*background-color: rgb\(22, 38, 63\)/);
    expect(out).not.toContain("rgb(255, 255, 255)");
  });

  it("::before 字面内容前插（counter/none 跳过）", () => {
    const out = inline(
      `<ul><li data-csb-content='"✓"' data-csb-color="rgb(46,111,214)">适合人群甲</li>` +
        `<li data-csb-content="counter(q)">编号项</li><li data-csb-content="none">普通项</li></ul>`,
    );
    expect(out).toContain("✓");
    expect(out).not.toContain("counter");
  });
});

describe("inlineComputedStyles：grid 版式转表格", () => {
  const GRID_ATTRS = 'data-cs-display="grid" data-cs-grid-template-columns="1fr 1fr 1fr"';
  it("连续同构 grid 行 → table/tr/td，单元格保留自身内联底色", () => {
    const out = inline(
      `<div class="cmp">` +
        `<div ${GRID_ATTRS}><div data-cs-background-color="rgb(22,38,63)">场景</div>` +
        `<div data-cs-background-color="rgb(22,38,63)">手动</div>` +
        `<div data-cs-background-color="rgb(46,111,214)">AutoBackup</div></div>` +
        `<div ${GRID_ATTRS}><div>数据库</div><div class="bad" data-cs-color="rgb(183,64,42)">手动加行</div>` +
        `<div class="good" data-cs-color="rgb(27,122,82)">自动检测</div></div>` +
        `</div>`,
    );
    expect(out).toContain("<table");
    expect((out.match(/<tr>/g) ?? []).length).toBe(2);
    expect((out.match(/<td/g) ?? []).length).toBe(6);
    expect(out).toContain("background-color: rgb(46, 111, 214)");
    // 格内文字色必须包在 span 上（td 块级 style color 被 PM 忽略）
    expect(out).toMatch(/<td[^>]*>(?:(?!<\/td>)[\s\S])*<span[^>]*color: rgb\(183, 64, 42\)/);
    // td 自身 style 里不应残留 color（只留 background-color 等块级通道属性）
    const tdColorLeaks = Array.from(out.matchAll(/<td[^>]*style="([^"]*)"/g)).filter((m) =>
      /(^|;)\s*color\s*:/.test(m[1] ?? ""),
    );
    expect(tdColorLeaks).toHaveLength(0);
  });

  it("非网格结构不误转", () => {
    const out = inline(`<div><p>一</p><p>二</p></div>`);
    expect(out).not.toContain("<table");
  });
});

it("a 链接自带底色：内容包 span（防白字落白底）", () => {
  const out = inline(
    `<div data-cs-background-color="rgb(46,111,214)"><a href="https://x.com" ` +
      `data-cs-background-color="rgb(46,111,214)" data-cs-color="rgb(255,255,255)">GitHub 仓库</a></div>`,
  );
  // span 承接底色+白字，链标记不受影响
  expect(out).toMatch(/<a[^>]*><span[^>]*background-color: rgb\(46, 111, 214\)/);
});
