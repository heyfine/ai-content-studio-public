import { describe, it, expect } from "vitest";
import {
  findOriginalTextRange,
  acceptSuggestion,
  type CalloutSuggestion,
} from "./callout-suggest-ui";

describe("findOriginalTextRange", () => {
  it("精确匹配原文片段", () => {
    const content = "这是普通正文。\n这里是警告内容。\n后续正文。";
    const range = findOriginalTextRange(content, "这里是警告内容。");
    expect(range).not.toBeNull();
    expect(content.slice(range!.start, range!.end)).toBe("这里是警告内容。");
  });

  it("trim 容错：前后空白不影响匹配", () => {
    const content = "正文\n  需要匹配的段落  \n后续";
    const range = findOriginalTextRange(content, "  需要匹配的段落  ");
    expect(range).not.toBeNull();
  });

  it("空白通配：片段中连续空白匹配正文中任意空白", () => {
    const content = "第一段\n第二段   有多余空格\n第三段";
    const range = findOriginalTextRange(content, "第二段 有多余空格");
    expect(range).not.toBeNull();
  });

  it("找不到时返回 null", () => {
    expect(findOriginalTextRange("正文", "不存在的片段")).toBeNull();
  });

  it("空片段返回 null", () => {
    expect(findOriginalTextRange("正文", "")).toBeNull();
    expect(findOriginalTextRange("正文", "   ")).toBeNull();
  });
});

describe("acceptSuggestion", () => {
  const suggestion: CalloutSuggestion = {
    originalText: "此处需要提醒读者注意",
    type: "warning",
    title: "注意",
    reason: "存在风险",
  };

  it("把原文片段替换为 callout 包裹", () => {
    const content = `前文\n此处需要提醒读者注意\n后文`;
    const next = acceptSuggestion(content, suggestion);
    expect(next).toContain(":::callout");
    expect(next).toContain('type="warning"');
    expect(next).toContain("此处需要提醒读者注意");
    expect(next).toContain(":::");
    expect(next).toContain("前文");
    expect(next).toContain("后文");
    // 验证原片段被 callout 包裹（不再是裸文本）
    expect(next).not.toMatch(/^前文\n此处需要提醒读者注意\n后文$/);
  });

  it("找不到原文时原样返回", () => {
    const content = "完全不相关的内容";
    expect(acceptSuggestion(content, suggestion)).toBe(content);
  });

  it("多条建议依次接受不冲突", () => {
    const s1: CalloutSuggestion = {
      originalText: "第一处需要强调",
      type: "tip",
      title: "推荐",
      reason: "",
    };
    const s2: CalloutSuggestion = {
      originalText: "第二处需要强调",
      type: "info",
      title: "信息",
      reason: "",
    };
    const content = `第一处需要强调\n中间\n第二处需要强调`;
    const after1 = acceptSuggestion(content, s1);
    const after2 = acceptSuggestion(after1, s2);
    expect(after2).toContain("第一处需要强调");
    expect(after2).toContain("第二处需要强调");
    expect(after2).toContain('type="tip"');
    expect(after2).toContain('type="info"');
  });
});
