import { describe, it, expect } from "vitest";
import { parseSuggestions } from "@/lib/services/callout-suggest-service";

describe("parseSuggestions", () => {
  it("解析正常 JSON 数组", () => {
    const raw = JSON.stringify([
      { originalText: "注意这段", type: "warning", title: "注意", reason: "有风险" },
      { originalText: "这段推荐", type: "tip", title: "推荐", reason: "是好做法" },
    ]);
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("warning");
    expect(result[1].type).toBe("tip");
  });

  it("解析 ```json 包裹的输出", () => {
    const raw =
      '```json\n[{"originalText":"段落","type":"info","title":"信息","reason":"补充"}]\n```';
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("info");
  });

  it("解析带前后多余文本的输出", () => {
    const raw =
      '好的，以下是我的建议：\n[{"originalText":"x","type":"note","title":"提醒","reason":"y"}]\n以上。';
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
  });

  it("非法 type 降级 neutral", () => {
    const raw = '[{"originalText":"x","type":"evil","title":"y","reason":"z"}]';
    const result = parseSuggestions(raw);
    expect(result[0].type).toBe("neutral");
  });

  it("空数组返回空", () => {
    expect(parseSuggestions("[]")).toEqual([]);
  });

  it("无效 JSON 返回空", () => {
    expect(parseSuggestions("不是 JSON")).toEqual([]);
    expect(parseSuggestions("[{}]")).toEqual([]);
  });

  it("originalText 为空的条目被过滤", () => {
    const raw = '[{"originalText":"","type":"info","title":"x","reason":"y"}]';
    expect(parseSuggestions(raw)).toEqual([]);
  });

  it("超长字段被截断", () => {
    const long = "A".repeat(600);
    const raw = JSON.stringify([
      { originalText: long, type: "info", title: "B".repeat(30), reason: "C".repeat(300) },
    ]);
    const result = parseSuggestions(raw);
    expect(result[0].originalText.length).toBeLessThanOrEqual(500);
    expect(result[0].title.length).toBeLessThanOrEqual(20);
    expect(result[0].reason.length).toBeLessThanOrEqual(200);
  });
});
