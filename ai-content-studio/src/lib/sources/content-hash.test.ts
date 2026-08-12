import { describe, expect, it } from "vitest";
import { contentHash, normalizeWhitespace } from "./content-hash";

describe("contentHash", () => {
  it("对相同内容返回相同哈希", () => {
    expect(contentHash("hello world")).toBe(contentHash("hello world"));
  });

  it("空白归一：换行/多空格/制表符与单空格等价", () => {
    expect(contentHash("hello\n  world\t")).toBe(contentHash("hello world"));
  });

  it("不同内容产生不同哈希", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });

  it("空字符串仍返回确定哈希（64 位 hex）", () => {
    const h = contentHash("");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(contentHash("   "));
  });

  it("normalizeWhitespace 折叠空白并去首尾", () => {
    expect(normalizeWhitespace("  a   b  ")).toBe("a b");
  });
});