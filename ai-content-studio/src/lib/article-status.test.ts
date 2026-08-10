import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, ARTICLE_STATUS_LABELS } from "./article-status";

describe("canTransition", () => {
  it("DRAFT → REVIEW/PUBLISHED/ARCHIVED 合法", () => {
    expect(canTransition("DRAFT", "REVIEW")).toBe(true);
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransition("DRAFT", "ARCHIVED")).toBe(true);
  });

  it("REVIEW → DRAFT/PUBLISHED/ARCHIVED 合法", () => {
    expect(canTransition("REVIEW", "DRAFT")).toBe(true);
    expect(canTransition("REVIEW", "PUBLISHED")).toBe(true);
  });

  it("PUBLISHED → DRAFT/ARCHIVED 合法，PUBLISHED → REVIEW 非法", () => {
    expect(canTransition("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(canTransition("PUBLISHED", "DRAFT")).toBe(true);
    expect(canTransition("PUBLISHED", "REVIEW")).toBe(false);
  });

  it("ARCHIVED → DRAFT 合法，ARCHIVED → PUBLISHED 非法", () => {
    expect(canTransition("ARCHIVED", "DRAFT")).toBe(true);
    expect(canTransition("ARCHIVED", "PUBLISHED")).toBe(false);
  });

  it("同状态 no-op 合法", () => {
    expect(canTransition("DRAFT", "DRAFT")).toBe(true);
    expect(canTransition("PUBLISHED", "PUBLISHED")).toBe(true);
  });
});

describe("assertTransition", () => {
  it("非法转换抛错", () => {
    expect(() => assertTransition("ARCHIVED", "PUBLISHED")).toThrow(/非法状态转换/);
  });

  it("合法转换不抛", () => {
    expect(() => assertTransition("DRAFT", "REVIEW")).not.toThrow();
  });
});

describe("ARTICLE_STATUS_LABELS", () => {
  it("四种状态均有中文标签", () => {
    expect(ARTICLE_STATUS_LABELS.DRAFT).toBe("草稿");
    expect(ARTICLE_STATUS_LABELS.PUBLISHED).toBe("已发布");
  });
});
