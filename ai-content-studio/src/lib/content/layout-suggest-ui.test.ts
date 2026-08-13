import { describe, it, expect } from "vitest";
import { applyLayoutSuggestion, applyLayoutSuggestions } from "./layout-suggest-ui";
import type { LayoutSuggestion } from "./layout-suggest-types";
import { scanCalloutSegments } from "./render";

describe("buildLayoutReplacement / applyLayoutSuggestion", () => {
  it("callout：把原文片段包裹为高亮块", () => {
    const content = "前文\n这里需要注意数据安全\n后文";
    const s: LayoutSuggestion = {
      action: "callout",
      originalText: "这里需要注意数据安全",
      type: "warning",
      title: "注意",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain(':::callout{type="warning" title="注意"');
    expect(next).toContain("这里需要注意数据安全");
    expect(next).toContain(":::");
    // 原片段不再裸露
    expect(next).not.toMatch(/^前文\n这里需要注意数据安全\n后文$/);
  });

  it("callout：type 缺失时降级 neutral", () => {
    const content = "正文\n要点内容\n结尾";
    const s: LayoutSuggestion = {
      action: "callout",
      originalText: "要点内容",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain('type="neutral"');
  });

  it("split：用 newText 拆分长段落", () => {
    const content = "第一句。第二句。\n第三句。";
    const s: LayoutSuggestion = {
      action: "split",
      originalText: "第一句。第二句。",
      newText: "第一句。\n\n第二句。",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("第一句。\n\n第二句。");
    expect(next).toContain("第三句。");
  });

  it("bold：无 newText 时整段加粗", () => {
    const content = "正文\n核心观点很重要\n结尾";
    const s: LayoutSuggestion = {
      action: "bold",
      originalText: "核心观点很重要",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("**核心观点很重要**");
  });

  it("bold：提供 newText 时用 AI 版本（仅加粗关键词）", () => {
    const content = "正文\n建议启用两步验证\n结尾";
    const s: LayoutSuggestion = {
      action: "bold",
      originalText: "建议启用两步验证",
      newText: "建议启用**两步验证**",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("建议启用**两步验证**");
    expect(next).not.toContain("建议启用两步验证\n结尾".split("\n")[0]);
  });

  it("heading：默认层级 2", () => {
    const content = "正文\n为什么需要 RLS\n结尾";
    const s: LayoutSuggestion = {
      action: "heading",
      originalText: "为什么需要 RLS",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("## 为什么需要 RLS");
  });

  it("heading：指定 headingLevel=3", () => {
    const content = "正文\n一个容易忽略的问题\n结尾";
    const s: LayoutSuggestion = {
      action: "heading",
      originalText: "一个容易忽略的问题",
      headingLevel: 3,
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("### 一个容易忽略的问题");
  });

  it("quote：多行内容每行加 > 前缀", () => {
    const content = "前文\n引用第一行\n引用第二行\n后文";
    const s: LayoutSuggestion = {
      action: "quote",
      originalText: "引用第一行\n引用第二行",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("> 引用第一行\n> 引用第二行");
  });

  it("list：用 newText 转列表", () => {
    const content = "要点：A、B、C";
    const s: LayoutSuggestion = {
      action: "list",
      originalText: "要点：A、B、C",
      newText: "要点：\n- A\n- B\n- C",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("- A\n- B\n- C");
  });

  it("remove_callout：把高亮块拆回普通正文", () => {
    const content =
      '前文\n:::callout{type="info" title="信息" icon="ℹ️"}\n这里内容不够重要\n:::\n后文';
    const s: LayoutSuggestion = {
      action: "remove_callout",
      originalText: "这里内容不够重要",
      reason: "",
    };
    const next = applyLayoutSuggestion(content, s);
    expect(next).toContain("这里内容不够重要");
    expect(next).not.toContain(":::callout");
    // 不再有 callout 段
    expect(scanCalloutSegments(next).filter((seg) => seg.kind === "callout")).toHaveLength(0);
  });

  it("找不到原文时原样返回", () => {
    const s: LayoutSuggestion = {
      action: "bold",
      originalText: "不存在的片段",
      reason: "",
    };
    expect(applyLayoutSuggestion("完全无关的内容", s)).toBe("完全无关的内容");
  });

  it("remove_callout 找不到对应高亮块时原样返回", () => {
    const s: LayoutSuggestion = {
      action: "remove_callout",
      originalText: "不存在",
      reason: "",
    };
    const content = ':::callout{type="info" title="信息" icon="ℹ️"}\n实际内容\n:::';
    expect(applyLayoutSuggestion(content, s)).toBe(content);
  });
});

describe("applyLayoutSuggestions", () => {
  it("多条建议逆序应用互不干扰", () => {
    const content = "第一处需要强调\n中间普通内容\n第二处需要提醒\n结尾";
    const s1: LayoutSuggestion = {
      action: "bold",
      originalText: "第一处需要强调",
      reason: "",
    };
    const s2: LayoutSuggestion = {
      action: "callout",
      originalText: "第二处需要提醒",
      type: "note",
      title: "提醒",
      reason: "",
    };
    const next = applyLayoutSuggestions(content, [s1, s2]);
    expect(next).toContain("**第一处需要强调**");
    expect(next).toContain(':::callout{type="note" title="提醒"');
    expect(next).toContain("中间普通内容");
  });

  it("定位失败的建议被跳过，不报错", () => {
    const content = "只有这段";
    const bad: LayoutSuggestion = {
      action: "bold",
      originalText: "找不到的内容",
      reason: "",
    };
    expect(applyLayoutSuggestions(content, [bad])).toBe(content);
  });

  it("同区间的重复建议只应用一条", () => {
    const content = "需要加粗的重点";
    const s: LayoutSuggestion = {
      action: "bold",
      originalText: "需要加粗的重点",
      reason: "",
    };
    const next = applyLayoutSuggestions(content, [s, { ...s }]);
    expect(next).toBe("**需要加粗的重点**");
  });

  it("应用后仍可被 scanCalloutSegments 正确解析（callout 与正文交替）", () => {
    const content = "前文\n这里需要注意\n中间普通内容\n这里是技巧\n后文";
    const suggestions: LayoutSuggestion[] = [
      {
        action: "callout",
        originalText: "这里需要注意",
        type: "warning",
        title: "注意",
        reason: "",
      },
      {
        action: "callout",
        originalText: "这里是技巧",
        type: "tip",
        title: "推荐",
        reason: "",
      },
    ];
    const next = applyLayoutSuggestions(content, suggestions);
    const segs = scanCalloutSegments(next);
    expect(segs.filter((seg) => seg.kind === "callout")).toHaveLength(2);
    const textSegs = segs.filter((seg) => seg.kind === "text").map((seg) => seg.value);
    expect(textSegs.join("|")).toContain("前文");
    expect(textSegs.join("|")).toContain("中间普通内容");
    expect(textSegs.join("|")).toContain("后文");
  });
});
