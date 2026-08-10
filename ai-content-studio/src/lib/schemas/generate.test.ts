import { describe, it, expect } from "vitest";
import { generateSchema } from "./generate";

describe("generateSchema", () => {
  it("接受合法输入", () => {
    const r = generateSchema.safeParse({ task: "article_generate", input: "写一篇文章" });
    expect(r.success).toBe(true);
  });

  it("拒绝空 task", () => {
    const r = generateSchema.safeParse({ task: "", input: "x" });
    expect(r.success).toBe(false);
  });

  it("拒绝空 input", () => {
    const r = generateSchema.safeParse({ task: "t", input: "" });
    expect(r.success).toBe(false);
  });

  it("拒绝超长 input", () => {
    const r = generateSchema.safeParse({ task: "t", input: "x".repeat(8001) });
    expect(r.success).toBe(false);
  });

  it("接受可选字段 temperature / maxTokens", () => {
    const r = generateSchema.safeParse({
      task: "t",
      input: "x",
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: "你是助手",
    });
    expect(r.success).toBe(true);
  });

  it("拒绝越界 temperature", () => {
    const r = generateSchema.safeParse({ task: "t", input: "x", temperature: 3 });
    expect(r.success).toBe(false);
  });
});
