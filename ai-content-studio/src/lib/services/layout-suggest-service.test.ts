import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseLayoutSuggestions, suggestLayout } from "./layout-suggest-service";
import { buildLayoutSuggestPrompt } from "@/lib/ai/layout-suggest-prompt";

const m = vi.hoisted(() => ({
  aiGenerate: vi.fn(),
  getPrompt: vi.fn(),
}));

vi.mock("@/lib/ai/generate", () => ({ generate: m.aiGenerate }));
vi.mock("@/lib/services/prompt-service", () => ({ getPrompt: m.getPrompt }));

describe("suggestLayout systemPrompt 组装", () => {
  beforeEach(() => {
    m.aiGenerate.mockReset();
    m.getPrompt.mockReset();
  });

  it("未选模板时使用内置排版 prompt，不传 promptId", async () => {
    m.aiGenerate.mockResolvedValue({ content: "[]", generationId: "g1", modelId: "m1" });
    await suggestLayout({ content: "正文", style: "standard" });
    expect(m.aiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: buildLayoutSuggestPrompt("standard") }),
    );
    expect(m.aiGenerate.mock.calls[0][0].promptId).toBeUndefined();
  });

  it("选择模板时仍保留内置格式指令，模板内容作为额外偏好拼接", async () => {
    m.getPrompt.mockResolvedValue({ id: "p1", content: "请让排版更活泼" });
    m.aiGenerate.mockResolvedValue({ content: "[]", generationId: "g1", modelId: "m1" });
    await suggestLayout({ content: "正文", style: "standard", promptId: "p1" });
    const args = m.aiGenerate.mock.calls[0][0];
    // 格式指令必须保留（否则 AI 不输出 JSON 建议，前端解析为空）
    expect(args.systemPrompt).toContain("只输出 JSON 数组");
    expect(args.systemPrompt).toContain("额外排版偏好");
    expect(args.systemPrompt).toContain("请让排版更活泼");
    expect(args.promptId).toBe("p1");
  });

  it("AI 返回合法 JSON 建议时解析成功", async () => {
    m.aiGenerate.mockResolvedValue({
      content: `[{"action":"callout","originalText":"数据安全","type":"warning","title":"注意","reason":"重要"}]`,
      generationId: "g1",
      modelId: "m1",
    });
    const r = await suggestLayout({ content: "数据安全很重要", style: "standard" });
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toMatchObject({ action: "callout", originalText: "数据安全" });
  });

  it("AI 返回非 JSON 文本时建议为空", async () => {
    m.aiGenerate.mockResolvedValue({
      content: "排版建议：把第二段加粗，第三段做成高亮块。",
      generationId: "g1",
      modelId: "m1",
    });
    const r = await suggestLayout({ content: "正文", style: "standard" });
    expect(r.suggestions).toEqual([]);
  });
});

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
