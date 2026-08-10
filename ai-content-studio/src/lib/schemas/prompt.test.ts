import { describe, it, expect } from "vitest";
import { createPromptSchema, updatePromptSchema } from "./prompt";

describe("createPromptSchema", () => {
  it("接受合法输入", () => {
    const r = createPromptSchema.safeParse({
      type: "article_write",
      name: "技术文章",
      content: "你是高级技术作者",
    });
    expect(r.success).toBe(true);
  });

  it("拒绝空 name", () => {
    const r = createPromptSchema.safeParse({ type: "t", name: "", content: "x" });
    expect(r.success).toBe(false);
  });

  it("拒绝空 type", () => {
    const r = createPromptSchema.safeParse({ type: "", name: "x", content: "x" });
    expect(r.success).toBe(false);
  });

  it("拒绝空 content", () => {
    const r = createPromptSchema.safeParse({ type: "t", name: "x", content: "" });
    expect(r.success).toBe(false);
  });

  it("description 空串与 undefined 均合法", () => {
    expect(
      createPromptSchema.safeParse({ type: "t", name: "x", content: "x", description: "" }).success,
    ).toBe(true);
    expect(createPromptSchema.safeParse({ type: "t", name: "x", content: "x" }).success).toBe(true);
  });

  it("active 可选", () => {
    expect(
      createPromptSchema.safeParse({ type: "t", name: "x", content: "x", active: false }).success,
    ).toBe(true);
  });
});

describe("updatePromptSchema", () => {
  it("部分更新合法——只传 name", () => {
    expect(updatePromptSchema.safeParse({ name: "新名" }).success).toBe(true);
  });

  it("空对象合法（全可选）", () => {
    expect(updatePromptSchema.safeParse({}).success).toBe(true);
  });

  it("content 非空校验生效", () => {
    expect(updatePromptSchema.safeParse({ content: "" }).success).toBe(false);
  });
});
