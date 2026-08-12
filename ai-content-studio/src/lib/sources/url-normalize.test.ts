import { describe, expect, it } from "vitest";
import { extractDomain, normalizeUrl } from "./url-normalize";

describe("normalizeUrl", () => {
  it("去除 utm_* tracking 参数，保留内容参数", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x&keep=1")).toBe(
      "https://example.com/a?keep=1",
    );
  });

  it("去除 fbclid/gclid/msclkid 等其它 tracking 参数", () => {
    expect(normalizeUrl("https://example.com/?fbclid=I&gclid=AB&msclkid=Z&id=9")).toBe(
      "https://example.com/?id=9",
    );
  });

  it("去除 fragment", () => {
    expect(normalizeUrl("https://example.com/p#section")).toBe("https://example.com/p");
  });

  it("去除冗余尾斜杠但保留根斜杠", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
    expect(normalizeUrl("https://example.com/a///")).toBe("https://example.com/a");
  });

  it("小写 host", () => {
    expect(normalizeUrl("HTTP://Example.COM/P")).toBe("http://example.com/P");
  });

  it("保留影响内容的参数", () => {
    expect(normalizeUrl("https://example.com/article?id=100&lang=zh")).toBe(
      "https://example.com/article?id=100&lang=zh",
    );
  });

  it("排序 query 参数使规范化确定", () => {
    expect(normalizeUrl("https://example.com/?b=2&a=1")).toBe(
      normalizeUrl("https://example.com/?a=1&b=2"),
    );
  });

  it("非 http/https 协议抛错", () => {
    expect(() => normalizeUrl("ftp://example.com")).toThrow(/http\/https/);
    expect(() => normalizeUrl("file:///x")).toThrow(/http\/https/);
  });

  it("非法 URL 抛错", () => {
    expect(() => normalizeUrl("not a url")).toThrow(/非法 URL/);
    expect(() => normalizeUrl("")).toThrow(/非法 URL/);
  });
});

describe("extractDomain", () => {
  it("返回小写 host（含端口）", () => {
    expect(extractDomain("https://NEWs.Example.com:8080/a")).toBe("news.example.com:8080");
  });
});
