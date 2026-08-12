import { describe, expect, it } from "vitest";
import { createSourceSchema, fetchStatusSchema, listSourcesSchema, sourceIdSchema } from "./source";

describe("createSourceSchema", () => {
  it("合法 URL 通过", () => {
    const r = createSourceSchema.safeParse({ url: "https://example.com/a" });
    expect(r.success).toBe(true);
  });
  it("空字符串失败", () => {
    const r = createSourceSchema.safeParse({ url: "" });
    expect(r.success).toBe(false);
  });
  it("非法 URL 失败", () => {
    expect(createSourceSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });
  it("缺 url 失败", () => {
    expect(createSourceSchema.safeParse({}).success).toBe(false);
  });
});

describe("fetchStatusSchema", () => {
  it("枚举值通过，外值失败", () => {
    expect(fetchStatusSchema.safeParse("fetched").success).toBe(true);
    expect(fetchStatusSchema.safeParse("blocked").success).toBe(true);
    expect(fetchStatusSchema.safeParse("nope").success).toBe(false);
  });
});

describe("listSourcesSchema", () => {
  it("全部可选：空对象通过", () => {
    expect(listSourcesSchema.safeParse({}).success).toBe(true);
  });
  it("domain + status 通过", () => {
    expect(listSourcesSchema.safeParse({ domain: "example.com", status: "fetched" }).success).toBe(
      true,
    );
  });
  it("非法 status 失败", () => {
    expect(listSourcesSchema.safeParse({ status: "weird" }).success).toBe(false);
  });
});

describe("sourceIdSchema", () => {
  it("有 id 通过", () => {
    expect(sourceIdSchema.safeParse({ id: "abc" }).success).toBe(true);
  });
  it("空 id 失败", () => {
    expect(sourceIdSchema.safeParse({ id: "" }).success).toBe(false);
    expect(sourceIdSchema.safeParse({}).success).toBe(false);
  });
});
