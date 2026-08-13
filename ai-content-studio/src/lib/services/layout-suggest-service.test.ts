import { describe, it, expect } from "vitest";
import { parseLayoutSuggestions } from "./layout-suggest-service";

describe("parseLayoutSuggestions", () => {
  it("解析正常 JSON 数组（多种动作）", () => {
    const raw = JSON.stringify([
      {
        action: "callout",
        originalText: "注意这段",
        type: "warning",
        title: "注意",
        reason: "有风险",
      },
      { action: "bold", originalText: "核心观点", reason: "值得突出" },
      { action: "split", originalText: "长段落", newText: "第一段\n\n第二段", reason: "太长" },
    ]);
    const result = parseLayoutSuggestions(raw);
    expect(result).toHaveLength(3);
    expect(result[0].action).toBe("callout");
    expect(result[0].type).toBe("warning");
    expect(result[1].action).toBe("bold");
    expect(result[2].newText).toContain("\n\n");
  });

  it("解析 ```json 包裹的输出", () => {
    const raw =
      '```json\n[{"action":"callout","originalText":"段落","type":"info","title":"信息","reason":"补充"}]\n```';
    const result = parseLayoutSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("callout");
  });

  it("解析带前后多余文本的输出", () => {
    const raw =
      '好的，以下是我的排版建议：\n[{"action":"quote","originalText":"引文","reason":"引用"}]\n以上。';
    const result = parseLayoutSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("quote");
  });

  it("非法 action 条目被过滤", () => {
    const raw =
      '[{"action":"make_it_pretty","originalText":"x","reason":"y"},{"action":"bold","originalText":"z","reason":"w"}]';
    const result = parseLayoutSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("bold");
  });

  it("callout 的非法 type 不落地（undefined），应用时降级 neutral", () => {
    const raw = '[{"action":"callout","originalText":"x","type":"evil","title":"y","reason":"z"}]';
    const result = parseLayoutSuggestions(raw);
    expect(result[0].action).toBe("callout");
    expect(result[0].type).toBeUndefined();
  });

  it("headingLevel 越界被钳制", () => {
    const raw =
      '[{"action":"heading","originalText":"x","headingLevel":9,"reason":"y"},{"action":"heading","originalText":"z","headingLevel":0,"reason":"w"}]';
    const result = parseLayoutSuggestions(raw);
    expect(result[0].headingLevel).toBe(3);
    expect(result[1].headingLevel).toBe(1);
  });

  it("数量按排版强度上限截断", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      action: "bold",
      originalText: `第${i}段`,
      reason: "",
    }));
    const raw = JSON.stringify(items);
    expect(parseLayoutSuggestions(raw, "minimal")).toHaveLength(3);
    expect(parseLayoutSuggestions(raw, "standard")).toHaveLength(6);
    expect(parseLayoutSuggestions(raw, "emphasis")).toHaveLength(8);
  });

  it("空数组 / 无效 JSON 返回空", () => {
    expect(parseLayoutSuggestions("[]")).toEqual([]);
    expect(parseLayoutSuggestions("不是 JSON")).toEqual([]);
    expect(parseLayoutSuggestions("[{}]")).toEqual([]);
  });

  it("originalText 为空的条目被过滤", () => {
    const raw = '[{"action":"bold","originalText":"","reason":"y"}]';
    expect(parseLayoutSuggestions(raw)).toEqual([]);
  });

  it("超长字段被截断", () => {
    const long = "A".repeat(600);
    const raw = JSON.stringify([
      {
        action: "split",
        originalText: long,
        newText: "B".repeat(3000),
        reason: "C".repeat(300),
      },
    ]);
    const result = parseLayoutSuggestions(raw);
    expect(result[0].originalText.length).toBeLessThanOrEqual(500);
    expect(result[0].newText?.length).toBeLessThanOrEqual(2000);
    expect(result[0].reason.length).toBeLessThanOrEqual(200);
  });
});
