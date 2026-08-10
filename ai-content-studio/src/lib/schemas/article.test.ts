import { describe, it, expect } from "vitest";
import { createArticleSchema, updateArticleSchema } from "./article";

describe("createArticleSchema", () => {
  it("仅 title 合法", () => {
    expect(createArticleSchema.safeParse({ title: "Hello" }).success).toBe(true);
  });

  it("拒绝空 title", () => {
    expect(createArticleSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("非法 status 拒绝", () => {
    expect(createArticleSchema.safeParse({ title: "x", status: "BAD" }).success).toBe(false);
  });

  it("合法 status 通过", () => {
    expect(createArticleSchema.safeParse({ title: "x", status: "REVIEW" }).success).toBe(true);
  });
});

describe("updateArticleSchema", () => {
  it("空对象合法", () => {
    expect(updateArticleSchema.safeParse({}).success).toBe(true);
  });

  it("seoScore 可置 null", () => {
    expect(updateArticleSchema.safeParse({ seoScore: null }).success).toBe(true);
  });

  it("title 空串非法", () => {
    expect(updateArticleSchema.safeParse({ title: "" }).success).toBe(false);
  });
});
