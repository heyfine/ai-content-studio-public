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
    // 色块容器含块级子内容 → 卡片化：第一色标 #1b2a4a→rgb(27,42,74) 成为 callout fill，
    // 近白字在浅卡上不可读 → 清除
    expect(out).toContain('data-fill-color="rgb(27, 42, 74)"');
    expect(out).not.toContain("rgb(255, 255, 255)");
  });
});

describe("inlineComputedStyles：被丢容器的样式下传", () => {
  it("单段引用容器（无块级子内容）：底色/左色条/对齐下传给生成的段落", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(22,38,63)" data-cs-border-left="4px solid rgb(74,134,232)"` +
        ` data-cs-text-align="center">会拿到父底色<span data-cs-background-color="rgb(255,255,255)">自己的浅蓝底优先</span></div>`,
    );
    // 无块级子内容 → 不卡片化，走裸文本包 p + 下传
    expect(out).not.toContain("data-callout");
    expect((out.match(/<p[^>]*background-color: rgb\(22, 38, 63\)/g) ?? []).length).toBe(1);
    expect(out).toContain("border-left: 4px solid rgb(74, 134, 232)");
    expect(out).toContain("text-align: center");
  });

  it("被丢容器的裸文本包成段落，文字色再包 span（PM 解析通道）", () => {
    const out = inline(`<div data-cs-color="rgb(157,184,220)">三个问题里有两个让你心里一虚</div>`);
    expect(out).toMatch(/<p[^>]*>[\s\S]*三个问题里有两个让你心里一虚/);
    // 色必须落在 span 上：Tiptap Color mark 只解析行内元素 style（块级 style color 被忽略）
    expect(out).toMatch(/<span[^>]*color: rgb\(157, 184, 220\)/);
  });

  it("嵌套容器：深色内块卡片化（fill 接管），外层白底不产噪声", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(255,255,255)"><div data-cs-background-color="rgb(22,38,63)">` +
        `<p>暗块文字</p></div><p>白卡正文</p></div>`,
    );
    // 内层深色块成为 callout 卡片（底色进 fill，逐段铺色被消灭）
    expect(out).toContain('data-callout="neutral"');
    expect(out).toContain('data-fill-color="rgb(22, 38, 63)"');
    // 纯白底全链不落
    expect(out).not.toContain("rgb(255, 255, 255)");
    expect((out.match(/data-callout/g) ?? []).length).toBe(1); // 仅内层一张卡
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

describe("Pass D：语义卡片化（色块容器 → 编辑器原生 callout）", () => {
  it("卡片容器转 callout：fill 取原底色、首个短句成标题、≤2 字徽章删除", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(22,38,63)">` +
        `<div data-cs-color="rgb(127,176,245)">BACKUP 自检清单</div>` +
        `<div data-cs-background-color="rgb(46,111,214)">1</div>` +
        `<ol><li>问题一</li></ol>` +
        `<div>三个问题里有两个让你心里一虚</div></div>`,
    );
    expect(out).toContain('data-callout="neutral"');
    expect(out).toContain('data-fill-color="rgb(22, 38, 63)"');
    expect(out).toContain('data-title="BACKUP 自检清单"');
    expect(out).not.toContain(">1<"); // 编号徽章作为装饰删除
    // 容器实色底移交 fill 属性（渲染端 color-mix 调浅），不再整块铺深色
    expect(out).not.toMatch(/style="[^"]*background-color: rgb\(22, 38, 63\)/);
  });

  it("卡片内继承性浅字清除，刻意强调色保留", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(22,38,63)">` +
        `<div data-cs-color="rgb(232,241,255)">浅字</div>` +
        `<p data-cs-color="rgb(217,71,43)">红色强调</p></div>`,
    );
    expect(out).toContain("data-callout");
    expect(out).not.toContain("rgb(232, 241, 255)"); // 近白字在浅卡上不可读 → 清除
    expect(out).toContain("rgb(217, 71, 43)"); // 刻意红保留
  });

  it("代码块容器不卡片化：底色与浅色代码字清除（编辑器代码块主题接管）", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(16,25,43)"><pre data-cs-color="rgb(184,224,255)">git clone …</pre></div>`,
    );
    expect(out).not.toContain("data-callout");
    expect(out).not.toMatch(/background-color: rgb\(16, 25, 43\)/);
    expect(out).not.toContain("rgb(184, 224, 255)");
  });

  it("含 h1 的封面豁免卡片：居中保留、白字与底色清除、emoji 徽章删除", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(27,42,74)" data-cs-text-align="center">` +
        `<div>🛡️</div>` +
        `<h1 data-cs-color="rgb(255,255,255)">你的备份</h1>` +
        `<p data-cs-color="rgb(197,216,240)">—— 聊聊 AutoBackup</p></div>`,
    );
    expect(out).not.toContain("data-callout");
    expect(out).not.toMatch(/background-color/);
    expect(out).not.toContain("rgb(255, 255, 255)");
    expect(out).not.toContain("rgb(197, 216, 240)");
    expect(out).toContain("<h1");
    expect(out).not.toContain("🛡️");
    expect(out.replace(/\s+/g, "")).toContain("text-align:center");
  });

  it("单段色块（无块级子内容）不卡片化：整段连续底色（无斑马纹）", () => {
    const out = inline(
      `<div data-cs-background-color="rgb(240,246,255)" data-cs-border-left="4px solid rgb(74,134,232)">而它真正的诚意在另一半</div>`,
    );
    expect(out).not.toContain("data-callout");
    expect(out).toMatch(/<p[^>]*background-color: rgb\(240, 246, 255\)/);
  });

  it("表格深色单元格上的白字不被误清除（暗底存活判定）", () => {
    const grid = 'data-cs-display="grid" data-cs-grid-template-columns="1fr 1fr"';
    const out = inline(
      `<div><div ${grid}><div data-cs-background-color="rgb(22,38,63)" data-cs-color="rgb(255,255,255)">场景</div>` +
        `<div data-cs-background-color="rgb(22,38,63)" data-cs-color="rgb(255,255,255)">手动</div></div>` +
        `<div ${grid}><div>A</div><div>B</div></div></div>`,
    );
    expect(out).toContain("<table");
    expect(out).toMatch(
      /<td[^>]*background-color: rgb\(22, 38, 63\)[^>]*>(?:(?!<\/td>)[\s\S])*color: rgb\(255, 255, 255\)/,
    );
  });
});
